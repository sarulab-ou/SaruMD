use crate::state::AppState;
use notify::{RecursiveMode, Watcher};
use std::{collections::HashSet, path::PathBuf, sync::mpsc, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

/// Watch directories (not inodes), so editor/atomic-save replacement is detected too.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let (sender, receiver) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |event| {
            let _ = sender.send(event);
        })
        .ok();
        let mut watched = HashSet::<PathBuf>::new();
        loop {
            let event = receiver.recv_timeout(Duration::from_millis(750));
            let mut targets = Vec::new();
            if let Ok(mut docs) = app.state::<AppState>().lock() {
                let parents: HashSet<_> = docs
                    .docs
                    .values()
                    .filter_map(|d| d.path.as_ref()?.parent().map(PathBuf::from))
                    .collect();
                if let Some(watcher) = &mut watcher {
                    for path in parents.difference(&watched) {
                        let _ = watcher.watch(path, RecursiveMode::NonRecursive);
                    }
                    for path in watched.difference(&parents) {
                        let _ = watcher.unwatch(path);
                    }
                }
                watched = parents;
                // Timeout polling is also a fallback when a network folder/watcher loses events.
                let ids: Vec<_> = docs.docs.keys().cloned().collect();
                for id in ids {
                    let before = docs.get(&id).map(|d| d.snapshot.external).unwrap_or(false);
                    if let Ok(after) = docs.check_external(&id) {
                        if before != after || (event.is_ok() && after) {
                            targets.push(id);
                        }
                    }
                }
            }
            for id in targets {
                if let Some(window) = app.get_webview_window(&id) {
                    let _ = window.emit_to(
                        tauri::EventTarget::webview_window(window.label()),
                        "document-external",
                        (),
                    );
                }
            }
        }
    });
}
