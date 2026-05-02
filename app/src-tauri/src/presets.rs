pub use party_display_core::presets::{collect_presets_from_dir, PresetFile};

include!(concat!(env!("OUT_DIR"), "/embedded_presets.rs"));

fn embedded_presets() -> Vec<PresetFile> {
    EMBEDDED_PRESETS
        .iter()
        .map(|(name, content)| PresetFile {
            name:    name.to_string(),
            content: content.to_string(),
        })
        .collect()
}

#[tauri::command]
pub fn get_presets() -> Vec<PresetFile> {
    if let Ok(exe) = std::env::current_exe() {
        let dir = exe
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("presets");
        if dir.exists() {
            return collect_presets_from_dir(&dir);
        }
    }
    embedded_presets()
}
