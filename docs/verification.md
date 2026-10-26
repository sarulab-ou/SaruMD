# 検証記録（最終更新：2026-10-27）

## 更新版0.1.3：ファイルメニュー・PDF・印刷

ファイルメニュー（Alt+F、キー表示、矢印/Home/End/Esc操作）、PDF保存先選択、印刷（Ctrl+P）、全ウィンドウへの安全な終了要求を追加。タブは追加せず、画面内ロゴとタイトルの「— WinMD」を削除した。PDF/印刷は未保存本文のサニタイズ済みプレビューを使用し、原本を自動保存しない。PDFはネイティブWebView2で生成後、既存のatomic_saveで保存する。32 MiB上限、.pdf以外の保存先拒否、開いている文書の上書き拒否、上書き確認後の外部変更比較を実装した。

2026-10-27、既存のWindows/WSL GNU環境で実施：

| 検証                                                                                                | 結果                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run check` / `pnpm run lint` / `pnpm run build`                                               | 成功。Viteの約724 kBチャンク警告は継続                                                                                                                                                                             |
| `pnpm run test`                                                                                     | 8ファイル25件成功。メニューのAlt+F/キー移動/disabled/IMEガード、印刷画像待機・失敗・timeout、最新未保存本文とXSS/外部画像ブロックの印刷スナップショットを追加                                                      |
| `test -p winmd-core` / `test -p winmd-core --target x86_64-pc-windows-gnu`                          | Linux14件、実Windows15件成功                                                                                                                                                                                       |
| desktop Windows `clippy --all-targets` / core Linux `clippy --all-targets` / `fmt --all -- --check` | 成功（`-D warnings`）。プローブ修正後のexample clippyも再確認                                                                                                                                                      |
| Windows x64 GNUリリース / NSIS                                                                      | 成功。ログ`.tools/final-build-0.1.3.log`で`Finished 1 bundle`。署名なし・クロスビルド警告あり                                                                                                                      |
| 7-Zip `t` / 展開照合                                                                                | 成功。exeの標準UNK→NSSマーカー3バイトだけを正規化して全体一致、WebView2Loader.dllと第三者ライセンス全文はハッシュ一致                                                                                              |
| 実WebView2 PDFプローブ                                                                              | `scripts/build-print-probe-wsl.sh`で生成し、非表示ウィンドウで実行。66,961バイトのPDFを作成、終了コード0・PASS                                                                                                     |
| PDF読取・描画                                                                                       | Windows Miniconda baseのPyMuPDFで5ページ全てのA4寸法、日本語見出しと末尾END_OF_DOCUMENT、SHOULD_NOT_PRINT不在を確認。全5ページをPNGにして目視し、文字欠け・重なりなし、表ヘッダー繰り返しとコード/引用の表示を確認 |

PDFの試験出力は`.tools/print-smoke-0.1.3.pdf`、ログは同名`.log`/`.err`、描画は`.tools/print-smoke-page-1.png`〜`5.png`。固定fixtureと製品の印刷CSS・PDF生成関数を使い、実プリンターとユーザー文書には触れていない。WebView2終了時に`Failed to unregister class Chrome_WidgetWin_0 ... 1412`が標準エラーへ出たが、PDF生成・検証・プロセス終了は成功した。

プローブ初回はexeにCommon Controls v6のマニフェストがなくWindowsローダーで停止したため、専用ビルドスクリプトで埋め込んだ。次にdata URLの非許可を確認したため、製品の権限は広げずテスト専用localhost fixtureへ変更した。最終プローブで上記PASSを確認した。pnpm 11の組み込み`check`による別処理を避け、プロジェクトの型検査は明示的に`pnpm run check`で実行した。依存は既存ローカルstoreからoffline/frozen-lockfileで復元しており、ライブラリのバージョン更新はしていない。

**未実施**：最終アプリ上のクリック/Alt+F、保存ダイアログのキャンセル・上書き、実プリンター、印刷プレビューUI、複数dirty文書の終了確認、v0.1.3インストーラーの対話受入。これらを実施済みとは扱わない。手順をmanual-tests.mdへ追加済み。

| 0.1.3成果物                                                                           | SHA-256                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `target/verified/x86_64-pc-windows-gnu/release/winmd.exe`                             | `ba672b60763ae0527eb9ffcd7a81593890c7c9aee83a3de5a5df900d4b56917a` |
| `target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.3_x64-setup.exe` | `181a446809e332fe06ccf7c6ffbe96a62eeb3206f51d136ff658a66f53ce0035` |

インストーラーは4,995,111バイト。既存のインストール済みアプリは置き換えていない。

## 更新版0.1.2：関連付け起動の修正

ユーザー環境で.mdのダブルクリックがWindowsのアクセスエラーになった。実際のHKCUを読み、WinMD.md、WinMD.markdown、Applications/winmd.exeのopen commandに余計な`$`付き引用符が入っていたことを確認。例：`$"...\winmd.exe$" $"%1$"`。NSISのシングルクォート内で不要なドル記号を付けた実装ミスだった。権限を広げる対処は行っていない。

修正はNSISの文字列を`'"$INSTDIR\winmd.exe" "%1"'`、アイコンを`'"$INSTDIR\winmd.exe",0'`へ変更するもの。現在の既知の不正6値は`repair-associations.ps1`で事前検証・バックアップ後に修復した。ユーザーが選択したUserChoiceのProgId/Hashは不変。バックアップは`.tools/association-backups/20261026_234902-4423a786d7444a5ca9f7107a9c64e297.json`。

`test-associations.ps1`はフックの実WriteRegStr行を取り出し、書き込み先だけをGUID付きのテストキーへ変更してNSISをコンパイル・サイレント実行する。空白・日本語を含む仮インストール先で6値の完全一致とUserChoice不変を確認してPASS。実際の関連付けをテストで変更せず、終了時にテストキーを削除した。

修復後、`.tools/association-smoke/日本語 (関連付け確認).md`をStart-Processのシェル関連付けで開き、インストール済み`%LOCALAPPDATA%/WinMD/winmd.exe`が起動し、`日本語 (関連付け確認).md — WinMD`のタイトルが出たことを確認。ユーザーのデスクトップ文書は変更していない。これは関連付け経由の起動確認であり、0.1.2インストーラーの全GUI受入ではない。

フロントエンド19件、Windows Rust15件、Linux Rust14件、型チェック、ESLint、clippy、Prettier、Rust fmt、Viteビルドが成功。実行コマンドは前版と同じ検証コマンドと`./scripts/test-associations.ps1`、修復前の`./scripts/repair-associations.ps1 -WhatIf`、確認後の同スクリプト実行。修復後の再実行は「already correct」となり、再書き込みしないことも確認した。

`.tools/build-verified.sh`でWindows x64 GNUリリースとNSISを生成し、`Finished 1 bundle`を確認。ログは`.tools/final-build-0.1.2.log`。7-Zipの`t`検査と展開照合も成功し、exeは標準UNK→NSS識別子だけを正規化して全体一致、WebView2Loader.dll・通知全文は完全一致した。署名なし・クロスビルド・チャンクサイズの警告は継続。インストーラーは4,972,008バイト。

| 0.1.2成果物                                                                           | SHA-256                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `target/verified/x86_64-pc-windows-gnu/release/winmd.exe`                             | `2cf6d4d58c1c28ecc67a15da6e2c488e5c1a04895b81ae7f463ccb688a379e4a` |
| `target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.2_x64-setup.exe` | `3b4200512841e4e44b48b30e24d8e688437b098ccda631966b4d1e4d755a8941` |

以下の0.1.1以前の配布物は関連付け文字列に不具合があるため、再インストールには0.1.2以降を使用する。

## 更新版0.1.1（23:35 JSTビルド）

追加内容はクリップボード画像のCtrl+V、cleanな文書への外部変更自動反映、Windows既定アプリ一覧への登録と設定画面への任意の案内。READMEとmanual-tests.mdに操作・制限・追加受入手順を記載した。

| 実行したコマンド相当                                                                                                                          | 結果                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --offline --frozen-lockfile --store-dir .tools/pnpm-store`                                                                      | 成功。既存lockfileと整合                                                                                                                                                    |
| `pnpm check`、`pnpm lint`、`pnpm build`                                                                                                       | 成功。JS約720kBのチャンクサイズ警告は継続                                                                                                                                   |
| `pnpm test`                                                                                                                                   | 6ファイル19件成功。画像の遅延挿入・Undo/Redo・貼り付け中の編集・失敗時保持・通常テキスト貼り付け・SVG/サイズ拒否、外部通知集約・dirty/busy保護・エラー後再試行を追加        |
| `bash scripts/rust-wsl.sh test -p winmd-core --target x86_64-pc-windows-gnu`                                                                  | Windows実行ファイルで15件成功。実PNGを文書フォルダーへ作成、指定形式名、同名保護、壊れたPNG/不正名/不明文書/未保存/読み取り専用/保存失敗拒否、外部置換読込とdirty保護を追加 |
| `bash scripts/rust-wsl.sh test -p winmd-core`                                                                                                 | Linux側14件成功                                                                                                                                                             |
| `bash scripts/rust-wsl.sh check -p winmd --target x86_64-pc-windows-gnu`                                                                      | 成功                                                                                                                                                                        |
| `bash scripts/rust-wsl.sh clippy -p winmd --target x86_64-pc-windows-gnu -- -D warnings`、coreの`--all-targets`、`cargo fmt --all -- --check` | 成功                                                                                                                                                                        |
| `cargo metadata --locked --format-version 1 --filter-platform x86_64-pc-windows-gnu`、`node scripts/licenses.mjs`                             | 成功。png/chronoの依存・通知を確認、両lockfileを保持                                                                                                                        |
| `.tools/build-verified.sh`（`CARGO_TARGET_DIR=target/verified`）                                                                              | Windows x64 GNUリリースとNSIS成功。ログ：`.tools/final-build-0.1.1.log`。署名なし・クロスビルドの警告あり                                                                   |
| 7-Zip 26.00 `t`、テスト用フォルダーへの展開と内容比較                                                                                         | 成功。WebView2Loader.dll・通知全文はハッシュ一致。exeは標準のUNK→NSS識別子3バイトのみの差を正規化して全体一致                                                               |

