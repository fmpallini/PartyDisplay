use std::fs;
use std::path::Path;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "ogg", "flac", "m4a", "aac", "opus",
];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn collect_audio_files(dir: &Path, recursive: bool, out: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(err) => {
            eprintln!("[local_audio] cannot read {:?}: {err}", dir);
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_audio_files(&path, recursive, out);
        } else if path.is_file() && is_audio_file(&path) {
            if let Some(s) = path.to_str() {
                out.push(s.to_owned());
            }
        }
    }
}

/// Scan a directory for audio files and return their absolute paths, sorted alphabetically.
/// Supported extensions: mp3, wav, ogg, flac, m4a, aac, opus (case-insensitive).
#[tauri::command]
pub fn scan_audio_folder(path: String, recursive: bool) -> Result<Vec<String>, String> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }
    let mut files = Vec::new();
    collect_audio_files(dir, recursive, &mut files);
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;

    #[test]
    fn test_scan_returns_sorted_audio_files() {
        let dir = std::env::temp_dir().join("pd_test_audio");
        fs::create_dir_all(&dir).unwrap();
        for name in &["charlie.mp3", "alpha.flac", "bravo.wav"] {
            File::create(dir.join(name)).unwrap().write_all(b"").unwrap();
        }
        File::create(dir.join("ignore.txt")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), false).unwrap();

        assert_eq!(result.len(), 3);
        assert!(result[0].ends_with("alpha.flac"));
        assert!(result[1].ends_with("bravo.wav"));
        assert!(result[2].ends_with("charlie.mp3"));

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_scan_recursive() {
        let dir = std::env::temp_dir().join("pd_test_audio_rec");
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        File::create(dir.join("root.mp3")).unwrap().write_all(b"").unwrap();
        File::create(sub.join("nested.mp3")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), true).unwrap();
        assert_eq!(result.len(), 2);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_scan_nonrecursive_excludes_subdirs() {
        let dir = std::env::temp_dir().join("pd_test_audio_norec");
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        File::create(dir.join("root.mp3")).unwrap().write_all(b"").unwrap();
        File::create(sub.join("nested.mp3")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), false).unwrap();
        assert_eq!(result.len(), 1);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_scan_missing_path_returns_err() {
        let result = scan_audio_folder("/nonexistent/path/xyz".to_owned(), false);
        assert!(result.is_err());
    }

    #[test]
    fn test_scan_case_insensitive_extensions() {
        let dir = std::env::temp_dir().join("pd_test_audio_case");
        fs::create_dir_all(&dir).unwrap();
        File::create(dir.join("track.MP3")).unwrap().write_all(b"").unwrap();
        File::create(dir.join("track.Flac")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), false).unwrap();
        assert_eq!(result.len(), 2);

        fs::remove_dir_all(&dir).unwrap();
    }
}
