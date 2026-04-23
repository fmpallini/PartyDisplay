# SMTC External Player Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read track metadata and playback position from any SMTC-registered Windows media app when Party Display is in External sound source mode, so lyrics and song info work identically to other sources.

**Architecture:** New `smtc.rs` Rust module polls `GlobalSystemMediaTransportControlsSessionManager` every 1 second, emits `smtc-track-changed` and `smtc-position-update` Tauri events. `useExternalPlayer.ts` activates the listener when external mode is active and maps events onto the existing `PlayerState` shape. All other sources unchanged.

**Tech Stack:** Rust `windows` crate (WinRT bindings), `base64` crate, `tokio` (already present), React `useEffect` + Tauri `listen`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/src-tauri/Cargo.toml` | Modify | Add `windows` + `base64` deps |
| `app/src-tauri/src/smtc.rs` | Create | SMTC state, commands, polling loop, thumbnail conversion |
| `app/src-tauri/src/main.rs` | Modify | Register `mod smtc`, manage `SmtcState`, add 2 commands |
| `app/src/hooks/useExternalPlayer.ts` | Modify | SMTC listener effect, track + position state |

---

## Task 1: Add Cargo Dependencies

**Files:**
- Modify: `app/src-tauri/Cargo.toml`

- [ ] **Step 1: Add `windows` and `base64` to Cargo.toml**

Open `app/src-tauri/Cargo.toml` and append to the `[dependencies]` section:

```toml
windows = { version = "0.58", features = [
  "Media_Control",
  "Storage_Streams",
  "Foundation",
] }
base64 = "0.22"
```

- [ ] **Step 2: Verify cargo resolves dependencies**

```bash
cd app/src-tauri && cargo fetch
```

Expected: fetches without error. If version conflict on `windows`, try `"0.56"` or `"0.57"`.

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock
git commit -m "chore: add windows WinRT and base64 deps for SMTC"
```

---

## Task 2: Create `smtc.rs`

**Files:**
- Create: `app/src-tauri/src/smtc.rs`

- [ ] **Step 1: Create `smtc.rs` with full implementation**

Create `app/src-tauri/src/smtc.rs` with this exact content:

```rust
use std::sync::Mutex;
use std::time::Duration;
use base64::{Engine as _, engine::general_purpose};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

// Matches TrackInfo shape expected by the frontend (player-types.ts)
#[derive(serde::Serialize, Clone)]
struct SmtcTrackInfo {
    id:        String,
    name:      String,
    artists:   String,
    #[serde(rename = "albumArt")]
    album_art: String,
    duration:  u64,  // ms
    #[serde(rename = "positionMs")]
    position_ms: u64,
}

#[derive(serde::Serialize, Clone)]
struct SmtcPositionUpdate {
    #[serde(rename = "positionMs")]
    position_ms: u64,
}

pub struct SmtcState {
    stop_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl Default for SmtcState {
    fn default() -> Self {
        Self { stop_tx: Mutex::new(None) }
    }
}

#[tauri::command]
pub async fn start_smtc_listener(
    app:   AppHandle,
    state: tauri::State<'_, SmtcState>,
) -> Result<(), String> {
    let mut guard = state.stop_tx.lock().unwrap();
    // Stop any existing polling thread before starting a new one
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    *guard = Some(stop_tx);
    drop(guard);

    tauri::async_runtime::spawn(async move {
        smtc_poll_loop(app, stop_rx).await;
    });

    Ok(())
}

#[tauri::command]
pub fn stop_smtc_listener(state: tauri::State<'_, SmtcState>) -> Result<(), String> {
    let mut guard = state.stop_tx.lock().unwrap();
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

async fn smtc_poll_loop(app: AppHandle, mut stop_rx: oneshot::Receiver<()>) {
    let mut last_track: Option<(String, String)> = None; // (title, artist)
    loop {
        tokio::select! {
            _ = &mut stop_rx => break,
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                poll_smtc(&app, &mut last_track).await;
            }
        }
    }
}

async fn poll_smtc(app: &AppHandle, last_track: &mut Option<(String, String)>) {
    match try_poll_smtc(app, last_track).await {
        Ok(()) => {}
        Err(e) => {
            eprintln!("[SMTC] poll error: {e:?}");
            // Any error = no usable session → clear display
            if last_track.is_some() {
                *last_track = None;
                let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
            }
        }
    }
}

async fn try_poll_smtc(
    app:        &AppHandle,
    last_track: &mut Option<(String, String)>,
) -> windows::core::Result<()> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    let session = manager.GetCurrentSession()?;
    let props    = session.TryGetMediaPropertiesAsync()?.await?;
    let timeline = session.GetTimelineProperties()?;

    let title  = props.Title()?.to_string();
    let artist = props.Artist()?.to_string();

    // Empty title = app registered SMTC but isn't playing anything meaningful
    if title.is_empty() {
        if last_track.is_some() {
            *last_track = None;
            let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
        }
        return Ok(());
    }

    // Convert 100-nanosecond WinRT ticks to milliseconds
    let position_ms = (timeline.Position()?.Duration.max(0) / 10_000) as u64;
    let duration_ms = (timeline.EndTime()?.Duration.max(0) / 10_000) as u64;

    let track_key = (title.clone(), artist.clone());
    if last_track.as_ref() != Some(&track_key) {
        *last_track = Some(track_key);
        let album_art = get_thumbnail(&props).await.unwrap_or_default();
        let _ = app.emit("smtc-track-changed", Some(SmtcTrackInfo {
            id:          String::new(),
            name:        title,
            artists:     artist,
            album_art,
            duration:    duration_ms,
            position_ms,
        }));
    }

    let _ = app.emit("smtc-position-update", SmtcPositionUpdate { position_ms });

    Ok(())
}

async fn get_thumbnail(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use windows::Storage::Streams::DataReader;

    let thumb_ref = props.Thumbnail().ok()?;
    let stream    = thumb_ref.OpenReadAsync().ok()?.await.ok()?;
    let size      = stream.Size().ok()? as u32;
    if size == 0 {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size).ok()?.await.ok()?;

    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;

    // Detect MIME type from magic bytes to build a correct data URL
    let mime = if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else {
        "image/png"
    };

    Some(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(&bytes)
    ))
}
```

