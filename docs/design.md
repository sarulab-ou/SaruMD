# 設計判断

## GitHubからの手動更新（0.1.21）

「ヘルプ (H) → 更新…」は`https://api.github.com/repos/sarulab-ou/SaruMD/releases?per_page=100`から固定リポジトリの公開リリースを取得する。現在の配布が試用版のため、試用版を除外する`/latest`ではなくreleases一覧を使い、公開済みで現在より大きいsemverを選ぶ。最新版に必要な配布物が欠けていた場合は古い版へフォールバックせず、エラーにする。

取得するのは同リポジトリ・同タグの`SaruMD_<version>_x64-setup.exe`と`SHA256SUMS.txt`のみ。GitHub APIのSHA-256 digest、チェックサムファイル、実際のバイト数・SHA-256・PE先頭を照合する。上限はインストーラー100 MiB、API 4 MiB、チェックサム64 KiB。Windows PowerShell/.NETでHTTPSのみを使い、証明書検証を維持し、GitHubと配布CDNへのリダイレクト回数・待ち時間を制限する。これは信頼したGitHub配布物との整合性検証であり、コード署名や独立した署名鍵の検証ではない。

文書所有権を確認する4つの限定IPCで、確認・ダウンロード・終了開始・キャンセルを行う。呼び出し元はURL・パス・実行コマンドを指定できない。更新を始めたウィンドウへ確認/ダウンロードを予約し、別ウィンドウによる横取りを防ぐ。既存のpreview sandbox、DOMPurify、CSPと汎用HTTP/fs/shell権限は広げない。

検証済みの一時ファイルを保持した後、セッション番号付きの終了要求を1ウィンドウずつ送る。通常の保存・破棄・キャンセルとrevisionの保護を通し、保存キャンセル/失敗や既存モーダルは更新を中止する。終了確認中は文書の新規作成・オープンを止める。最後の文書が終了ガードを通ってから隠した補助プロセスを起動し、旧プロセスの終了を最大120秒待ち、再度SHA-256を確認してNSISを`/P /UPDATE /R /D=<現在のインストール先>`で実行する。文書を確認せず強制終了しない。インストール成功後は自分のインストーラーファイルと空の一時ディレクトリだけを削除し、再帰削除しない。

自動の定期チェックは行わない。0.1.20以前には更新ボタンがないため、初回はインストーラーによる導入が必要。

## SaruMDへの名称変更

0.1.12から製品名と配布実行ファイルをSaruMDに変更した。実行ファイルは`SaruMD.exe`、インストーラーは`SaruMD_0.1.12_x64-setup.exe`。GitHubリポジトリは`https://github.com/sarulab-ou/SaruMD`。

アプリ識別子`jp.winmd.editor`は継続し、single-instanceの同じキューとWebView2データを利用する。内部のRustパッケージ名・`crates/winmd-core/`・プレビューのDOM属性名も互換性のため維持する。旧版を起動したまま新exeを開くと旧プロセスへ要求が転送されるため、切り替え前に旧版を保存・終了する。関連付けはSaruMD専用のProgID/Capabilitiesで登録し、旧WinMDの登録・WindowsのUserChoiceを自動変更しない。

同一ファイルはファイルIDで既存文書へ解決し、既存ウィンドウをshow→unminimize→set_focusする。元の未保存テキストを再読込せず、別ウィンドウも作らない。

## 文書とウィンドウ

