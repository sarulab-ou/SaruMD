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

pub fn powershell(script: &str) -> Result<Command> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let path = PathBuf::from(
            std::env::var_os("SystemRoot").ok_or("Windowsのフォルダーを確認できません。")?,
        )
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let mut command = Command::new(path);
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
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
    updates::verify_installer(&candidate, File::open(&path).map_err(|e| e.to_string())?)?;
    Ok(Staged {
        candidate,
        path,
        temp: Some(temp),
    })
}
