use crate::{images, Result};
use percent_encoding::percent_decode_str;
use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq)]
pub enum LinkTarget {
    Web(url::Url),
    Markdown(PathBuf),
    File(PathBuf),
}

/// Resolve only a clicked reference, using the caller-owned document as its base.
/// No process working directory, shell command, environment expansion or URL handler fallback.
pub fn resolve(document: Option<&Path>, reference: &str) -> Result<LinkTarget> {
    let reference = reference.trim();
    if reference.is_empty() || reference.len() > 8192 || reference.chars().any(char::is_control) {
        return Err("リンク先が不正です。".into());
    }
    let lower = reference.to_ascii_lowercase();
    if lower.starts_with("https:") || lower.starts_with("http:") {
        return images::external_url(reference).map(LinkTarget::Web);
    }
    let path = if lower.starts_with("file:") {
        let url = url::Url::parse(reference).map_err(|_| "ファイルURLが不正です。")?;
        if url.host_str().is_some() || url.query().is_some() {
            return Err("ローカルファイルのURLを指定してください。".into());
        }
        url.to_file_path().map_err(|_| "ファイルURLが不正です。")?
    } else {
        let raw = reference.split('#').next().unwrap_or_default();
        if raw.is_empty() || raw.contains('?') {
            return Err("ファイルへのパスを指定してください。".into());
        }
        let decoded = percent_decode_str(raw)
            .decode_utf8()
            .map_err(|_| "ファイルパスの文字コードが不正です。")?;
        validate_path_text(&decoded)?;
        PathBuf::from(decoded.as_ref())
    };
    // file: URLs must pass the same device/stream/remote path checks as ordinary paths.
    validate_path_text(path.to_str().ok_or("ファイルパスが不正です。")?)?;
    let path = if path.is_absolute() {
        path
    } else {
        if path.has_root() {
            return Err("絶対パスにはドライブ名も指定してください。".into());
        }
        document
            .and_then(Path::parent)
            .ok_or("相対リンクは文書を保存してから開けます。")?
            .join(path)
    };
    let path = path
        .canonicalize()
        .map_err(|e| format!("リンク先を開けません（{}）: {e}", path.display()))?;
    if !path.is_file() {
        return Err("リンク先がファイルではありません。".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "md" | "markdown" => Ok(LinkTarget::Markdown(path)),
        // Shell-open is limited to document formats; executable/script/shortcut links
        // never reach the OS. Check the canonical target, including symlink targets.
        "txt" | "text" | "log" | "json" | "jsonl" | "csv" | "tsv" | "xml" | "yaml" | "yml"
        | "toml" | "pdf" | "doc" | "docx" | "odt" | "rtf" | "xls" | "xlsx" | "ods" | "ppt"
        | "pptx" | "odp" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tif" | "tiff"
        | "html" | "htm" => Ok(LinkTarget::File(path)),
        _ => Err("この種類のファイルはリンクから開けません。".into()),
    }
}

fn validate_path_text(path: &str) -> Result<()> {
    let drive = path.as_bytes().get(0..3).is_some_and(|p| {
        p[0].is_ascii_alphabetic() && p[1] == b':' && matches!(p[2], b'/' | b'\\')
    });
    let rest = if drive { &path[2..] } else { path };
    if path.is_empty()
        || path.chars().any(char::is_control)
        || path.starts_with("\\\\")
        || path.starts_with("//")
        || rest.contains([':', '?'])
    {
        return Err("ローカルファイルへのパスを指定してください。".into());
    }
    Ok(())
}
