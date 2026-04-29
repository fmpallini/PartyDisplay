use std::path::PathBuf;

pub static PHOTO_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

pub fn collect_photos(folder: &std::path::Path, recursive: bool) -> Vec<PathBuf> {
    let mut photos = Vec::new();
    collect_photos_inner(folder, recursive, &mut photos);
    photos.sort();
    photos
}

fn collect_photos_inner(folder: &std::path::Path, recursive: bool, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(folder) else { return };
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        let path = entry.path();
        if ft.is_dir() && recursive {
            collect_photos_inner(&path, recursive, out);
        } else if ft.is_file()
            && path.extension()
                .and_then(|e| e.to_str())
                .map(|e| PHOTO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false)
        {
            out.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collect_photos_filters_extensions() {
        let dir = std::env::temp_dir().join("party_display_test_flat");
        fs::create_dir_all(&dir).unwrap();
        let keep = ["a.jpg", "b.jpeg", "c.png", "d.webp"];
        let skip = ["e.txt", "f.mp4", "g.pdf"];
        for name in keep.iter().chain(skip.iter()) {
            fs::write(dir.join(name), b"").unwrap();
        }
        let result = collect_photos(&dir, false);
        let names: Vec<&str> = result.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        for k in &keep { assert!(names.contains(k), "expected {k}"); }
        for s in &skip { assert!(!names.contains(s), "did not expect {s}"); }
        for name in keep.iter().chain(skip.iter()) {
            let _ = fs::remove_file(dir.join(name));
        }
    }

    #[test]
    fn collect_photos_recursive_finds_nested() {
        let root = std::env::temp_dir().join("party_display_test_recursive");
        let sub  = root.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(root.join("top.jpg"), b"").unwrap();
        fs::write(sub.join("nested.png"), b"").unwrap();
        fs::write(sub.join("skip.txt"), b"").unwrap();
        let flat      = collect_photos(&root, false);
        let recursive = collect_photos(&root, true);
        let flat_names: Vec<&str> = flat.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        let rec_names: Vec<&str> = recursive.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        assert!(flat_names.contains(&"top.jpg"));
        assert!(!flat_names.contains(&"nested.png"));
        assert!(rec_names.contains(&"top.jpg"));
        assert!(rec_names.contains(&"nested.png"));
        assert!(!rec_names.contains(&"skip.txt"));
        let _ = fs::remove_file(root.join("top.jpg"));
        let _ = fs::remove_file(sub.join("nested.png"));
        let _ = fs::remove_file(sub.join("skip.txt"));
        let _ = fs::remove_dir(&sub);
        let _ = fs::remove_dir(&root);
    }

    #[test]
    fn collect_photos_case_insensitive_extensions() {
        let dir = std::env::temp_dir().join("party_display_test_case");
        fs::create_dir_all(&dir).unwrap();
        let files = ["upper.JPG", "mixed.Png", "lower.webp"];
        for name in &files { fs::write(dir.join(name), b"").unwrap(); }
        let result = collect_photos(&dir, false);
        let names: Vec<&str> = result.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        for f in &files { assert!(names.contains(f), "expected {f}"); }
        for name in &files { let _ = fs::remove_file(dir.join(name)); }
    }

    #[test]
    fn collect_photos_recursive_includes_subdirectory() {
        let dir    = std::env::temp_dir().join("party_display_test_recursive2");
        let subdir = dir.join("sub");
        fs::create_dir_all(&subdir).unwrap();
        fs::write(dir.join("top.jpg"), b"").unwrap();
        fs::write(subdir.join("deep.jpg"), b"").unwrap();
        let flat      = collect_photos(&dir, false);
        let recursive = collect_photos(&dir, true);
        let flat_names: Vec<&str> = flat.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        let rec_names: Vec<&str> = recursive.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        assert!(flat_names.contains(&"top.jpg"));
        assert!(!flat_names.contains(&"deep.jpg"));
        assert!(rec_names.contains(&"top.jpg"));
        assert!(rec_names.contains(&"deep.jpg"));
        let _ = fs::remove_file(dir.join("top.jpg"));
        let _ = fs::remove_file(subdir.join("deep.jpg"));
        let _ = fs::remove_dir(subdir);
    }

    #[test]
    fn collect_photos_empty_dir_returns_empty() {
        let dir = std::env::temp_dir().join("party_display_test_empty");
        fs::create_dir_all(&dir).unwrap();
        let result = collect_photos(&dir, false);
        assert!(result.is_empty());
    }
}
