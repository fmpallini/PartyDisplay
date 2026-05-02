use std::{fs, path::Path};

fn main() {
    tauri_build::build();

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let presets_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("presets")
        .canonicalize()
        .expect("presets/ dir not found");

    let mut entries: Vec<(String, String)> = fs::read_dir(&presets_dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(|s| s.eq_ignore_ascii_case("json"))
                        .unwrap_or(false)
                })
                .filter_map(|e| {
                    let path = e.path().canonicalize().ok()?;
                    let name = path.file_stem()?.to_str()?.to_string();
                    let abs = path.to_str()?.replace('\\', "/");
                    Some((name, abs))
                })
                .collect()
        })
        .unwrap_or_default();

    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let mut code = String::from("pub static EMBEDDED_PRESETS: &[(&str, &str)] = &[\n");
    for (name, abs_path) in &entries {
        code.push_str(&format!("    ({name:?}, include_str!({abs_path:?})),\n"));
    }
    code.push_str("];\n");

    fs::write(Path::new(&out_dir).join("embedded_presets.rs"), code).unwrap();

    println!("cargo:rerun-if-changed={}", presets_dir.display());
}
