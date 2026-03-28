# Party Display — Plan 3: Slideshow & Beat Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the photo slideshow in the display window — folder selection, photo rendering, and beat-synchronized transitions driven by the Spotify Audio Analysis API. Photos change on detected beats; the display window receives current track and transition cues from the control window via Tauri events.

**Architecture:** Rust watches the selected photo folder using the `notify` crate and sends the file list to both windows. The control panel frontend polls `getState()` from the SDK to track playback position, fetches the Audio Analysis for the current track, finds upcoming beat timestamps, and schedules `setTimeout` transitions that fire `photo-advance` Tauri events at beat boundaries. The display window listens for these events and crossfades to the next photo.

**Tech Stack:** `notify` crate (folder watcher) · Spotify Web API (`/audio-analysis/{id}`) · SDK `getCurrentState()` · React `useEffect` timers · CSS crossfade transition

**Depends on:** Plan 2 complete (player hook, auth, device_id in Rust state).

---

## File Map

**Rust**
- Modify: `app/src-tauri/Cargo.toml` — add `notify`
- Create: `app/src-tauri/src/slideshow.rs` — folder watcher command, photo list state
- Modify: `app/src-tauri/src/main.rs` — register slideshow commands

**Frontend**
- Create: `app/src/lib/audio-analysis.ts` — fetch + cache Spotify Audio Analysis, beat scheduler
- Create: `app/src/hooks/usePhotoLibrary.ts` — listen for photo-list events, maintain shuffled queue
- Create: `app/src/hooks/useBeatScheduler.ts` — schedule photo advances on beat timestamps
- Create: `app/src/hooks/useDisplaySync.ts` — listen for `photo-advance` event (display window side)
- Create: `app/src/components/SlideshowView.tsx` — fullscreen photo with CSS crossfade
- Create: `app/src/components/FolderPicker.tsx` — button to open folder picker dialog
- Modify: `app/src/windows/control/ControlPanel.tsx` — add FolderPicker, beat scheduler
- Modify: `app/src/windows/display/DisplayWindow.tsx` — add SlideshowView

---

## Task 1: Rust folder watcher

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/src/slideshow.rs`
- Modify: `app/src-tauri/src/main.rs`

- [ ] **Step 1: Add `notify` and `tauri-plugin-dialog` to `app/src-tauri/Cargo.toml`**

Full `[dependencies]` section:

```toml
[dependencies]
tauri                   = { version = "2", features = ["devtools"] }
tauri-plugin-deep-link  = "2"
tauri-plugin-shell      = "2"
tauri-plugin-dialog     = "2"
serde                   = { version = "1", features = ["derive"] }
serde_json              = "1"
keyring                 = "3"
cpal                    = "0.15"
rustfft                 = "6"
notify                  = "6"
```

Also add to `app/package.json` devDependencies:

```json
"@tauri-apps/plugin-dialog": "^2"
```

Run `npm install` in `app/`.

- [ ] **Step 2: Create `app/src-tauri/src/slideshow.rs`**

```rust
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Emitter;

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

pub struct SlideshowState {
    pub folder:  Mutex<Option<PathBuf>>,
    pub photos:  Mutex<Vec<String>>, // absolute paths as strings
    _watcher:    Mutex<Option<RecommendedWatcher>>,
}

impl SlideshowState {
    pub fn new() -> Self {
        Self {
            folder:   Mutex::new(None),
            photos:   Mutex::new(Vec::new()),
            _watcher: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone)]
struct PhotoListPayload {
    photos: Vec<String>,
}

fn collect_photos(folder: &PathBuf) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(folder) else { return vec![] };
    let mut photos: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension()
                .and_then(|x| x.to_str())
                .map(|x| x.to_lowercase())
                .unwrap_or_default();
            IMAGE_EXTS.contains(&ext.as_str())
        })
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    photos.sort();
    photos
}

