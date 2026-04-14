use std::path::PathBuf;

/// Returns the path to the presets folder.
///
/// Release: looks for `presets/` next to the executable.
/// Dev:     falls back to `<CARGO_MANIFEST_DIR>/../../presets` (repo root).
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
    // Compile-time fallback for dev builds: repo root / presets
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("presets")
}

#[derive(serde::Serialize)]
pub struct PresetFile {
    pub name:    String,
    pub content: String,
}

/// Reads all `.json` files from the presets folder next to the exe.
/// Returns each file's name (without extension) and raw content string.
#[tauri::command]
pub fn get_presets() -> Vec<PresetFile> {
    let dir = presets_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        eprintln!("presets dir not found: {}", dir.display());
        return vec![];
    };
    let mut presets: Vec<PresetFile> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let path = e.path();
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let content = std::fs::read_to_string(&path).ok()?;
            Some(PresetFile { name, content })
        })
        .collect();
    presets.sort_by(|a, b| a.name.cmp(&b.name));
    presets
}