0.1.13からメニュー直下に読み取り専用のアドレスバーを置く。DocumentStateのpathを表示用に整形し、ドライブの`\\?\`を除去、UNCの`\\?\UNC\`を通常の`\\`にする。保存先の実パスは変えない。初期読込・保存成功・再読み込みのrefreshで同期し、保存キャンセル/失敗では元のパスを保持する。同じパスの本文編集ではinputのvalueを再設定せず、コピー用の選択と横スクロールを維持する。印刷時は既存のapp非表示規則に含める。

Alt+Dは既存のアプリ共通ショートカット処理で扱い、メニューを閉じてアドレス欄へfocus→selectする。プレビューiframeからも既存のキー転送処理で伝達する。IME変換・モーダル・排他的処理の保護を維持し、Ctrl/Shift/Metaを伴うAlt+Dは対象にしない。

Tauri 2の1バックエンドが `Documents` を管理し、`doc-N` ごとに独立したWebviewWindowを生成する。タブや共有プレビューは作らない。各WebViewのCodeMirror、Undo、DocumentState、保存キュー、Worker、外部画像の許可状態は独立している。未編集の空ウィンドウも再利用せず、例外処理を減らした。

起動要求はsingle-instanceプラグインからRustキューへ入り、setup完了後に処理する。初回も追加起動もパスをバックエンドへ保持するため、フロントエンドの準備前のイベント消失を避ける。相対パスは要求ごとのcwdで解決する。起動時の個別ファイルエラー後も最低1つの文書ウィンドウを確保する。

既存ファイルはcanonicalizeとsame-fileのファイルIDで比較する。保存先の予約・別ウィンドウ所有確認・I/Oは共通Mutexの内側で直列化する。文書数が少ない初版では、細かなロック構造より一貫性を優先した。新規保存先の親フォルダーもcanonicalizeする。

## 保存と終了

0.1.20ではHTML文書のtitleを、保存先のbasenameから拡張子を除いて.pdfを付けた名前へrefresh時に同期する。PDF保存ダイアログの既存のRust file_stem規則と揃え、WebView2の印刷用文書名へも使う。未保存は`無題.pdf`。ShowPrintUIが非同期にタイトルを利用できるよう即時に元の「無題」へ戻さず、保存先の変更時に更新する。ネイティブウィンドウのタイトルは従来どおりRust側で`ファイル名 (フルパス)`を管理する。

Rustは文書の保存済み文字列、ディスク上の元バイト列、書式、リビジョンを管理する。フロントエンドは現在の編集と保存時のスナップショットを区別し、保存完了ではそのスナップショットの文字列だけをacknowledgeする。Undoで保存済み内容へ戻った場合も正しくcleanになる。

UTF-8を厳密に読み、BOM/改行形式を別に保持する。CodeMirror上はLFへ正規化し、保存時に元のLF/CRLFへ戻す。末尾改行を自動挿入しない。混在改行や単独CRは元バイトを保持した読み取り専用とする。

同じディレクトリのtempfileへ書き込み、sync_all後にハンドルを閉じ、WindowsではReplaceFileWで置換する。新規ファイルは上書きしないMoveFileExWを使う。原本の先行削除は禁止。置換後の再読み込みを確認する。ReplaceFileWの部分失敗に備えて原本バックアップを指定し、失敗時は保持する。外部の書き込みとの照合と置換を完全に不可分にするものではなく、ネットワークFS/電源断の完全保証もしない。

SaveHooksでwrite/sync/commit段階に失敗・外部書き込みを注入する。テストはtempdirと専用fixtureのみを使う。容量枯渇のような危険な試験はしない。

全CloseRequestedをRustで止め、当該WebViewの確認UIへ送る。GUI未準備・応答不能なら閉じずに保持する。UIは保存キュー完了を待ち、保存・保存せず閉じる・キャンセルを扱う。保存失敗/キャンセル/追加入力がある場合は終了しない。最終終了IPCの間だけCodeMirrorを読み取り専用にし、その時点以降の入力損失を防ぐ。Rustも所有権・リビジョン・clean条件を再確認した後だけdestroyする。フロントエンドに汎用destroy権限を与えない。再読み込みの短いIPC区間も編集を止める。

## 外部変更

親ディレクトリをnotifyで監視し、inode置換型の更新も拾う。750msの内容照合をフォールバックとして併用。フォーカス復帰と保存直前にも確認する。自身の保存後は同じMutex内で基準バイト列を更新するため、自分の書き込みを外部変更として扱わない。削除・読み取り失敗時はメモリ内容を保持し、別名保存を案内する。強制上書きUIは作らない。

## プレビューの境界

0.1.19では既存のhover通知へ親ウィンドウ座標を追加し、約350ms後にリンク先の文字列を固定配置のポップアップで表示する。プレビューはiframeの矩形と内部座標を合成する。ポップアップはpointer-events:noneで、画面端へ収まるよう位置を補正し、長い参照は折り返す。文字列はtextContentで設定する。マウス離脱・スクロール・再描画・blurに加え、クリック/ドラッグ、Esc、resizeでタイマーと表示を解除する。ホバー中にリンク先の内容は読み込まず、既存のフッターと保存状態を維持する。

0.1.18ではソースとプレビューのmousemoveで、クリックと同じ検証済みリンク参照をフッターへ表示する。ローカルリンクは内部の`href="#"`ではなく保持済みメタデータを使う。保存/エラー状態のDOMは更新を止めず独立に保持し、hover中だけ非表示にするため、離したときは最新の状態へ戻る。表示はtextContentで行い、長いリンクは1行省略とtitleにする。ペイン外、スクロール、再描画/文書変更、ウィンドウのblurでは表示を解除する。hoverではIPC・ファイルアクセス・外部起動を行わない。

0.1.17ではローカルファイルリンクを既存の所有権確認付き`open_external_link`へ追加する。相対パスの基準は呼び出し元が所有する文書の保存先であり、プロセスのcwdや他ウィンドウのパスを使わない。RustでURLデコード、ローカルパス検証、存在・ファイル種別確認、canonicalizeを行う。Markdownは既存の`windows::open_path`を通し、同じファイルの既存ウィンドウと未保存編集を維持する。JSON/PDF/Office等は文書拡張子の許可リストを確認し、既定アプリへファイルパスとして渡す。シェルのコマンド文字列は作らない。実行ファイル・スクリプト・ショートカット、URLスキームへの迂回、デバイス/ADS/リモートパスは拒否する。シンボリックリンクは解決先の拡張子で判定する。

ローカルリンクはrendererで`href`を生成せず、エスケープした`data-winmd-link`へ保持する。DOMPurifyではこの不活性な属性だけをURI検査から除外し、直後にリンク参照として個別検証する。表示後も実パスをDOMのナビゲーション先にせず`href="#"`と検証済みメタデータを使い、従来のtrusted/単一左クリック/修飾キーなし/範囲選択なしの条件でIPCへ渡す。印刷用クローンからはローカルリンクのメタデータとhrefを削除する。ソースはCodeMirror構文木からインラインMarkdownリンクを特定し、ラベル・リンク先を装飾する。コードや画像構文を通常のファイルリンクと誤認しない。HTTP URLの既存装飾、画像読み込みの制限、sandbox/CSP、capabilityは維持する。

0.1.15ではHTTP/HTTPSとwww形式のURL検出を共通化し、通常クリックで既存のRust所有権確認付きopenerへ渡す。ソースはCodeMirrorの可視範囲にURLマークを付け、内容・Undoを変えずにクリックする。プレビューはサニタイズ後のプレーンテキスト/コードのURLも安全なDOMプロパティでa要素へ置換する。既存リンクとMathMLは再リンク化しない。句読点と対応しない閉じ括弧を線形時間で除く。クリックはtrusted・左ボタン・単一クリック・修飾キーなし・選択範囲なしに限定する。元のHTTP/HTTPS再検証、画像制限とsandbox/CSPは維持する。

0.1.11ではmarkedのブロック/インライン拡張で`$$...$$`と`$...$`をトークン化し、コード内とエスケープを尊重する。KaTeX 0.19.1をWorker内だけで実行し、`output=mathml`、`trust=false`、`maxExpand=1000`、`maxSize=20`、数式ごとの独立したマクロ領域を使う。1式16,384文字、1文書1,000式・生成MathML 2 MiBに制限し、不正/上限超過の数式は元のTeXを残す。

生成MathMLはそのままHTMLに混ぜず、エスケープしたメタデータと元のTeXを持つspanへ入れる。従来のMarkdown用DOMPurifyを通した後、取得したMathMLを別の限定したタグ/属性リストで再サニタイズして挿入する。パース前にも未知のタグ・URL/イベント/スタイル属性を拒否し、Markdown側にMathML・任意CSS・SVGを許可しない。静的CSSとOSの数式フォントで表示するため、CDN・追加の外部通信・Webフォントは不要。iframeのsandbox/CSPは変更しない。

生成時の元位置は検証したWeakMapへ保持し、数式クリックは描画された記号の文字列探索ではなく元の`$`位置へ移動する。印刷にはサニタイズ済みのMathMLと静的CSSだけを複製し、元式/生成HTMLのメタデータ属性を残さない。URL検証関数はKaTeXの依存を親UIへ持ち込まないよう独立させた。

0.1.10ではプレビューの本文クリックからソースへ移動する。既存の生成元行マーカーをDOMPurify後に検証し、すべての対応要素をWeakMapへ保持する。スクロール用の重複除去した対応表とは分け、リスト項目や表行の最寄り要素も特定できるようにした。クリックしたDOMテキスト位置は標準のcaretPositionFromPoint、未対応環境ではcaretRangeFromPointで取得する。

現在の描画スナップショットの範囲内で元テキストと照合し、前のDOMテキスト・表の列・コードフェンスを考慮する。正確な一致を確定できない書式は対応ブロックの先頭へ移動する。選択と表示位置だけを変更し、文書・保存・Undoを変更しない。ドラッグ選択、リンク、修飾付きクリック、古いプレビュー、IME/モーダル/PDF準備中は移動しない。既存のiframe sandbox/CSPとネイティブ権限は変更しない。

0.1.9では左右の双方向スクロール連動を追加した。markedのトークンと元のLFテキストを対応付け、見出し・段落・コード・リスト項目・表行などに生成時の行番号を付ける。生HTMLのエスケープは維持する。DOMPurify後に整数・範囲を検証してDOM要素と行番号の対応表へ移し、マーカー属性は削除するため印刷DOMには残らない。

CodeMirrorの行ブロックの実測位置と、iframe内の対応DOMの実測位置から、隣り合う対応箇所の間を補間する。スクロールごとに全要素の高さを測らず、二分探索で近傍だけを読む。単純な全体のスクロール率は使わない。段落や引用・コード内部など、対応点の間は近似になる。先頭・末尾は両側の端へ合わせ、各ペインのスクロール可能範囲を超えない。

最後にホイール・キー・ポインター・フォーカス入力があった側を操作元とする。追従によるscrollイベントとCodeMirrorの高さ再計測で操作元を切り替えず、requestAnimationFrameで集約する。ResizeObserverと画像loadで再同期し、レイアウト変更では共通の文書位置を保持する。プレビューの描画対象テキストが現在のソースと一致しない間と印刷準備中は追従しない。iframeの権限・CSPやネイティブの権限は変更しない。

markedはWorkerで変換し、raw HTMLをエスケープする。200ms debounce、800ms max-wait。最後に要求した変換の結果だけを採用する。まだ次の要求を送っていない連続入力中は直近の変換結果を表示し、無期限の更新延期を避ける。

DOMPurifyでタグと属性を限定したDocumentFragmentを生成する。画像rendererはsrcを作らず `data-winmd-src` に保持するため、DOMパーサーによる先行通信を避ける。サニタイズ後は検証済みDOMプロパティのみを設定し、未検証HTMLを連結しない。

プレビューは固定srcdocのiframe内。sandboxはallow-same-originのみで、スクリプト・フォーム・ポップアップ・トップナビゲーションを許可しない。same-originは親からDOMを安全に更新するために必要であり、allow-scriptsと組み合わせない。frame内CSPはscript/connect/frameをnone。静的スタイル以外のstyleとHTML由来id/nameなどを除去する。親UIとCSSを共有しない。

クリックは常にアプリ内ナビゲーションを止め、認証情報なしhttp/httpsのURL、または上記の検証済みローカル文書だけをRustへ渡す。中クリック・文脈メニューも抑止する。画像許可は文書内UIのチェック時のみ、初期値はfalse。新しい文書へ許可を引き継がない。

ローカル画像はRustに文書所有IDを自動注入し、現在の文書のフォルダーだけから取得。フロントエンドに任意パス、他ウィンドウID、汎用fs/shell権限を与えない。パスcanonicalizeと開いたファイルハンドルの実体パスを確認し、symlink/junctionの脱出を拒否する。SVGと任意data/file URLは拒否。現在は配下外フォルダーの追加許可UIを作らず、許可が必要と表示する。

`AppManifest::commands`で独自IPCもACLへ登録。capabilityはdoc-*のローカルWebViewだけに、文書コマンドとlisten/unlistenだけを許可する。remote capability、asset protocol全ディスクscope、汎用fs/shell/window生成権限はない。

## 配布

NSIS currentUser、標準WebView2 Evergreenを使用。ブラウザエンジンを同梱しない。Tauriの自動fileAssociationsでは既定値への書き込みを避けられるかの判断を増やすため、独自の限定したNSIS hookでProgID/Applications/SupportedTypes/OpenWithProgidsとRegisteredApplications/Capabilitiesを登録する。UserChoiceと拡張子の既定値を触らない。

通常のビルドはWindows MSVC。今回の環境だけ既存WSL MinGWを用いたGNU試用成果物を生成し、別出力先 `target/verified` へ最終版を置いた。起動中の初期試作バイナリを置き換えない。公式サポート対象MSVCのビルド・実GUI受入が残る。

## 公式資料

0.1.5では「編集 (E)」とショートカット表示を追加。メニュー処理をファイル/編集で共有し、Alt+F/E、左右移動、disabled項目のスキップを扱う。タイムスタンプはPCローカル時刻の年2桁`YYMMDD_HHMMSS`をF5で挿入し、画像名の年4桁形式とは分ける。Undo履歴を分離して挿入1回を1操作で戻す。

メニューの切り取り/貼り付けは公式Tauri clipboard-managerをRustから使用する。JSへ汎用プラグイン権限は付けず、既存の所有文書チェックを通る専用コマンドだけを許可する。自動監視・メニュー表示時の読み取りはしない。画像はRustでRGBAの画素数を確認してPNG化し、バイナリIPCで返して既存の画像保存/選択追跡へ渡す。テキストはプレーンテキストだけを扱う。切り取りはクリップボードへの書き込み成功後に削除する。非同期処理の前後で文書と選択の一致を検査し、途中で変わった範囲を上書きしない。

- [Tauri 2 Clipboard](https://v2.tauri.app/plugin/clipboard/)

0.1.3ではHTMLのファイルメニューにAlt+Fとキー表示を追加。1文書1ウィンドウのまま、アプリ内ロゴとタイトルのアプリ名を省いた。「終了」は各文書の既存close要求を通し、保存確認を迂回しない。

PDF/印刷は保存・貼り付け・再読み込みと直列化し、準備中は編集を一時停止する。現在の未保存本文をWorkerで再変換し、既存DOMPurifyと画像検証を通ったarticleだけを印刷用DOMへ複製する。外部画像の許可状態を維持し、画像ロードとフォントを待つ。印刷CSSは本文以外を非表示にし、表のヘッダー繰り返し、長いコードの折り返し、A4余白を設定する。iframeのsandboxとCSPは維持する。

WindowsネイティブのWebView2 ShowPrintUI/PrintToPdfをTauri 2 with_webview経由でUIスレッドから呼ぶ。PDFは一時フォルダーに生成し、成功コールバックとPDFヘッダー確認後、Rustダイアログで選ばれた.pdfへ既存atomic_saveで保存する。既存出力は具体的内容を読み取って上書き確認し、置換直前の内容比較を行う。開いている文書への出力を拒否し、Markdownの保存・dirty状態には影響させない。保存・検証の上限は32 MiB。COM API互換性のためTauriを2.12系列、webview2-comを0.39.1へ固定する。

- [WebView2の印刷API](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/print)
- [Tauri 2 with_webview](https://docs.rs/tauri/2.12.5/tauri/webview/struct.Webview.html#method.with_webview)

0.1.1の追加設計：画像貼り付けはCodeMirrorのpasteイベントの画像データだけを使い、クリップボード常時監視や読み取り権限は追加しない。PNGをTauri 2のRawバイナリIPCで送り、Rustでデコード・サイズを検証し、所有文書のフォルダーへ新規限定のatomic_saveを行う。ファイル名はRust側PCローカル時刻から生成し、任意パスを受け付けない。貼り付けの非同期処理は保存キューに即時予約し、Save As/終了/再読み込みとの順序を保証する。挿入範囲はCodeMirrorの変更を通じて追跡し、画像保存完了前は本文を変更しない。

外部変更は300ms集約後、cleanな文書のみ保存キュー内で自動反映する。待機中の追加入力を再確認し、Rustのreload_externalでも未保存編集を拒否する。dirtyなら既存通知と手動操作へ残す。自動反映では位置を維持し、ディスクからの再読み込みとしてUndoをリセットする。

関連付けはHKCU RegisteredApplicationsとCapabilitiesも登録する。対話インストールの任意の「はい」からだけ `ms-settings:defaultapps?registeredAppUser=WinMD` を開く。Windowsの既定値・UserChoiceは触らない。

- [Tauri 2 single-instance](https://v2.tauri.app/plugin/single-instance/)
- [CapabilitiesとAppManifest](https://v2.tauri.app/security/capabilities/)
- [Tauri 2設定形式](https://v2.tauri.app/reference/config/)
- [Windows / NSIS / WebView2](https://v2.tauri.app/distribute/windows-installer/)
- [ReplaceFileWの成功・失敗時の挙動](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)
- [marked renderer拡張](https://marked.js.org/using_pro)

参照日：2026-10-26。Tauri 1のAPIは使用していない。
