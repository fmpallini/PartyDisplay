#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod audio;

use std::sync::Mutex;
use tauri::Manager;

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
        // single-instance MUST be registered before deep-link so it can intercept
        // the second process launch (which carries the party-display://callback URL)
        // and forward it to the running instance instead of opening a new window.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // The OS launches a second process with the party-display://callback URL
            // as a command-line arg. single-instance blocks that process and delivers
            // the args here. We must re-emit the deep-link event ourselves because
            // tauri-plugin-deep-link only processes args at its own startup — it never
            // sees the second process's args unless we forward them.
            use tauri::Emitter;
            let urls: Vec<String> = args.iter()
                .filter(|a| a.starts_with("party-display://"))
                .cloned()
                .collect();
            if !urls.is_empty() {
                let _ = app.emit("deep-link://new-url", urls);
            }
            if let Some(w) = app.get_webview_window("control") {
                let _ = w.set_focus();
            }
        }))
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
