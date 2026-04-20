#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod media_keys;
mod remote_server;
mod audio;
mod dlna;
mod dlna_proxy;
mod local_audio;
mod slideshow;
mod system;
mod presets;
mod window_manager;

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{Manager, Listener};

/// Monotonic counter: each call to `start_oauth_callback_server` bumps this.
/// The spawned thread compares its snapshot — if it no longer matches, the
/// thread exits, freeing port 7357 for the new server.
static OAUTH_SERVER_GEN: AtomicUsize = AtomicUsize::new(0);

/// Escape the five HTML special characters so user-controlled strings are safe
/// to interpolate into HTML responses.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&#39;")
}

/// Starts a one-shot HTTP server on 127.0.0.1:7357 that receives the OAuth
/// callback from the browser, emits the code as a Tauri event, and responds
/// with a self-closing HTML page.
///
/// Hardening:
/// - Bumps OAUTH_SERVER_GEN so any previous hung server thread exits promptly.
/// - Uses non-blocking accept with a 5-minute timeout instead of blocking forever.
/// - Retries bind up to 10× (100 ms apart) to handle the brief window while the
///   previous thread is still releasing the port.
/// - HTML-escapes the error parameter before embedding it in the response page.
#[tauri::command]
fn start_oauth_callback_server(app: tauri::AppHandle) -> Result<(), String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::{Duration, Instant};
    use tauri::Emitter;

    // Signal any running server thread to exit, then capture our generation id.
    let my_gen = OAUTH_SERVER_GEN.fetch_add(1, Ordering::SeqCst) + 1;

    std::thread::spawn(move || {
        // The previous server thread may still hold the port for up to ~100 ms
        // while it notices the generation change. Retry binding accordingly.
        const BIND_RETRIES: u32 = 10;
        let mut listener_opt: Option<TcpListener> = None;
        for i in 0..BIND_RETRIES {
            if i > 0 { std::thread::sleep(Duration::from_millis(100)); }
            if OAUTH_SERVER_GEN.load(Ordering::SeqCst) != my_gen { return; }
            match TcpListener::bind("127.0.0.1:7357") {
                Ok(l)  => { listener_opt = Some(l); break; }
                Err(e) => {
                    if i == BIND_RETRIES - 1 {
                        eprintln!("OAuth server bind error: {e}");
                        return;
                    }
                }
            }
        }
        let listener = match listener_opt {
            Some(l) => l,
            None    => return,
        };
        listener.set_nonblocking(true).ok();

        // Poll accept until a connection arrives, our generation is superseded,
        // or the 5-minute timeout elapses (user abandoned the login flow).
        let deadline = Instant::now() + Duration::from_secs(300);
        let mut stream = loop {
            if OAUTH_SERVER_GEN.load(Ordering::SeqCst) != my_gen { return; }
            if Instant::now() > deadline { return; }
            match listener.accept() {
                Ok((s, _)) => break s,
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => { eprintln!("OAuth accept error: {e}"); return; }
            }
        };

        // Switch back to blocking for the actual read/write with a short timeout.
        stream.set_nonblocking(false).ok();
        stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
        stream.set_write_timeout(Some(Duration::from_secs(5))).ok();

        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).unwrap_or(0);
        let request = String::from_utf8_lossy(&buf[..n]);

        let mut code: Option<String> = None;
        let mut err_param: Option<String> = None;
        let mut state: Option<String> = None;

        if let Some(first_line) = request.lines().next() {
            if let Some(query) = first_line.split('?').nth(1).and_then(|s| s.split(' ').next()) {
                for pair in query.split('&') {
                    let mut kv = pair.splitn(2, '=');
                    match (kv.next(), kv.next()) {
                        (Some("code"),  Some(v)) => code      = Some(v.to_string()),
                        (Some("error"), Some(v)) => err_param = Some(v.to_string()),
                        (Some("state"), Some(v)) => state     = Some(v.to_string()),
                        _ => {}
                    }
                }
            }
        }

        let body = if code.is_some() {
            r#"<!doctype html><html><head><title>Party Display</title></head>
<body style="font-family:monospace;background:#111;color:#1db954;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;flex-direction:column">
<h2 style="margin:0 0 8px">&#x2705; Connected to Spotify!</h2>
<p style="color:#aaa;margin:0">You can close this tab.</p>
<script>try{window.close()}catch(e){}</script>
</body></html>"#.to_string()
        } else {
            // html_escape prevents XSS if the error value contains HTML characters.
            let safe_err = html_escape(err_param.as_deref().unwrap_or("unknown"));
            format!(r#"<!doctype html><html><head><title>Party Display</title></head>
<body style="font-family:monospace;background:#111;color:#e74c3c;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;flex-direction:column">
<h2>&#x274C; Auth error: {safe_err}</h2><p style="color:#aaa">You can close this tab.</p>
</body></html>"#)
        };

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(), body
        );
        if let Err(e) = stream.write_all(response.as_bytes()) {
            eprintln!("OAuth response write error: {e}");
        }

        #[derive(serde::Serialize, Clone)]
        struct OAuthPayload { code: String, state: String }

        if let Some(c) = code {
            let _ = app.emit("oauth-code", OAuthPayload {
                code:  c,
                state: state.unwrap_or_default(),
            });
        }
    });
    Ok(())
}

