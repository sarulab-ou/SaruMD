# WinMD development rules

- タブを作らない。1文書1ウィンドウを守る。
- 保存の安全性を優先する。削除後rename、原本への自動保存は禁止。
- Markdownを信頼しない。生HTMLをエスケープし、DOMPurifyとsandboxを維持する。
- Tauri 2のAPIを使う。権限を広げる前に文書所有関係を確認する。
- 未実施のテストを実施済みと報告しない。
- Git/ghはWSLから使用する。依頼なしにcommit/pushしない。
- `src/` はUI、`crates/winmd-core/` は文書・I/O、`src-tauri/` はWindows/Tauri連携。
- `pnpm check`, `pnpm test`, `pnpm lint`, `pnpm build` とRustのtest/clippy/fmtを実行する。
- GUI検証は `docs/manual-tests.md`、実行記録は `docs/verification.md` を更新する。
