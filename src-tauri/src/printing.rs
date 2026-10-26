//! Native printing uses the caller's WebView2; JavaScript supplies neither paths nor HTML.
use tauri::WebviewWindow;
use winmd_core::Result;

#[cfg(windows)]
pub fn print(window: &WebviewWindow) -> Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER,
    };
    use windows::core::Interface;
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .with_webview(move |view| {
            // Tauri dispatches this closure to the WebView2 STA thread.
            let result = unsafe {
                view.controller()
                    .CoreWebView2()
                    .and_then(|core| core.cast::<ICoreWebView2_16>())
                    .and_then(|core| core.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER))
            }
            .map_err(|e| format!("印刷画面を開けませんでした: {e}"));
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[cfg(windows)]
pub fn pdf(window: &WebviewWindow) -> Result<Vec<u8>> {
    use std::os::windows::ffi::OsStrExt;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7},
        PrintToPdfCompletedHandler,
    };
    use windows::core::{Interface, PCWSTR};
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let path = temp.path().join("document.pdf");
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .with_webview(move |view| {
            let completed = tx.clone();
            let result = (|| -> windows::core::Result<()> {
                // All COM handles remain on the UI thread, including the completion callback.
                unsafe {
                    let core = view
                        .controller()
                        .CoreWebView2()?
                        .cast::<ICoreWebView2_7>()?;
                    let settings = view
                        .environment()
                        .cast::<ICoreWebView2Environment6>()?
                        .CreatePrintSettings()?;
                    settings.SetPageWidth(8.2677165354)?; // WebView2 uses inches: A4 portrait.
                    settings.SetPageHeight(11.6929133858)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    core.PrintToPdf(
                        PCWSTR(wide.as_ptr()),
                        &settings,
                        &PrintToPdfCompletedHandler::create(Box::new(move |error, success| {
                            let result = error
                                .and_then(|()| {
                                    if success {
                                        Ok(())
                                    } else {
                                        Err(windows::core::Error::from_hresult(
                                            windows::core::HRESULT(0x80004005u32 as i32),
                                        ))
                                    }
                                })
                                .map_err(|e| format!("PDF生成に失敗しました: {e}"));
                            let _ = completed.send(result);
                            Ok(())
                        })),
                    )
                }
            })();
            if let Err(error) = result {
                let _ = tx.send(Err(error.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    // Runs on a blocking worker, never blocks WebView2's message pump. Keep the tempdir alive.
    rx.recv().map_err(|e| e.to_string())??;
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("PDF生成結果が不正です。".into());
    }
    Ok(bytes)
}

#[cfg(not(windows))]
pub fn print(_window: &WebviewWindow) -> Result<()> {
    Err("印刷はWindowsで使用できます。".into())
}
#[cfg(not(windows))]
pub fn pdf(_window: &WebviewWindow) -> Result<Vec<u8>> {
    Err("PDF出力はWindowsで使用できます。".into())
}
