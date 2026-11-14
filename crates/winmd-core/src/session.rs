//! Update-only workspace handoff. Document contents and arbitrary commands are never stored.
use crate::Result;
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ViewMode {
    Split,
    Editor,
    Viewer,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct TextPoint {
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Selection {
    pub anchor: TextPoint,
    pub head: TextPoint,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPosition {
    pub line: f64,
    pub at_end: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UiState {
    pub mode: ViewMode,
    pub source_width: f64,
    pub selection: Selection,
    pub scroll: ReadingPosition,
}

impl UiState {
    pub fn validate(&self) -> Result<()> {
        if !self.source_width.is_finite()
            || !(20.0..=80.0).contains(&self.source_width)
            || !self.scroll.line.is_finite()
            || !(1.0..=33_554_434.0).contains(&self.scroll.line)
            || [&self.selection.anchor, &self.selection.head]
                .iter()
                .any(|p| {
                    p.line == 0 || p.column == 0 || p.line > 33_554_433 || p.column > 33_554_433
                })
        {
            return Err("文書の復元位置が不正です。".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ResumeDocument {
    pub path: Option<PathBuf>,
    pub ui: UiState,
    pub window: Option<WindowState>,
}

#[derive(Deserialize, Serialize)]
pub struct Workspace {
    pub schema: u32,
    pub documents: Vec<ResumeDocument>,
}

impl Workspace {
    pub fn validate(&self) -> Result<()> {
        if self.schema != 1 || self.documents.len() > 1000 {
            return Err("更新前の文書一覧を読み込めません。".into());
        }
        for document in &self.documents {
            document.ui.validate()?;
            if document.path.as_ref().is_some_and(|p| !p.is_absolute())
                || document.window.as_ref().is_some_and(|w| {
                    w.width < 100 || w.height < 100 || w.width > 32768 || w.height > 32768
                })
            {
                return Err("更新前の文書の復元情報が不正です。".into());
            }
        }
        Ok(())
    }
}

pub fn write_workspace(directory: &Path, documents: Vec<ResumeDocument>) -> Result<PathBuf> {
    let workspace = Workspace {
        schema: 1,
        documents,
    };
    workspace.validate()?;
    let bytes = serde_json::to_vec(&workspace).map_err(|e| e.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("更新前の文書一覧が大きすぎます。".into());
    }
    let mut file = tempfile::Builder::new()
        .prefix("resume-")
        .suffix(".json")
        .tempfile_in(directory)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.keep().map(|(_, path)| path).map_err(|e| e.to_string())
}

pub fn read_workspace(path: &Path) -> Result<Workspace> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("更新前の文書一覧が大きすぎます。".into());
    }
    let workspace: Workspace = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    workspace.validate()?;
    Ok(workspace)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ui() -> UiState {
        UiState {
            mode: ViewMode::Viewer,
            source_width: 32.0,
            selection: Selection {
                anchor: TextPoint {
                    line: 20,
                    column: 4,
                },
                head: TextPoint {
                    line: 18,
                    column: 1,
                },
            },
            scroll: ReadingPosition {
                line: 15.75,
                at_end: false,
            },
        }
    }

    #[test]
    fn validates_restoration_without_document_contents() {
        let mut workspace = Workspace {
            schema: 1,
            documents: vec![ResumeDocument {
                path: None,
                ui: ui(),
                window: None,
            }],
        };
        assert!(workspace.validate().is_ok());
        workspace.documents[0].path = Some(PathBuf::from("relative.md"));
        assert!(workspace.validate().is_err());
        workspace.documents[0].path = None;
        workspace.schema = 2;
        assert!(workspace.validate().is_err());
    }

    #[test]
    fn rejects_invalid_positions_and_non_finite_layouts() {
        let mut value = ui();
        value.scroll.line = f64::NAN;
        assert!(value.validate().is_err());
        value = ui();
        value.source_width = 0.0;
        assert!(value.validate().is_err());
        value = ui();
        value.selection.head.column = 0;
        assert!(value.validate().is_err());
    }

    #[test]
    fn hands_off_multiple_documents_and_consumes_no_document_contents() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("日本語 (space) &.md");
        std::fs::write(&source, "保存済みの原本").unwrap();
        let path = write_workspace(
            directory.path(),
            vec![
                ResumeDocument {
                    path: Some(source.clone()),
                    ui: ui(),
                    window: Some(WindowState {
                        x: -1200,
                        y: 10,
                        width: 1100,
                        height: 800,
                        maximized: true,
                    }),
                },
                ResumeDocument {
                    path: None,
                    ui: UiState {
                        mode: ViewMode::Editor,
                        ..ui()
                    },
                    window: None,
                },
            ],
        )
        .unwrap();
        let loaded = read_workspace(&path).unwrap();
        assert_eq!(loaded.documents.len(), 2);
        assert_eq!(loaded.documents[0].path.as_ref(), Some(&source));
        assert_eq!(loaded.documents[0].ui, ui());
        assert_eq!(loaded.documents[0].window.as_ref().unwrap().x, -1200);
        assert_eq!(loaded.documents[1].ui.mode, ViewMode::Editor);
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "保存済みの原本");
        assert!(!std::fs::read_to_string(&path)
            .unwrap()
            .contains("保存済みの原本"));
        std::fs::write(&path, b"{broken").unwrap();
        assert!(read_workspace(&path).is_err());
        std::fs::write(&path, vec![b' '; 4 * 1024 * 1024 + 1]).unwrap();
        assert!(read_workspace(&path).is_err());
    }
}
