//! Download/check only: never launches an installer or closes a document.
#[allow(dead_code)]
#[path = "../src/update_download.rs"]
mod update_download;

fn main() {
    let current = std::env::args()
        .nth(1)
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").into());
    let result = (|| -> winmd_core::Result<()> {
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
