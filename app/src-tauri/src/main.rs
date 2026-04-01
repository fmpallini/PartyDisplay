#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod audio;
mod slideshow;
mod system;
mod window_manager;

use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::Manager;

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

pub struct AppState {
    pub device_id: Mutex<Option<String>>,
}

#[tauri::command]
fn ping() -> &'static str {
    "pong"
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
fn set_device_id(state: tauri::State<AppState>, device_id: String) -> Result<(), String> {
    *state.device_id.lock().unwrap() = Some(device_id);
    Ok(())
}

#[tauri::command]
fn relaunch(app: tauri::AppHandle) {
    app.restart();
}

fn main() {
    let slideshow_state = Arc::new(slideshow::SlideshowState::default());
    tauri::Builder::default()
        .manage(AppState { device_id: Mutex::new(None) })
        .manage(Arc::clone(&slideshow_state))
        // single-instance MUST be registered before deep-link so it can intercept
        // the second process launch (which carries the party-display://callback URL)
        // and forward it to the running instance instead of opening a new window.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // The OS launches a second process with the party-display://callback URL
            // as a command-line arg. single-instance blocks that process and delivers
            // the args here. We must re-emit the deep-link event ourselves because
            // tauri-plugin-deep-link only processes args at its own startup — it never
            // sees the second process's args unless we forward them.
            use tauri::Emitter;
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
            ping,
            start_oauth_callback_server,
            set_device_id,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
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
            relaunch,
        ])
        .setup(|app| {
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
