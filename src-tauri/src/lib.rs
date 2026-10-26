mod commands;
mod state;
mod watch;
mod windows;

use state::{AppState, Launch};
use std::{path::PathBuf, sync::atomic::Ordering};
use tauri::Manager;

pub fn run() {
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
        .invoke_handler(tauri::generate_handler![
            commands::document_snapshot,
            commands::new_document,
            commands::open_documents,
            commands::save_document,
            commands::reload_document,
            commands::check_external,
            commands::request_close,
            commands::close_document,
            commands::read_local_image,
            commands::open_external_link,
            commands::set_document_title,
            commands::save_pasted_image,
        ])
        .setup(|app| {
            let handle = app.handle();
            windows::enqueue(
                handle,
                Launch {
                    paths: std::env::args_os()
                        .skip(1)
                        .filter(|a| a != "--")
                        .map(PathBuf::from)
                        .collect(),
                    cwd: std::env::current_dir()?,
                },
            );
            app.state::<AppState>().ready.store(true, Ordering::Release);
            windows::drain(handle);
            watch::start(handle.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("WinMD could not start");
}
