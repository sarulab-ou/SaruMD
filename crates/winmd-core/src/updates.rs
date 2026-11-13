use crate::Result;
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;

pub const RELEASES_URL: &str =
    "https://api.github.com/repos/sarulab-ou/SaruMD/releases?per_page=100";
pub const MAX_PACKAGE: u64 = 100 * 1024 * 1024;

/// A launch during file replacement waits for the updater's exclusive lock.
pub fn wait_for_update(directory: &std::path::Path, timeout: std::time::Duration) -> bool {
    #[cfg(windows)]
    {
        use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt, time::Instant};
        let started = Instant::now();
        loop {
            match OpenOptions::new()
                .read(true)
                .write(true)
                .share_mode(0)
                .open(directory.join(".sarumd-update.lock"))
            {
                Ok(_) => return true,
                Err(error) if matches!(error.raw_os_error(), Some(32 | 33)) => {
                    if started.elapsed() >= timeout {
                        return false;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(_) => return true,
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (directory, timeout);
        true
    }
}

#[derive(Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub draft: bool,
    pub published_at: Option<String>,
    pub assets: Vec<Asset>,
}

#[derive(Clone, Deserialize)]
pub struct Asset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
    pub digest: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Candidate {
    pub version: String,
    pub filename: String,
    pub url: String,
    pub checksum_url: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    pub current_version: String,
    pub available: Option<Available>,
}

#[derive(Serialize)]
pub struct Available {
    pub version: String,
    pub bytes: u64,
}

pub fn select(releases: &[Release], current: &str) -> Result<Option<Candidate>> {
    let current = Version::parse(current).map_err(|_| "現在のバージョンが不正です。")?;
    // The project distributes preview releases; /latest would omit all of them.
    let newest = releases
        .iter()
        .filter_map(|release| {
            if release.draft || release.published_at.is_none() {
                return None;
            }
            let version = Version::parse(release.tag_name.strip_prefix('v')?).ok()?;
            (version > current && release.tag_name == format!("v{version}"))
                .then_some((version, release))
        })
        .max_by(|a, b| a.0.cmp(&b.0));
    let Some((version, release)) = newest else {
        return Ok(None);
    };
    let filename = format!("SaruMD_{version}_x64-update.zip");
    let base = format!("https://github.com/sarulab-ou/SaruMD/releases/download/v{version}/");
    let unique = |name: &str| -> Result<&Asset> {
        let mut matches = release.assets.iter().filter(|asset| asset.name == name);
        let asset = matches
            .next()
            .ok_or("最新版の更新用ZIPが揃っていません。時間を置いて再試行してください。")?;
        if matches.next().is_some() || asset.browser_download_url != format!("{base}{name}") {
            return Err("更新ファイルの取得先が不正です。".into());
        }
        Ok(asset)
    };
    let package = unique(&filename)?;
    let checksum = unique("SHA256SUMS.txt")?;
    if package.size == 0 || package.size > MAX_PACKAGE || checksum.size > 64 * 1024 {
        return Err("更新ファイルのサイズが不正です。".into());
    }
    let sha256 = package
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|digest| digest.len() == 64 && digest.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or("更新ファイルのSHA-256を確認できません。")?
        .to_ascii_lowercase();
    Ok(Some(Candidate {
        version: version.to_string(),
        filename,
        url: package.browser_download_url.clone(),
        checksum_url: checksum.browser_download_url.clone(),
        bytes: package.size,
        sha256,
    }))
}

pub fn verify_checksums(candidate: &Candidate, text: &str) -> Result<()> {
    let mut matches = text.lines().filter_map(|line| {
        let mut fields = line.split_whitespace();
        let hash = fields.next()?;
        let name = fields.next()?.trim_start_matches('*');
        (name == candidate.filename && fields.next().is_none()).then_some(hash)
    });
    let hash = matches
        .next()
        .ok_or("SHA256SUMS.txtに更新ファイルがありません。")?;
    if matches.next().is_some() || !hash.eq_ignore_ascii_case(&candidate.sha256) {
        return Err("GitHubのdigestとSHA256SUMS.txtが一致しません。".into());
    }
    Ok(())
}

pub fn verify_package(candidate: &Candidate, mut reader: impl Read) -> Result<()> {
    let mut hash = Sha256::new();
    let mut size = 0u64;
    let mut prefix: Vec<u8> = Vec::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        size += count as u64;
        if size > candidate.bytes || size > MAX_PACKAGE {
            return Err("更新ファイルのサイズが一致しません。".into());
        }
        prefix.extend(
            buffer[..count]
                .iter()
                .take(4usize.saturating_sub(prefix.len())),
        );
        hash.update(&buffer[..count]);
    }
    if size != candidate.bytes
        || prefix != b"PK\x03\x04"
        || format!("{:x}", hash.finalize()) != candidate.sha256
    {
        return Err("更新用ZIPの検証に失敗しました。ファイルを変更しません。".into());
    }
    Ok(())
}

/// One document at a time. Cancellation invalidates the session before another close.
pub struct CloseSequence {
    pub session: u64,
    remaining: std::collections::VecDeque<String>,
}
impl CloseSequence {
    pub fn new(session: u64, ids: Vec<String>) -> Self {
        Self {
            session,
            remaining: ids.into(),
        }
    }
    pub fn next(&self) -> Option<&str> {
        self.remaining.front().map(String::as_str)
    }
    pub fn remove(&mut self, id: &str) {
        self.remaining.retain(|value| value != id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn waits_for_an_update_instead_of_starting_during_file_replacement() {
        use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt, time::Duration};
        let dir = tempfile::tempdir().unwrap();
        let lock = OpenOptions::new()
            .write(true)
            .create_new(true)
            .share_mode(0)
            .open(dir.path().join(".sarumd-update.lock"))
            .unwrap();
        assert!(!wait_for_update(dir.path(), Duration::from_millis(10)));
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            drop(lock);
        });
        assert!(wait_for_update(dir.path(), Duration::from_secs(2)));
        thread.join().unwrap();
    }
    fn release(version: &str) -> Release {
        let filename = format!("SaruMD_{version}_x64-update.zip");
        let base = format!("https://github.com/sarulab-ou/SaruMD/releases/download/v{version}/");
        Release {
            tag_name: format!("v{version}"),
            draft: false,
            published_at: Some("2026-11-13".into()),
            assets: vec![
                Asset {
                    name: filename.clone(),
                    browser_download_url: format!("{base}{filename}"),
                    size: 4,
                    digest: Some(format!("sha256:{:x}", Sha256::digest(b"PK\x03\x04"))),
                },
                Asset {
                    name: "SHA256SUMS.txt".into(),
                    browser_download_url: format!("{base}SHA256SUMS.txt"),
                    size: 100,
                    digest: None,
                },
            ],
        }
    }
    #[test]
    fn compares_versions_numerically_and_includes_published_preview_releases() {
        let releases = vec![release("0.1.9"), release("0.1.20"), release("0.1.10")];
        assert_eq!(
            select(&releases, "0.1.9").unwrap().unwrap().version,
            "0.1.20"
        );
        assert!(select(&releases, "0.1.20").unwrap().is_none());
        assert!(select(&releases, "0.2.0").unwrap().is_none());
        let mut unpublished = release("9.0.0");
        unpublished.draft = true;
        assert!(select(&[unpublished], "0.1.0").unwrap().is_none());
        let mut unpublished = release("9.0.0");
        unpublished.published_at = None;
        assert!(select(&[unpublished], "0.1.0").unwrap().is_none());
    }
    #[test]
    fn rejects_missing_assets_foreign_urls_oversized_and_missing_digests() {
        for mode in 0..7 {
            let mut r = release("0.1.21");
            match mode {
                0 => {
                    r.assets.pop();
                }
                1 => r.assets[0].browser_download_url = "https://evil.invalid/update.exe".into(),
                2 => r.assets[0].size = MAX_PACKAGE + 1,
                3 => r.assets[0].digest = None,
                4 => r.assets.push(r.assets[0].clone()),
                5 => {
                    r.assets[0].browser_download_url =
                        r.assets[0].browser_download_url.replace("https:", "http:")
                }
                _ => {
                    r.assets[0].name = "SaruMD_0.1.21_x64-setup.exe".into();
                    r.assets[0].browser_download_url = r.assets[0]
                        .browser_download_url
                        .replace("x64-update.zip", "x64-setup.exe");
                }
            }
            assert!(select(&[r], "0.1.20").is_err(), "mode {mode}");
        }
    }
    #[test]
    fn checks_both_manifest_hashes_and_exact_zip_bytes() {
        let candidate = select(&[release("0.1.21")], "0.1.20").unwrap().unwrap();
        let line = format!("{}  {}\n", candidate.sha256, candidate.filename);
        verify_checksums(&candidate, &line).unwrap();
        assert!(verify_checksums(&candidate, &format!("{line}{line}")).is_err());
        assert!(verify_checksums(
            &candidate,
            &line.replace(&candidate.sha256, &"0".repeat(64))
        )
        .is_err());
        verify_package(&candidate, &b"PK\x03\x04"[..]).unwrap();
        for bytes in [
            &b"PK"[..],
            &b"PK\x03\x04bad"[..],
            &b"nope"[..],
            &b"MZxx"[..],
        ] {
            assert!(verify_package(&candidate, bytes).is_err());
        }
    }
    #[test]
    fn closes_one_owned_document_at_a_time() {
        let mut sequence =
            CloseSequence::new(7, vec!["doc-1".into(), "doc-2".into(), "doc-3".into()]);
        assert_eq!(sequence.session, 7);
        assert_eq!(sequence.next(), Some("doc-1"));
        sequence.remove("doc-3");
        assert_eq!(sequence.next(), Some("doc-1"));
        sequence.remove("doc-1");
        assert_eq!(sequence.next(), Some("doc-2"));
        sequence.remove("doc-2");
        assert_eq!(sequence.next(), None);
    }
}
