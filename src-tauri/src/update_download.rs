use std::{
    fs::File,
    path::{Path, PathBuf},
    process::Command,
};
use winmd_core::{
    updates::{self, Candidate},
    Result,
};

pub struct Staged {
    pub candidate: Candidate,
    pub path: PathBuf,
    pub temp: Option<tempfile::TempDir>,
}

pub const FILE_OPERATIONS: &str = include_str!("update-files.ps1");

pub fn verify_payload(staged: &Staged) -> Result<()> {
    let script = format!(
        "{FILE_OPERATIONS}\n[void](Assert-SaruMDPayload $env:SARUMD_PAYLOAD $env:SARUMD_VERSION)"
    );
    let result = powershell(&script)?
        .env(
            "SARUMD_PAYLOAD",
            staged
                .path
                .parent()
                .ok_or("一時フォルダーがありません。")?
                .join("payload"),
        )
        .env("SARUMD_VERSION", &staged.candidate.version)
        .output()
        .map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err("展開済みの更新ファイルを検証できません。文書は閉じませんでした。".into());
    }
    Ok(())
}

pub fn powershell(script: &str) -> Result<Command> {
    #[cfg(windows)]
    {
        use base64::Engine;
        use std::os::windows::process::CommandExt;
        let path = PathBuf::from(
            std::env::var_os("SystemRoot").ok_or("Windowsのフォルダーを確認できません。")?,
        )
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        // PowerShell's -Command quoting differs from ordinary Windows argv parsing.
        let bytes: Vec<u8> = script
            .trim_start_matches('\u{feff}')
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        if encoded.len() > 30_000 {
            return Err("更新の補助処理が長すぎます。".into());
        }
        let mut command = Command::new(&path);
        command
            // A launcher may inherit PowerShell 7's module path, which breaks WinPS 5.1 autoload.
            .env(
                "PSModulePath",
                path.parent()
                    .ok_or("PowerShellのフォルダーがありません。")?
                    .join("Modules"),
            )
            .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded])
            .creation_flags(0x08000000);
        Ok(command)
    }
    #[cfg(not(windows))]
    {
        let _ = script;
        Err("更新はWindowsで使用できます。".into())
    }
}

fn fetch(url: &str, path: &Path, limit: u64) -> Result<()> {
    let output = powershell(include_str!("update-fetch.ps1"))?
        .env("SARUMD_FETCH_URL", url)
        .env("SARUMD_FETCH_PATH", path)
        .env("SARUMD_FETCH_LIMIT", limit.to_string())
        .output()
        .map_err(|e| format!("更新の通信処理を起動できません: {e}"))?;
    if !output.status.success() {
        return Err(
            "GitHubから取得できませんでした。通信環境を確認し、時間を置いて再試行してください。"
                .into(),
        );
    }
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > limit {
        return Err("更新の応答が大きすぎます。".into());
    }
    Ok(())
}

pub fn find_update(current: &str) -> Result<Option<Candidate>> {
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let path = dir.path().join("releases.json");
    fetch(updates::RELEASES_URL, &path, 4 * 1024 * 1024)?;
    let releases: Vec<updates::Release> =
        serde_json::from_reader(File::open(path).map_err(|e| e.to_string())?)
            .map_err(|_| "GitHubの更新情報を読み取れません。")?;
    updates::select(&releases, current)
}

pub fn download(candidate: Candidate) -> Result<Staged> {
    let temp = tempfile::Builder::new()
        .prefix("sarumd-update-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let sums = temp.path().join("SHA256SUMS.txt");
    fetch(&candidate.checksum_url, &sums, 64 * 1024)?;
    updates::verify_checksums(
        &candidate,
        &std::fs::read_to_string(&sums).map_err(|e| e.to_string())?,
    )?;
    std::fs::remove_file(sums).map_err(|e| e.to_string())?;
    let path = temp.path().join(&candidate.filename);
    fetch(&candidate.url, &path, candidate.bytes)?;
    prepare(candidate, path, temp)
}

/// Also used by the download-only example for isolated, offline package validation.
pub fn prepare(candidate: Candidate, path: PathBuf, temp: tempfile::TempDir) -> Result<Staged> {
    updates::verify_package(&candidate, File::open(&path).map_err(|e| e.to_string())?)?;
    let script = format!("{FILE_OPERATIONS}\nExpand-SaruMDPackage $env:SARUMD_ARCHIVE $env:SARUMD_PAYLOAD $env:SARUMD_VERSION");
    let expanded = powershell(&script)?
        .env("SARUMD_ARCHIVE", &path)
        .env("SARUMD_PAYLOAD", temp.path().join("payload"))
        .env("SARUMD_VERSION", &candidate.version)
        .output()
        .map_err(|e| e.to_string())?;
    if !expanded.status.success() {
        return Err(
            "更新用ZIPの展開・内容の検証に失敗しました。ファイルは変更していません。".into(),
        );
    }
    Ok(Staged {
        candidate,
        path,
        temp: Some(temp),
    })
}
