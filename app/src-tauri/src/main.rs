#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod audio;

use std::sync::Mutex;

pub struct AppState {
    pub device_id: Mutex<Option<String>>,
}

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
fn set_device_id(state: tauri::State<AppState>, device_id: String) -> Result<(), String> {
    *state.device_id.lock().unwrap() = Some(device_id);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { device_id: Mutex::new(None) })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            set_device_id,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
            audio::start_audio_capture,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register("party-display")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
