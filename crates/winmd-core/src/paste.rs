use crate::{
    file_io::{atomic_save, SaveHooks},
    Result,
};
use std::{io::Cursor, path::Path};

pub const MAX_PNG_BYTES: usize = 16 * 1024 * 1024;
const MAX_PIXELS: u64 = 16 * 1024 * 1024;

/// Accept only a real, bounded PNG, even if the IPC caller spoofs its MIME type.
fn validate_png(bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() || bytes.len() > MAX_PNG_BYTES {
        return Err("貼り付け画像の上限は16 MiBです。".into());
    }
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_limits(png::Limits {
        bytes: 128 * 1024 * 1024,
    });
    let mut reader = decoder
        .read_info()
        .map_err(|e| format!("PNG画像を読み込めません: {e}"))?;
    let info = reader.info();
    if u64::from(info.width) * u64::from(info.height) > MAX_PIXELS {
        return Err("貼り付け画像の上限は16メガピクセルです。".into());
    }
    let size = reader
        .output_buffer_size()
        .ok_or("画像サイズが不正です。")?;
    if size > 128 * 1024 * 1024 {
        return Err("画像の展開サイズが大きすぎます。".into());
    }
    let mut buffer = vec![0; size];
    reader
        .next_frame(&mut buffer)
        .map_err(|e| format!("PNG画像が破損しています: {e}"))?;
    Ok(())
}

/// The timestamp comes from the backend clock, never from an arbitrary IPC path.
pub fn write_png(
    document: &Path,
    bytes: &[u8],
    timestamp: &str,
    hooks: &dyn SaveHooks,
) -> Result<String> {
    if timestamp.len() != 15
        || timestamp.as_bytes()[8] != b'_'
        || !timestamp
            .bytes()
            .enumerate()
            .all(|(i, b)| i == 8 || b.is_ascii_digit())
    {
        return Err("画像の日時形式が不正です。".into());
    }
    validate_png(bytes)?;
    let root = document
        .parent()
        .ok_or("文書の保存先がありません。")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let filename = format!("{timestamp}.png");
    let target = root.join(&filename);
    if target.symlink_metadata().is_ok() {
        return Err("同じ秒の画像ファイルが既にあります。1秒待ってから再度貼り付けてください。上書きはしません。".into());
    }
    atomic_save(&target, bytes, None, hooks)?;
    Ok(filename)
}
