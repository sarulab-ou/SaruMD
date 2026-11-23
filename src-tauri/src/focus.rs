//! Activation is performed on the owning UI thread after resolving the document owner.
use tauri::{Manager, WebviewWindow};
use winmd_core::Result;

pub fn existing(window: WebviewWindow) -> Result<()> {
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            #[cfg(windows)]
            let result = target
                .hwnd()
                .map_err(|e| e.to_string())
                .and_then(|hwnd| native::activate_hwnd(windows::Win32::Foundation::HWND(hwnd.0)));
            #[cfg(not(windows))]
            let result = target
                .show()
                .and_then(|_| target.unminimize())
                .and_then(|_| target.set_focus())
                .map_err(|e| e.to_string());
            if let Err(error) = result {
                crate::windows::show_error(target.app_handle(), &error);
            }
        })
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
#[path = "focus_windows.rs"]
mod native;
