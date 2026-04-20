use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::{
    Router,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, watch};

const HTML: &str = include_str!("../../../remote/index.html");
const PORT: u16 = 9091;
const VIZ_MODES: [&str; 3] = ["photos", "visualizer", "split"];

// ── Shared state ─────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct RemoteAppState {
    pub playing: bool,
    pub slideshow_paused: bool,
    pub toggles: HashMap<String, bool>,
    pub viz_mode: String,
}

impl Default for RemoteAppState {
    fn default() -> Self {
        Self {
            playing: false,
            slideshow_paused: false,
            toggles: HashMap::new(),
            viz_mode: "photos".to_string(),
        }
    }
}

pub struct RemoteState {
    pub handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    pub tx: broadcast::Sender<String>,
    pub app_state: Arc<Mutex<RemoteAppState>>,
    pub shutdown_tx: watch::Sender<bool>,
}

impl Default for RemoteState {
    fn default() -> Self {
        let (tx, _) = broadcast::channel(32);
        let (shutdown_tx, _) = watch::channel(true);
        Self {
            handle: Mutex::new(None),
            tx,
            app_state: Arc::new(Mutex::new(RemoteAppState::default())),
            shutdown_tx,
        }
    }
}

#[derive(Serialize, Clone)]
pub struct RemoteInfo {
    pub ip: String,
    pub port: u16,
}

// ── Axum server state (passed to route handlers via State extractor) ──────────

#[derive(Clone)]
struct ServerState {
    tx: broadcast::Sender<String>,
    app_state: Arc<Mutex<RemoteAppState>>,
    app: AppHandle,
    shutdown_rx: watch::Receiver<bool>,
}

// ── Route handlers ────────────────────────────────────────────────────────────

async fn serve_html() -> impl IntoResponse {
    axum::response::Html(HTML)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

pub(crate) fn build_full_state(s: &RemoteAppState) -> String {
    serde_json::json!({
        "type": "full-state",
        "playing": s.playing,
        "slideshowPaused": s.slideshow_paused,
        "toggles": s.toggles,
        "vizMode": s.viz_mode,
    })
    .to_string()
}

async fn handle_socket(mut socket: WebSocket, state: ServerState) {
    let full_state = build_full_state(&state.app_state.lock().unwrap());
    if socket.send(Message::Text(full_state.into())).await.is_err() {
        return;
    }

    let mut rx = state.tx.subscribe();
    let mut shutdown_rx = state.shutdown_rx.clone();

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if !*shutdown_rx.borrow() {
                    let _ = socket.send(Message::Close(None)).await;
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(cmd) = serde_json::from_str::<WsCommand>(&text) {
                            dispatch_action(&cmd.action, &state);
                        }
                    }
                    _ => break,
                }
            }
            broadcast_result = rx.recv() => {
                match broadcast_result {
                    Ok(broadcast_msg) => {
                        if socket.send(Message::Text(broadcast_msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        // Re-send full state to resync the client after dropped messages.
                        let resync = build_full_state(&state.app_state.lock().unwrap());
                        if socket.send(Message::Text(resync.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        }
    }
}

// ── Action dispatch ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct WsCommand {
    action: String,
}

fn dispatch_action(action: &str, state: &ServerState) {
    let hotkey = match action {
        "prev-track"      => "music-prev",
        "play-pause"      => "music-toggle",
        "next-track"      => "music-next",
        "vol-up"          => "vol-up",
        "vol-down"        => "vol-down",
        "prev-photo"      => "prev",
        "next-photo"      => "next",
        "pause-slideshow" => "pause",
        "prev-preset"     => "prev-preset",
        "next-preset"     => "next-preset",
        "toggle-viz-mode" => "cycle-viz-mode",
        "toggle-track"    => "track",
        "toggle-lyrics"   => "lyrics",
        "toggle-clock"    => "clock",
        "toggle-battery"  => "battery",
        "toggle-photos"   => "counter",
        _ => return,
    };

    let _ = state.app.emit("display-hotkey", serde_json::json!({ "action": hotkey }));

    // Optimistic state tracking so WS clients stay in sync with remote-driven changes.
    let broadcast_msg = {
        let mut s = state.app_state.lock().unwrap();
        match action {
            "play-pause" => {
                s.playing = !s.playing;
                Some(serde_json::json!({ "type": "playback-state", "paused": !s.playing }).to_string())
            }
            "pause-slideshow" => {
                s.slideshow_paused = !s.slideshow_paused;
                Some(
                    serde_json::json!({ "type": "slideshow-state", "paused": s.slideshow_paused })
                        .to_string(),
                )
            }
            "toggle-viz-mode" => {
                let idx = VIZ_MODES.iter().position(|&m| m == s.viz_mode.as_str()).unwrap_or(0);
                s.viz_mode = VIZ_MODES[(idx + 1) % VIZ_MODES.len()].to_string();
                Some(serde_json::json!({ "type": "viz-mode", "mode": s.viz_mode }).to_string())
            }
            "toggle-track" | "toggle-lyrics" | "toggle-clock" | "toggle-battery"
            | "toggle-photos" => {
                let key = match action {
                    "toggle-track"   => "track",
                    "toggle-lyrics"  => "lyrics",
                    "toggle-clock"   => "clock",
                    "toggle-battery" => "battery",
                    "toggle-photos"  => "photos",
                    _ => unreachable!(),
                };
                let val = !s.toggles.get(key).copied().unwrap_or(false);
                s.toggles.insert(key.to_string(), val);
                Some(serde_json::json!({ "type": "toggle-state", "key": key, "value": val }).to_string())
            }
            _ => None,
        }
    };

    if let Some(msg) = broadcast_msg {
        let _ = state.tx.send(msg);
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn start_remote_server(
    state: tauri::State<'_, RemoteState>,
    app: AppHandle,
) -> Result<RemoteInfo, String> {
    let ip = local_ip_address::local_ip()
        .map(|addr| addr.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    // Abort any existing server task.
    {
        let mut guard = state.handle.lock().unwrap();
        if let Some(h) = guard.take() {
            h.abort();
        }
    }

    let tx = state.tx.clone();
    let app_state = Arc::clone(&state.app_state);
    let _ = state.shutdown_tx.send(true); // mark active for new connections
    let shutdown_rx = state.shutdown_tx.subscribe();

    // Bind synchronously so port-in-use errors surface immediately to the caller.
    let std_listener = std::net::TcpListener::bind(format!("0.0.0.0:{PORT}"))
        .map_err(|e| format!("Could not start server: {e}"))?;
    std_listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let server_state = ServerState { tx, app_state, app, shutdown_rx };
    let router = Router::new()
        .route("/", get(serve_html))
        .route("/ws", get(ws_handler))
        .with_state(server_state);

    let handle = tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::from_std(std_listener) {
            Ok(listener) => { let _ = axum::serve(listener, router).await; }
            Err(e) => eprintln!("[remote_server] Failed to create async listener: {e}"),
        }
    });

    {
        let mut guard = state.handle.lock().unwrap();
        *guard = Some(handle);
    }

    Ok(RemoteInfo { ip, port: PORT })
}

#[tauri::command]
pub fn stop_remote_server(state: tauri::State<'_, RemoteState>) {
    let _ = state.shutdown_tx.send(false); // signal all active sockets to close
    let mut guard = state.handle.lock().unwrap();
    if let Some(h) = guard.take() {
        h.abort();
    }
}
