# 開発・ビルドガイド

ユーザー向けの使い方は[日本語README](../README.ja.md)、[English README](../README.md)を参照してください。この文書は従来のREADMEから開発・検証の詳細を整理したものです。

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

今回の環境ではRustをプロジェクト内の`.tools/`に置き、WSLから`bash scripts/rust-wsl.sh test -p winmd-core`を実行しました。Windows API試験は`--target x86_64-pc-windows-gnu`を追加します。通常環境では直接cargoを使用できます。

実行済みと未実施の区別は[検証記録](verification.md)、GUI受入手順は[手動テスト](manual-tests.md)を参照してください。現在のGNU試用ビルドはMSVCビルド・実クリップボード・関連付けなどの実GUI受入が未完了です。

関連付けを変更した場合は、Windows PowerShellから`./scripts/test-associations.ps1`も実行します。実際のNSIS書き込み行をコンパイルし、GUID付きの隔離レジストリへ書いて、コマンド・アイコンの引用符を確認します。テスト後に隔離キーを削除し、実際のUserChoiceや関連付けは変更しません。ネイティブのmakensis.exe、または今回の`.tools/nsis`のWSLコンパイラを使用します。

0.1.1で誤登録された引用符だけを修復する場合は`./scripts/repair-associations.ps1 -WhatIf`で確認してから同スクリプトを実行できます。既存WinMDのexe/DLL、既知の不正値との一致を確認し、変更前の値を`.tools/association-backups/`へバックアップします。UserChoiceは変更しません。不明な値や別インストールは上書きせず停止します。通常は0.1.2以降のインストーラーを使用してください。

## Windows MSVCビルド

```powershell
$env:CI='true'
pnpm desktop:build
```

設定されたbeforeBuildCommandが型チェックとフロントエンドビルドを実行し、NSISを作成します。ワークスペースルートの標準出力先：

- `target/x86_64-pc-windows-msvc/release/winmd.exe`
- `target/x86_64-pc-windows-msvc/release/bundle/nsis/WinMD_0.1.8_x64-setup.exe`

`CARGO_TARGET_DIR`で出力先を変更できます。今回生成したGNU試用版は`target/verified/x86_64-pc-windows-gnu/release/`にあります。[生成済みNSIS v0.1.8](../target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.8_x64-setup.exe)はこの作業フォルダー限定のリンクです。一般配布先は[GitHub Releases](https://github.com/sarulab-ou/winmd/releases)です（初回バイナリリリースは準備中）。

MSVC版は今回未生成です。Tauriが公式にサポートするWindowsターゲットはMSVCです。[公式Windowsビルド資料](https://v2.tauri.app/distribute/windows-installer/)

## 配布と関連付け

NSISはユーザー単位でインストールし、コード署名・自動更新は設定していません。WebView2が不足する場合はMicrosoftのbootstrapperをダウンロードします。WebView2導入済みなら、アプリのライブラリ・フォント・スタイルはローカルに揃います。[公式WebView2取扱い](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options)

`.md`と`.markdown`のOpenWith候補、ProgID、RegisteredApplications/CapabilitiesをHKCUへ登録します。既定値やUserChoiceは変更しません。通常の対話インストールでは、ユーザーが「はい」を選んだ場合だけWindows設定を開きます。サイレント・パッシブ・更新モードでは開きません。アンインストールはWindows設定から行います。

実行ファイルを別フォルダーへ移動する場合は、同じフォルダーの`WebView2Loader.dll`も必要です。NSISにはこのDLL、MITのLICENSE、依存ライブラリの通知全文を含めています。

## ライセンス通知の再生成

Windows PowerShell 7で、リポジトリルートから実行します。

```powershell
New-Item -ItemType Directory -Force .tools | Out-Null
cargo metadata --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc | Set-Content -Encoding utf8NoBOM .tools/cargo-metadata.json
pnpm licenses
```

`scripts/licenses.mjs`はインストール済みnpm依存、Cargoメタデータ、`docs/licenses/`の補足通知を統合します。現在の通知はGNU対象と開発依存も含みます。MSVCで再配布する前には対象を合わせて再生成してください。[補足通知の出典](licenses/README.md)

WinMD自身のライセンスは[MIT](../LICENSE)です。依存ライブラリのライセンスはそれぞれ維持します。

## 設計と制限

詳細は[設計判断](design.md)を参照してください。

- 同じ文書の保存を直列化し、保存中の追加入力は未保存のまま保持します。
- 不正UTF-8は拒否し、混在改行・単独CRの文書は読み取り専用です。
- クラッシュ復元、原本への自動保存、改行変換UI、外部変更への強制上書きは実装していません。
- ローカル画像はPNG/JPEG/GIF/WebPのみ。SVGや文書フォルダー外への追加許可UIは対象外です。画像のUndoで作成済みPNGを自動削除しません。
- 置換保存ではhard link関係を維持しません。別プロセスとの完全排他、ネットワークFSや電源断での原子性は保証しません。
- 大きい文書のDOMサニタイズ・更新は主スレッドを使用します。Viteの約720kBのチャンク警告があり、実画面の1万行入力性能は未測定です。
