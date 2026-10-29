use crate::{
    document::Documents,
    file_io::{self, LineEnding, NoFault, SaveHooks},
    images, Result,
};
use std::{fs, path::Path};

struct FailAt(&'static str);
impl SaveHooks for FailAt {
    fn stage(&self, stage: &str) -> Result<()> {
        if stage == self.0 {
            Err(format!("injected {stage} failure"))
        } else {
            Ok(())
        }
    }
}

#[test]
fn utf8_bom_newlines_and_final_newline_round_trip() {
    for bom in [false, true] {
        for ending in ["\n", "\r\n"] {
            for final_newline in [false, true] {
                let mut input = if bom { vec![0xef, 0xbb, 0xbf] } else { vec![] };
                input.extend_from_slice(
                    format!(
                        "日本語{ending}本文{}",
                        if final_newline { ending } else { "" }
                    )
                    .as_bytes(),
                );
                let (text, format) = file_io::decode(&input).unwrap();
                assert_eq!(file_io::encode(&text, &format).unwrap(), input);
            }
        }
    }
}

#[test]
fn invalid_encoding_and_mixed_line_endings_are_not_silently_overwritten() {
    assert!(file_io::decode(&[0x82, 0xa0]).is_err());
    assert!(file_io::decode(b"a\0b").is_err());
    for input in [b"a\r\nb\nc".as_slice(), b"a\rb".as_slice()] {
        let (text, format) = file_io::decode(input).unwrap();
        assert_eq!(format.line_ending, LineEnding::Mixed);
        assert!(file_io::encode(&text, &format).is_err());
    }
}

#[test]
fn independent_documents_and_same_file_focus_identity() {
    let dir = tempfile::tempdir().unwrap();
    let a = dir.path().join("日本語 (a).md");
    let b = dir.path().join("b.md");
    fs::write(&a, "A").unwrap();
    fs::write(&b, "B").unwrap();
    let mut docs = Documents::default();
    let (aid, _) = docs.open(&a).unwrap();
    let (bid, _) = docs.open(&b).unwrap();
    assert_ne!(aid, bid);
    assert_eq!(docs.open(&a).unwrap(), (aid.clone(), false));
    docs.edit(&aid, "A2".into(), 1).unwrap();
    // A repeated launch must return ownership without reloading dirty text from disk.
    assert_eq!(docs.open(&a).unwrap(), (aid.clone(), false));
    assert_eq!(docs.docs.len(), 2);
    assert_eq!(docs.get(&aid).unwrap().snapshot.text, "A2");
    assert_eq!(docs.get(&aid).unwrap().snapshot.saved_text, "A");
    let alias_before_save = dir.path().join("same file alias.md");
    fs::hard_link(&a, &alias_before_save).unwrap();
    assert_eq!(docs.open(&alias_before_save).unwrap(), (aid.clone(), false));
    assert_eq!(docs.get(&aid).unwrap().snapshot.text, "A2");
    let baseline = docs.get(&aid).unwrap().baseline.clone().unwrap();
    docs.save(&aid, &a, Some(&baseline), "A2", 1, &NoFault)
        .unwrap();
    assert_eq!(docs.get(&bid).unwrap().snapshot.text, "B");
    assert_eq!(fs::read_to_string(&b).unwrap(), "B");
    let alias = dir.path().join("alias.md");
    fs::hard_link(&a, &alias).unwrap();
    assert_eq!(docs.open(&alias).unwrap(), (aid, false));
}

#[test]
fn save_failures_preserve_disk_buffer_dirty_state_and_allow_retry() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("original.md");
    for stage in ["write", "sync", "commit"] {
        fs::write(&path, "original").unwrap();
        let mut docs = Documents::default();
        let (id, _) = docs.open(&path).unwrap();
        assert!(docs
            .save(&id, &path, Some(b"original"), "edited", 1, &FailAt(stage))
            .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        let snapshot = &docs.get(&id).unwrap().snapshot;
        assert_eq!(snapshot.text, "edited");
        assert_ne!(snapshot.text, snapshot.saved_text);
        docs.save(&id, &path, Some(b"original"), "edited", 1, &NoFault)
            .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "edited");
    }
}

