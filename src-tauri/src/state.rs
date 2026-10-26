use std::{
    collections::VecDeque,
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
}

impl AppState {
    pub fn lock(&self) -> winmd_core::Result<std::sync::MutexGuard<'_, Documents>> {
        self.documents
            .lock()
            .map_err(|_| "文書管理でエラーが発生しました。アプリを再起動してください。".into())
    }
}
