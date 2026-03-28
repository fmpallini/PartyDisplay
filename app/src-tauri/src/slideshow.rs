use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::Emitter;

#[derive(Default)]
pub struct SlideshowState {
    pub folder:  Mutex<Option<PathBuf>>,
    pub photos:  Mutex<Vec<PathBuf>>,
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

static PHOTO_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

pub fn collect_photos(folder: &PathBuf) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(folder) else { return vec![] };
    let mut photos: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| PHOTO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
                    .unwrap_or(false)
        })
        .collect();
    photos.sort();
    photos
}

#[derive(Serialize, Clone)]
pub struct PhotoListPayload {
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn watch_folder(
    path: String,
    state: tauri::State<Arc<SlideshowState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let photos = collect_photos(&folder);
    {
        let mut f = state.folder.lock().unwrap();
        *f = Some(folder.clone());
        let mut p = state.photos.lock().unwrap();
        *p = photos.clone();
    }

    // Emit initial list
    let payload = PhotoListPayload {
        paths: photos.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
    };
    app.emit("photo-list", payload.clone()).map_err(|e| e.to_string())?;

    // Spawn filesystem watcher
    let state_arc = Arc::clone(&*state);
    let app2 = app.clone();
    let folder2 = folder.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            use notify::EventKind::*;
            match event.kind {
                Create(_) | Remove(_) | Modify(notify::event::ModifyKind::Name(_)) => {
                    let new_photos = collect_photos(&folder2);
                    let mut p = state_arc.photos.lock().unwrap();
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

    watcher
        .watch(&folder, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *state.watcher.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn get_photos(state: tauri::State<Arc<SlideshowState>>) -> Vec<String> {
    state
        .photos
        .lock()
        .unwrap()
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
        let dir = std::env::temp_dir().join("party_display_test_photos");
        fs::create_dir_all(&dir).unwrap();

        let keep = ["a.jpg", "b.jpeg", "c.png", "d.webp"];
        let skip = ["e.txt", "f.mp4", "g.pdf"];

        for name in keep.iter().chain(skip.iter()) {
            fs::write(dir.join(name), b"").unwrap();
        }

        let result = collect_photos(&dir);
        let names: Vec<&str> = result
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();

        for k in &keep {
            assert!(names.contains(k), "expected {k} in result");
        }
        for s in &skip {
            assert!(!names.contains(s), "did not expect {s} in result");
        }

        // cleanup
        for name in keep.iter().chain(skip.iter()) {
            let _ = fs::remove_file(dir.join(name));
        }
    }
}
