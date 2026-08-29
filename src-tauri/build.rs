fn main() {
    const COMMANDS: &[&str] = &[
        "execute_http_request",
        "cancel_http_request",
        "load_workspace_tree",
        "create_collection",
        "rename_collection",
        "delete_collection",
        "create_folder",
        "rename_folder",
        "delete_folder",
        "move_folder",
        "save_request",
        "get_saved_request",
        "rename_request",
        "duplicate_request",
        "move_request",
        "delete_request",
        "list_history",
        "get_history_entry",
        "delete_history_entry",
        "clear_history",
        "load_environment_state",
        "create_environment",
        "rename_environment",
        "delete_environment",
        "set_active_environment",
        "save_environment_variable",
        "delete_environment_variable",
        "reveal_environment_variable",
        "secret_store_status",
        "unlock_secret_store",
        "lock_secret_store",
        "run_collection",
        "list_test_runs",
        "get_test_run",
        "create_workspace_backup",
        "stage_workspace_restore",
    ];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to build Tauri application metadata");
}
