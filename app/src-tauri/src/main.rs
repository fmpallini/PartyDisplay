#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
