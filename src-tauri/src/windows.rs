use crate::state::{AppState, Launch};
use std::{path::Path, sync::atomic::Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use winmd_core::Result;

fn create_window(app: &AppHandle, id: &str) -> Result<()> {
    let window = WebviewWindowBuilder::new(app, id, WebviewUrl::App("index.html".into()))
        .title("WinMD")
        .inner_size(1180.0, 800.0)
        .min_inner_size(760.0, 440.0)
        .decorations(true)
        .on_navigation(|url| {
            // App assets only. All external navigation, including about:blank popups, is refused.
            (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                || (matches!(url.scheme(), "http" | "https")
                    && url.host_str() == Some("tauri.localhost"))
                || (cfg!(debug_assertions)
                    && url.host_str() == Some("127.0.0.1")
                    && url.port() == Some(1420))
        })
        .build()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    let label = id.to_string();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Some(w) = handle.get_webview_window(&label) {
                let _ = w.emit_to(
                    tauri::EventTarget::webview_window(w.label()),
                    "document-close-requested",
                    (),
                );
            }
        }
        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
            for path in paths {
                if let Err(error) = open_path(&handle, path) {
                    show_error(&handle, &error);
                }
            }
        }
        _ => {}
    });
    Ok(())
}

pub fn show_error(app: &AppHandle, error: &str) {
    app.dialog()
        .message(error)
        .title("WinMD — エラー")
        .show(|_| {});
}

pub fn new_document(app: &AppHandle) -> Result<()> {
    let id = app.state::<AppState>().lock()?.create();
    if let Err(error) = create_window(app, &id) {
        app.state::<AppState>().lock()?.docs.remove(&id);
        return Err(error);
    }
    Ok(())
}

pub fn open_path(app: &AppHandle, path: &Path) -> Result<()> {
    let (id, created) = app.state::<AppState>().lock()?.open(path)?;
    if created {
        if let Err(error) = create_window(app, &id) {
            app.state::<AppState>().lock()?.docs.remove(&id);
            return Err(error);
        }
    } else if let Some(window) = app.get_webview_window(&id) {
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn enqueue(app: &AppHandle, launch: Launch) {
    let state = app.state::<AppState>();
    if let Ok(mut queue) = state.launches.lock() {
        queue.push_back(launch);
    }
    if state.ready.load(Ordering::Acquire) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || drain(&handle));
    }
}

pub fn drain(app: &AppHandle) {
    loop {
        let launch = app
            .state::<AppState>()
            .launches
            .lock()
            .ok()
            .and_then(|mut queue| queue.pop_front());
        let Some(launch) = launch else {
            break;
        };
        if launch.paths.is_empty() {
            if let Err(error) = new_document(app) {
                show_error(app, &error);
            }
        } else {
            for path in launch.paths {
                let path = if path.is_absolute() {
                    path
                } else {
                    launch.cwd.join(path)
                };
                if let Err(error) = open_path(app, &path) {
                    show_error(app, &error);
                }
            }
            // Invalid launch arguments must still leave a usable app window.
            if app.webview_windows().is_empty() {
                if let Err(error) = new_document(app) {
                    show_error(app, &error);
                }
            }
        }
    }
}