実行ファイルは25,259,498バイト、NSISは4,970,832バイト。今回もMSVCビルド、実クリップボードからWebView2への貼り付け、非PNGの実画像変換、実Codex操作とのGUI連携、実インストールと.mdの設定画面・既定選択・アンインストールは未実施。新しいGUI試験を実施済みとは扱わない。クリップボードのテストは合成pasteイベントとモック保存、Rust側は一時ディレクトリの実PNGを使用し、ユーザーのクリップボードや本物の文書を読み書きしていない。

| 最新成果物                                                                            | SHA-256                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `target/verified/x86_64-pc-windows-gnu/release/winmd.exe`                             | `34881437369370ed22bb1202975a35e615731400385ba4eae4b167ac67bbb217` |
| `target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.1_x64-setup.exe` | `3719e41f747400d21c32fe1e3a43fbdc56e79856c5ded4a5e14c7538dc08c976` |

以下は初版の履歴であり、0.1.0のハッシュは更新されたexeには当てはまらない。

## 環境

- Windows x64、OS build 26200、WebView2 155.0.4283.62（Tauri CLI infoで確認）。
- Node 24.19.0、pnpm 11.25.0。
- Windows側MSVC/SDK/Rustなし。WSL Ubuntu 24.04・既存MinGW GCC 13.2.0を利用。
- Rust 1.99.1、rustfmt/clippyはプロジェクト内 `.tools` に導入。ユーザーの既存Rust設定・OSパッケージは変更していない。
- Tauri Rust 2.12.5 / JS・CLI 2.12.4、CodeMirror 6、marked 16.4.2、DOMPurify 3.4.17。正確な依存は両lockfileを参照。

