# 開発・ビルドガイド

ユーザー向けの使い方は[README](../README.md)を参照してください。この文書では開発・検証の手順を説明します。

## Windows開発環境

- Windows 11 x64、Node.js 22.12以上、pnpm 11.25.0。
- Rust stable MSVC x64。現在のlockfileはRust 1.99.1で検証しました。
- Visual Studio 2022 Build Tools：「C++によるデスクトップ開発」、MSVC x64、Windows 10/11 SDK。
- Microsoft Edge WebView2 Evergreen Runtime。
- [Tauri公式前提条件](https://v2.tauri.app/start/prerequisites/)。Git/gh操作はWSLを使用します。

リポジトリルートでPowerShellから実行します。

```powershell
$env:CI='true'
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm desktop:dev
```

Corepackがない場合はpnpmを別途導入してください。`pnpm dev`はブラウザ用のフロントエンド起動であり、ネイティブのファイル操作にはTauri起動が必要です。

## テストと整形

リンクの描画・通常クリック・ドラッグ選択・読み取り専用の検証は`pnpm test:links`でも実行できます。既存Edgeを隔離したヘッドレス環境で起動し、CDPからtrustedマウスイベントを送り、両ペインのリンクコールバックを照合します。外部ブラウザの起動関数はモックに置き換え、外部サイトへは接続しません。結果は`.tools/links-smoke-result.json`に保存します。

```powershell
$env:CI='true'
pnpm run check
pnpm run test
pnpm run lint
pnpm run build
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo fmt --all -- --check
```

スクロール連動の実描画試験は`pnpm run test:scroll`で実行できます。Windowsの既存Edgeを専用プロファイルのヘッドレス環境で起動し、ローカル検証サーバーだけを使用します。別のChromium系ブラウザを使う場合は、`WINMD_BROWSER`に実行ファイルのパスを指定してください。結果は`.tools/scroll-smoke-result.json`に保存します。

この試験では左右からの追従、幅変更による折り返し、遅れて読み込まれる画像、追従の逆流がないことに加え、見出し・コード・表の実クリック座標からソースの文字位置へ移動することを確認します。Tauriのネイティブウィンドウを操作するGUI受入とは区別します。

0.1.11以降は数式の実レイアウト、数式クリック、印刷DOMも確認し、数式だけの印刷用fixtureを`.tools/math-print.html`へ出力します。`scripts/build-print-probe-wsl.sh`で非表示WebView2検証用exeを生成し、`print_smoke.exe <出力PDFのパス> <fixtureのパス>`の第2引数にこのHTMLを渡すと、製品と同じPDF生成関数で数式出力を検証できます。第2引数を省略した場合は従来の固定日本語fixtureを使います。

今回の環境ではRustをプロジェクト内の`.tools/`に置き、WSLから`bash scripts/rust-wsl.sh test -p winmd-core`を実行しました。Windows API試験は`--target x86_64-pc-windows-gnu`を追加します。通常環境では直接cargoを使用できます。

実行済みと未実施の区別は[検証記録](verification.md)、GUI受入手順は[手動テスト](manual-tests.md)を参照してください。現在のGNU試用ビルドはMSVCビルド・実クリップボード・関連付けなどの実GUI受入が未完了です。

関連付けを変更した場合は、Windows PowerShellから`./scripts/test-associations.ps1`も実行します。実際のNSIS書き込み行をコンパイルし、GUID付きの隔離レジストリへ書いて、コマンド・アイコンの引用符を確認します。テスト後に隔離キーを削除し、実際のUserChoiceや関連付けは変更しません。ネイティブのmakensis.exe、または今回の`.tools/nsis`のWSLコンパイラを使用します。

0.1.1で誤登録された引用符だけを修復する場合は`./scripts/repair-associations.ps1 -WhatIf`で確認してから同スクリプトを実行できます。既存SaruMDのexe/DLL、既知の不正値との一致を確認し、変更前の値を`.tools/association-backups/`へバックアップします。UserChoiceは変更しません。不明な値や別インストールは上書きせず停止します。通常は0.1.2以降のインストーラーを使用してください。

## Windows MSVCビルド

```powershell
$env:CI='true'
pnpm desktop:build
```

設定されたbeforeBuildCommandが型チェックとフロントエンドビルドを実行し、NSISを作成します。ワークスペースルートの標準出力先：

- `target/x86_64-pc-windows-msvc/release/SaruMD.exe`
- `target/x86_64-pc-windows-msvc/release/bundle/nsis/SaruMD_0.1.22_x64-setup.exe`

`CARGO_TARGET_DIR`で出力先を変更できます。今回生成したGNU試用版は`target/verified/x86_64-pc-windows-gnu/release/`にあります。公開用の[v0.1.22リリース](https://github.com/sarulab-ou/SaruMD/releases/tag/v0.1.22)から初回導入用インストーラー・更新用ZIP・SHA-256チェックサムを取得できます。

MSVC版は今回未生成です。Tauriが公式にサポートするWindowsターゲットはMSVCです。[公式Windowsビルド資料](https://v2.tauri.app/distribute/windows-installer/)

## 配布と関連付け

NSISは初回導入用で、ユーザー単位でインストールします。0.1.22以降の「ヘルプ → 更新…」はZIPを取得してファイルを置き換える方式です。0.1.21の更新は従来のNSIS方式です。コード署名と定期的な自動チェックは設定していません。WebView2が不足する場合は初回インストーラーがMicrosoftのbootstrapperをダウンロードします。ZIP自体はWebView2 Runtimeを導入しません。[公式WebView2取扱い](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options)

`.md`と`.markdown`のOpenWith候補、ProgID、RegisteredApplications/CapabilitiesをHKCUへ登録します。既定値やUserChoiceは変更しません。通常の対話インストールでは、ユーザーが「はい」を選んだ場合だけWindows設定を開きます。サイレント・パッシブ・更新モードでは開きません。アンインストールはWindows設定から行います。

実行ファイルを別フォルダーへ移動する場合は、同じフォルダーの`WebView2Loader.dll`も必要です。NSISにはこのDLL、MITのLICENSE、依存ライブラリの通知全文を含めています。

## 更新のダウンロードだけを検査する

配布ビルド後に更新用ZIPを作成します。実行ファイルとDLLに加え、リポジトリのライセンス通知を含めます。Windows PowerShell 5.1で実行できるよう、共有の更新処理・パッケージ化・テストのPS1はUTF-8 BOM付きで保存します。ネイティブコマンドは同じ共有処理をUTF-8で埋め込み、先頭BOMを除きUTF-16LE/Base64のEncodedCommandで実行します。子プロセスのPSModulePathはWindows標準モジュールに固定し、PowerShell 7などから継承する設定差を避けます。

```powershell
$env:CI='true'
pnpm package:update -BuildDirectory target/x86_64-pc-windows-msvc/release
pnpm test:update
```

GNU検証環境は`-BuildDirectory target/verified/x86_64-pc-windows-gnu/release`を指定します。出力先はビルド先の`bundle/update/`です。ZIPは`SaruMD_<version>_x64-update.zip`、内容は4ファイルと`update.json`です。同じビルドを再度パッケージ化した場合は同じZIPになります。パッケージ化後、製品と同じ展開・検証関数で内容を確認します。NSISが同じビルド先にある場合、`SHA256SUMS.txt`にはZIPとNSISの両方を含めます。リリース時は**初回導入用exe・更新用ZIP・SHA256SUMS.txtの3点**をGitHub Releasesへ添付してください。ZIPがないリリースは0.1.22以降の更新に使えません。

`src-tauri/examples/update_probe.rs`は製品と同じ取得・検証関数を使い、GitHubの公開ZIPを一時フォルダーへダウンロード・検証します。プログラムの実行、文書の終了、インストール先の変更は行いません。通常はネットワーク接続が必要です。`--local <ZIP> <リリース情報JSON>`ではローカルZIPを使って同じRust/PowerShell経路を検査できます。JSONはGitHub releases一覧と同じ配列形式で、パスや取得先の制約も同じです。ローカルモードでは通信しません。

```powershell
$env:CI='true'
cargo build -p winmd --example update_probe --release --features custom-protocol --target x86_64-pc-windows-msvc
./target/x86_64-pc-windows-msvc/release/examples/update_probe.exe
```

引数は比較用の現在バージョンです。省略時はビルドしたアプリのバージョンを使います。今回のGNU環境ではWSLから同じrelease/exampleを`x86_64-pc-windows-gnu`でビルドし、Windowsから実行しました。MinGWのdebug exampleはexport ordinal上限でリンクに失敗したため、releaseで検証しています。アプリの更新導線・未保存確認・実インストールのGUI受入は別途必要です。

## ライセンス通知の再生成

Windows PowerShell 7で、リポジトリルートから実行します。

```powershell
New-Item -ItemType Directory -Force .tools | Out-Null
cargo metadata --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc | Set-Content -Encoding utf8NoBOM .tools/cargo-metadata.json
pnpm licenses
```

`scripts/licenses.mjs`はインストール済みnpm依存、Cargoメタデータ、`docs/licenses/`の補足通知を統合します。現在の通知はGNU対象と開発依存も含みます。MSVCで再配布する前には対象を合わせて再生成してください。[補足通知の出典](licenses/README.md)

SaruMD自身のライセンスは[MIT](../LICENSE)です。依存ライブラリのライセンスはそれぞれ維持します。

## 設計と制限

詳細は[設計判断](design.md)を参照してください。

- 同じ文書の保存を直列化し、保存中の追加入力は未保存のまま保持します。
- 不正UTF-8は拒否し、混在改行・単独CRの文書は読み取り専用です。
- クラッシュ復元、原本への自動保存、改行変換UI、外部変更への強制上書きは実装していません。
- ローカル画像はPNG/JPEG/GIF/WebPのみ。SVGや文書フォルダー外への追加許可UIは対象外です。画像のUndoで作成済みPNGを自動削除しません。
- 置換保存ではhard link関係を維持しません。別プロセスとの完全排他、ネットワークFSや電源断での原子性は保証しません。
- 大きい文書のDOMサニタイズ・更新は主スレッドを使用します。Viteの約720kBのチャンク警告があり、実画面の1万行入力性能は未測定です。
