# 検証記録（最終更新：2026-10-29）

## v0.1.12公開結果

実装・公開資料をコミット`387b7f03fdc3a378141c1f5591246aa1e01e1e8d`としてmasterへpushし、2026-10-29 12:33:05 JSTに[SaruMD v0.1.12](https://github.com/sarulab-ou/SaruMD/releases/tag/v0.1.12)を公開した。APIで`isDraft=false`、`isPrerelease=true`、タグ対象が同コミットであることを確認した。Assetsは`SaruMD_0.1.12_x64-setup.exe`（6,312,241バイト）と`SHA256SUMS.txt`で、GitHub側digestは下記の検証済みインストーラーのSHA-256と一致する。

公開URLから認証ヘッダー・Cookie・curl設定ファイルを使わずに両Assetsを再取得し、`sha256sum -c SHA256SUMS.txt`でOKを確認した。masterの公開READMEも現在の原本とバイト一致し、リリースHTMLを取得できることを確認。取得結果は`.tools/public-release-0.1.12/`へ保存した。公開直前の型検査、Vitest 12ファイル56件、ESLint、Prettier全体チェックも成功した。コード・依存・配布物はビルド後に変更していないため、既存のRust・実起動・関連付け・配布物照合の確認を引き継ぐ。v0.1.8とv0.1.11のタグ・配布物は保持した。

## v0.1.12公開準備

生成済みの`SaruMD.exe`をユーザーの依頼で起動し、ProductName=SaruMD、ProductVersion=0.1.12を照合した。追加起動後も既存PID 29416の「無題」ウィンドウが存在することを確認。ユーザーから「OKです。release add commit push」と公開指示を受けた。README・開発ガイド・告知案のダウンロード先を0.1.12へ更新し、`docs/releases/v0.1.12.md`へ変更点・旧版からの切り替え・確認範囲をまとめた。以下の更新版0.1.12節の「未コミット・未公開」は、生成時点の記録として保持する。

## 更新版0.1.12：SaruMDへの名称変更と同一文書の再オープン

製品名・Windows実行ファイルをSaruMD / `SaruMD.exe`へ変更し、NSIS・関連付け・エラー表示・README・開発ガイド・告知案・サンプル・ライセンス通知の現在名を揃えた。既存のタグ、公開済みWinMDの配布物、過去の検証記録と提供PNGは保持した。アプリ識別子`jp.winmd.editor`、内部Rustパッケージ、DOM属性名は互換性のため維持する。旧版WinMDからの切り替え手順をREADMEへ記載し、SaruMDのProgID/Capabilitiesを専用に登録する。旧WinMDの登録とUserChoiceは自動変更しない。

既存文書を開く場合は、元のDocumentsの所有判定を使い、show→unminimize→set_focusで既存ウィンドウを表示・復元する。既存ウィンドウが消失した場合も無言で成功させずエラーにする。Rustの既存回帰試験へ、再オープン/hard linkが文書数・未保存テキスト・保存済みテキストを変えない検証を追加した。

型検査、Vitest 12ファイル56件、ESLint、Prettier全体チェック、Vite buildが成功。RustはLinux14件・Windows15件、Windows desktop/Linux coreのall-targets clippy（-D warnings）、fmt check、metadataが成功（`.tools/validate-0.1.12.log`）。502パッケージのライセンス通知を再生成。`scripts/test-associations.ps1`で実NSIS行を隔離HKCUへコンパイル・実行し、空白/日本語パスの6つのcommand/icon値とUserChoice不変を確認した。

Windows x64 GNUリリースとNSIS生成が成功（`.tools/final-build-0.1.12.log`）。初回は前日に失敗したサンドボックス試験プロセス（エラー通知のみ）がWebView2Loader.dllを保持していたためPermission deniedとなった。その試験プロセスだけを終了して再実行し、`Finished 1 bundle`を確認した。製品exeのProductNameはSaruMD、FileVersion/ProductVersionは0.1.12。7-Zipの`t`と隔離展開が成功し、`SaruMD.exe`はNSIS標準識別マーカーNSS/UNKだけを正規化してビルドexeと一致。現行UIの3アセット、WebView2Loader.dll、LICENSE、第三者通知を照合した。梱包に旧`winmd.exe`はない。既存のチャンクサイズ・GNUクロスビルド・署名なし警告は継続。

成果物：`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/SaruMD_0.1.12_x64-setup.exe`、6,312,241バイト、SHA-256 `477e20517854af1ef92f56297dbda10cb7a6d8b8018ee908bd18476ccb080404`。

実Windowsデスクトップで試験用の日本語/空白パスを起動した。同じ相対パスの追加起動は終了コード0で既存プロセス・同じウィンドウID 529750を保持した。hard linkの最初の試行は追加プロセスが15秒以内に終了せず、その時点で元プロセスも消失していたため合格に含めない。その後、起動中のPID 29416を開始前後で照合して元パスを再度開く試験を行い、追加プロセスは終了コード0、PID 29416とhard link文書のウィンドウID 2893484が変わらず、1プロセス・1ウィンドウを確認した。画面取得は`Computer Use was not approved to use sarumd`で拒否されたため、最小化/非表示からの復元とOSの前面フォーカスのGUI受入は未実施。試験文書だけを開いたままとし、ユーザーの実文書を変更していない。

ユーザーの依頼によりGitHubリポジトリを`https://github.com/sarulab-ou/SaruMD`へ改名し、originも同URLの.gitへ更新した。APIで名前とPUBLICを確認し、認証なしで新URLを取得、旧`/winmd` URLが新URLへ転送されること、v0.1.11の公開リリースが維持されることも確認した。ローカルの作業フォルダー名は維持。コードのcommit/push、0.1.12のReleases公開、実インストール/アンインストールは実行していない。

## v0.1.11公開結果

実装・資料をコミット`445d07fb78bb98dbbff37798ce998accb085d7c2`としてmasterへpushし、2026-10-28 17:00:51 JSTに[v0.1.11](https://github.com/sarulab-ou/winmd/releases/tag/v0.1.11)を公開した。GitHub APIで`isDraft=false`、`isPrerelease=true`、タグの対象が同コミットであることを確認。Assetsのインストーラーは6,309,487バイトで、GitHub側のdigestが下記のローカルSHA-256と一致した。`SHA256SUMS.txt`も添付した。

認証ヘッダー・Cookie・curl設定ファイルを使わずに公開URLからインストーラーとチェックサムを再取得し、`sha256sum -c SHA256SUMS.txt`でOKとなった。masterの公開READMEも現在の原本とバイト一致し、リリースHTMLが取得できることを確認。取得結果は`.tools/public-release-0.1.11/`へ保存した。公開直前に型検査、Vitest 12ファイル56件、ESLintとPrettier全体チェックを再確認し、成功した。コード・依存・配布物はビルド完了後に変更しておらず、既存のRust・PDF・配布物照合の記録を引き継ぐ。v0.1.8のタグと配布物は変更していない。

## v0.1.11の実ウィンドウ確認・公開準備

Windowsデスクトップでビルド済みのv0.1.11を直接起動し、新規文書へ日本語とTeXのサンプルを入力した。起動プロセスのパスを`target/verified/x86_64-pc-windows-gnu/release/winmd.exe`と照合し、実画面で分数・根号・総和・積分・行列・alignedの表示を確認した。ユーザーから「OKです」と動作確認を受け、release/add/commit/pushの依頼を受けた。先頭へ戻す操作時にEscで操作が停止したため、その移動は完了と扱わない。試験文書は未保存で開いたままとし、実ユーザー文書は変更していない。実プリンター、インストーラーの対話受入、GUI全体の試験は引き続き未完了。

公開対象は検証済みの0.1.11インストーラー（下記ハッシュ）と`SHA256SUMS.txt`。READMEのダウンロード先・開発ガイド・告知案を0.1.11へ更新し、`docs/releases/v0.1.11.md`に変更点・確認範囲をまとめた。公開済みv0.1.8のタグと配布物は保持する。以下の各節の「未公開・未コミット」は、各更新版を作成した時点の記録である。

## 更新版0.1.11：TeX数式表示

`$...$`のインライン数式と`$$...$$`の独立/複数行数式に対応した。KaTeX 0.19.1でMathMLをWorker生成し、HTML用/MathML用の2段階のDOMPurifyを通して表示する。通常のコード・エスケープしたドル・生HTMLは数式として解釈しない。TeXの外部通信/HTML拡張はtrust=falseで無効にし、式長・個数・生成量・展開回数・指定サイズを制限した。エラーは元式を保持して表示し、本文全体の変換を止めない。前の未コミットのクリック移動も引き継いだ。

型検査、Vitest 12ファイル56件、ESLintが成功。MathMLの名前空間/分数/根号/行列、インライン/複数行、空白・エスケープ・コード除外・不正構文・再帰マクロ・個数/式長の上限・TeXからのURL/画像/HTML/CSS拒否・印刷DOM・数式の元位置を確認。実描画試験もPASSで、4数式、上下に積まれた分数（間隔9.265625 px）と2行の行列を確認し、数式クリックがソース位置31と一致した。既存の双方向スクロールと見出し/コード/表クリックも成功した。

実描画の印刷DOMから`.tools/math-print.html`を出力し、非表示のWebView2プローブで製品のPDF生成関数を実行した。終了コード0、`PASS: native WebView2 PDF: 39800 bytes`を確認。`.tools/math-print-0.1.11.pdf`はA4・1ページで、末尾`MATH_PRINT_END`を含むことを確認し、全ページをPNGへ描画して目視した。文中の上付き/分数、独立した総和・分数・行列の文字・記号・罫線が表示され、重なりや欠落はなかった。終了時の既知のWebView2 unregister class 1412メッセージは出たが、PDF生成とプロセス終了は成功した。

RustのLinux14件・Windows15件、all-targets clippy（Windows desktop/Linux core、-D warnings）、fmt checkとPDFプローブのビルドが成功（`.tools/validate-0.1.11.log`、`.tools/build-math-print-probe.log`）。新しいnpm依存KaTeXとcommanderを含む502パッケージの第三者通知を再生成した。数式フォントはOSフォントを使い、新しいフォントファイルは同梱しない。

Prettier全体チェック、Vite build、Windows x64 GNUリリースとNSIS生成が成功（`.tools/final-build-0.1.11.log`）。7-Zipの`t`と隔離展開が成功し、展開exeは標準NSIS識別マーカーを正規化してビルドexeと一致した。WebView2Loader.dll・LICENSE・第三者通知も一致。現在の3アセット（`index-B1Wlxx9u.css`、`index-BHHEUHe1.js`、`preview-worker-BjJGxgIi.js`）の同梱と、FileVersion/ProductVersionが0.1.11であることを確認した。既存のチャンクサイズ・署名なし・クロスビルド警告は継続。

成果物：`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.11_x64-setup.exe`、6,309,487バイト、SHA-256 `4b5351c626627718bbc30123a5da1ffd822a590e7e5521022edae46aa230179b`。

最終アプリの手動操作・実プリンター・インストーラーの対話受入は今回未実施。PDF保存ダイアログを含めた受入全体の完了とは扱わない。既存インストールの置き換え、commit/push、0.1.11のGitHubリリース公開は行っていない。

## 更新版0.1.10：プレビューのクリック位置からソースへ移動

プレビューの文字を通常クリックすると、左側の対応する文字へカーソルを移し、編集領域にフォーカスして表示位置を調整する機能を追加した。現在の描画元テキストと一致する場合だけ位置を採用する。太字などの繰り返し、コードフェンスの言語指定、引用の接頭辞、表の行/列を考慮し、一意の対応が見つからない書式はブロック先頭へ移動する。リンク・範囲選択・修飾付き/複数クリック・変換待ち・IME・モーダル・PDF準備中は移動しない。文書内容とUndo履歴を変えず、読み取り専用でもカーソル移動は可能とした。

型検査、Vitest 11ファイル47件、ESLintが成功。位置照合5件、文書/Undoを変更しない移動1件、選択・リンク・修飾キー・古いスナップショットを尊重する制御1件を追加。既存の位置付きプレビュー、印刷時のマーカー除去、1万行試験なども成功した。RustのLinux14件・Windows15件、all-targets clippy（Windows desktop/Linux core、-D warnings）、fmt checkが成功（`.tools/validate-0.1.10.log`）。依存ライブラリは増やしていない。

既存のヘッドレスEdge試験を拡張し、実際のDOM文字の描画座標をクリックした場合のソースUTF-16位置を確認した。見出し5350、コード5854、表セル5827で、期待値と実際のカーソル位置が完全一致し、本文の不変とフォーカスも確認した。既存の双方向スクロール・リサイズ・遅延画像・逆流防止もPASS。結果は`.tools/scroll-smoke-result.json`、手順は`node scripts/test-scroll.mjs`。Tauri最終アプリでの手動クリック・ドラッグ/コピー・IMEのGUI受入は今回未実施。

TeX数式は既存のコード/依存を確認し、数式レンダラー未実装であることを確認した。今回も`$...$`や`$$...$$`の数式描画は追加せず、READMEへ未対応の説明を追記した。

Vite build、Windows x64 GNUリリース、NSIS生成が成功（`.tools/final-build-0.1.10.log`）。7-Zipの`t`と隔離展開が成功し、exeは標準NSIS識別マーカーを正規化してビルドexeと一致、WebView2Loader.dll・LICENSE・第三者通知も一致した。現在のフロントエンド3アセットをexe内で照合し、FileVersion/ProductVersionが0.1.10であることを確認した。既存のチャンクサイズ・署名なし・クロスビルド警告は継続。

成果物：`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.10_x64-setup.exe`、6,247,041バイト、SHA-256 `84d70218ee3fc0a05661d23a552cfcc6d88abd0f408d2be7231fa99a841401eb`。既存インストールの置き換え、commit/push、0.1.10のGitHubリリース公開は行っていない。

## 更新版0.1.9：左右のスクロール連動

左右どちらの操作でも追従するスクロール連動を実装した。Markdownの生成ブロックの元行と、CodeMirror/プレビューの実際の高さを対応付け、間を補間する。幅変更・画像読み込み後の位置保持、追従の逆流防止、古いプレビューでの追従停止を追加した。文書端はスクロール可能範囲に制限し、段落・引用・コード内部などは補間とする。HTMLエスケープ、DOMPurify、iframe sandbox/CSPを維持し、行番号マーカーは印刷前に除去する。

型検査、Vitest 10ファイル40件、ESLint、Vite buildが成功。新しい8件の試験は元行の対応・不正HTML/マーカー・異なる高さの補間・双方向/ループ抑止・先頭/末尾・古いプレビュー・高さ再計測・リサイズ・iframe外側のスクロールバー入力などを確認した。既存の1万行試験も実際のWorkerと同じ位置付きMarkdown変換へ切り替えた。Linux14件・Windows15件のRust test、Windows desktop/Linux coreのall-targets clippy（-D warnings）、fmt checkが成功（`.tools/validate-0.1.9.log`）。既存のViteチャンクサイズ警告は継続。

`node scripts/test-scroll.mjs`で、40セクションの日本語・折り返し・リスト・表・コード・遅延PNGを含むfixtureを既存Edgeの隔離プロファイルで実行し、PASSとなった。アプリと同じCodeMirror・Preview・Worker・sandbox iframe・スクロール制御を使用。実描画での対応見出しのずれは、左→右0.734375 px、右→左0.484375 px、幅変更後0.53125 px、遅延画像の読み込み後0.65625 px、待機後0.65625 pxで、確認したケースでは1 px未満だった。結果は`.tools/scroll-smoke-result.json`、再実行可能なfixtureは`tests/browser/scroll-sync.*`、実行スクリプトは`scripts/test-scroll.mjs`にある。

検証中に単純な論理行内補間で折り返しとのずれ、追従先の再計測が操作元を奪う逆流、幅変更で物理scrollTopだけを保持するずれを検出した。両側の対応ブロックの実ピクセル間を補間し、入力により操作元を選び、レイアウト変更では共通の文書位置を保持する方式へ修正して再検証した。初期の一時サーバーは検証用ブラウザのプロファイルを監視して停止したため、正式な検証スクリプトではファイル監視を止め、実時間で結果を回収する。

これはヘッドレスEdgeでの描画試験であり、Tauri最終アプリの実ホイール・トラックパッド・スクロールバー・IME・PDFダイアログの受入を完了したとは扱わない。手順はmanual-tests.mdへ追加した。0.1.8の公開済みリリース・タグ・インストーラーは変更せず、0.1.9をローカル更新版として用意する。

Windows x64 GNUリリース・NSIS生成が成功し、`.tools/final-build-0.1.9.log`で`Finished 1 bundle`を確認した。7-Zipの`t`と隔離展開に成功。展開exeはNSISの標準NSS/UNK識別マーカーだけを正規化してビルドexeと一致し、WebView2Loader.dll・LICENSE・第三者ライセンス通知も一致した。現在のdistの3アセット名（`index-B1Wlxx9u.css`、`index-Ce5ODZZp.js`、`preview-worker-C2-P0i1N.js`）がexeに含まれることを確認し、最新フロントエンドの同梱を検証した。署名なしGNUクロスビルドの既存警告は継続。

成果物：`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.9_x64-setup.exe`、6,244,288バイト、SHA-256 `952dea46f455e25b44ef149baa59d8cb19249668d1a8269e6bbc532dc339370c`。インストール済みアプリの置き換え、commit/push、GitHubへの0.1.9リリース公開は行っていない。

## スクリーンショットのPNG差し替え・READMEの日本語一本化

ユーザー提供の`editor-ja.png`を`docs/screenshots/editor-ja.png`へ加工せずコピーした。PillowでPNG形式・1477×1039ピクセル・149,817バイトを確認し、原本とコピーのSHA-256が`5459f1515f08827b62f6d68efa8a2b3e11610bc7aabfd4f1da92959bf0c99257`で一致した。JPEGからの変換や撮り直しはしていない。

README.mdを日本語へ統一し、宣伝的な冒頭の一文と言語切り替えを削除。独立したREADME.ja.mdは削除し、開発ガイドの参照先をREADME.mdへ変更した。READMEと日本語の告知案には提供PNGを1枚掲載し、従来のJPEG3枚とそれらへのリンク・英語の告知案を整理した。過去の検証記録と公開済みv0.1.8タグの内容は履歴として維持する。

Prettier全体チェックに成功し、READMEとdocs配下のMarkdown全11ファイルに含まれるローカルリンク/画像29件がすべて存在することを確認した。リリースノート末尾の使い方リンクは現在のREADMEへ変更し、古いJPEGを参照するタグ内READMEへの案内を外した。アプリコードと配布インストーラーは変更していないため、アプリのテスト・再ビルドは繰り返していない。

## v0.1.8公開結果

ユーザーの明示的な依頼により、`sarulab-ou/winmd`をPUBLICへ変更し、[v0.1.8](https://github.com/sarulab-ou/winmd/releases/tag/v0.1.8)を2026-10-28 09:49:29 JSTに公開した。GitHub APIで`visibility=PUBLIC`、`isDraft=false`、`isPrerelease=true`を確認。リリース対象は`40f2d6e814a9ac9e10132c5cad504088d9921d41`で、Assetsには`WinMD_0.1.8_x64-setup.exe`（6,242,916バイト）と`SHA256SUMS.txt`（92バイト）がある。GitHub側のexeのdigestも記録済みSHA-256と一致した。

curlの設定ファイル・認証ヘッダー・Cookieを使わず、リポジトリHTML、リリースHTML、両READMEのraw、日本語READMEのHTML、スクリーンショット3枚、チェックサム、インストーラーの計10 URLを取得した。両READMEと画像3枚はローカルとバイト一致し、取得したexeは`sha256sum -c SHA256SUMS.txt`でOKとなった。結果は`.tools/public-release-0.1.8/`に保存した。ブラウザの描画・インストーラーの新規実行はこの公開確認には含まない。

両READMEにv0.1.8の直接ダウンロード・リリースノート・チェックサムのリンクを追加し、公開準備中の説明を公開済みプレリリースへ更新した。開発ガイドと告知案も同じ配布状況へ更新。Prettier全体チェックが成功し、README・告知案・リリースノート内のローカルリンク/画像39件が存在することを確認した。アプリコードは変更していないため、直前の公開資料更新で成功した型検査・32件のフロントエンドテスト・ESLint・Vite build、Linux14件/Windows15件のRust test・clippy・fmtの記録を引き継ぐ。Twitter投稿はしていない。

## v0.1.8配布前の成果物確認

既存のv0.1.8インストーラー（6,242,916バイト）のSHA-256が、0.1.8ビルド時の記録`c16e57ca25f9763fe7cd2c2666dec21cff9fe352ed96e37678ff08b39880e3db`と一致した。7-Zipの`t`と隔離フォルダーへの展開に成功。展開したexeはTauri標準のNSIS識別マーカーNSS/UNKだけを正規化してビルド済みexeと完全一致し、WebView2Loader.dll・MIT LICENSE・第三者ライセンス通知は現在の原本とハッシュ一致した。FileVersion/ProductVersionはいずれも0.1.8。

ビルド済みアプリの変更を含む`5aa452f`から今回の公開資料更新までは文書・画像の変更のみで、アプリコード・依存lockfile・バージョン変更はない。既存の確認済みインストーラーを配布し、再ビルド・再インストールは行わない。署名なしGNU試用版であるため、GitHub Releasesではプレリリースとして扱い、未完了のGUI/インストール受入をリリースノートとREADMEに明記する。チェックサムファイルも配布する。

公開前の4コミットを既知の秘密鍵・GitHub/OpenAI/AWS認証情報パターンで検索し、一致はなかった。これは限定的な形式検索であり、網羅的な秘密情報監査ではない。生成物や`.tools/`はGitに含めず、インストーラーはReleasesのAssetsへ掲載する。

## 公開準備：README・スクリーンショット・告知文

日本語・英語READMEを、実画面、主な機能、公開用ダウンロード先、使い方、ショートカット、制限の順に更新した。作業フォルダー内のインストーラーへのリンクを一般利用者向けのGitHub Releasesへ変更し、バイナリ未公開の説明を付けた。開発ガイドの生成物名は現行0.1.8へ更新。アプリのコード・バージョン・依存のlockfileは変更していない。

GitHubの確認時点でリポジトリはPRIVATE、`gh release list --limit 5`は空だった。リポジトリの公開範囲変更・リリース作成・Twitter投稿は行っていない。公開後に使う文案と公開準備中の文案を`docs/announcement.md`へ分け、添付順と代替テキスト案を付けた。

Windows上のインストール済みWinMD（exeのFileVersion/ProductVersionともに0.1.8）で、`docs/examples/notes.ja.md`と`notes.en.md`をCtrl+Oから開いた。見出し・チェックリスト・表・コードの左右表示、Alt+FでPDF出力/印刷/ショートカットの表示、Escでメニューを閉じる操作を確認。サンプルの外部整形後、変更内容の反映と「外部の変更を反映しました」の表示も確認した。撮影は対象のWinMDウィンドウだけに限定し、JPEG3枚（各1182×831）を再圧縮せず保存した。撮影手順と対象サンプルは`docs/screenshots/README.md`に記載した。

型検査、Vitest 9ファイル32件、ESLint、Prettier全体チェック、Vite buildが成功。プロジェクトスクリプトと同じ各ローカルCLIを直接実行した。RustはLinux14件・Windows15件のcore test、Windows desktop/Linux coreのall-targets clippy（-D warnings）、fmt checkが成功（`.tools/validate-readme-publication-20261028.log`）。既存のViteチャンクサイズ警告は継続。README・告知・画像説明・サンプル内のローカルリンク/画像46件はすべて存在し、PillowでJPEGの形式・寸法を確認した。

初回のpnpm実行はサンドボックス内でnode_modulesの再構成が停滞したため中止し、通常権限の実行でローカルキャッシュからoffline/frozen-lockfile復元した。esbuildのサンドボックス内での読み取り拒否も、通常の実行環境で再検証して解消した。依存バージョンやlockfileの更新はない。

今回のGUI確認は文書表示・メニュー・外部更新に限る。実クリップボード、PDF保存ダイアログ、実プリンター、IME、インストーラー全体の受入を完了したとは扱わない。新しいネイティブビルド・インストーラーは生成していない。GitHubの非ログイン状態でのREADME/画像表示も、まだ非公開のため未確認。公開後の確認手順をmanual-tests.mdへ追加した。

## 更新版0.1.8：タイムスタンプ形式

Windows x64 GNUリリース・NSIS生成と7-Zipの`t`が成功（`.tools/final-build-0.1.8.log`）。成果物は`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.8_x64-setup.exe`、6,242,916バイト、SHA-256 `c16e57ca25f9763fe7cd2c2666dec21cff9fe352ed96e37678ff08b39880e3db`。既存の署名なし・クロスビルド・チャンクサイズ警告は継続。既存インストールの置き換えとcommit/pushはしていない。

F5/編集メニューで挿入する日時を`yyyy/mm/dd hh:mm:ss`（PCローカル時刻・24時間制）へ変更。年は4桁、月日・時分秒は2桁とし、画像ファイル名の形式は変更していない。入力日時と出力例に食い違いがあったため、指定された形式に従って実際の日時をそのまま表示する実装とした。

既存テストの日時を2026年1月3日8時32分2秒へ更新し、`2026/01/03 08:32:02`の出力・選択置換・Undo/Redoを確認。Vitest 9ファイル32件、型検査、ESLint、Prettier、Vite buildが成功。RustのLinux14件・Windows15件、all-targets clippy（Windows desktop/Linux core、-D warnings）、fmt checkも成功（`.tools/validate-0.1.8.log`）。実GUI操作は今回未実施。

## 更新版0.1.7：左右の見出し行を削除

Windows x64 GNUリリース・NSIS生成と7-Zipの`t`が成功（`.tools/final-build-0.1.7.log`）。成果物は`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.7_x64-setup.exe`、6,242,383バイト、SHA-256 `4a2cc052cd8bf289df057723d9535ff9cff864f472f6963cc0eb8c47798c5bcd`。既存の署名なし・クロスビルド警告は継続。インストール済みアプリの置き換えとcommit/pushはしていない。

「MARKDOWN／ソース」「PREVIEW／プレビュー」の2行と専用CSSを削除。左右のsectionのaria-label、iframeのtitle、編集領域のラベルは残し、画面上の見出し行だけをなくした。

型検査、Vitest 9ファイル32件、ESLint、Prettier、Vite buildが成功。RustのLinux14件・Windows15件、all-targets clippy（Windows desktop/Linux core、-D warnings）、fmt checkも成功（`.tools/validate-0.1.7.log`）。既存のチャンクサイズ警告は継続。実GUIでの表示・操作は今回未実施。manual-tests.mdへ確認手順を追加した。

## 更新版0.1.6：フルパスをタイトルへ移動

タイトルを`ファイル名 (フルパス)`形式に変更し、メニュー直下のパス行・CSS・DOM参照を削除。表示ではWindowsの`\\?\`を外し、`\\?\UNC\server\share\...`は通常の`\\server\share\...`にする。I/Oに使用するcanonical pathは加工しない。未保存の`*`と保存先のない文書の「無題」を維持し、既存のrefresh経由でSave As後もタイトルを更新する。

TypeScript型検査、Vitest 9ファイル32件、ESLint、Prettier、Vite buildが成功。削除したパス行を使っていた既存メニューテストの外側クリック先は編集領域に変更した。RustはLinux14件・Windows15件、all-targets clippy（Windows desktop/Linux core、-D warnings）、fmt checkが成功（`.tools/validate-0.1.6.log`）。Windows x64 GNUリリース・NSIS生成と7-Zipの`t`が成功（`.tools/final-build-0.1.6.log`）。既存のチャンクサイズ・署名なし・クロスビルド警告は継続。

成果物：`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.6_x64-setup.exe`、6,245,036バイト、SHA-256 `fb9f8804da1843894047fd3e525cfdee8aa2e5844bf667ef5efef3d31f8dcb91`。

実GUIのタイトル表示・UNC共有・Save Asと、インストーラーの対話操作は今回未実施。manual-tests.mdへ手順を追加した。既存インストールの置き換えとcommit/pushはしていない。

## 更新版0.1.5：編集メニュー

「編集 (E)」（Alt+E）に、元に戻す（Ctrl+Z）、切り取り（Ctrl+X）、貼り付け（Ctrl+V）、選択削除（Del）、検索（Ctrl+F）、次/前（F3/Shift+F3）、置換（Ctrl+H）、タイムスタンプ（F5）を追加し、キーを各項目右に表示した。タイムスタンプはローカル時刻の年2桁`YYMMDD_HHMMSS`（例：`261027_123456`）。F5によるWebView再読み込みを抑止する。画像ファイル名の年4桁形式は維持する。ファイル/編集のメニュー操作を共有し、左右移動、disabled項目、最小ウィンドウのスクロールに対応した。

切り取り・メニュー貼り付けは公式Tauri clipboard-manager 2.5.0をRustから使用。所有文書を検証する専用コマンドに限定し、汎用JSプラグイン権限は追加していない。通常のCtrl+X/Vはエディタの標準動作を維持する。画像のメニュー貼り付けはPNGへ変換し、既存の保存/位置追跡処理へ渡す。切り取りは書き込み成功前に本文を消さず、非同期処理中の文書/選択変更を検出して中止する。メニュー表示・起動時にクリップボードの内容は読み取らない。

実施済み：TypeScript型検査、ESLint、Prettier、Vite build、Vitest 9ファイル32件。追加試験はタイムスタンプの選択置換とUndo/Redo、クリップボード失敗時の本文保持・途中変更の拒否、テキスト改行正規化、画像メニューと既存保存処理の接続、検索の前後/折り返し、置換欄のフォーカス、読み取り専用、Alt+Eと左右メニュー移動。クリップボードはモックを使用し、実ユーザーの内容を読み書きしていない。

RustはLinux14件・Windows15件のcore test、desktop Windows/core Linuxのall-targets clippy（-D warnings）、fmt checkが成功（`.tools/validate-0.1.5.log`）。Windows x64 GNUリリースとNSIS生成に成功（`.tools/final-build-0.1.5.log`）。7-Zipの`t`、展開後exeの標準UNK→NSSマーカー正規化比較、ライセンス通知全文のハッシュ照合が成功した。追加依存の全文通知を再生成し、clipboard-winのBSL-1.0本文も公式SPDXから補足した。既存のチャンクサイズ・署名なし・クロスビルド警告は継続。

インストーラー：`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.5_x64-setup.exe`、6,243,013バイト、SHA-256 `03600e24b59d19de014fa4f2f4270fe500eef538fe131b64fb81fea74b4df790`。

未実施：実GUIのメニュー/キー操作、実クリップボードのテキスト・画像貼り付け、IMEとの組み合わせ、v0.1.5インストーラーの対話受入。手順はmanual-tests.mdへ追加済み。既存インストールの置き換え、commit/pushは行っていない。

## 更新版0.1.4：上部バーの簡素化

右上の「検索・置換」と外部画像許可チェックを削除し、それらを参照していたイベント登録・印刷時のdisabled切り替え・CSSも削除した。左上を「ファイル (F)」に変更し、Fを下線表示。既存のAlt+F、Ctrl+F／Ctrl+Hを維持する。外部画像は初期ブロックのままで、現在のUIには許可操作を置かない。

`pnpm run check`、`pnpm run test`（8ファイル25件）、`pnpm run lint`、`pnpm run build`が成功。削除したボタンをフォーカスする既存メニューテストは、既存の分割境界へ変更した。RustはLinux14件・Windows15件のtest、desktop Windowsとcore Linuxのclippy（all-targets、-D warnings）、fmt checkが成功。フロントエンド約724 kBのチャンク警告は継続。

Windows x64 GNUリリースとNSIS生成が成功し、`.tools/final-build-0.1.4.log`の`Finished 1 bundle`を確認。7-Zipの`t`も成功。署名なし・クロスビルド警告は継続。インストーラーは4,994,430バイト、SHA-256は`37637689702aad9aa6a772dc56890ae0c25151c1188afad06552c9671791b527`。

成果物：`target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.4_x64-setup.exe`。実GUIでの表示・キー操作・インストールは今回未実施。既存インストールは置き換えていない。manual-tests.mdへ受入手順を追加し、README両言語の説明とインストーラーリンクを更新した。

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
