use winmd_core::Result;
#[cfg(windows)]
pub fn activate_hwnd(hwnd: windows::Win32::Foundation::HWND) -> Result<()> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetLastActivePopup, IsIconic, IsWindowVisible, SetForegroundWindow,
        ShowWindow, SW_RESTORE, SW_SHOW,
    };
    // ShowWindow is synchronous on the owner thread. Do not rely on queued
    // unminimize/set_focus calls observing an already updated minimized flag.
    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else if !IsWindowVisible(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
        // Keep an active native save/confirmation dialog usable instead of covering it.
        let popup = GetLastActivePopup(hwnd);
        let target = if !popup.0.is_null() && IsWindowVisible(popup).as_bool() {
            popup
        } else {
            hwnd
        };
        if IsIconic(target).as_bool() {
            let _ = ShowWindow(target, SW_RESTORE);
        }
        if GetForegroundWindow() != target && !SetForegroundWindow(target).as_bool() {
            return Err(
                "開いているSaruMDを前面にできませんでした。タスクバーから選択してください。".into(),
            );
        }
    }
    Ok(())
}
