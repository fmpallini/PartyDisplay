# SMTC Integration for External Player Mode

**Date:** 2026-04-23  
**Scope:** External sound source mode only — no changes to Spotify, local, or DLNA sources.

---

## Goal

When Party Display is in External sound source mode, read track metadata and playback position from any SMTC-registered Windows media application (Chrome, VLC, Winamp, native apps, etc.) so that song info display and lyrics sync work identically to other sources.

---

## Architecture

Two new pieces; everything else unchanged.

| Component | Location | Purpose |
|---|---|---|
| `smtc.rs` | `app/src-tauri/src/smtc.rs` | WinRT SMTC polling, event emission |
| `useExternalPlayer.ts` | `app/src/hooks/useExternalPlayer.ts` | Start/stop listener, forward events to app state |

### New Tauri commands
- `start_smtc_listener` — spawns polling thread, returns immediately
- `stop_smtc_listener` — signals thread to stop cleanly

### New Tauri events (Rust → frontend)
- `smtc-track-changed` — payload: `TrackInfo | null`
- `smtc-position-update` — payload: `{ positionMs: number }`

---

## Data Flow

```
User activates External mode
  → useExternalPlayer: invoke('start_smtc_listener')
  → smtc.rs: RequestAsync() → get SessionManager
  → spawn background thread, loop every 1s:
      GetCurrentSession()
        → None: emit smtc-track-changed(null), skip position
        → Some(session):
            TryGetMediaPropertiesAsync() → title, artist, thumbnail
            GetTimelineProperties()     → Position (elapsed), EndTime (total)
            if title+artist differ from last known:
              convert thumbnail → base64 data URL (or "" on failure)
              emit smtc-track-changed { id:"", name, artists, albumArt, duration, positionMs }
            emit smtc-position-update { positionMs }

  → useExternalPlayer:
      on smtc-track-changed(payload):
        setCurrentTrack(payload)   // null clears display and stops lyrics
      on smtc-position-update(payload):
        lastPositionMs.current = payload.positionMs
        lastPollTime.current   = Date.now()

User leaves External mode / app closes
  → useExternalPlayer: invoke('stop_smtc_listener')
  → thread receives stop signal via oneshot channel, exits
```

---

## Rust Module: `smtc.rs`

### Dependencies to add (`Cargo.toml`, Windows-only)

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = [
  "Media_Control",
  "Storage_Streams",
  "Foundation",
] }
base64 = "0.22"
```

`tokio` (already present with `time` + `sync` features) handles the sleep and oneshot channel.

### State

```rust
pub struct SmtcState {
    stop_tx: Mutex<Option<oneshot::Sender<()>>>,
}
```

Stored in Tauri's managed state. `start_smtc_listener` creates the channel and spawns the thread. `stop_smtc_listener` sends on the channel and clears it.

### Polling thread logic

```
loop {
  select! {
    _ = stop_rx  => break,
    _ = sleep(1s) => {
      let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
      let session = manager.GetCurrentSession();
      match session {
        Err(_) | Ok(None) => {
          if last_track.is_some() {
            emit smtc-track-changed(null)
            last_track = None
          }
          continue
        }
        Ok(Some(s)) => {
          let props    = s.TryGetMediaPropertiesAsync()?.await?;
          let timeline = s.GetTimelineProperties()?;
          let title    = props.Title()?.to_string();
          let artist   = props.Artist()?.to_string();
          let pos_ms   = timeline.Position().Duration / 10_000;  // 100ns → ms
          let dur_ms   = timeline.EndTime().Duration / 10_000;

          if (title, artist) != last_track {
            let art = read_thumbnail(props.Thumbnail()).await.unwrap_or_default();
            emit smtc-track-changed { id:"", name:title, artists:artist, albumArt:art, duration:dur_ms, positionMs:pos_ms }
            last_track = Some((title, artist))
          }
          emit smtc-position-update { positionMs: pos_ms }
        }
      }
    }
  }
}
```

### Thumbnail conversion

```
props.Thumbnail()               // IRandomAccessStreamReference
  .OpenReadAsync()?.await?      // IRandomAccessStream
  → read all bytes → Vec<u8>
  → base64::encode()
  → format!("data:image/png;base64,{}", encoded)
```

Failure at any step → return `""` (empty albumArt), do not abort track emission.

---

## Frontend: `useExternalPlayer.ts`

### Changes

- Add `useEffect` that runs when `active === true`
- Start listener on mount, stop on cleanup
- Store `lastPositionMs` and `lastPollTime` in refs
- Expose interpolated `positionMs` getter: `lastPositionMs + (Date.now() - lastPollTime)`
- Set `currentTrack` state from `smtc-track-changed` events (null clears it)
- Media key functions (play/pause, next, prev) unchanged

### What stays the same

`useLyrics` receives `currentTrack` via existing props — zero changes needed. `LyricsOverlay` and `DisplayWindow` unchanged.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No SMTC session (app doesn't support it, nothing playing) | Emit `track-changed(null)` → clear display |
| WinRT API call fails mid-poll | Log error, skip poll cycle, keep last state |
| Thumbnail conversion fails | Emit track with `albumArt: ""` |
| `stop_smtc_listener` called before `start` | No-op |
| App closes without stopping listener | Thread exits on next poll when channel drops |

---

## Session Selection

Uses `GetCurrentSession()` — the session Windows considers "current" (last interacted). No user-facing picker. If nothing is active, clears track info.

---

## Position Accuracy

Poll interval: 1s. Frontend interpolates using `Date.now()` delta between polls. Expected lyrics drift: <1s (acceptable; LRCLIB timestamps are at 1s granularity anyway).

---

## Files Modified

| File | Change |
|---|---|
| `app/src-tauri/src/smtc.rs` | New — SMTC polling module |
| `app/src-tauri/src/main.rs` | Register `SmtcState`, add two Tauri commands |
| `app/src-tauri/Cargo.toml` | Add `windows` crate + `base64` (Windows-only) |
| `app/src/hooks/useExternalPlayer.ts` | Add SMTC listener, expose track + position |

No other files change.
