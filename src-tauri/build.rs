fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "document_snapshot",
            "new_document",
            "open_documents",
            "save_document",
            "reload_document",
            "check_external",
            "request_close",
            "close_document",
            "read_local_image",
            "open_external_link",
            "set_document_title",
            "save_pasted_image",
            "print_document",
            "export_pdf",
            "request_exit",
        ]),
    ))
    .expect("Tauri 2 build configuration failed");
}
