use std::{
    collections::{BTreeMap, VecDeque},
    path::PathBuf,
    sync::{atomic::AtomicBool, Mutex},
};
use winmd_core::document::Documents;

pub struct Launch {
    pub paths: Vec<PathBuf>,
    pub cwd: PathBuf,
}

#[derive(Default)]
pub struct AppState {
    pub documents: Mutex<Documents>,
    pub launches: Mutex<VecDeque<Launch>>,
    pub ready: AtomicBool,
    pub updates: Mutex<crate::updating::State>,
    pub resume: Mutex<BTreeMap<String, winmd_core::session::UiState>>,
}

impl AppState {
    pub fn update(&self) -> winmd_core::Result<std::sync::MutexGuard<'_, crate::updating::State>> {
        self.updates
            .lock()
            .map_err(|_| "更新の状態を確認できません。".into())
    }
    pub fn lock(&self) -> winmd_core::Result<std::sync::MutexGuard<'_, Documents>> {
        self.documents
            .lock()
            .map_err(|_| "文書管理でエラーが発生しました。アプリを再起動してください。".into())
    }
}
