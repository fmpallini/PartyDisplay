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

pub fn collect_presets_from_dir(dir: &std::path::Path) -> Vec<PresetFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
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

/// Reads all `.json` files from the presets folder next to the exe.
/// Returns each file's name (without extension) and raw content string.
#[tauri::command]
pub fn get_presets() -> Vec<PresetFile> {
    let dir = presets_dir();
    if !dir.exists() {
        eprintln!("presets dir not found: {}", dir.display());
        return vec![];
    }
    collect_presets_from_dir(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collect_only_json_files() {
        let dir = std::env::temp_dir().join("party_display_presets_test");
        fs::create_dir_all(&dir).unwrap();

        fs::write(dir.join("alpha.json"), r#"{"name":"alpha"}"#).unwrap();
        fs::write(dir.join("beta.json"),  r#"{"name":"beta"}"#).unwrap();
        fs::write(dir.join("ignore.txt"), "not a preset").unwrap();
        fs::write(dir.join("ignore.milk"), "not a preset").unwrap();

        let result = collect_presets_from_dir(&dir);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "alpha");
        assert_eq!(result[1].name, "beta");

        for f in ["alpha.json", "beta.json", "ignore.txt", "ignore.milk"] {
            let _ = fs::remove_file(dir.join(f));
        }
    }

    #[test]
    fn collect_returns_sorted_by_name() {
        let dir = std::env::temp_dir().join("party_display_presets_sort_test");
        fs::create_dir_all(&dir).unwrap();

        for name in ["zebra", "apple", "mango"] {
            fs::write(dir.join(format!("{name}.json")), "{}").unwrap();
        }

        let result = collect_presets_from_dir(&dir);
        let names: Vec<&str> = result.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["apple", "mango", "zebra"]);

        for name in ["zebra", "apple", "mango"] {
            let _ = fs::remove_file(dir.join(format!("{name}.json")));
        }
    }

    #[test]
    fn collect_returns_empty_for_nonexistent_dir() {
        let result = collect_presets_from_dir(std::path::Path::new("/nonexistent/path/xyz"));
        assert!(result.is_empty());
    }

    #[test]
    fn collect_reads_file_content() {
        let dir = std::env::temp_dir().join("party_display_presets_content_test");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("test.json"), r#"{"key":"value"}"#).unwrap();

        let result = collect_presets_from_dir(&dir);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].content, r#"{"key":"value"}"#);

        let _ = fs::remove_file(dir.join("test.json"));
    }
}