#[test]
fn external_change_replacement_deletion_and_save_as_conflict() {
    let dir = tempfile::tempdir().unwrap();
    let a = dir.path().join("a.md");
    let b = dir.path().join("b.md");
    fs::write(&a, "a").unwrap();
    fs::write(&b, "b").unwrap();
    let mut docs = Documents::default();
    let (id, _) = docs.open(&a).unwrap();
    docs.open(&b).unwrap();
    docs.edit(&id, "mine".into(), 1).unwrap();
    assert!(docs.save(&id, &b, Some(b"b"), "mine", 1, &NoFault).is_err());
    fs::write(&a, "theirs").unwrap();
    assert!(docs.check_external(&id).unwrap());
    assert!(docs.save(&id, &a, Some(b"a"), "mine", 1, &NoFault).is_err());
    assert_eq!(docs.get(&id).unwrap().snapshot.text, "mine");
    fs::remove_file(&a).unwrap();
    assert!(docs.check_external(&id).unwrap());
    assert!(docs.save(&id, &a, Some(b"a"), "mine", 1, &NoFault).is_err());
    let rescue = dir.path().join("rescue.md");
    docs.save(&id, &rescue, None, "mine", 1, &NoFault).unwrap();
    assert!(!docs.check_external(&id).unwrap());
}

#[test]
fn stale_revision_and_unknown_document_cannot_save_or_reload() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.md");
    fs::write(&path, "a").unwrap();
    let mut docs = Documents::default();
    let (id, _) = docs.open(&path).unwrap();
    docs.edit(&id, "newest".into(), 2).unwrap();
    assert!(docs
        .save(&id, &path, Some(b"a"), "old", 1, &NoFault)
        .is_err());
    assert!(docs.reload(&id, 1).is_err());
    assert!(docs.edit("doc-other", "x".into(), 3).is_err());
    assert_eq!(fs::read_to_string(path).unwrap(), "a");
}

#[test]
fn image_containment_and_content_type() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("文書 (画像)");
    fs::create_dir(&root).unwrap();
    let document = root.join("テスト.md");
    fs::write(&document, "").unwrap();
    fs::write(root.join("図.png"), b"\x89PNG\r\n\x1a\n").unwrap();
    assert!(images::local_image(&document, "%E5%9B%B3.png")
        .unwrap()
        .starts_with("data:image/png;base64,"));
    fs::write(dir.path().join("secret.png"), b"\x89PNG\r\n\x1a\n").unwrap();
    for reference in [
        "../secret.png",
        "%2e%2e/secret.png",
        "file:///C:/secret.png",
        "C:\\secret.png",
        "//server/share/a.png",
        "missing.png",
    ] {
        assert!(
            images::local_image(&document, reference).is_err(),
            "{reference}"
        );
    }
    fs::write(root.join("x.svg"), b"<svg onload='alert(1)'/>").unwrap();
    assert!(images::local_image(&document, "x.svg").is_err());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(dir.path().join("secret.png"), root.join("link.png")).unwrap();
        assert!(images::local_image(&document, "link.png").is_err());
    }
}

#[test]
fn dangerous_external_urls_are_rejected() {
    for raw in [
        "javascript:alert(1)",
        "file:///C:/x",
        "data:text/html,a",
        "ms-settings:display",
        "https://user:pass@example.com",
    ] {
        assert!(images::external_url(raw).is_err());
    }
    assert!(images::external_url("https://example.com/日本語").is_ok());
}

#[test]
fn newly_created_target_is_not_clobbered() {
    struct ConcurrentCreate<'a>(&'a Path);
    impl SaveHooks for ConcurrentCreate<'_> {
        fn stage(&self, stage: &str) -> Result<()> {
            if stage == "commit" {
                fs::write(self.0, "other process").unwrap();
            }
            Ok(())
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("new.md");
    assert!(file_io::atomic_save(&path, b"mine", None, &ConcurrentCreate(&path)).is_err());
    assert_eq!(fs::read_to_string(path).unwrap(), "other process");
}

#[test]
fn change_while_writing_temp_file_is_not_overwritten() {
    struct ConcurrentEdit<'a>(&'a Path);
    impl SaveHooks for ConcurrentEdit<'_> {
        fn stage(&self, stage: &str) -> Result<()> {
            if stage == "commit" {
                fs::write(self.0, "external revision").unwrap();
            }
            Ok(())
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("race.md");
    fs::write(&path, "original").unwrap();
    assert!(
        file_io::atomic_save(&path, b"mine", Some(b"original"), &ConcurrentEdit(&path)).is_err()
    );
    assert_eq!(fs::read_to_string(path).unwrap(), "external revision");
}

#[test]
#[cfg(windows)]
fn windows_locked_file_preserves_dirty_buffer_and_can_be_retried() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("locked.md");
    fs::write(&path, "original").unwrap();
    let mut docs = Documents::default();
    let (id, _) = docs.open(&path).unwrap();
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .share_mode(0)
        .open(&path)
        .unwrap();
    assert!(docs
        .save(&id, &path, Some(b"original"), "mine", 1, &NoFault)
        .is_err());
    assert_eq!(docs.get(&id).unwrap().snapshot.text, "mine");
    assert_eq!(docs.get(&id).unwrap().snapshot.saved_text, "original");
    drop(lock);
    assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    docs.save(&id, &path, Some(b"original"), "mine", 1, &NoFault)
        .unwrap();
    assert_eq!(fs::read_to_string(path).unwrap(), "mine");
}

