# WinMDの公開告知案

以下はTwitter（X）へ手動投稿するための文面案です。リポジトリと[v0.1.8インストーラー](https://github.com/sarulab-ou/winmd/releases/tag/v0.1.8)は公開済みです。Twitterへの投稿はまだ行っていません。

## まず使う案：公開後の告知

GitHubのソースと試用版インストーラーを紹介する文面です。

```text
Windows向けMarkdownエディタ「WinMD」を公開しました。

・左で編集、右でプレビュー
・Ctrl+Vで画像を保存＆挿入
・PDF出力・印刷
・外部ツールの更新も反映（未保存の編集がない場合）

1文書1ウィンドウのシンプルなエディタです。MITライセンス。
https://github.com/sarulab-ou/winmd
#Markdown #Windows
```

添付は[日本語の編集画面](screenshots/editor-ja.jpg)を1枚目、[PDF出力のメニュー](screenshots/file-menu.jpg)を2枚目にします。

画像の代替テキスト案：

1. 「WinMDの実画面。左にMarkdownのソース、右に見出し・チェックリスト・表・コードのプレビュー。同じ内容を並べて確認できる。」
2. 「WinMDのファイルメニュー。新しいウィンドウ、開く、保存、名前を付けて保存、PDFにエクスポート、印刷、終了を表示。対応するショートカットも記載。」

## 別案：使いどころを伝える

```text
Markdownのメモや手順書を、Windowsで気軽に書きたくて「WinMD」を作りました。

左で書いて、右ですぐ確認。
画像はCtrl+Vで貼り付け、仕上がったらPDFに。
タブは作らず、1文書1ウィンドウにしました。

MITライセンスで公開しています。
https://github.com/sarulab-ou/winmd
#Markdown #Windows
```

添付：[日本語の編集画面](screenshots/editor-ja.jpg)。ソース公開後に使用します。バイナリ配布を約束しない文面です。

## 別案：試用版の配布を伝える

```text
Windows向けMarkdownエディタ「WinMD」の試用版を公開しました。

左で編集、右でプレビュー。画像はCtrl+Vで保存＆挿入でき、PDF出力・印刷にも対応。
1文書1ウィンドウで使えます。

メモや手順書を書くためのシンプルなエディタです。
https://github.com/sarulab-ou/winmd
#Markdown #Windows
```

添付：[日本語の編集画面](screenshots/editor-ja.jpg)と[PDF出力のメニュー](screenshots/file-menu.jpg)。配布版は署名なしのプレリリースです。

## English draft

The source and preview installer are available from the repository and Releases.

```text
Introducing WinMD, a Markdown editor for Windows.

Live preview, Ctrl+V image paste, PDF export and printing. One document per window. MIT licensed. The app UI is currently Japanese.

https://github.com/sarulab-ou/winmd
#Markdown #Windows
```

Attach [the English sample screen](screenshots/editor-en.jpg). Suggested alt text: “WinMD on Windows, with Markdown source on the left and a live preview of headings, a checklist, a table, and code on the right. Application menus are Japanese.”

## 画像と投稿前の確認

- 画像はv0.1.8の実画面です。英語版の画像も文書本文だけが英語で、アプリUIの英語対応を示すものではありません。
- 撮影したサンプルは[日本語](examples/notes.ja.md)・[英語](examples/notes.en.md)。撮り直しの手順は[スクリーンショットの説明](screenshots/README.md)にあります。
- [GitHub Releases](https://github.com/sarulab-ou/winmd/releases/tag/v0.1.8)で署名なしのWindows x64試用版とチェックサムを配布しています。両READMEも公開先へ更新済みです。
- 実施済みと未実施の確認範囲は[検証記録](verification.md)、受入手順は[手動テスト](manual-tests.md)を参照してください。
- 各文面は1件ずつ投稿する想定です。アカウント名や追加のハッシュタグを付ける場合は、投稿画面の文字数表示で収まることを確認してください。
