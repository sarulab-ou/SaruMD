use crate::{state::AppState, windows};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use winmd_core::{
    document::{same_path, Snapshot},
    file_io::{self, NoFault},
    images, Result,
};

async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|e| e.to_string())?
}

fn owned(app: &AppHandle, window: &WebviewWindow) -> Result<String> {
    let id = window.label().to_string();
    app.state::<AppState>().lock()?.get(&id)?;
    Ok(id)
}

#[tauri::command]
pub async fn save_pasted_image(
    app: AppHandle,
    window: WebviewWindow,
    request: tauri::ipc::Request<'_>,
) -> Result<String> {
    let id = owned(&app, &window)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("画像はバイナリ形式で送信してください。".into());
    };
    if bytes.len() > winmd_core::paste::MAX_PNG_BYTES {
        return Err("貼り付け画像の上限は16 MiBです。".into());
    }
    let bytes = bytes.clone();
    blocking(move || {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        // The registry lock also serializes Save As, keeping the image's directory stable.
        app.state::<AppState>()
            .lock()?
            .paste_png(&id, &bytes, &timestamp, &NoFault)
    })
    .await
}

#[tauri::command]
pub fn document_snapshot(app: AppHandle, window: WebviewWindow) -> Result<Snapshot> {
    let id = owned(&app, &window)?;
    let snapshot = app.state::<AppState>().lock()?.get(&id)?.snapshot.clone();
    Ok(snapshot)
}

#[tauri::command]
pub async fn new_document(app: AppHandle, window: WebviewWindow) -> Result<()> {
    owned(&app, &window)?;
    blocking(move || windows::new_document(&app)).await
}

#[tauri::command]
pub async fn open_documents(app: AppHandle, window: WebviewWindow) -> Result<()> {
    owned(&app, &window)?;
    blocking(move || {
        let paths = app
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("Markdown", &["md", "markdown"])
            .blocking_pick_files();
        if let Some(paths) = paths {
            let mut errors = Vec::new();
            for path in paths {
                match path
                    .into_path()
                    .map_err(|e| e.to_string())
                    .and_then(|p| windows::open_path(&app, &p))
                {
                    Ok(()) => {}
                    Err(error) => errors.push(error),
                }
            }
            if !errors.is_empty() {
                return Err(errors.join("\n"));
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn save_document(
    app: AppHandle,
    window: WebviewWindow,
    text: String,
    revision: u64,
    save_as: bool,
) -> Result<Option<Snapshot>> {
    let id = owned(&app, &window)?;
    blocking(move || {
        let (old_path, baseline) = {
            let state = app.state::<AppState>();
            let docs = state.lock()?;
            let d = docs.get(&id)?;
            (d.path.clone(), d.baseline.clone())
        };
        let target = if save_as || old_path.is_none() {
            let mut picker = app
                .dialog()
                .file()
                .set_parent(&window)
                .add_filter("Markdown", &["md", "markdown"]);
            if let Some(path) = &old_path {
                if let Some(parent) = path.parent() {
                    picker = picker.set_directory(parent);
                }
                if let Some(name) = path.file_name() {
                    picker = picker.set_file_name(name.to_string_lossy());
                }
            } else {
                picker = picker.set_file_name("無題.md");
            }
            let Some(path) = picker.blocking_save_file() else {
                return Ok(None);
            };
            path.into_path().map_err(|e| e.to_string())?
        } else {
            old_path.clone().unwrap()
        };
        let same = old_path.as_ref().is_some_and(|p| same_path(p, &target));
        let expected = if same {
            baseline
        } else if target.exists() {
            // Confirm a concrete version, then compare that same version immediately before commit.
            let existing = file_io::read(&target)?;
            let yes = app
                .dialog()
                .message(format!(
                    "既存ファイルを上書きしますか？\n{}",
                    target.display()
                ))
                .title("WinMD — 上書き確認")
                .parent(&window)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "上書き".into(),
                    "キャンセル".into(),
                ))
                .blocking_show();
            if !yes {
                return Ok(None);
            }
            Some(existing)
        } else {
            None
        };
        let state = app.state::<AppState>();
        let result =
            state
                .lock()?
                .save(&id, &target, expected.as_deref(), &text, revision, &NoFault)?;
        Ok(Some(result))
    })
    .await
}

#[tauri::command]
pub async fn reload_document(
    app: AppHandle,
    window: WebviewWindow,
    text: String,
    revision: u64,
    only_if_clean: bool,
) -> Result<Snapshot> {
    let id = owned(&app, &window)?;
    blocking(move || {
        let state = app.state::<AppState>();
        let mut docs = state.lock()?;
        if !docs.get(&id)?.snapshot.read_only {
            docs.edit(&id, text, revision)?;
        }
        if only_if_clean {
            docs.reload_external(&id, revision)
        } else {
            docs.reload(&id, revision)
        }
    })
    .await
}

#[tauri::command]
pub async fn check_external(app: AppHandle, window: WebviewWindow) -> Result<bool> {
    let id = owned(&app, &window)?;
    blocking(move || app.state::<AppState>().lock()?.check_external(&id)).await
}

#[tauri::command]
pub fn request_close(app: AppHandle, window: WebviewWindow) -> Result<()> {
    owned(&app, &window)?;
    window
        .emit_to(
            tauri::EventTarget::webview_window(window.label()),
            "document-close-requested",
            (),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_document(
    app: AppHandle,
    window: WebviewWindow,
    text: String,
    revision: u64,
    discard: bool,
) -> Result<()> {
    let id = owned(&app, &window)?;
    {
        let state = app.state::<AppState>();
        let mut docs = state.lock()?;
        if !docs.get(&id)?.snapshot.read_only {
            docs.edit(&id, text, revision)?;
        }
        let d = docs.get(&id)?;
        if d.snapshot.revision != revision || (!discard && d.snapshot.text != d.snapshot.saved_text)
        {
            return Err("未保存の変更があります。ウィンドウを閉じませんでした。".into());
        }
    }
    // destroy bypasses CloseRequested only AFTER the owned document has passed the guard.
    window.destroy().map_err(|e| e.to_string())?;
    app.state::<AppState>().lock()?.docs.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn read_local_image(
    app: AppHandle,
    window: WebviewWindow,
    reference: String,
) -> Result<String> {
    let id = owned(&app, &window)?;
    blocking(move || {
        let path = app
            .state::<AppState>()
            .lock()?
            .get(&id)?
            .path
            .clone()
            .ok_or("相対画像は文書を保存してから表示できます。")?;
        images::local_image(&path, &reference)
    })
    .await
}

#[tauri::command]
pub fn open_external_link(app: AppHandle, window: WebviewWindow, url: String) -> Result<()> {
    owned(&app, &window)?;
    let parsed = images::external_url(&url)?;
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_document_title(app: AppHandle, window: WebviewWindow, dirty: bool) -> Result<()> {
    let id = owned(&app, &window)?;
    let path = app.state::<AppState>().lock()?.get(&id)?.path.clone();
    let name = path
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "無題".into());
    window
        .set_title(&format!(
            "{}{} — WinMD",
            if dirty { "* " } else { "" },
            name
        ))
        .map_err(|e| e.to_string())
}
