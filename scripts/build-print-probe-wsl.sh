#!/usr/bin/env bash
# GNU/WSL probe needs the Common Controls v6 manifest that tauri-build embeds in SaruMD.exe.
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=true
export CARGO_TARGET_DIR="$PWD/target/verified"
mkdir -p .tools
x86_64-w64-mingw32-windres -i src-tauri/examples/print_smoke.rc -o .tools/print-smoke-res.o -O coff
bash scripts/rust-wsl.sh rustc -p winmd --release --example print_smoke --target x86_64-pc-windows-gnu --features custom-protocol -- -C "link-arg=$PWD/.tools/print-smoke-res.o"
# Windows DLL search starts beside the probe executable.
cp target/verified/x86_64-pc-windows-gnu/release/WebView2Loader.dll target/verified/x86_64-pc-windows-gnu/release/examples/WebView2Loader.dll
