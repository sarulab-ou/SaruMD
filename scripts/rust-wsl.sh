#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=true
if [[ -x "$PWD/.tools/cargo/bin/cargo" ]]; then
  export RUSTUP_HOME="$PWD/.tools/rustup"
  export CARGO_HOME="$PWD/.tools/cargo"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
exec cargo "$@"
