use crate::{
    file_io::{self, Format, LineEnding, SaveHooks},
    Result,
};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub path: Option<String>,
    pub text: String,
    pub saved_text: String,
    pub revision: u64,
    pub format: Format,
    pub read_only: bool,
    pub external: bool,
}

pub struct Document {
    pub snapshot: Snapshot,
    pub path: Option<PathBuf>,
    pub baseline: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct Documents {
    pub docs: BTreeMap<String, Document>,
    next: u64,
}

pub fn resolved(path: &Path) -> Result<PathBuf> {
    if path.exists() {
        return path.canonicalize().map_err(|e| e.to_string());
    }
    let name = path.file_name().ok_or("ファイル名がありません。")?;
    let parent = path
        .parent()
        .ok_or("フォルダーがありません。")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    Ok(parent.join(name))
}

pub fn same_path(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    if a.exists() && b.exists() {
        return same_file::is_same_file(a, b).unwrap_or(false);
    }
    #[cfg(windows)]
    {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    }
    #[cfg(not(windows))]
    false
}

impl Documents {
    pub fn paste_png(
        &self,
        id: &str,
        bytes: &[u8],
        timestamp: &str,
        hooks: &dyn SaveHooks,
    ) -> Result<String> {
        let document = self.get(id)?;
        if document.snapshot.read_only {
            return Err("読み取り専用文書には画像を貼り付けできません。".into());
        }
        let path = document
            .path
            .as_ref()
            .ok_or("先にMarkdown文書を保存してください。")?;
        crate::paste::write_png(path, bytes, timestamp, hooks)
    }

    pub fn create(&mut self) -> String {
        self.next += 1;
        let id = format!("doc-{}", self.next);
        let snapshot = Snapshot {
            id: id.clone(),
            path: None,
            text: String::new(),
            saved_text: String::new(),
            revision: 0,
            format: Format::default(),
            read_only: false,
            external: false,
        };
        self.docs.insert(
            id.clone(),
            Document {
                snapshot,
                path: None,
                baseline: None,
            },
        );
        id
    }

    pub fn owner(&self, path: &Path) -> Option<String> {
        self.docs
            .iter()
            .find(|(_, d)| d.path.as_ref().is_some_and(|p| same_path(p, path)))
            .map(|(id, _)| id.clone())
    }

    pub fn open(&mut self, path: &Path) -> Result<(String, bool)> {
        let path = path
            .canonicalize()
            .map_err(|e| format!("開けません: {e}"))?;
        if let Some(id) = self.owner(&path) {
            return Ok((id, false));
        }
        let bytes = file_io::read(&path)?;
        let (text, format) = file_io::decode(&bytes)?;
        let id = self.create();
        let d = self.docs.get_mut(&id).unwrap();
        d.snapshot.path = Some(path.display().to_string());
        d.snapshot.text = text.clone();
        d.snapshot.saved_text = text;
        d.snapshot.read_only = format.line_ending == LineEnding::Mixed;
        d.snapshot.format = format;
        d.path = Some(path);
        d.baseline = Some(bytes);
        Ok((id, true))
    }

    pub fn get(&self, id: &str) -> Result<&Document> {
        self.docs
            .get(id)
            .ok_or_else(|| "文書の所有権がありません。".into())
    }
    pub fn get_mut(&mut self, id: &str) -> Result<&mut Document> {
        self.docs
            .get_mut(id)
            .ok_or_else(|| "文書の所有権がありません。".into())
    }

    pub fn edit(&mut self, id: &str, text: String, revision: u64) -> Result<()> {
        let d = self.get_mut(id)?;
        if d.snapshot.read_only {
            return Err("混在改行の文書は読み取り専用です。".into());
        }
        if text.len() as u64 > file_io::MAX_DOCUMENT {
            return Err("文書の上限は32 MiBです。".into());
        }
        if revision < d.snapshot.revision {
            return Ok(());
        }
        if revision == d.snapshot.revision && text != d.snapshot.text {
            return Err("文書リビジョンが一致しません。".into());
        }
        d.snapshot.text = text;
        d.snapshot.revision = revision;
        Ok(())
    }

    pub fn check_external(&mut self, id: &str) -> Result<bool> {
        let d = self.get_mut(id)?;
        d.snapshot.external = d
            .path
            .as_ref()
            .is_some_and(|p| file_io::read(p).ok().as_ref() != d.baseline.as_ref());
        Ok(d.snapshot.external)
    }

    pub fn reload_external(&mut self, id: &str, expected_revision: u64) -> Result<Snapshot> {
        let snapshot = &self.get(id)?.snapshot;
        if snapshot.text != snapshot.saved_text {
            return Err("未保存の変更があるため、自動再読み込みを中止しました。".into());
        }
        self.reload(id, expected_revision)
    }

    pub fn reload(&mut self, id: &str, expected_revision: u64) -> Result<Snapshot> {
        let d = self.get_mut(id)?;
        if d.snapshot.revision != expected_revision {
            return Err("再読み込み中に文書が変更されました。".into());
        }
        let bytes = file_io::read(d.path.as_ref().ok_or("保存先がありません。")?)?;
        let (text, format) = file_io::decode(&bytes)?;
        d.snapshot.revision += 1;
        d.snapshot.saved_text = text.clone();
        d.snapshot.text = text;
        d.snapshot.read_only = format.line_ending == LineEnding::Mixed;
        d.snapshot.format = format;
        d.snapshot.external = false;
        d.baseline = Some(bytes);
        Ok(d.snapshot.clone())
    }

    // Caller holds the registry mutex throughout save: target reservation and I/O are serialized.
    pub fn save(
        &mut self,
        id: &str,
        target: &Path,
        expected: Option<&[u8]>,
        text: &str,
        revision: u64,
        hooks: &dyn SaveHooks,
    ) -> Result<Snapshot> {
        let path = resolved(target)?;
        if self.owner(&path).is_some_and(|owner| owner != id) {
            return Err("別のWinMDウィンドウで編集中の保存先です。".into());
        }
        self.edit(id, text.to_string(), revision)?;
        let d = self.get_mut(id)?;
        if revision != d.snapshot.revision {
            return Err("新しい編集があります。再度保存してください。".into());
        }
        let bytes = file_io::encode(text, &d.snapshot.format)?;
        file_io::atomic_save(&path, &bytes, expected, hooks)?;
        d.path = Some(path.clone());
        d.baseline = Some(bytes);
        d.snapshot.path = Some(path.display().to_string());
        d.snapshot.saved_text = text.to_string();
        d.snapshot.external = false;
        Ok(d.snapshot.clone())
    }
}
