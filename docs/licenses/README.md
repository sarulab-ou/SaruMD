# 補足ライセンスの出典

2026-10-26に公式上流から取得した本文。公開パッケージに独立したライセンスファイルがない場合の補足に使う。`scripts/licenses.mjs` が配布用の `docs/third-party-licenses.txt` に統合する。

| ファイル                | 出典・対応                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| webview2-rs-MIT.txt     | [元コミットのLICENSE](https://github.com/wravery/webview2-rs/blob/edc2caf886175ccaebe86078c9cfe1ae2a187328/LICENSE)。webview2-com 0.39.1 の `.cargo_vcs_info.json` と照合。macros/sysも同じ上流。 |
| alloc-stdlib-BSD.txt    | [元コミットのLICENSE](https://github.com/dropbox/rust-alloc-no-stdlib/blob/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE)。alloc-stdlib 0.3.0 の元コミット。                                   |
| MPL-2.0.txt             | [SPDX公式MPL-2.0本文](https://github.com/spdx/license-list-data/blob/main/text/MPL-2.0.txt)。selectors 0.38.0 の標準ライセンス本文。                                                              |
| saxes-ISC.txt           | [saxes v6.0.0 LICENSE](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE)。                                                                                                                   |
| keyv-MIT.txt            | [keyv上流LICENSE](https://github.com/jaredwray/keyv/blob/main/LICENSE)。現行上流の通知で補足。4.5.4のREADMEでもMITと著作者を確認。                                                                |
| natural-compare-MIT.txt | [natural-compare-lite上流LICENSE](https://github.com/litejs/natural-compare-lite/blob/master/LICENSE)。1.4.0のREADMEの著作者・MIT表記と照合。                                                     |

npmのプラットフォーム別バイナリは同じ上流のesbuild/rollup/Tauri CLIの本文、`@humanfs/types`は同じ上流のcoreの本文を併記。esrecurse、imurmurhash、stackbackは配布ソース/README内の通知も取り出す。開発・テスト依存も広めに収録している。

MPL対象ファイルには変更を加えていない。対応ソースはCargo.lockに固定された各クレートをcrates.ioから取得できる。例：`cargo vendor --locked vendor`。再配布時はこのソース取得方法と通知を維持する。GNU試作バイナリはWindowsシステムDLLに加え、Tauriが供給するWebView2Loader.dllを同梱する。MinGWのlibgcc/libstdc++/winpthread DLLへの動的依存はimport tableにない。
