use crate::{
    state::AppState,
    update_download::{download, find_update, powershell, verify_payload, Staged, FILE_OPERATIONS},
};
use std::{fs::File, process::Child};
use tauri::{AppHandle, Emitter, Manager};
use winmd_core::{
    updates::{self, Available, Candidate, CloseSequence, Offer},
    Result,
};

#[derive(Default)]
pub struct State {
    pub owner: Option<String>,
    pub busy: bool,
    pub candidate: Option<Candidate>,
    pub staged: Option<Staged>,
    pub closing: Option<CloseSequence>,
    pub installing: bool,
    pub session: u64,
}

impl State {
    pub fn claim(&mut self, owner: &str) -> Result<()> {
        if self.busy
            || self.closing.is_some()
            || self.installing
            || self.owner.as_deref().is_some_and(|id| id != owner)
        {
            return Err("別の更新処理が進行中です。".into());
        }
        self.owner = Some(owner.into());
        self.busy = true;
        Ok(())
    }
    pub fn allow_open(&self) -> Result<()> {
        if self.closing.is_some() || self.installing {
            Err("更新の終了確認中は文書を開けません。".into())
        } else {
            Ok(())
        }
    }
}

pub fn check(app: &AppHandle, owner: &str) -> Result<Offer> {
    let current = app.package_info().version.to_string();
    {
        let state = app.state::<AppState>();
        let mut update = state.update()?;
        update.claim(owner)?;
        update.candidate = None;
        update.staged = None;
    }
    let found = find_update(&current);
    let state = app.state::<AppState>();
    let mut update = state.update()?;
    update.busy = false;
    if update.owner.as_deref() != Some(owner) {
        return Err("更新はキャンセルされました。".into());
    }
    update.candidate = match found {
        Ok(candidate) => candidate,
        Err(error) => {
            update.owner = None;
            return Err(error);
        }
    };
    if update.candidate.is_none() {
        update.owner = None;
    }
    Ok(Offer {
        current_version: current,
        available: update.candidate.as_ref().map(|candidate| Available {
            version: candidate.version.clone(),
            bytes: candidate.bytes,
        }),
    })
}

pub fn stage(app: &AppHandle, owner: &str) -> Result<()> {
    let candidate = {
        let state = app.state::<AppState>();
        let mut update = state.update()?;
        let candidate = update
            .candidate
            .clone()
            .ok_or("先に更新を確認してください。")?;
        update.claim(owner)?;
        update.staged = None;
        candidate
    };
    let result = download(candidate);
    let state = app.state::<AppState>();
    let mut update = state.update()?;
    update.busy = false;
    if update.owner.as_deref() != Some(owner) {
        return Err("更新はキャンセルされました。".into());
    }
    update.staged = Some(result?);
    Ok(())
}

pub fn begin(app: &AppHandle, owner: &str) -> Result<()> {
    let state = app.state::<AppState>();
    let mut update = state.update()?;
    if update.busy
        || update.closing.is_some()
        || update.installing
        || update.owner.as_deref() != Some(owner)
    {
        return Err("別の更新処理が進行中です。".into());
    }
    let staged = update
        .staged
        .as_ref()
        .ok_or("更新ファイルを先にダウンロードしてください。")?;
    updates::verify_package(
        &staged.candidate,
        File::open(&staged.path).map_err(|e| e.to_string())?,
    )?;
    verify_payload(staged)?;
    // Fail before closing documents if the installation directory is not writable.
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let directory = executable.parent().ok_or("インストール先がありません。")?;
    let _probe = tempfile::Builder::new()
        .prefix(".sarumd-write-")
        .tempdir_in(directory)
        .map_err(|_| "アプリのフォルダーに書き込めません。更新は開始しませんでした。")?;
    let ids = state.lock()?.docs.keys().cloned().collect();
    update.session += 1;
    update.closing = Some(CloseSequence::new(update.session, ids));
    if let Err(error) = request_next(app, &update) {
        update.closing = None;
        return Err(error);
    }
    Ok(())
}

fn request_next(app: &AppHandle, update: &State) -> Result<()> {
    if let Some(sequence) = &update.closing {
        if let Some(id) = sequence.next() {
            let window = app
                .get_webview_window(id)
                .ok_or("終了対象のウィンドウが見つかりません。")?;
            window.show().map_err(|e| e.to_string())?;
            window.unminimize().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            window
                .emit_to(
                    tauri::EventTarget::webview_window(id),
                    "update-close-requested",
                    sequence.session,
                )
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn cancel(app: &AppHandle, owner: &str, session: Option<u64>) -> Result<()> {
    let state = app.state::<AppState>();
    let mut update = state.update()?;
    if update.installing {
        return Err("更新ファイルへの置き換えを開始しています。".into());
    }
    let matches = match session {
        Some(session) => update
            .closing
            .as_ref()
            .is_some_and(|s| s.session == session),
        None => update.closing.is_none() && update.owner.as_deref() == Some(owner),
    };
    if matches {
        update.closing = None;
        update.owner = None;
        update.candidate = None;
        update.staged = None;
        for window in app.webview_windows().values() {
            let _ = window.emit_to(
                tauri::EventTarget::webview_window(window.label()),
                "update-cancelled",
                (),
            );
        }
    }
    Ok(())
}

/// Called only AFTER the last document passed its ordinary save/discard guard.
pub fn launch_helper(update: &mut State) -> Result<Child> {
    let staged = update.staged.as_mut().ok_or("更新ファイルがありません。")?;
    updates::verify_package(
        &staged.candidate,
        File::open(&staged.path).map_err(|e| e.to_string())?,
    )?;
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let raw = executable
        .parent()
        .ok_or("インストール先がありません。")?
        .to_string_lossy();
    let directory = if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
    };
    let script = format!("{FILE_OPERATIONS}\n{}", include_str!("update-helper.ps1"));
    let child = powershell(&script)?
        .env("SARUMD_UPDATE_PARENT", std::process::id().to_string())
        .env("SARUMD_UPDATE_ARCHIVE", &staged.path)
        .env("SARUMD_UPDATE_VERSION", &staged.candidate.version)
        .env("SARUMD_UPDATE_HASH", &staged.candidate.sha256)
        .env("SARUMD_UPDATE_DIRECTORY", directory)
        .spawn()
        .map_err(|e| format!("更新処理を起動できません: {e}"))?;
    // The helper waits for this process to exit; keep only its verified private directory alive.
    if let Some(temp) = staged.temp.take() {
        let _ = temp.keep();
    }
    update.installing = true;
    Ok(child)
}

pub fn closed(app: &AppHandle, update: &mut State, id: &str) -> Result<()> {
    let was_next = update.closing.as_ref().and_then(CloseSequence::next) == Some(id);
    if let Some(sequence) = &mut update.closing {
        sequence.remove(id);
    }
    if was_next && !update.installing {
        if let Err(error) = request_next(app, update) {
            update.closing = None;
            update.owner = None;
            update.candidate = None;
            update.staged = None;
            return Err(error);
        }
    }
    Ok(())
}