- [ ] **Step 2: Check it compiles in isolation**

```bash
cd app/src-tauri && cargo check 2>&1 | head -40
```

Expected: errors about `smtc` not being a module yet (because `main.rs` doesn't declare it). That's fine — the file itself should show no errors about `smtc.rs` internals. If you see errors inside `smtc.rs`, fix them before proceeding.

---

## Task 3: Wire `smtc.rs` into `main.rs`

**Files:**
- Modify: `app/src-tauri/src/main.rs`

- [ ] **Step 1: Add `mod smtc` declaration**

At the top of `main.rs`, after the existing `mod` declarations (around line 13), add:

```rust
mod smtc;
```

- [ ] **Step 2: Register `SmtcState` in the builder**

In `main()`, find this line (around line 186):

```rust
let slideshow_state = Arc::new(slideshow::SlideshowState::default());
tauri::Builder::default()
    .manage(Arc::clone(&slideshow_state))
    .manage(remote_server::RemoteState::default())
```

Add `.manage(smtc::SmtcState::default())` after the existing `.manage` calls:

```rust
let slideshow_state = Arc::new(slideshow::SlideshowState::default());
tauri::Builder::default()
    .manage(Arc::clone(&slideshow_state))
    .manage(remote_server::RemoteState::default())
    .manage(smtc::SmtcState::default())
```

- [ ] **Step 3: Register SMTC commands in `invoke_handler!`**

Find the `invoke_handler!` macro (around line 214). Add the two new commands at the end of the list, before the closing `]`:

```rust
    media_keys::send_media_key,
    exit_app,
    clear_webview_data,
    presets::get_presets,
    system::trigger_cast_flyout,
    remote_server::start_remote_server,
    remote_server::stop_remote_server,
    smtc::start_smtc_listener,
    smtc::stop_smtc_listener,
```

- [ ] **Step 4: Full cargo check**

```bash
cd app/src-tauri && cargo check 2>&1 | head -60
```

Expected: no errors. If you see WinRT-related errors about missing features, add them to the `windows` features list in `Cargo.toml`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/smtc.rs app/src-tauri/src/main.rs
git commit -m "feat(backend): add SMTC listener commands for external player mode"
```

---

## Task 4: Update `useExternalPlayer.ts`

**Files:**
- Modify: `app/src/hooks/useExternalPlayer.ts`

- [ ] **Step 1: Replace file contents**

Replace the entire file with:

```typescript
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PlayerState, PlayerControls, TrackInfo } from '../lib/player-types'

