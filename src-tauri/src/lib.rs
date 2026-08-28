mod http;

use http::{cancel_http_request, execute_http_request, HttpEngine};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_engine = HttpEngine::new().expect("failed to initialize HTTP engine");

    tauri::Builder::default()
        .manage(http_engine)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            execute_http_request,
            cancel_http_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
