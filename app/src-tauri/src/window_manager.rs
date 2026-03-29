use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Serialize, Clone)]
pub struct MonitorInfo {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct DisplayState {
    pub monitor_name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub fullscreen: bool,
    #[serde(default)]
    pub is_open: bool,
}

// ── Persistence ───────────────────────────────────────────────────────────────

fn state_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("display_state.json"))
}

fn load_state_file(app: &AppHandle) -> DisplayState {
    let Some(path) = state_path(app) else { return DisplayState::default() };
    let Ok(data)   = std::fs::read_to_string(path) else { return DisplayState::default() };
    serde_json::from_str(&data).unwrap_or_default()
}

fn write_state_file(app: &AppHandle, state: &DisplayState) {
    let Some(path) = state_path(app) else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(state) {
        let _ = std::fs::write(path, json);
    }
}

/// Called from window event listener to snapshot current windowed state.
/// When fullscreen, preserves the previous windowed size so restoring works.
pub fn snapshot_window_state(app: &AppHandle, win: &WebviewWindow) {
    let Ok(is_fs) = win.is_fullscreen() else { return };
    let existing = load_state_file(app);
    let monitor_name = win
        .current_monitor().ok().flatten()
        .and_then(|m| m.name().map(|n| n.to_string()));

    let state = if is_fs {
        // Keep windowed bounds from last non-fullscreen snapshot
        DisplayState { fullscreen: true, monitor_name, ..existing }
    } else {
        let (x, y) = win.outer_position()
            .map(|p| (p.x, p.y))
            .unwrap_or((existing.x, existing.y));
        let (w, h) = win.outer_size()
            .map(|s| (s.width, s.height))
            .unwrap_or((existing.width, existing.height));
        DisplayState { x, y, width: w, height: h, fullscreen: false, monitor_name, is_open: existing.is_open }
    };
    write_state_file(app, &state);
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    let Some(win) = app.get_webview_window("control") else { return vec![] };
    let monitors  = win.available_monitors().unwrap_or_default();
    let primary_name = win.primary_monitor().ok().flatten()
        .and_then(|m| m.name().map(|n| n.to_string()));

    monitors.into_iter().map(|m| {
        let pos  = m.position();
        let size = m.size();
        let name = m.name().map(|s| s.as_str()).unwrap_or("Unknown").to_string();
        let is_primary = primary_name.as_deref() == Some(name.as_str());
        MonitorInfo { name, x: pos.x, y: pos.y, width: size.width, height: size.height, is_primary }
    }).collect()
}

#[tauri::command]
pub fn load_display_state(app: AppHandle) -> DisplayState {
    load_state_file(&app)
}

#[tauri::command]
pub fn open_display_window(
    app: AppHandle,
    monitor_name: Option<String>,
    fullscreen: bool,
) -> Result<(), String> {
    let win = app.get_webview_window("display")
        .ok_or_else(|| "Display window not found".to_string())?;

    let saved   = load_state_file(&app);
    let monitors = win.available_monitors().map_err(|e| e.to_string())?;

    // Pick target monitor: explicit arg > last saved > primary > first
    let target_name: Option<&str> = monitor_name.as_deref()
        .or(saved.monitor_name.as_deref());

    let monitor = target_name
        .and_then(|name| monitors.iter().find(|m| m.name().map(|s| s.as_str()) == Some(name)))
        .or_else(|| monitors.iter().find(|m| {
            let primary_name = win.primary_monitor().ok().flatten()
                .and_then(|pm| pm.name().map(|n| n.to_string()));
            primary_name.as_deref() == m.name().map(|s| s.as_str())
        }))
        .or_else(|| monitors.first());

    if let Some(mon) = monitor {
        let mon_pos  = mon.position();
        let mon_size = mon.size();

        if fullscreen {
            // Place window inside target monitor so OS fullscreens on the right screen
            win.set_position(PhysicalPosition::new(
                mon_pos.x + (mon_size.width as i32 / 2),
                mon_pos.y + (mon_size.height as i32 / 2),
            )).map_err(|e| e.to_string())?;
            win.set_fullscreen(true).map_err(|e| e.to_string())?;
        } else {
            let w = if saved.width  > 100 { saved.width  } else { 1280 };
            let h = if saved.height > 100 { saved.height } else { 720  };
            // Keep saved position only if it actually falls on this monitor
            let on_this = saved.x >= mon_pos.x
                && saved.x < mon_pos.x + mon_size.width  as i32
                && saved.y >= mon_pos.y
                && saved.y < mon_pos.y + mon_size.height as i32;
            let (x, y) = if on_this { (saved.x, saved.y) } else { (mon_pos.x + 80, mon_pos.y + 80) };
            win.set_fullscreen(false).map_err(|e| e.to_string())?;
            win.set_size(PhysicalSize::new(w, h)).map_err(|e| e.to_string())?;
            win.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        }
    }

    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;

    // Snapshot after opening and mark as open
    snapshot_window_state(&app, &win);
    let mut state = load_state_file(&app);
    state.is_open = true;
    write_state_file(&app, &state);
    Ok(())
}

#[tauri::command]
pub fn close_display_window(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("display")
        .ok_or_else(|| "Display window not found".to_string())?;
    snapshot_window_state(&app, &win);
    let mut state = load_state_file(&app);
    state.is_open = false;
    write_state_file(&app, &state);
    win.hide().map_err(|e| e.to_string())?;
    Ok(())
}

/// Called when the user manually closes the display window (native X button).
/// Hides the window instead of destroying it, saves is_open = false, and
/// emits an event so the control panel can update its button.
pub fn handle_display_close_requested(app: &AppHandle, win: &WebviewWindow) {
    snapshot_window_state(app, win);
    let mut state = load_state_file(app);
    state.is_open = false;
    write_state_file(app, &state);
    let _ = win.hide();
    use tauri::Emitter;
    let _ = app.emit("display-window-closed", ());
}

#[tauri::command]
pub fn toggle_display_fullscreen(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("display")
        .ok_or_else(|| "Display window not found".to_string())?;
    let is_fs = win.is_fullscreen().map_err(|e| e.to_string())?;
    win.set_fullscreen(!is_fs).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn exit_display_fullscreen(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("display")
        .ok_or_else(|| "Display window not found".to_string())?;
    win.set_fullscreen(false).map_err(|e| e.to_string())?;
    Ok(())
}
