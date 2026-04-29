use party_display_core::local_audio::scan_audio_folder as scan_impl;

#[tauri::command]
pub fn scan_audio_folder(path: String, recursive: bool) -> Result<Vec<String>, String> {
    scan_impl(path, recursive)
}