## 初版0.1.0で実行した検証

以下は実行済み。シェルのPATHにnpm/pnpmがなかったため、Windows側では実際には `node <bundled-pnpm>/bin/pnpm.cjs` またはローカルの各CLIのJSエントリーを使用した。`CI=true`を初回から設定。Pythonは使用していない。

| コマンド相当                                                                                                      | 結果                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --store-dir .tools/pnpm-store`                                                                      | 成功。pnpm-lock.yaml作成。ESLint 9のサポート終了警告あり                                                                                            |
| `pnpm check` (`tsc --noEmit`)                                                                                     | 成功                                                                                                                                                |
| `pnpm test` (`vitest run`)                                                                                        | 4ファイル・11件成功。文書独立、保存中追加入力、キュー失敗回復、debounce/max-wait、古い変換結果拒否、連続入力中の結果採用、XSS・画像・危険URL、1万行 |
| `pnpm lint` (`eslint src tests scripts` と `prettier --check .`)                                                  | 成功（最終ドキュメント整形後も再確認）                                                                                                              |
| `pnpm build` (`tsc --noEmit && vite build`)                                                                       | 成功。メインJS約716kBのチャンク警告あり                                                                                                             |
| `bash scripts/rust-wsl.sh test -p winmd-core`                                                                     | Linux側：10件成功                                                                                                                                   |
| `bash scripts/rust-wsl.sh test -p winmd-core --target x86_64-pc-windows-gnu`                                      | Windows実行ファイルで11件成功。実Windows ReplaceFileW、新規作成、共有なしロック、保存失敗注入、形式保持、競合、画像範囲を検証                       |
| `bash scripts/rust-wsl.sh check -p winmd --target x86_64-pc-windows-gnu`                                          | Tauri全体のWindows向けコンパイル成功                                                                                                                |
| `bash scripts/rust-wsl.sh clippy -p winmd-core --all-targets -- -D warnings`                                      | 成功                                                                                                                                                |
| `bash scripts/rust-wsl.sh clippy -p winmd --target x86_64-pc-windows-gnu -- -D warnings`                          | 成功                                                                                                                                                |
| `bash scripts/rust-wsl.sh fmt --all -- --check`                                                                   | 成功                                                                                                                                                |
| `cargo metadata --locked --format-version 1 --filter-platform x86_64-pc-windows-gnu`、`node scripts/licenses.mjs` | ライセンス通知を生成。本文がパッケージ外にあるものは補足通知と同じ上流の本文を使用                                                                  |
| `cargo build -p winmd --release --target x86_64-pc-windows-gnu --features custom-protocol`                        | 成功。最終版のCARGO_TARGET_DIRは `target/verified`                                                                                                  |
| Tauri CLI `bundle --target x86_64-pc-windows-gnu --bundles nsis`                                                  | 最終版で `Finished 1 bundle`。署名なし・クロスビルド警告あり                                                                                        |
| 7-Zip `t` によるNSIS検査                                                                                          | アーカイブとして整合性確認。インストール試験とは別                                                                                                  |

Rustの追加試験には保存中の外部変更注入を含む。Windowsだけの11件目は共有なしファイルロックでの失敗・再試行。テストは一時ディレクトリだけを使用。

## 修正した問題と環境上の経緯

- Windows実テストでtempfileハンドルによるReplaceFileWの共有違反を検出。sync後に `into_temp_path()` でファイルハンドルを閉じてから置換するよう修正し、Windowsテストを再実行して成功。
- 連続入力中のプレビューで、入力リビジョンに完全一致する結果だけを採用すると更新が延期されうるため、最後にWorkerへ要求したリビジョンと照合するよう修正。遅い古い結果の排除と、連続入力中の直近スナップショットの採用を自動テスト。
- Tauriソースも確認し、Emitter::emitが全体配送であることを確認。閉じる要求・外部変更通知は明示したEventTarget::webview_windowへのemit_toへ変更し、受信もgetCurrentWebviewWindow().listenへ限定。コンパイル確認後に配布物を再生成。最終GUIでの配送受入は未実施。
- サンドボックス内ではWSLがE_ACCESSDENIED、esbuildが親ディレクトリでアクセス拒否。必要なテスト/ビルドだけ通常権限の実行へ切り替えた。
- WSL1ではLinux Nodeを直接実行するとExec format errorとなるため、標準ELFローダー経由で公式Linux Node/Tauri CLIを実行した。
- NSISはUbuntu公式debを.toolsへ展開し、wrapperでNSISDIRを指定。OSへインストールしなかった。
- 起動中の初期試作ファイルへの再bundleではPermission deniedが出た。初期生成物を最終扱いせず、別の `target/verified` に修正版を新規ビルドして最終bundle成功を確認。

## GUIで確認できた範囲

初期GNU試作を `.tools/gui/日本語 (テスト)/a.md` とb.mdの複数引数でWindows起動。単一プロセスにタイトルの異なる2独立ウィンドウが存在することを確認した。a.mdを前面表示し、左右分割、CodeMirror、行番号、日本語本文、GFMタスク・表、相対PNG、外部画像のブロック表示をスクリーンショットで目視した。

computer-useの最初の起動操作はアプリ承認タイムアウト。非UI起動後に画面確認はできたが、編集領域への操作時に実ユーザー入力が検出され、その後の再確認でEscによる操作停止が通知された。以後GUI操作は行っていない。**入力・保存・Undo・終了確認をGUIで実施済みとは扱わない。** 初期試作のウィンドウは未保存編集を守るため強制終了しない。最終バイナリは別の出力先で、初期試作を上書きしていない。

## 性能試験の境界

Vitest/jsdom、1万行・日本語リスト＋強調＋インラインコードの固定入力で1回計測：CodeMirror EditorStateの100追記4ms、marked変換81ms、jsdom DOMPurify939ms。これはWebView2の描画・IME・入力遅延を測定していない。環境差もあるため合格の時間閾値には使わず、実画面性能はN手順で確認する。Workerによる変換は実装済みだが、DOMサニタイズ/更新は主スレッドに残る。

## 残っている受入確認

MSVCでのビルド、最終成果物のGUI再確認、IME実変換・再変換、ウィンドウのスナップ/複数モニター、追加起動と同一ファイルフォーカスの実GUI試験、保存/終了/外部変更の実GUI試験、Save As後の画像基準、外部通信の実測、NSIS実インストール・関連付け・アンインストール、クリーン環境のWebView2不足時導入、1万行の体感性能。手順は `manual-tests.md` に用意した。

commit/push、リリース公開、外部サービス登録、実ユーザー文書の変更、既定アプリ変更は実行していない。

## 初版0.1.0の配布物の照合（当時の値）

2026-10-26 23:08 JSTの生成物を7-Zip 26.00で `t` 検査し、NSISとして整合性を確認。テスト専用フォルダーへ展開してWebView2Loader.dllと最新third-party-licenses.txtのSHA-256がソース側と一致することも確認した。

梱包内のwinmd.exeと直接実行用winmd.exeの差は、Tauriが標準で書き換える `__TAURI_BUNDLE_TYPE_VAR_UNK` → `__TAURI_BUNDLE_TYPE_VAR_NSS` の3バイトだけ。全バイト比較とTauri Utils 2.10.2のplatform.rsの定義で確認した。実装コードの差ではない。

| 成果物                                                                                | SHA-256                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `target/verified/x86_64-pc-windows-gnu/release/winmd.exe`                             | `4451D4C63B551E655CD7B50092C08B42F50679F907C1890A1AE8F40C2EBE7B10` |
| `target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.0_x64-setup.exe` | `208784ECF2133D5778762CA7FE63119C179F91B167934105B38A279F86B70D32` |

実行ファイル24,728,568バイト、インストーラー4,815,961バイト。インストーラーにwinmd.exe、WebView2Loader.dll、LICENSE、通知全文を含むことを確認。署名とインストール動作を検証したものではない。
