use crate::Result;
use serde::Serialize;
use std::{fs, io::Write, path::Path};

pub const MAX_DOCUMENT: u64 = 32 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
pub enum LineEnding {
    LF,
    CRLF,
    Mixed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Format {
    pub bom: bool,
    pub line_ending: LineEnding,
}

impl Default for Format {
    fn default() -> Self {
        Self {
            bom: false,
            line_ending: LineEnding::LF,
        }
    }
}

pub fn decode(bytes: &[u8]) -> Result<(String, Format)> {
    let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let content = if bom { &bytes[3..] } else { bytes };
    let text = std::str::from_utf8(content)
        .map_err(|_| "未対応の文字コードです。UTF-8として読めないため開きません。".to_string())?;
    if text.contains('\0') {
        return Err("NULを含むファイルは編集できません。".into());
    }
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count();
    let cr = text.matches('\r').count();
    let line_ending = if cr != crlf || (crlf > 0 && lf != crlf) {
        LineEnding::Mixed
    } else if crlf > 0 {
        LineEnding::CRLF
    } else {
        LineEnding::LF
    };
    Ok((
        text.replace("\r\n", "\n").replace('\r', "\n"),
        Format { bom, line_ending },
    ))
}

pub fn encode(text: &str, format: &Format) -> Result<Vec<u8>> {
    if format.line_ending == LineEnding::Mixed {
        return Err("混在改行の文書は読み取り専用です。".into());
    }
    if text.contains('\r') || text.contains('\0') {
        return Err("文書内の改行またはNULが不正です。".into());
    }
    let mut bytes = if format.bom {
        vec![0xef, 0xbb, 0xbf]
    } else {
        Vec::new()
    };
    let content = if format.line_ending == LineEnding::CRLF {
        text.replace('\n', "\r\n")
    } else {
        text.to_string()
    };
    bytes.extend_from_slice(content.as_bytes());
    Ok(bytes)
}

pub fn read(path: &Path) -> Result<Vec<u8>> {
    let meta = fs::metadata(path).map_err(|e| format!("ファイルを確認できません: {e}"))?;
    if !meta.is_file() || meta.len() > MAX_DOCUMENT {
        return Err("通常の32 MiB以下のファイルを指定してください。".into());
    }
    fs::read(path).map_err(|e| format!("読み込みに失敗しました: {e}"))
}

/// Test seam: failures can be injected before write, sync or commit without filling a disk.
pub trait SaveHooks {
    fn stage(&self, _stage: &str) -> Result<()> {
        Ok(())
    }
}
pub struct NoFault;
impl SaveHooks for NoFault {}

pub fn atomic_save(
    path: &Path,
    bytes: &[u8],
    expected: Option<&[u8]>,
    hooks: &dyn SaveHooks,
) -> Result<()> {
    let parent = path.parent().ok_or("保存先フォルダーがありません。")?;
    let mut temp = tempfile::Builder::new()
        .prefix(".winmd-")
        .tempfile_in(parent)
        .map_err(|e| format!("一時ファイルを作成できません: {e}"))?;
    hooks.stage("write")?;
    temp.write_all(bytes)
        .map_err(|e| format!("書き込みに失敗しました: {e}"))?;
    hooks.stage("sync")?;
    temp.as_file()
        .sync_all()
        .map_err(|e| format!("同期に失敗しました: {e}"))?;
    hooks.stage("commit")?;
    // Repeat the comparison immediately before replacement, after all potentially slow writes.
    match expected {
        Some(old) if read(path)?.as_slice() != old => {
            return Err("外部変更があります。再読み込み、または別名保存してください。".into())
        }
        None if path.exists() => {
            return Err("保存先が他の処理で作成されました。別名保存してください。".into())
        }
        _ => {}
    }
    if expected.is_some()
        && fs::metadata(path)
            .map_err(|e| e.to_string())?
            .permissions()
            .readonly()
    {
        return Err("読み取り専用のファイルには保存できません。".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, ReplaceFileW, MOVEFILE_WRITE_THROUGH,
        };
        // tempfile uses a handle which may deny ReplaceFile access on Windows.
        // into_temp_path closes it after sync_all, retaining automatic path cleanup.
        let temp_path = temp.into_temp_path();
        let dest: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let src: Vec<u16> = temp_path.as_os_str().encode_wide().chain(Some(0)).collect();
        // A backup also covers ReplaceFile's partial-failure cases. Keep it on failure.
        let backup_path = parent.join(format!(
            ".winmd-backup-{}",
            temp_path.file_name().unwrap().to_string_lossy()
        ));
        let backup: Vec<u16> = backup_path
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        let ok = unsafe {
            if expected.is_some() {
                ReplaceFileW(
                    dest.as_ptr(),
                    src.as_ptr(),
                    backup.as_ptr(),
                    0,
                    std::ptr::null(),
                    std::ptr::null(),
                )
            } else {
                MoveFileExW(src.as_ptr(), dest.as_ptr(), MOVEFILE_WRITE_THROUGH)
            }
        };
        if ok == 0 {
            let error = std::io::Error::last_os_error();
            return Err(format!(
                "置換に失敗しました: {error}。原本バックアップがある場合: {}",
                backup_path.display()
            ));
        }
        if read(path)? != bytes {
            return Err("保存後の内容確認に失敗しました。バックアップを保持しました。".into());
        }
        if backup_path.exists() {
            let _ = fs::remove_file(backup_path);
        }
    }
    #[cfg(not(windows))]
    {
        if expected.is_some() {
            temp.persist(path)
                .map_err(|e| format!("置換に失敗しました: {e}"))?;
        } else {
            temp.persist_noclobber(path)
                .map_err(|e| format!("保存に失敗しました: {e}"))?;
        }
        if read(path)? != bytes {
            return Err("保存後の内容確認に失敗しました。".into());
        }
    }
    Ok(())
}
