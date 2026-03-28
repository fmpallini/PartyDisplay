#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod audio;

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