/// Called from frontend after the user picks a folder.
/// Starts a filesystem watcher and emits `photo-list` to all windows.
#[tauri::command]
pub fn watch_folder(
    folder_path: String,
    app: tauri::AppHandle,
    state: tauri::State<Arc<SlideshowState>>,
) -> Result<(), String> {
    let folder = PathBuf::from(&folder_path);
    if !folder.is_dir() {
        return Err(format!("{folder_path} is not a directory"));
    }

    let photos = collect_photos(&folder);
    {
        let mut s_folder = state.folder.lock().unwrap();
        let mut s_photos = state.photos.lock().unwrap();
        *s_folder = Some(folder.clone());
        *s_photos = photos.clone();
    }

    let _ = app.emit("photo-list", PhotoListPayload { photos: photos.clone() });

    // Set up watcher to re-emit on changes
    let app_clone   = app.clone();
    let state_clone = state.inner().clone();
    let folder_c    = folder.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            if matches!(event.kind, EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)) {
                let updated = collect_photos(&folder_c);
                *state_clone.photos.lock().unwrap() = updated.clone();
                let _ = app_clone.emit("photo-list", PhotoListPayload { photos: updated });
            }
        }
    }).map_err(|e| e.to_string())?;

    watcher.watch(&folder, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
    *state.inner()._watcher.lock().unwrap() = Some(watcher);

    Ok(())
}

#[tauri::command]
pub fn get_photos(state: tauri::State<Arc<SlideshowState>>) -> Vec<String> {
    state.photos.lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collect_photos_filters_extensions() {
        let dir = std::env::temp_dir().join("pd_test_photos");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.jpg"),  b"").unwrap();
        fs::write(dir.join("b.png"),  b"").unwrap();
        fs::write(dir.join("c.txt"),  b"").unwrap();
        fs::write(dir.join("d.mp3"),  b"").unwrap();

        let photos = collect_photos(&dir);
        assert_eq!(photos.len(), 2, "expected 2 image files, got: {:?}", photos);
        assert!(photos.iter().any(|p| p.ends_with("a.jpg")));
        assert!(photos.iter().any(|p| p.ends_with("b.png")));

        fs::remove_dir_all(&dir).unwrap();
    }
}
```

- [ ] **Step 3: Run the unit test — expect PASS**

```bash
cd app/src-tauri && cargo test slideshow::tests::collect_photos_filters_extensions -- --nocapture
```

Expected:
```
test slideshow::tests::collect_photos_filters_extensions ... ok
test result: ok. 1 passed; 0 failed
```

- [ ] **Step 4: Register slideshow module and plugin in `app/src-tauri/src/main.rs`**

Replace the entire file:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod audio;
mod slideshow;

use std::sync::{Arc, Mutex};
use slideshow::SlideshowState;

pub struct AppState {
    pub device_id: Mutex<Option<String>>,
}

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
fn set_device_id(state: tauri::State<AppState>, device_id: String) -> Result<(), String> {
    *state.device_id.lock().unwrap() = Some(device_id);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { device_id: Mutex::new(None) })
        .manage(Arc::new(SlideshowState::new()))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            set_device_id,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
            audio::start_audio_capture,
            slideshow::watch_folder,
            slideshow::get_photos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Add dialog permission to `app/src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability",
  "windows": ["control", "display"],
  "permissions": [
    "core:default",
    "shell:default",
    "deep-link:default",
    "dialog:default"
  ]
}
```

- [ ] **Step 6: Verify Rust compiles**

```bash
cd app/src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` with no errors.

- [ ] **Step 7: Commit**

```bash
git add app/src-tauri/
git commit -m "feat: Rust folder watcher with photo-list event emission, passing filter test"
```

---

## Task 2: Folder picker UI component

**Files:**
- Create: `app/src/components/FolderPicker.tsx`

- [ ] **Step 1: Create `app/src/components/FolderPicker.tsx`**

```tsx
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'

interface Props {
  onFolderSelected: (path: string) => void
}