function mediaKey(key: string) {
  invoke('send_media_key', { key }).catch(e => console.error('[ExternalPlayer]', e))
}

export function useExternalPlayer(active: boolean): PlayerState & PlayerControls {
  const [paused, setPaused] = useState(false)
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [positionMs, setPositionMs] = useState(0)

  useEffect(() => {
    if (!active) return

    invoke('start_smtc_listener').catch(e =>
      console.error('[ExternalPlayer] SMTC start failed:', e)
    )

    let unlistenTrack: (() => void) | undefined
    let unlistenPos:   (() => void) | undefined

    listen<TrackInfo | null>('smtc-track-changed', (e) => {
      setTrack(e.payload)
      if (e.payload === null) setPositionMs(0)
    }).then(fn => { unlistenTrack = fn })

    listen<{ positionMs: number }>('smtc-position-update', (e) => {
      setPositionMs(e.payload.positionMs)
    }).then(fn => { unlistenPos = fn })

    return () => {
      invoke('stop_smtc_listener').catch(() => {})
      unlistenTrack?.()
      unlistenPos?.()
      setTrack(null)
      setPositionMs(0)
    }
  }, [active])

  const togglePlay = useCallback(() => {
    mediaKey('play_pause')
    setPaused(p => !p)
  }, [])

  const nextTrack = useCallback(() => { mediaKey('next') }, [])
  const prevTrack = useCallback(() => { mediaKey('prev') }, [])

  return {
    ready:      active,
    deviceId:   null,
    track,
    paused,
    positionMs,
    volume:     1,
    shuffle:    false,
    error:      null,
    togglePlay,
    nextTrack,
    prevTrack,
    seek:          () => {},
    setVolume:     () => {},
    toggleShuffle: () => {},
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `useExternalPlayer.ts`. Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useExternalPlayer.ts
git commit -m "feat(frontend): wire SMTC events into external player hook"
```

---

## Task 5: Build and Manual Test

- [ ] **Step 1: Full Tauri build check**

```bash
cd app && npm run tauri build -- --debug 2>&1 | tail -30
```

Expected: build succeeds. Fix any compilation errors before proceeding.

- [ ] **Step 2: Launch app in dev mode**

```bash
cd app && npm run tauri dev
```

- [ ] **Step 3: Test — active media session**

1. Open any SMTC-compatible player (Windows Media Player, Groove, Spotify desktop, YouTube in Chrome)
2. Start playing a track
3. In Party Display Control Panel, switch source to **External**
4. Verify: song title + artist appear in the display overlay
5. Verify: album art appears (if the app provides it)
6. Verify: lyrics load and sync (check the lyrics overlay on the display window)
7. Skip to next track in the external player → verify Party Display updates within ~1s

- [ ] **Step 4: Test — no media session**

1. Stop all media players completely
2. Switch to External mode (or it's already active)
3. Verify: song info overlay is blank (no stale track shown)
4. Verify: lyrics overlay is hidden

- [ ] **Step 5: Test — unsupported app**

1. Play audio from an app that doesn't register SMTC (e.g., old VLC versions, some games)
2. Verify: song info stays blank (no crash, no stale data)

- [ ] **Step 6: Test — mode switching**

1. Start in Spotify source with a playing track
2. Switch to External source
3. Verify: previous Spotify track info clears immediately
4. Verify: SMTC track appears if a compatible player is running

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat: SMTC integration for external player mode — song info and lyrics now work"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections mapped to tasks (deps → smtc.rs → main.rs → frontend → test)
- [x] **No placeholders:** All steps have exact code or commands
- [x] **Type consistency:** `SmtcTrackInfo` fields match `TrackInfo` in `player-types.ts` (`id`, `name`, `artists: String`, `albumArt`, `duration`, `positionMs`)
- [x] **No session → clear track:** handled in `poll_smtc` error branch + empty title check
- [x] **Thumbnail failure → empty string:** `get_thumbnail` returns `Option<String>`, unwrapped with `.unwrap_or_default()` → `""`
- [x] **Stop before start:** `start_smtc_listener` sends on existing channel before creating new one
- [x] **Cleanup on unmount:** `useEffect` cleanup calls `stop_smtc_listener` + unlisten both events + resets state
