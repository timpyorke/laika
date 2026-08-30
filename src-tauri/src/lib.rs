mod backup;
mod chaining;
mod error;
mod http;
#[cfg(feature = "performance")]
pub mod performance;
mod secrets;
mod store;
mod testing;
mod variables;

use backup::BackupService;
use http::HttpEngine;
use secrets::SecretStore;
use store::{commands, Store, StoreHandle};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_engine = HttpEngine::new().expect("failed to initialize HTTP engine");

    tauri::Builder::default()
        .manage(http_engine)
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = app.path().app_data_dir().ok();
            app.manage(
                directory
                    .as_deref()
                    .map(open_store)
                    .unwrap_or_else(StoreHandle::unavailable),
            );
            app.manage(
                directory
                    .as_deref()
                    .map(SecretStore::new)
                    .unwrap_or_else(SecretStore::unavailable),
            );
            app.manage(
                directory
                    .map(BackupService::new)
                    .unwrap_or_else(BackupService::unavailable),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::execute_http_request,
            commands::cancel_http_request,
            commands::load_workspace_tree,
            commands::create_collection,
            commands::rename_collection,
            commands::delete_collection,
            commands::create_folder,
            commands::rename_folder,
            commands::delete_folder,
            commands::move_folder,
            commands::save_request,
            commands::get_saved_request,
            commands::rename_request,
            commands::duplicate_request,
            commands::move_request,
            commands::delete_request,
            commands::list_history,
            commands::get_history_entry,
            commands::delete_history_entry,
            commands::clear_history,
            commands::load_environment_state,
            commands::create_environment,
            commands::rename_environment,
            commands::delete_environment,
            commands::set_active_environment,
            commands::save_environment_variable,
            commands::delete_environment_variable,
            commands::reveal_environment_variable,
            commands::secret_store_status,
            commands::unlock_secret_store,
            commands::lock_secret_store,
            commands::run_collection,
            commands::preflight_collection_run,
            commands::list_test_runs,
            commands::get_test_run,
            commands::get_diagnostics_settings,
            commands::set_diagnostics_enabled,
            commands::clear_diagnostics,
            commands::export_diagnostics,
            backup::create_workspace_backup,
            backup::stage_workspace_restore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Opening the workspace must not be able to stop the app from starting. If the
/// database cannot be created or migrated, the window still opens and every
/// workspace command reports a recoverable error instead.
fn open_store(directory: &std::path::Path) -> StoreHandle {
    if std::fs::create_dir_all(directory).is_err() {
        return StoreHandle::unavailable();
    }
    let restored = backup::apply_pending_restore(directory).unwrap_or(false);
    match tauri::async_runtime::block_on(Store::open(&directory.join("laika.db"))) {
        Ok(store) => StoreHandle::ready(store),
        Err(_) if restored => {
            if backup::rollback_last_restore(directory).is_ok() {
                match tauri::async_runtime::block_on(Store::open(&directory.join("laika.db"))) {
                    Ok(store) => StoreHandle::ready(store),
                    Err(_) => StoreHandle::unavailable(),
                }
            } else {
                StoreHandle::unavailable()
            }
        }
        Err(_) => StoreHandle::unavailable(),
    }
}