export default function FolderPicker({ onFolderSelected }: Props) {
  const [folder, setFolder] = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  async function pick() {
    try {
      const selected = await open({ directory: true, multiple: false })
      if (!selected || Array.isArray(selected)) return
      await invoke('watch_folder', { folderPath: selected })
      setFolder(selected)
      setError(null)
      onFolderSelected(selected)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div style={{ margin: '12px 0' }}>
      <button
        onClick={pick}
        style={{ background: '#333', color: '#eee', border: '1px solid #555',
                 padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}
      >
        {folder ? '📂 Change Photo Folder' : '📂 Select Photo Folder'}
      </button>
      {folder && <span style={{ color: '#aaa', fontSize: 12, marginLeft: 8 }}>{folder}</span>}
      {error  && <p style={{ color: '#e74c3c', fontSize: 12 }}>❌ {error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/FolderPicker.tsx
git commit -m "feat: folder picker component using tauri-plugin-dialog"
```

---

## Task 3: Photo library hook (frontend)

**Files:**
- Create: `app/src/hooks/usePhotoLibrary.ts`

This hook listens for the `photo-list` Tauri event, maintains a shuffled queue, and advances through it.

- [ ] **Step 1: Create `app/src/hooks/usePhotoLibrary.ts`**

```typescript
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function usePhotoLibrary() {
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null)
  const queueRef  = useRef<string[]>([])
  const indexRef  = useRef(0)

  function loadPhotos(photos: string[]) {
    if (photos.length === 0) return
    queueRef.current = shuffle(photos)
    indexRef.current = 0
    setCurrentPhoto(queueRef.current[0])
  }

  // On mount: load any already-watched photos (e.g. after hot reload)
  useEffect(() => {
    invoke<string[]>('get_photos').then(photos => {
      if (photos.length > 0) loadPhotos(photos)
    })
  }, [])

  // Listen for photo-list updates from Rust watcher
  useEffect(() => {
    const unlisten = listen<{ photos: string[] }>('photo-list', ({ payload }) => {
      loadPhotos(payload.photos)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  function advance() {
    if (queueRef.current.length === 0) return
    indexRef.current = (indexRef.current + 1) % queueRef.current.length
    // Reshuffle when we've cycled through all photos
    if (indexRef.current === 0) {
      queueRef.current = shuffle(queueRef.current)
    }
    setCurrentPhoto(queueRef.current[indexRef.current])
  }

  return { currentPhoto, advance, total: queueRef.current.length }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/hooks/usePhotoLibrary.ts
git commit -m "feat: photo library hook with shuffled queue and Rust watcher event listener"
```

---

## Task 4: Audio Analysis beat scheduler

**Files:**
- Create: `app/src/lib/audio-analysis.ts`
- Create: `app/src/hooks/useBeatScheduler.ts`

The beat scheduler:
1. Fetches `/audio-analysis/{track_id}` from Spotify Web API (requires `user-read-currently-playing` scope — already in Plan 1 scopes).
2. Gets current playback position from `player.getCurrentState()`.
3. Finds the next N beats after the current position.
4. Schedules `setTimeout` for each upcoming beat, emitting a Tauri event `photo-advance` at each one.
5. Reschedules when the track changes.

- [ ] **Step 1: Create `app/src/lib/audio-analysis.ts`**

```typescript
export interface Beat {
  start:      number // seconds from track start
  duration:   number
  confidence: number
}

export interface AudioAnalysis {
  beats: Beat[]
}

const cache = new Map<string, AudioAnalysis>()

export async function fetchAudioAnalysis(
  trackId: string,
  accessToken: string,
): Promise<AudioAnalysis> {
  if (cache.has(trackId)) return cache.get(trackId)!

  const res = await fetch(`https://api.spotify.com/v1/audio-analysis/${trackId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Audio analysis fetch failed: ${res.status}`)
  const data = await res.json() as AudioAnalysis
  cache.set(trackId, data)
  return data
}

/** Returns beat timestamps (in ms from now) that fall within the next `windowMs` ms. */
export function upcomingBeats(
  beats: Beat[],
  positionMs: number,
  windowMs: number,
): number[] {
  const posS = positionMs / 1000
  return beats
    .filter(b => b.start > posS && b.start < posS + windowMs / 1000 && b.confidence > 0.3)
    .map(b => (b.start - posS) * 1000)
}
```

- [ ] **Step 2: Create `app/src/hooks/useBeatScheduler.ts`**

```typescript
import { useEffect, useRef } from 'react'
import { emit } from '@tauri-apps/api/event'
import type { TrackInfo } from './useSpotifyPlayer'
import { fetchAudioAnalysis, upcomingBeats } from '../lib/audio-analysis'

const WINDOW_MS = 10_000 // schedule beats 10 seconds ahead

export function useBeatScheduler(
  track: TrackInfo | null,
  accessToken: string | null,
  getPositionMs: () => Promise<number>,
) {
  const timersRef   = useRef<ReturnType<typeof setTimeout>[]>([])
  const trackIdRef  = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  function clearTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  useEffect(() => {
    if (!track || !accessToken) return
    if (track.id === trackIdRef.current) return // same track, already scheduled

    trackIdRef.current  = track.id
    cancelledRef.current = false
    clearTimers()

    let scheduleHandle: ReturnType<typeof setTimeout>

    async function schedule() {
      if (cancelledRef.current) return
      try {
        const analysis   = await fetchAudioAnalysis(track!.id, accessToken!)
        const positionMs = await getPositionMs()
        const beats      = upcomingBeats(analysis.beats, positionMs, WINDOW_MS)

        beats.forEach(delayMs => {
          const id = setTimeout(() => {
            emit('photo-advance', null)
          }, delayMs)
          timersRef.current.push(id)
        })

        // Reschedule before the window expires
        scheduleHandle = setTimeout(schedule, WINDOW_MS - 1000)
      } catch (e) {
        console.error('Beat scheduler error:', e)
        // Retry in 5s on failure
        scheduleHandle = setTimeout(schedule, 5000)
      }
    }

    schedule()

    return () => {
      cancelledRef.current = true
      clearTimers()
      clearTimeout(scheduleHandle)
    }
  }, [track?.id, accessToken])
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/audio-analysis.ts app/src/hooks/useBeatScheduler.ts
git commit -m "feat: Audio Analysis fetch + beat scheduler emitting photo-advance events"
```

---

## Task 5: Slideshow display component

**Files:**
- Create: `app/src/hooks/useDisplaySync.ts`
- Create: `app/src/components/SlideshowView.tsx`

- [ ] **Step 1: Create `app/src/hooks/useDisplaySync.ts`**

The display window advances photos when it receives a `photo-advance` event.

```typescript
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

export function useDisplaySync(advance: () => void) {
  useEffect(() => {
    const unlisten = listen('photo-advance', () => advance())
    return () => { unlisten.then(fn => fn()) }
  }, [advance])
}
```

- [ ] **Step 2: Create `app/src/components/SlideshowView.tsx`**

```tsx
import { useEffect, useState } from 'react'

interface Props {
  currentPhoto: string | null
}

export default function SlideshowView({ currentPhoto }: Props) {
  const [displayed, setDisplayed] = useState<string | null>(null)
  const [fading,    setFading]    = useState(false)

  useEffect(() => {
    if (!currentPhoto || currentPhoto === displayed) return
    setFading(true)
    const id = setTimeout(() => {
      setDisplayed(currentPhoto)
      setFading(false)
    }, 600) // match transition duration
    return () => clearTimeout(id)
  }, [currentPhoto])

  if (!displayed) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#333', fontFamily: 'monospace' }}>
        Select a photo folder in the control panel.
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <img
        src={`asset://localhost/${displayed.replace(/\\/g, '/')}`}
        alt=""
        style={{
          width: '100%', height: '100%', objectFit: 'contain',
          opacity: fading ? 0 : 1,
          transition: 'opacity 0.6s ease-in-out',
        }}
      />
    </div>
  )
}
```

Note on the `src` URL: Tauri v2 serves local files via the `asset://` protocol. The path must use forward slashes.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useDisplaySync.ts app/src/components/SlideshowView.tsx
git commit -m "feat: SlideshowView with CSS crossfade, useDisplaySync event listener"
```

---

## Task 6: Wire slideshow into both windows

**Files:**
- Modify: `app/src/windows/display/DisplayWindow.tsx`
- Modify: `app/src/windows/control/ControlPanel.tsx`

- [ ] **Step 1: Replace `app/src/windows/display/DisplayWindow.tsx`**

```tsx
import SlideshowView from '../../components/SlideshowView'
import { useDisplaySync } from '../../hooks/useDisplaySync'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'

export default function DisplayWindow() {
  const { currentPhoto, advance } = usePhotoLibrary()
  useDisplaySync(advance)

  return <SlideshowView currentPhoto={currentPhoto} />
}
```

- [ ] **Step 2: Add FolderPicker and beat scheduler to `app/src/windows/control/ControlPanel.tsx`**

Replace the entire file:

```tsx
import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'
import FolderPicker from '../../components/FolderPicker'
import LoginButton from '../../components/LoginButton'
import NowPlaying from '../../components/NowPlaying'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { useAuth } from '../../hooks/useAuth'
import { useBeatScheduler } from '../../hooks/useBeatScheduler'
import { useFftData } from '../../hooks/useFftData'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error: authError, login, logout } = useAuth()
  const player = useSpotifyPlayer(authenticated ? accessToken : null)
  const bins   = useFftData()
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

  // Beat scheduler — needs current playback position from the SDK
  const getPositionMs = useCallback(async (): Promise<number> => {
    // The SDK doesn't expose a direct `getPosition()` — getCurrentState() returns it
    // We use a script eval trick since the player is in the same window context
    const state = await (window as any).__spotifyPlayer?.getCurrentState?.()
    return state?.position ?? 0
  }, [])

  useBeatScheduler(
    player.track,
    authenticated ? accessToken : null,
    getPositionMs,
  )

  async function startCapture() {
    try {
      await invoke('start_audio_capture')
      setCapturing(true)
    } catch (e) {
      setCaptureError(String(e))
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 24, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h2 style={{ color: '#1db954', margin: '0 0 20px' }}>Party Display</h2>

      <LoginButton authenticated={authenticated} loading={loading} onLogin={login} onLogout={logout} />

      {authError    && <p style={{ color: '#e74c3c' }}>❌ Auth: {authError}</p>}
      {player.error && <p style={{ color: '#e74c3c' }}>❌ Player: {player.error}</p>}

      {authenticated && player.ready && (
        <p style={{ color: '#1db954', marginTop: 8 }}>✅ Connected — device_id: {player.deviceId}</p>
      )}

      <NowPlaying track={player.track} paused={player.paused} />

      <FolderPicker onFolderSelected={() => {}} />

      {player.ready && !capturing && (
        <button
          onClick={startCapture}
          style={{ background: '#1db954', border: 'none', padding: '8px 20px',
                   borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', marginTop: 8 }}
        >
          Start WASAPI Capture
        </button>
      )}
      {capturing    && <p style={{ color: '#1db954', marginTop: 8 }}>✅ Capturing — play a track</p>}
      {captureError && <p style={{ color: '#e74c3c' }}>❌ {captureError}</p>}

      <SpectrumCanvas bins={bins} />
      <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
        FFT: {bins.reduce((a, b) => a + Math.max(0, b + 100), 0).toFixed(0)} energy units
      </p>
    </div>
  )
}
```

**Note:** `__spotifyPlayer` must be set on `window` when the player is created. Update `useSpotifyPlayer.ts` to do:
```typescript
// After `player.connect()`:
(window as any).__spotifyPlayer = player
```
Add this line in `app/src/hooks/useSpotifyPlayer.ts` just after `player.connect()`.

- [ ] **Step 3: Add `asset://` protocol permission to capabilities**

The display window needs to serve local files. Update `app/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability",
  "windows": ["control", "display"],
  "permissions": [
    "core:default",
    "core:asset:default",
    "shell:default",
    "deep-link:default",
    "dialog:default"
  ]
}
```

- [ ] **Step 4: Run and verify full slideshow + beat sync flow**

```bash
cd app && npm run tauri dev
```

Manual verification checklist:
- [ ] Control panel: click "Select Photo Folder" → folder dialog opens → select a folder with 3+ images.
- [ ] Display window: shows first photo after folder is selected.
- [ ] Control panel: connect Spotify, play a track on the Party Display device.
- [ ] Display window: photos change on beats (roughly in time with the music — varies by track's beat confidence scores).
- [ ] Change track in Spotify → beat scheduler reschedules for the new track.
- [ ] Add a new image to the watched folder → `photo-list` updates, new image enters the queue on the next shuffle cycle.

- [ ] **Step 5: Commit**

```bash
git add app/src/windows/ app/src/hooks/useSpotifyPlayer.ts app/src-tauri/capabilities/default.json
git commit -m "feat: wire slideshow + beat scheduler into both windows, asset protocol"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Folder selection UI | Task 2 (`FolderPicker`) |
| Rust folder watcher (notify) | Task 1 (`slideshow.rs`) |
| Photo list emitted to frontend | Task 1 (`photo-list` event) |
| Shuffled photo queue | Task 3 (`usePhotoLibrary`) |
| Spotify Audio Analysis fetch | Task 4 (`audio-analysis.ts`) |
| Beat-synchronized photo transitions | Task 4 (`useBeatScheduler`) |
| `photo-advance` event to display | Task 4 (`emit('photo-advance')`) |
| Display window listens + advances | Task 5 (`useDisplaySync`) |
| CSS crossfade transition | Task 5 (`SlideshowView`) |
| Display window shows photos | Task 6 (DisplayWindow) |
| Beat scheduler resets on track change | Task 4 (useEffect dep on `track.id`) |
| Reschedules every 10s window | Task 4 (`WINDOW_MS` constant) |

**No placeholders.** All steps contain complete code.

**Type consistency:**
- `usePhotoLibrary` returns `{ advance: () => void }`, `useDisplaySync` accepts `advance: () => void` ✅
- `useBeatScheduler(track: TrackInfo | null, ...)` — `TrackInfo` imported from `useSpotifyPlayer` ✅
- `watch_folder` Rust command takes `folder_path: String` matching `invoke('watch_folder', { folderPath: selected })` (Tauri camelCase → snake_case conversion is automatic) ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-28-plan3-slideshow-beat-sync.md`.

**Depends on Plan 2 being complete (player, FFT, auth all working).**

Which execution approach — subagent-driven or inline?