fn test_png() -> Vec<u8> {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder
            .write_header()
            .unwrap()
            .write_image_data(&[255, 0, 0, 255])
            .unwrap();
    }
    bytes
}

#[test]
fn clipboard_image_is_png_beside_owned_document_and_never_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("日本語 (文書).md");
    fs::write(&path, "original").unwrap();
    let mut docs = Documents::default();
    let (id, _) = docs.open(&path).unwrap();
    let bytes = test_png();
    let filename = docs
        .paste_png(&id, &bytes, "20261026_231824", &NoFault)
        .unwrap();
    assert_eq!(filename, "20261026_231824.png");
    assert_eq!(fs::read(dir.path().join(&filename)).unwrap(), bytes);
    assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    assert!(docs
        .paste_png(&id, &test_png(), "20261026_231824", &NoFault)
        .is_err());
    assert_eq!(fs::read(dir.path().join(filename)).unwrap(), bytes);
    assert!(docs
        .paste_png(&id, &bytes, "../../escape", &NoFault)
        .is_err());
    assert!(docs
        .paste_png("doc-unknown", &bytes, "20261026_231825", &NoFault)
        .is_err());
}

#[test]
fn clipboard_image_validation_and_io_failure_leave_no_linkable_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.md");
    fs::write(&path, "a").unwrap();
    let mut docs = Documents::default();
    let (id, _) = docs.open(&path).unwrap();
    for invalid in [
        b"not PNG".to_vec(),
        b"\x89PNG\r\n\x1a\n".to_vec(),
        vec![0; crate::paste::MAX_PNG_BYTES + 1],
    ] {
        assert!(docs
            .paste_png(&id, &invalid, "20261026_231824", &NoFault)
            .is_err());
    }
    for stage in ["write", "sync", "commit"] {
        assert!(docs
            .paste_png(&id, &test_png(), "20261026_231824", &FailAt(stage))
            .is_err());
        assert!(!dir.path().join("20261026_231824.png").exists());
    }
    assert_eq!(fs::read_to_string(path).unwrap(), "a");
    let unsaved = docs.create();
    assert!(docs
        .paste_png(&unsaved, &test_png(), "20261026_231824", &NoFault)
        .is_err());
    docs.get_mut(&id).unwrap().snapshot.read_only = true;
    assert!(docs
        .paste_png(&id, &test_png(), "20261026_231824", &NoFault)
        .is_err());
}

#[test]
fn external_replacement_reload_updates_preview_source_and_preserves_failed_reload_buffer() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("external.md");
    fs::write(&path, "old").unwrap();
    let mut docs = Documents::default();
    let (id, _) = docs.open(&path).unwrap();
    // Atomic replacement, as used by many external editors/Codex.
    file_io::atomic_save(&path, b"# changed externally", Some(b"old"), &NoFault).unwrap();
    assert!(docs.check_external(&id).unwrap());
    let snapshot = docs.reload_external(&id, 0).unwrap();
    assert_eq!(snapshot.text, "# changed externally");
    assert_eq!(snapshot.saved_text, snapshot.text);
    assert!(!docs.check_external(&id).unwrap());
    fs::write(&path, [0x82, 0xa0]).unwrap();
    assert!(docs.reload(&id, snapshot.revision).is_err());
    assert_eq!(docs.get(&id).unwrap().snapshot.text, snapshot.text);
    fs::remove_file(path).unwrap();
    assert!(docs.reload(&id, snapshot.revision).is_err());
    assert_eq!(docs.get(&id).unwrap().snapshot.text, snapshot.text);
}

#[test]
fn external_auto_reload_refuses_unsaved_edits_even_with_current_revision() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("conflict.md");
    fs::write(&path, "original").unwrap();
    let mut docs = Documents::default();
    let (id, _) = docs.open(&path).unwrap();
    docs.edit(&id, "WinMD edits".into(), 1).unwrap();
    fs::write(&path, "Codex edits").unwrap();
    assert!(docs.check_external(&id).unwrap());
    assert!(docs.reload_external(&id, 1).is_err());
    assert_eq!(docs.get(&id).unwrap().snapshot.text, "WinMD edits");
    assert_eq!(docs.get(&id).unwrap().snapshot.saved_text, "original");
    docs.edit(&id, "original".into(), 2).unwrap();
    assert_eq!(docs.reload_external(&id, 2).unwrap().text, "Codex edits");
}