#[tauri::command]
fn exit_app() {
    std::process::exit(0);
}

/// Delete the WebView2 user-data folder so that localStorage and other
/// browser-side storage is wiped on the next launch.
/// Used by both the --reset CLI flag and the UI reset button.
#[tauri::command]
fn clear_webview_data() {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let _ = std::fs::remove_dir_all(
            std::path::Path::new(&local).join("com.partydisplay.app")
        );
    }
}

fn main() {
    // Handle --reset: clear all saved state and exit. The user relaunches manually.
    let cli_args: Vec<String> = std::env::args().collect();
    if cli_args.contains(&"--reset".to_string()) {
        let _ = auth::clear_tokens();
        let _ = auth::clear_client_id();
        clear_webview_data();
        std::process::exit(0);
    }

    let slideshow_state = Arc::new(slideshow::SlideshowState::default());
    tauri::Builder::default()
        .manage(Arc::clone(&slideshow_state))
        .manage(remote_server::RemoteState::default())
        // single-instance MUST be registered before deep-link so it can intercept
        // the second process launch (which carries the party-display://callback URL)
        // and forward it to the running instance instead of opening a new window.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::Emitter;
            // The OS launches a second process with the party-display://callback URL
            // as a command-line arg. single-instance blocks that process and delivers
            // the args here. We must re-emit the deep-link event ourselves because
            // tauri-plugin-deep-link only processes args at its own startup — it never
            // sees the second process's args unless we forward them.
            let urls: Vec<String> = args.iter()
                .filter(|a| a.starts_with("party-display://"))
                .cloned()
                .collect();
            if !urls.is_empty() {
                let _ = app.emit("deep-link://new-url", urls);
            }
            if let Some(w) = app.get_webview_window("control") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            start_oauth_callback_server,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
            auth::store_client_id,
            auth::load_client_id,
            auth::clear_client_id,
            audio::start_audio_capture,
            slideshow::watch_folder,
            slideshow::get_photos,
            window_manager::get_monitors,
            window_manager::load_display_state,
            window_manager::open_display_window,
            window_manager::close_display_window,
            window_manager::set_display_fullscreen,
            window_manager::toggle_display_fullscreen,
            window_manager::exit_display_fullscreen,
            system::get_battery_status,
            system::get_ip_location,
            local_audio::scan_audio_folder,
            dlna::dlna_discover,
            dlna::dlna_browse,
            media_keys::send_media_key,
            exit_app,
            clear_webview_data,
            presets::get_presets,
            system::trigger_cast_flyout,
            remote_server::start_remote_server,
            remote_server::stop_remote_server,
        ])
        .setup(|app| {
            // Start the DLNA HTTP proxy server (http://127.0.0.1:29341/...)
            tauri::async_runtime::spawn(dlna_proxy::start());

            // Keep RemoteState in sync with playback and slideshow events.
            {
                let remote = app.state::<remote_server::RemoteState>();
                let tx_pb = remote.tx.clone();
                let app_state_pb = Arc::clone(&remote.app_state);
                let tx_ss = remote.tx.clone();
                let app_state_ss = Arc::clone(&remote.app_state);
                let tx_ds = remote.tx.clone();
                let app_state_ds = Arc::clone(&remote.app_state);

                app.handle().listen("playback-tick", move |event| {
                    if let Ok(payload) =
                        serde_json::from_str::<serde_json::Value>(event.payload())
                    {
                        let paused = payload
                            .get("paused")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);
                        let mut s = app_state_pb.lock().unwrap();
                        let playing = !paused;
                        if s.playing == playing { return; }
                        s.playing = playing;
                        drop(s);
                        let msg =
                            serde_json::json!({ "type": "playback-state", "paused": paused })
                                .to_string();
                        let _ = tx_pb.send(msg);
                    }
                });

                app.handle().listen("display-settings-changed", move |event| {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                        let msg = {
                            let mut s = app_state_ds.lock().unwrap();
                            for (key, field) in [
                                ("track",   "trackOverlayVisible"),
                                ("lyrics",  "lyricsVisible"),
                                ("clock",   "clockWeatherVisible"),
                                ("battery", "batteryVisible"),
                                ("photos",  "photoCounterVisible"),
                            ] {
                                if let Some(v) = payload.get(field).and_then(|v| v.as_bool()) {
                                    s.toggles.insert(key.to_string(), v);
                                }
                            }
                            if let Some(v) = payload.get("visualizerMode").and_then(|v| v.as_str()) {
                                s.viz_mode = v.to_string();
                            }
                            remote_server::build_full_state(&s)
                        };
                        let _ = tx_ds.send(msg);
                    }
                });

                app.handle().listen("slideshow-state", move |event| {
                    if let Ok(payload) =
                        serde_json::from_str::<serde_json::Value>(event.payload())
                    {
                        let paused = payload
                            .get("paused")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let mut s = app_state_ss.lock().unwrap();
                        if s.slideshow_paused == paused { return; }
                        s.slideshow_paused = paused;
                        drop(s);
                        let msg =
                            serde_json::json!({ "type": "slideshow-state", "paused": paused })
                                .to_string();
                        let _ = tx_ss.send(msg);
                    }
                });
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register("party-display")?;
            }
            // Exit the whole process when the control window is closed.
            // Without this the hidden display window keeps the process alive.
            let app_handle = app.handle().clone();
            if let Some(control) = app.get_webview_window("control") {
                control.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Destroyed) {
                        app_handle.exit(0);
                    }
                });
            }
            // Size the control window to fill the available monitor height (minus taskbar).
            if let Some(control) = app.get_webview_window("control") {
                if let Ok(Some(monitor)) = control.current_monitor() {
                    let scale = monitor.scale_factor();
                    let logical_h = monitor.size().height as f64 / scale;
                    let target_h = (logical_h - 80.0).min(950.0).max(720.0);
                    let _ = control.set_size(tauri::Size::Logical(tauri::LogicalSize {
                        width: 420.0,
                        height: target_h,
                    }));
                }
            }
            // Auto-save display window state on every resize/move; intercept manual close
            if let Some(display) = app.get_webview_window("display") {
                let app_handle2 = app.handle().clone();
                display.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::Resized(_)
                        | tauri::WindowEvent::Moved(_) => {
                            if let Some(w) = app_handle2.get_webview_window("display") {
                                window_manager::snapshot_window_state(&app_handle2, &w);
                            }
                        }
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            // Prevent destroy; hide instead so the window can be re-opened
                            api.prevent_close();
                            if let Some(w) = app_handle2.get_webview_window("display") {
                                window_manager::handle_display_close_requested(&app_handle2, &w);
                            }
                        }
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
