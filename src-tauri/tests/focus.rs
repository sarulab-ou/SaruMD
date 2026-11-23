// No Tauri GUI runtime is linked into this isolated native activation test.
#[cfg(windows)]
#[path = "../src/focus_windows.rs"]
mod native;

#[cfg(windows)]
mod tests {
    use super::native::activate_hwnd;
    use windows::{
        core::w,
        Win32::{Foundation::HWND, UI::WindowsAndMessaging::*},
    };

    struct Fixture(HWND);
    impl Fixture {
        unsafe fn new(owner: Option<HWND>) -> Self {
            Self(unsafe {
                CreateWindowExW(
                    Default::default(),
                    w!("STATIC"),
                    w!("SaruMD isolated focus test"),
                    WS_OVERLAPPEDWINDOW,
                    100,
                    100,
                    400,
                    300,
                    owner,
                    None,
                    None,
                    None,
                )
                .unwrap()
            })
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            unsafe {
                let _ = DestroyWindow(self.0);
            }
        }
    }

    #[test]
    #[ignore = "Requires an interactive Windows desktop"]
    fn activates_existing_normal_minimized_maximized_and_dialog_windows() {
        unsafe {
            let original = GetForegroundWindow();
            let target = Fixture::new(None);
            let cover = Fixture::new(None);
            for state in [SW_SHOWNORMAL, SW_MINIMIZE, SW_SHOWMAXIMIZED, SW_HIDE] {
                let _ = ShowWindow(target.0, state);
                let _ = ShowWindow(cover.0, SW_SHOW);
                assert!(GetForegroundWindow() == cover.0 || SetForegroundWindow(cover.0).as_bool());
                activate_hwnd(target.0).unwrap();
                assert_eq!(GetForegroundWindow(), target.0);
                assert!(!IsIconic(target.0).as_bool());
                assert!(IsWindowVisible(target.0).as_bool());
                if state == SW_SHOWMAXIMIZED {
                    assert!(IsZoomed(target.0).as_bool());
                }
            }
            let dialog = Fixture::new(Some(target.0));
            let _ = ShowWindow(dialog.0, SW_SHOW);
            let _ = SetForegroundWindow(dialog.0);
            let _ = SetForegroundWindow(cover.0);
            activate_hwnd(target.0).unwrap();
            assert_eq!(GetForegroundWindow(), dialog.0);
            drop(dialog);
            drop(cover);
            drop(target);
            if !original.0.is_null() {
                let _ = SetForegroundWindow(original);
            }
        }
    }
}
