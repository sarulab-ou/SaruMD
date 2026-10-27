# 設計判断

## 文書とウィンドウ

Tauri 2の1バックエンドが `Documents` を管理し、`doc-N` ごとに独立したWebviewWindowを生成する。タブや共有プレビューは作らない。各WebViewのCodeMirror、Undo、DocumentState、保存キュー、Worker、外部画像の許可状態は独立している。未編集の空ウィンドウも再利用せず、例外処理を減らした。

起動要求はsingle-instanceプラグインからRustキューへ入り、setup完了後に処理する。初回も追加起動もパスをバックエンドへ保持するため、フロントエンドの準備前のイベント消失を避ける。相対パスは要求ごとのcwdで解決する。起動時の個別ファイルエラー後も最低1つの文書ウィンドウを確保する。

既存ファイルはcanonicalizeとsame-fileのファイルIDで比較する。保存先の予約・別ウィンドウ所有確認・I/Oは共通Mutexの内側で直列化する。文書数が少ない初版では、細かなロック構造より一貫性を優先した。新規保存先の親フォルダーもcanonicalizeする。

## 保存と終了

Rustは文書の保存済み文字列、ディスク上の元バイト列、書式、リビジョンを管理する。フロントエンドは現在の編集と保存時のスナップショットを区別し、保存完了ではそのスナップショットの文字列だけをacknowledgeする。Undoで保存済み内容へ戻った場合も正しくcleanになる。

UTF-8を厳密に読み、BOM/改行形式を別に保持する。CodeMirror上はLFへ正規化し、保存時に元のLF/CRLFへ戻す。末尾改行を自動挿入しない。混在改行や単独CRは元バイトを保持した読み取り専用とする。

同じディレクトリのtempfileへ書き込み、sync_all後にハンドルを閉じ、WindowsではReplaceFileWで置換する。新規ファイルは上書きしないMoveFileExWを使う。原本の先行削除は禁止。置換後の再読み込みを確認する。ReplaceFileWの部分失敗に備えて原本バックアップを指定し、失敗時は保持する。外部の書き込みとの照合と置換を完全に不可分にするものではなく、ネットワークFS/電源断の完全保証もしない。

SaveHooksでwrite/sync/commit段階に失敗・外部書き込みを注入する。テストはtempdirと専用fixtureのみを使う。容量枯渇のような危険な試験はしない。

全CloseRequestedをRustで止め、当該WebViewの確認UIへ送る。GUI未準備・応答不能なら閉じずに保持する。UIは保存キュー完了を待ち、保存・保存せず閉じる・キャンセルを扱う。保存失敗/キャンセル/追加入力がある場合は終了しない。最終終了IPCの間だけCodeMirrorを読み取り専用にし、その時点以降の入力損失を防ぐ。Rustも所有権・リビジョン・clean条件を再確認した後だけdestroyする。フロントエンドに汎用destroy権限を与えない。再読み込みの短いIPC区間も編集を止める。

## 外部変更

親ディレクトリをnotifyで監視し、inode置換型の更新も拾う。750msの内容照合をフォールバックとして併用。フォーカス復帰と保存直前にも確認する。自身の保存後は同じMutex内で基準バイト列を更新するため、自分の書き込みを外部変更として扱わない。削除・読み取り失敗時はメモリ内容を保持し、別名保存を案内する。強制上書きUIは作らない。

## プレビューの境界

markedはWorkerで変換し、raw HTMLをエスケープする。200ms debounce、800ms max-wait。最後に要求した変換の結果だけを採用する。まだ次の要求を送っていない連続入力中は直近の変換結果を表示し、無期限の更新延期を避ける。

DOMPurifyでタグと属性を限定したDocumentFragmentを生成する。画像rendererはsrcを作らず `data-winmd-src` に保持するため、DOMパーサーによる先行通信を避ける。サニタイズ後は検証済みDOMプロパティのみを設定し、未検証HTMLを連結しない。

プレビューは固定srcdocのiframe内。sandboxはallow-same-originのみで、スクリプト・フォーム・ポップアップ・トップナビゲーションを許可しない。same-originは親からDOMを安全に更新するために必要であり、allow-scriptsと組み合わせない。frame内CSPはscript/connect/frameをnone。静的スタイル以外のstyleとHTML由来id/nameなどを除去する。親UIとCSSを共有しない。

クリックは常にアプリ内ナビゲーションを止め、認証情報なしhttp/httpsのURLだけをRustでも再検証してopenerへ渡す。中クリック・文脈メニューも抑止する。画像許可は文書内UIのチェック時のみ、初期値はfalse。新しい文書へ許可を引き継がない。

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
