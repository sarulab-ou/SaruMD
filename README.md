# WinMD

English | [日本語](README.ja.md)

A Markdown editor for Windows. **Each document opens in its own independent window**, with source editing on the left and a live preview on the right. No tabs. The application UI is currently Japanese.

## Install

**[Windows x64 installer v0.1.3](target/verified/x86_64-pc-windows-gnu/release/bundle/nsis/WinMD_0.1.3_x64-setup.exe)**

This link points to the generated installer in this build workspace. No GitHub release has been published yet, and the installer is not included in source checkouts.

1. Run the installer on Windows 11 x64.
2. If WebView2 Runtime is missing, the installer downloads and installs it. This requires an internet connection.
3. To associate `.md` files with WinMD, accept the installer's offer to open Windows Settings, then choose WinMD for `.md`. Your default application is changed only when you select it.

The current installer is an unsigned GNU trial build. GUI and installation acceptance testing is incomplete; see the [verification record](docs/verification.md).

## Quick start

1. Launch WinMD and press **Ctrl+O** to open a Markdown file. Each file gets a separate window.
2. Edit on the left and view the result on the right. Drag the divider to resize the panes.
3. Press **Ctrl+S** to save. For a new document, choose its location first.
4. Copy an image and press **Ctrl+V** in the editor. WinMD saves it beside the Markdown file as `20261026_231824.png` and inserts an image link. Unsaved documents are saved first; existing images are never overwritten.
5. Changes made by Codex or another editor reload automatically when WinMD has no unsaved edits. Otherwise, WinMD keeps your edits and shows a conflict notification.
6. Press **Alt+F** for the File menu. Choose **PDFにエクスポート** to save a PDF, or **印刷 (Ctrl+P)** to open the print dialog.

PDF export and printing include the rendered document and unsaved edits. PDFs use A4 portrait and exclude the editor and menus. They do not save or change the Markdown source. Remote image permission follows the preview setting. Exit asks each window to save its changes; canceled documents remain open.

Image paste accepts PNG, JPEG, GIF, and WebP, saving as PNG. The limit is 16 MiB and 16 megapixels. If a file with the same timestamp already exists, wait one second and paste again.

## Shortcuts

| Action                            | Shortcut                        |
| --------------------------------- | ------------------------------- |
| File menu                         | Alt+F (arrows, Enter, Esc)      |
| New document in a separate window | Ctrl+N                          |
| Open a file                       | Ctrl+O                          |
| Save / Save As                    | Ctrl+S / Ctrl+Shift+S           |
| Paste an image or text            | Ctrl+V                          |
| Find / Replace                    | Ctrl+F / Ctrl+H                 |
| Undo / Redo                       | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z |
| Close the current window          | Ctrl+W / Alt+F4                 |
| Print                             | Ctrl+P                          |

## Files and preview

- UTF-8 BOM settings, LF/CRLF line endings, and trailing newlines are preserved. Mixed line endings open read-only.
- There is no autosave or crash recovery. Save changes with Ctrl+S.
- Raw HTML is escaped and preview output is sanitized. Remote images are blocked until you allow them for that document.
- Local images must stay within the document's folder. Documents are limited to 32 MiB; local images to 16 MiB each and the first 100 images.

## Development

Built with Tauri 2, TypeScript, Vite, CodeMirror 6, marked, DOMPurify, and Rust.

```powershell
$env:CI='true'
pnpm install --frozen-lockfile
pnpm desktop:dev
```

Run `pnpm check`, `pnpm test`, and `pnpm lint` to validate the project. Build the Windows installer with `pnpm desktop:build`. See the [development and build guide](docs/development.md) for Rust, MSVC, WebView2, and detailed commands. The detailed developer documents are currently in Japanese.

[Design decisions](docs/design.md) · [Manual test checklist](docs/manual-tests.md)

## License

WinMD is licensed under the [MIT License](LICENSE). Dependencies retain their own licenses; see [third-party notices](docs/third-party-licenses.txt).
