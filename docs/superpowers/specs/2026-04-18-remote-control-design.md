# Remote Control Feature — Design Spec
**Date:** 2026-04-18  
**Status:** Approved

---

## Overview

A phone-accessible remote control for Party Display. When enabled from the Control Panel, the app hosts an HTTP+WebSocket server on the local network. The user scans a QR code or types the displayed URL into their phone browser to get the remote UI. Button presses on the phone are translated into the same Tauri events as keyboard hotkeys on the desktop.

---

## Architecture

### Components

| Component | Location | Responsibility |
|---|---|---|
| `remote_server.rs` | `app/src-tauri/src/` | axum HTTP+WS server, lifecycle, broadcast |
| Tauri commands | `main.rs` (registered) | `start_remote_server`, `stop_remote_server` |
| Control Panel UI | existing Control Panel component | toggle, IP display, QR code |
| `remote/index.html` | `remote/` (already built) | phone-side remote UI |

---

## Section 1 — Rust Server (`remote_server.rs`)

### Server Stack

- **Runtime:** Tokio (already used by Tauri)
- **HTTP+WS:** `axum` crate with `axum::extract::ws`
- **Dependencies to add:** `axum`, `local-ip-address` (for LAN IP detection)

### Routes

```
GET /     → serves embedded remote/index.html (include_str! at compile time)
GET /ws   → WebSocket upgrade
```

### Shared State

```rust
pub struct RemoteState {
    handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    tx: broadcast::Sender<String>,         // push state to all WS clients
    app_state: Mutex<RemoteAppState>,      // last known playing/paused/toggle state
}

pub struct RemoteAppState {
    playing: bool,
    slideshow_paused: bool,
    toggles: HashMap<String, bool>,
}
```

`RemoteState` is registered with `.manage()` in `main.rs`.

### Lifecycle

**`start_remote_server`:**
1. Abort existing handle if any
2. Bind `0.0.0.0:9091`
3. Detect LAN IP via `local_ip_address::local_ip()`
4. Spawn axum server task, store `JoinHandle`
5. Return `RemoteInfo { ip: String, port: u16 }`

**`stop_remote_server`:**
1. Abort the stored `JoinHandle`
2. Clear handle from state

### LAN IP Detection

Use `local-ip-address` crate — returns first non-loopback IPv4. Falls back to `127.0.0.1` if detection fails (with a warning shown in the UI).

---

## Section 2 — WebSocket Protocol

### Phone → Server (commands)

All messages are JSON: `{ "action": "<action-name>" }`

| Action | Maps to `display-hotkey` action |
|---|---|
| `prev-track` | `prev-track` |
| `play-pause` | `play-pause` |
| `next-track` | `next-track` |
| `vol-up` | `vol-up` |
| `vol-down` | `vol-down` |
| `prev-photo` | `prev` |
| `next-photo` | `next` |
| `pause-slideshow` | `pause` |
| `prev-preset` | `prev-preset` |
| `next-preset` | `next-preset` |
| `toggle-viz-mode` | `cycle-viz-mode` |
| `toggle-track` | `toggle-track` |
| `toggle-lyrics` | `toggle-lyrics` |
| `toggle-clock` | `toggle-clock` |
| `toggle-battery` | `toggle-battery` |
| `toggle-photos` | `toggle-photos` |

The WS handler emits `display-hotkey` on the `AppHandle` for each received action. This reuses the existing hotkey event pipeline — no new event handlers needed in the frontend.

### Server → Phone (state sync)

**On connect:** server sends a `full-state` snapshot immediately.

**Ongoing:** the Rust server listens to Tauri events (`playback-tick`, `slideshow-state`, toggle changes) and broadcasts incremental updates to all connected WS clients via the broadcast channel.

```jsonc
// On connect
{ "type": "full-state", "playing": bool, "slideshowPaused": bool, "toggles": { "track": bool, ... } }

// Incremental
{ "type": "playback-state", "paused": bool }
{ "type": "slideshow-state", "paused": bool }
{ "type": "toggle-state", "key": "lyrics", "value": bool }
```

### Event Listening in Rust

The WS handler task subscribes to relevant Tauri events via `app_handle.listen_any(...)` and forwards them to the broadcast channel as serialized JSON matching the schema above.

---

## Section 3 — Control Panel UI

### Location

New "Remote Control" section in the existing Control Panel settings area.

### States

**Off (default):**
```
[ Remote Control ]  ●─── OFF
"Control Party Display from your phone"
```

**Starting:** toggle disabled, brief spinner.

**On:**
```
[ Remote Control ]  ───● ON
http://192.168.1.42:9091   [Copy]
[QR CODE — 150×150px]
```

**Error:**
```
[ Remote Control ]  ●─── OFF
"Could not start server: port 9091 in use"
```

### Implementation Notes

- `qrcode` npm package generates QR client-side — encodes full URL `http://<ip>:<port>`
- Local state: `remoteEnabled: boolean`, `remoteInfo: { ip: string, port: number } | null`, `remoteError: string | null`
- On toggle ON: call `invoke('start_remote_server')` → set `remoteInfo`
- On toggle OFF: call `invoke('stop_remote_server')` → clear `remoteInfo`
- Toggle snaps back to OFF if command rejects

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Port 9091 already in use | Return error from command, show inline message, toggle stays off |
| LAN IP not detected | Return `127.0.0.1`, show warning "Local IP not detected — share manually" |
| Phone loses connection | `remote/index.html` auto-reconnects every 3s (already implemented) |
| Server stopped while phone connected | WS close triggers phone-side reconnect loop |

---

## Files Changed

| File | Change |
|---|---|
| `app/src-tauri/src/remote_server.rs` | New — server implementation |
| `app/src-tauri/src/main.rs` | Register `RemoteState`, add commands to invoke handler |
| `app/src-tauri/Cargo.toml` | Add `axum`, `local-ip-address` dependencies |
| Control Panel component | Add Remote Control toggle + QR display |
| `remote/index.html` | Already built — no changes needed |

---

## Out of Scope

- Authentication / access control (LAN-only, acceptable for party use)
- HTTPS / WSS (not needed on LAN)
- Multiple simultaneous remotes are supported naturally by the broadcast channel
- Persistent remote-enabled setting across app restarts (always starts disabled)
