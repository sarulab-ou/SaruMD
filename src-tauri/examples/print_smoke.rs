//! Windows-only, hidden WebView2 regression probe. Does not open a printer or touch user documents.
#[cfg(windows)]
#[allow(dead_code)]
#[path = "../src/printing.rs"]
mod printing;

#[cfg(windows)]
fn main() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    let started = Arc::new(AtomicBool::new(false));
    let finished = Arc::new(AtomicBool::new(false));
    let done = finished.clone();
    tauri::Builder::default()
        .on_page_load(move |view, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished || started.swap(true, Ordering::SeqCst) { return; }
            let app = view.app_handle().clone();
            let window = app.get_webview_window("print-smoke").unwrap();
            let done = done.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let result = printing::pdf(&window).and_then(|bytes| {
                    let path = std::env::args_os().nth(1).ok_or("Pass a test PDF output path")?;
                    winmd_core::file_io::atomic_save(std::path::Path::new(&path), &bytes, None, &winmd_core::file_io::NoFault)?;
                    println!("PASS: native WebView2 PDF: {} bytes", bytes.len());
                    Ok(())
                });
                done.store(true, Ordering::SeqCst);
                if let Err(error) = &result { eprintln!("FAIL: {error}"); }
                app.exit(if result.is_ok() { 0 } else { 1 });
            });
        })
        .setup(move |app| {
            let css = include_str!("../../src/style.css");
            let rows: String = (1..=90).map(|i| format!("<tr><td>{i}</td><td>日本語の表を複数ページで確認します。</td></tr>")).collect();
            let html = format!("<!doctype html><html lang='ja'><meta charset='utf-8'><style>{css}</style><body><div id='app'>SHOULD_NOT_PRINT: menu and editor</div><article id='print-content'><h1>日本語PDF出力テスト</h1><p>未保存の編集・見出し・表・コードが本文だけで出力されます。</p><h2>コードと引用</h2><pre><code>const message = '日本語';\nconsole.log(message);</code></pre><blockquote>印刷余白と文字の読みやすさを確認します。</blockquote><table><thead><tr><th>番号</th><th>内容</th></tr></thead><tbody>{rows}</tbody></table><p>END_OF_DOCUMENT</p></article></body></html>");
            // Serve a fixed fixture on loopback; do not enable production data-url permissions.
            let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
            let url = format!("http://{}/", listener.local_addr()?);
            std::thread::spawn(move || {
                use std::io::{Read, Write};
                for mut stream in listener.incoming().flatten() {
                    let _ = stream.read(&mut [0u8; 4096]);
                    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len());
                    let _ = stream.write_all(response.as_bytes());
                }
            });
            WebviewWindowBuilder::new(app, "print-smoke", WebviewUrl::External(url.parse()?))
                .visible(false).data_directory(std::env::temp_dir().join(format!("winmd-print-test-{}", std::process::id())))
                .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(45));
                if !finished.load(Ordering::SeqCst) { eprintln!("FAIL: PDF test timed out"); handle.exit(1); }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("PDF test app failed");
}

#[cfg(not(windows))]
fn main() {
    eprintln!("Run this probe on Windows.");
    std::process::exit(1);
}
