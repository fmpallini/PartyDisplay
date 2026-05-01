pub use party_display_core::presets::{collect_presets_from_dir, PresetFile};
use std::path::PathBuf;

fn presets_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        let candidate = exe
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("presets");
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("presets")
}

#[tauri::command]
pub fn get_presets() -> Vec<PresetFile> {
    let dir = presets_dir();
    if !dir.exists() {
        eprintln!("presets dir not found: {}", dir.display());
        return vec![];
    }
    collect_presets_from_dir(&dir)
}
