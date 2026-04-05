use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::Emitter;

#[derive(Default)]
pub struct SlideshowState {
    pub folder:    Mutex<Option<PathBuf>>,
    pub photos:    Mutex<Vec<PathBuf>>,
    pub watcher:   Mutex<Option<RecommendedWatcher>>,
    pub recursive: Mutex<bool>,
}

static PHOTO_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

pub fn collect_photos(folder: &std::path::Path, recursive: bool) -> Vec<PathBuf> {
    let mut photos = Vec::new();
    collect_photos_inner(folder, recursive, &mut photos);
    photos.sort();
    photos
}

fn collect_photos_inner(folder: &std::path::Path, recursive: bool, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(folder) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_photos_inner(&path, recursive, out);
        } else if path.is_file()
            && path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| PHOTO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false)
        {
            out.push(path);
        }
    }
}

#[derive(Serialize, Clone)]
pub struct PhotoListPayload {
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn watch_folder(
    path: String,
    recursive: bool,
    state: tauri::State<Arc<SlideshowState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let photos = collect_photos(&folder, recursive);
    { *state.folder.lock().unwrap_or_else(|e| e.into_inner())    = Some(folder.clone()); }
    { *state.photos.lock().unwrap_or_else(|e| e.into_inner())    = photos.clone(); }
    { *state.recursive.lock().unwrap_or_else(|e| e.into_inner()) = recursive; }

    let payload = PhotoListPayload {
        paths: photos.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
    };
    app.emit("photo-list", payload).map_err(|e| e.to_string())?;

    let state_arc = Arc::clone(&*state);
    let app2 = app.clone();
    let folder2 = folder.clone();
    // Debounce: track last-emit timestamp (ms since epoch) to avoid flooding
    // on bulk file operations. Only one emit per 300 ms window.
    let last_emit_ms = Arc::new(AtomicU64::new(0));

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            use notify::EventKind::*;
            match event.kind {
                Create(_) | Remove(_) | Modify(notify::event::ModifyKind::Name(_)) => {
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    let last = last_emit_ms.load(Ordering::Relaxed);
                    if now_ms.saturating_sub(last) < 300 {
                        return;
                    }
                    last_emit_ms.store(now_ms, Ordering::Relaxed);
                    let is_recursive = *state_arc.recursive.lock().unwrap_or_else(|e| e.into_inner());
                    let new_photos = collect_photos(&folder2, is_recursive);
                    let mut p = state_arc.photos.lock().unwrap_or_else(|e| e.into_inner());
                    *p = new_photos.clone();
                    let payload = PhotoListPayload {
                        paths: new_photos.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
                    };
                    let _ = app2.emit("photo-list", payload);
                }
                _ => {}
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let watch_mode = if recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };
    watcher.watch(&folder, watch_mode).map_err(|e| e.to_string())?;

    *state.watcher.lock().unwrap_or_else(|e| e.into_inner()) = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn get_photos(state: tauri::State<Arc<SlideshowState>>) -> Vec<String> {
    state
        .photos
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
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
        let names: Vec<&str> = result
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();

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
        assert!(!flat_names.contains(&"nested.png"), "flat should not find nested");

        assert!(rec_names.contains(&"top.jpg"));
        assert!(rec_names.contains(&"nested.png"), "recursive should find nested");
        assert!(!rec_names.contains(&"skip.txt"));

        let _ = fs::remove_file(root.join("top.jpg"));
        let _ = fs::remove_file(sub.join("nested.png"));
        let _ = fs::remove_file(sub.join("skip.txt"));
        let _ = fs::remove_dir(&sub);
        let _ = fs::remove_dir(&root);
    }
}
