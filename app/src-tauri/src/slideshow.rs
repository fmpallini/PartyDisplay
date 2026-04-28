use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::Emitter;
use party_display_core::slideshow::collect_photos;

#[derive(Default)]
pub struct SlideshowState {
    pub folder:    Mutex<Option<PathBuf>>,
    pub photos:    Mutex<Vec<PathBuf>>,
    pub watcher:   Mutex<Option<RecommendedWatcher>>,
    pub recursive: Mutex<bool>,
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
