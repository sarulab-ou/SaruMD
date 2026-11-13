//! Download/check only: never launches an installer or closes a document.
#[allow(dead_code)]
#[path = "../src/update_download.rs"]
mod update_download;

fn main() {
    let current = std::env::args()
        .nth(1)
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").into());
    let result = (|| -> winmd_core::Result<()> {
        if current == "--local" {
            let archive = std::env::args().nth(2).ok_or("ZIPを指定してください。")?;
            let metadata = std::env::args()
                .nth(3)
                .ok_or("テスト用リリース情報を指定してください。")?;
            let releases: Vec<winmd_core::updates::Release> =
                serde_json::from_reader(std::fs::File::open(metadata).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let candidate =
                winmd_core::updates::select(&releases, "0.0.0")?.ok_or("更新がありません。")?;
            let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
            let path = temp.path().join(&candidate.filename);
            std::fs::copy(&archive, &path).map_err(|e| e.to_string())?;
            let version = candidate.version.clone();
            let staged = match update_download::prepare(candidate, path, temp) {
                Ok(staged) => staged,
                Err(error) => {
                    let diagnostic = tempfile::tempdir().map_err(|e| e.to_string())?;
                    let script = format!("{}\nExpand-SaruMDPackage $env:SARUMD_ARCHIVE $env:SARUMD_PAYLOAD $env:SARUMD_VERSION", update_download::FILE_OPERATIONS);
                    let output = update_download::powershell(&script)?
                        .env("SARUMD_ARCHIVE", &archive)
                        .env("SARUMD_PAYLOAD", diagnostic.path().join("payload"))
                        .env("SARUMD_VERSION", version)
                        .output()
                        .map_err(|e| e.to_string())?;
                    eprintln!(
                        "Local diagnostic: {}",
                        String::from_utf8_lossy(&output.stderr)
                    );
                    return Err(error);
                }
            };
            update_download::verify_payload(&staged)?;
            println!(
                "PASS: local ZIP verified and prepared by native commands ({})",
                staged.candidate.version
            );
            return Ok(());
        }
        let Some(candidate) = update_download::find_update(&current)? else {
            println!("PASS: no newer published version for {current}");
            return Ok(());
        };
        let staged = update_download::download(candidate)?;
        println!(
            "PASS: verified {} ({} bytes), SHA-256 {}",
            staged.candidate.version, staged.candidate.bytes, staged.candidate.sha256
        );
        // TempDir is dropped here. No executable is launched.
        Ok(())
    })();
    if let Err(error) = result {
        eprintln!("FAIL: {error}");
        std::process::exit(1);
    }
}
