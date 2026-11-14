mod clipboard;
mod commands;
mod printing;
mod state;
mod update_download;
mod updating;
mod watch;
mod windows;

use state::{AppState, Launch};
use std::{path::PathBuf, sync::atomic::Ordering};
use tauri::Manager;

pub fn run() {
    // Only the updater's child inherits this one-use handoff; ordinary launches start normally.
    let resume_path = std::env::var_os("SARUMD_RESUME_SESSION").map(PathBuf::from);
    std::env::remove_var("SARUMD_RESUME_SESSION");
    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            if !winmd_core::updates::wait_for_update(directory, std::time::Duration::from_secs(120))
            {
                return;
            }
        }
    }
    tauri::Builder::default()
        .manage(AppState::default())
        // Register first: all additional launches feed the backend queue, not a frontend event.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            windows::enqueue(
                app,
                Launch {
                    paths: args
                        .into_iter()
                        .skip(1)
                        .filter(|s| s != "--")
                        .map(PathBuf::from)
                        .collect(),
                    cwd: cwd.into(),
                },
            );
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::document_snapshot,
            commands::take_resume_state,
            commands::new_document,
            commands::open_documents,
            commands::open_document_folder,
            commands::save_document,
            commands::reload_document,
            commands::check_external,
            commands::request_close,
            commands::close_document,
            commands::read_local_image,
            commands::open_external_link,
            commands::set_document_title,
            commands::save_pasted_image,
            commands::print_document,
            commands::export_pdf,
            commands::request_exit,
            commands::read_clipboard,
            commands::write_clipboard_text,
            commands::check_update,
            commands::download_update,
            commands::begin_update,
            commands::cancel_update,
        ])
        .setup(move |app| {
            let handle = app.handle();
            let mut restored = false;
            if let Some(path) = resume_path {
                match winmd_core::session::read_workspace(&path) {
                    Ok(workspace) => {
                        windows::restore(handle, workspace);
                        restored = !app.webview_windows().is_empty();
                        // Only consume our private handoff, never a caller-selected document.
                        if path
                            .file_name()
                            .is_some_and(|n| n.to_string_lossy().starts_with("resume-"))
                            && path
                                .parent()
                                .and_then(|p| p.file_name())
                                .is_some_and(|n| n.to_string_lossy().starts_with("sarumd-update-"))
                        {
                            let _ = std::fs::remove_file(&path);
                            if let Some(parent) = path.parent() {
                                let _ = std::fs::remove_dir(parent);
                            }
                        }
                    }
                    Err(error) => windows::show_error(
                        handle,
                        &format!("更新前の文書を復元できません: {error}"),
                    ),
                }
            }
            let paths: Vec<PathBuf> = std::env::args_os()
                .skip(1)
                .filter(|a| a != "--")
                .map(PathBuf::from)
                .collect();
            if !restored || !paths.is_empty() {
                windows::enqueue(
                    handle,
                    Launch {
                        paths,
                        cwd: std::env::current_dir()?,
                    },
                );
            }
            app.state::<AppState>().ready.store(true, Ordering::Release);
            windows::drain(handle);
            watch::start(handle.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("SaruMD could not start");
}
