use crate::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use percent_encoding::percent_decode_str;
use std::{
    fs::File,
    io::Read,
    path::{Component, Path},
};

/// Only raster images beneath the canonical document directory. No SVG or file:// access.
pub fn local_image(document: &Path, reference: &str) -> Result<String> {
    let decoded = percent_decode_str(reference)
        .decode_utf8()
        .map_err(|_| "画像URLが不正です。")?;
    if decoded.contains([':', '?', '#', '\0']) || decoded.starts_with(['/', '\\']) {
        return Err("画像は文書フォルダー内の相対パスに限ります。".into());
    }
    let relative = Path::new(decoded.as_ref());
    if relative
        .components()
        .any(|c| matches!(c, Component::Prefix(_) | Component::RootDir))
    {
        return Err("絶対パスは許可されていません。".into());
    }
    let root = document
        .parent()
        .ok_or("文書フォルダーがありません。")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let requested = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "画像が見つかりません。")?;
    if !requested.starts_with(&root) {
        return Err("文書フォルダー外の画像には許可が必要です。".into());
    }
    let mut file = File::open(&requested).map_err(|e| e.to_string())?;
    // Verify the actual opened handle as well, covering junction/symlink swaps before open.
    #[cfg(windows)]
    let actual = {
        use std::os::windows::ffi::OsStringExt;
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::GetFinalPathNameByHandleW;
        let mut buffer = vec![0u16; 32768];
        let len = unsafe {
            GetFinalPathNameByHandleW(
                file.as_raw_handle(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                0,
            )
        };
        if len == 0 || len as usize >= buffer.len() {
            return Err("画像の実体パスを確認できません。".into());
        }
        std::path::PathBuf::from(std::ffi::OsString::from_wide(&buffer[..len as usize]))
    };
    #[cfg(target_os = "linux")]
    let actual = {
        use std::os::fd::AsRawFd;
        std::fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd()))
            .map_err(|e| e.to_string())?
    };
    #[cfg(not(any(windows, target_os = "linux")))]
    let actual = requested.clone();
    if !actual.starts_with(&root) {
        return Err("画像の実体が文書フォルダー外です。".into());
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("画像の上限は16 MiBです。".into());
    }
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        return Err("対応画像はPNG/JPEG/GIF/WebPです。SVGは表示しません。".into());
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

pub fn external_url(raw: &str) -> Result<url::Url> {
    let url = url::Url::parse(raw).map_err(|_| "URLが不正です。")?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("外部リンクには認証情報なしのhttp/httpsだけを指定できます。".into());
    }
    Ok(url)
}
