# Party Display — Plan 2: Playback & Spectrum

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Spotify Web Playback SDK into the React control panel so the app registers as a Spotify Connect device and begins receiving playback. Port the validated WASAPI FFT loopback from the spike into the production app and stream spectrum data to both windows.

**Architecture:** SDK initialised in the control window's WebView2 (same approach as the spike — paste-token replaced by `accessToken` from `useAuth`). The `device_id` emitted by the SDK is forwarded to Rust via IPC and stored in app state so other commands can use it. WASAPI loopback Rust code is ported verbatim from `spike-tauri/src-tauri/src/main.rs` into `app/src-tauri/src/audio.rs`; FFT bins are emitted as a Tauri event to all windows. A spectrum canvas component subscribes to the event in the control window.

**Tech Stack:** Spotify Web Playback SDK (CDN script tag) · Tauri events (`app.emit`) · cpal 0.15 · rustfft 6 · React hook for Tauri events · `<canvas>` 2D API

**Depends on:** Plan 1 complete (app scaffold and auth working).

---

## File Map

**Rust**
- Modify: `app/src-tauri/Cargo.toml` — add `cpal`, `rustfft`
- Create: `app/src-tauri/src/audio.rs` — WASAPI loopback + FFT (ported from spike)
- Modify: `app/src-tauri/src/main.rs` — register audio commands, inject SDK script tag

**Frontend**
- Create: `app/src/hooks/useSpotifyPlayer.ts` — SDK lifecycle hook (init, ready, state changes)
- Create: `app/src/hooks/useFftData.ts` — Tauri event listener for `fft-data`, returns bin array
- Create: `app/src/components/SpectrumCanvas.tsx` — `<canvas>` that draws FFT bins
- Create: `app/src/components/NowPlaying.tsx` — track name + artist display
- Modify: `app/src/windows/control/ControlPanel.tsx` — add player + spectrum + now-playing
- Modify: `app/index.html` — add Spotify SDK `<script>` tag

---

## Task 1: Add cpal + rustfft and port WASAPI audio module

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/src/audio.rs`
- Modify: `app/src-tauri/src/main.rs`

- [ ] **Step 1: Add audio dependencies to `app/src-tauri/Cargo.toml`**

Add under `[dependencies]`:

```toml
cpal    = "0.15"
rustfft = "6"
```

Full `[dependencies]` section should now read:

```toml
[dependencies]
tauri                  = { version = "2", features = ["devtools"] }
tauri-plugin-deep-link = "2"
tauri-plugin-shell     = "2"
serde                  = { version = "1", features = ["derive"] }
serde_json             = "1"
keyring                = "3"
cpal                   = "0.15"
rustfft                = "6"
```

- [ ] **Step 2: Create `app/src-tauri/src/audio.rs`**

This is a direct port of the validated spike code. The only changes are: use `tauri::AppHandle` passed in (same as spike), and wrap in a public command.

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

/// Called from the frontend to start WASAPI loopback capture.
/// Spawns a thread and returns immediately; capture runs for the app lifetime.
#[tauri::command]
pub fn start_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        if let Err(e) = run_loopback(app) {
            eprintln!("Loopback error: {e}");
        }
    });
    Ok(())
}

fn run_loopback(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let host   = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("No default output device")?;

    let config        = device.default_output_config()?;
    let channels      = config.channels() as usize;
    let stream_config = cpal::StreamConfig {
        channels:    config.channels(),
        sample_rate: config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    const FFT_SIZE:  usize = 1024;
    const EMIT_BINS: usize = 64;

    let fft        = Arc::new(FftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE));
    let sample_buf = Arc::new(Mutex::new(Vec::<f32>::new()));
    let fft_ref    = fft.clone();
    let buf_ref    = sample_buf.clone();
    let app_clone  = app.clone();

    let stream = device.build_input_stream::<f32, _, _>(
        &stream_config,
        move |data: &[f32], _| {
            let mut buf = buf_ref.lock().unwrap();
            for chunk in data.chunks(channels.max(1)) {
                buf.push(chunk.iter().sum::<f32>() / chunk.len() as f32);
            }
            while buf.len() >= FFT_SIZE {
                let block: Vec<f32> = buf.drain(..FFT_SIZE).collect();
                let mut input: Vec<Complex<f32>> = block
                    .iter()
                    .enumerate()
                    .map(|(i, &s)| {
                        let w = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32
                            / (FFT_SIZE as f32 - 1.0)).cos());
                        Complex { re: s * w, im: 0.0 }
                    })
                    .collect();
                fft_ref.process(&mut input);
                let mags: Vec<f32> = input[..FFT_SIZE / 2]
                    .iter()
                    .map(|c| {
                        let m = c.norm() / FFT_SIZE as f32;
                        if m > 1e-10 { 20.0 * m.log10() } else { -100.0 }
                    })
                    .collect();
                let step = (FFT_SIZE / 2) / EMIT_BINS;
                let bins: Vec<f32> = (0..EMIT_BINS)
                    .map(|i| {
                        mags[i * step..(i + 1) * step]
                            .iter()
                            .cloned()
                            .fold(f32::NEG_INFINITY, f32::max)
                    })
                    .collect();
                let _ = app_clone.emit("fft-data", &bins);
            }
        },
        |err| eprintln!("WASAPI stream error: {err}"),
        None,
    )
    .map_err(|e| format!("Failed to open loopback stream: {e}"))?;

    stream.play()?;
    println!("✅ WASAPI loopback capture started");
    loop { std::thread::sleep(std::time::Duration::from_secs(3600)); }
}
```

- [ ] **Step 3: Register the audio command in `app/src-tauri/src/main.rs`**

Replace the entire file:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod audio;

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
            audio::start_audio_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Verify Rust compiles**

```bash
cd app/src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Compiling party-display ...` then `Finished`. No errors.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/
git commit -m "feat: port WASAPI FFT audio module from spike to production app"
```

---

## Task 2: Spotify SDK script injection

**Files:**
- Modify: `app/index.html`

The SDK must be loaded as a `<script>` tag — it cannot be imported as an npm module. It attaches itself to `window.Spotify` and calls `window.onSpotifyWebPlaybackSDKReady` when ready.

- [ ] **Step 1: Add SDK script to `app/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Party Display</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="https://sdk.scdn.co/spotify-player.js"></script>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Add Spotify SDK type declaration**

Create `app/src/spotify-sdk.d.ts`:

```typescript
// Minimal type declarations for the Spotify Web Playback SDK (CDN global)

interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: 'ready',                  cb: (data: { device_id: string }) => void): boolean
  addListener(event: 'not_ready',              cb: (data: { device_id: string }) => void): boolean
  addListener(event: 'player_state_changed',   cb: (state: SpotifyPlaybackState | null) => void): boolean
  addListener(event: 'initialization_error',   cb: (e: { message: string }) => void): boolean
  addListener(event: 'authentication_error',   cb: (e: { message: string }) => void): boolean
  addListener(event: 'account_error',          cb: (e: { message: string }) => void): boolean
  addListener(event: 'playback_error',         cb: (e: { message: string }) => void): boolean
}

interface SpotifyPlayerOptions {
  name: string
  getOAuthToken: (cb: (token: string) => void) => void
  volume?: number
}

interface SpotifyPlaybackState {
  paused: boolean
  position: number
  track_window: {
    current_track: {
      id: string
      name: string
      artists: Array<{ name: string }>
      album: { name: string; images: Array<{ url: string }> }
    }
  }
}

interface Window {
  Spotify: { Player: new (opts: SpotifyPlayerOptions) => SpotifyPlayer }
  onSpotifyWebPlaybackSDKReady: () => void
}
```

- [ ] **Step 3: Commit**

```bash
git add app/index.html app/src/spotify-sdk.d.ts
git commit -m "feat: load Spotify Web Playback SDK via script tag, add type declarations"
```

---

## Task 3: Spotify player hook

**Files:**
- Create: `app/src/hooks/useSpotifyPlayer.ts`

- [ ] **Step 1: Create `app/src/hooks/useSpotifyPlayer.ts`**

```typescript
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface TrackInfo {
  id:      string
  name:    string
  artists: string
  albumArt: string
}

export interface PlayerState {
  ready:     boolean
  deviceId:  string | null
  track:     TrackInfo | null
  paused:    boolean
  error:     string | null
}

export function useSpotifyPlayer(accessToken: string | null) {
  const [state, setState] = useState<PlayerState>({
    ready: false, deviceId: null, track: null, paused: true, error: null,
  })
  const playerRef = useRef<SpotifyPlayer | null>(null)

  useEffect(() => {
    if (!accessToken) return

    function initPlayer() {
      const player = new window.Spotify.Player({
        name: 'Party Display',
        getOAuthToken: (cb) => cb(accessToken!),
        volume: 0.8,
      })

      player.addListener('ready', ({ device_id }) => {
        setState(s => ({ ...s, ready: true, deviceId: device_id, error: null }))
        // Notify Rust of the device_id for future API calls
        invoke('set_device_id', { deviceId: device_id }).catch(console.error)
      })

      player.addListener('not_ready', ({ device_id }) => {
        console.warn('Player not ready, device_id:', device_id)
        setState(s => ({ ...s, ready: false }))
      })

      player.addListener('player_state_changed', (playbackState) => {
        if (!playbackState) return
        const t = playbackState.track_window.current_track
        setState(s => ({
          ...s,
          paused: playbackState.paused,
          track: {
            id:       t.id,
            name:     t.name,
            artists:  t.artists.map(a => a.name).join(', '),
            albumArt: t.album.images[0]?.url ?? '',
          },
        }))
      })

      player.addListener('initialization_error', e => setState(s => ({ ...s, error: `Init: ${e.message}` })))
      player.addListener('authentication_error',  e => setState(s => ({ ...s, error: `Auth: ${e.message}` })))
      player.addListener('account_error',         e => setState(s => ({ ...s, error: `Account: ${e.message}` })))
      player.addListener('playback_error',        e => setState(s => ({ ...s, error: `Playback: ${e.message}` })))

      player.connect()
      playerRef.current = player
    }

    if (window.Spotify) {
      initPlayer()
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer
    }

    return () => {
      playerRef.current?.disconnect()
      playerRef.current = null
    }
  }, [accessToken])

  return state
}
```

- [ ] **Step 2: Add `set_device_id` command to Rust**

Add to `app/src-tauri/src/main.rs` — first add a shared state type. Replace the entire file:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod audio;

use std::sync::Mutex;

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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            set_device_id,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
            audio::start_audio_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd app/src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/main.rs app/src/hooks/useSpotifyPlayer.ts
git commit -m "feat: Spotify player hook with device_id IPC, playback state tracking"
```

---

## Task 4: FFT event hook and spectrum canvas

**Files:**
- Create: `app/src/hooks/useFftData.ts`
- Create: `app/src/components/SpectrumCanvas.tsx`

- [ ] **Step 1: Create `app/src/hooks/useFftData.ts`**

```typescript
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export function useFftData(): number[] {
  const [bins, setBins] = useState<number[]>(new Array(64).fill(-100))

  useEffect(() => {
    const unlisten = listen<number[]>('fft-data', ({ payload }) => setBins(payload))
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return bins
}
```

- [ ] **Step 2: Create `app/src/components/SpectrumCanvas.tsx`**

```tsx
import { useEffect, useRef } from 'react'

interface Props {
  bins: number[]
  height?: number
}

export default function SpectrumCanvas({ bins, height = 140 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const bw = w / bins.length
    bins.forEach((db, i) => {
      const level = Math.max(0, Math.min(1, (db + 100) / 100))
      const barH  = level * h
      ctx.fillStyle = `hsl(${120 - level * 120}, 100%, 45%)`
      ctx.fillRect(i * bw, h - barH, bw - 1, barH)
    })
  }, [bins])

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={height}
      style={{ display: 'block', width: '100%', height, background: '#000', borderRadius: 4 }}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useFftData.ts app/src/components/SpectrumCanvas.tsx
git commit -m "feat: FFT event hook and spectrum canvas component"
```

---

## Task 5: Now Playing component

**Files:**
- Create: `app/src/components/NowPlaying.tsx`

- [ ] **Step 1: Create `app/src/components/NowPlaying.tsx`**

```tsx
import type { TrackInfo } from '../hooks/useSpotifyPlayer'

interface Props { track: TrackInfo | null; paused: boolean }

export default function NowPlaying({ track, paused }: Props) {
  if (!track) return <p style={{ color: '#666', fontSize: 13 }}>No track playing — open Spotify and select this device.</p>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
      {track.albumArt && (
        <img src={track.albumArt} alt="album art" width={48} height={48} style={{ borderRadius: 4 }} />
      )}
      <div>
        <p style={{ margin: 0, fontWeight: 'bold', color: '#eee', fontSize: 14 }}>
          {paused ? '⏸' : '▶'} {track.name}
        </p>
        <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>{track.artists}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/NowPlaying.tsx
git commit -m "feat: NowPlaying component — album art, track name, artist, pause state"
```

---

## Task 6: Wire everything into ControlPanel

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx`

- [ ] **Step 1: Replace `app/src/windows/control/ControlPanel.tsx`**

```tsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import LoginButton from '../../components/LoginButton'
import NowPlaying from '../../components/NowPlaying'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { useAuth } from '../../hooks/useAuth'
import { useFftData } from '../../hooks/useFftData'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error: authError, login, logout } = useAuth()
  const player = useSpotifyPlayer(authenticated ? accessToken : null)
  const bins   = useFftData()
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

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

      <LoginButton
        authenticated={authenticated}
        loading={loading}
        onLogin={login}
        onLogout={logout}
      />

      {authError    && <p style={{ color: '#e74c3c' }}>❌ Auth: {authError}</p>}
      {player.error && <p style={{ color: '#e74c3c' }}>❌ Player: {player.error}</p>}

      {authenticated && player.ready && (
        <p style={{ color: '#1db954', marginTop: 8 }}>
          ✅ Connected — device_id: {player.deviceId}
        </p>
      )}

      <NowPlaying track={player.track} paused={player.paused} />

      {player.ready && !capturing && (
        <button
          onClick={startCapture}
          style={{ background: '#1db954', border: 'none', padding: '8px 20px', borderRadius: 4,
                   cursor: 'pointer', fontWeight: 'bold', marginTop: 8 }}
        >
          Start WASAPI Capture
        </button>
      )}
      {capturing && <p style={{ color: '#1db954', marginTop: 8 }}>✅ Capturing — play a track</p>}
      {captureError && <p style={{ color: '#e74c3c' }}>❌ {captureError}</p>}

      <SpectrumCanvas bins={bins} />
      <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
        FFT: {bins.reduce((a, b) => a + Math.max(0, b + 100), 0).toFixed(0)} energy units
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Run and verify full playback + spectrum flow**

```bash
cd app && npm run tauri dev
```

Manual verification checklist:
- [ ] "Connect Spotify" button visible.
- [ ] Click Connect → complete OAuth → button changes to "Disconnect Spotify".
- [ ] `✅ Connected — device_id: <id>` appears.
- [ ] Open Spotify on phone/desktop → "Party Display" appears as a device → select it and play a track.
- [ ] Track name, artist and album art appear in NowPlaying.
- [ ] Click "Start WASAPI Capture" → button disappears, `✅ Capturing` shown.
- [ ] Spectrum bars animate in real time with the music.
- [ ] FFT energy number is non-zero while music plays.

- [ ] **Step 3: Commit**

```bash
git add app/src/windows/control/ControlPanel.tsx
git commit -m "feat: wire playback + spectrum + now-playing into ControlPanel"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Spotify Web Playback SDK in WebView2 | Task 2 (script tag) + Task 3 (hook) |
| Device registered as Spotify Connect | Task 3 (`useSpotifyPlayer` → `ready` event) |
| `device_id` stored in Rust state | Task 3 (`set_device_id` command) |
| Now-playing track info | Task 5 (`NowPlaying` component) |
| WASAPI loopback ported from spike | Task 1 (`audio.rs`) |
| FFT bins → Tauri event → frontend | Task 1 (same emit pattern as spike) |
| Spectrum canvas | Task 4 (`SpectrumCanvas`) |
| Start capture button | Task 6 (ControlPanel) |

**No placeholders.** All steps contain complete code.

**Type consistency:**
- `useFftData` returns `number[]`, `SpectrumCanvas` accepts `bins: number[]` ✅
- `useSpotifyPlayer` returns `PlayerState` with `track: TrackInfo | null`, `NowPlaying` accepts `track: TrackInfo | null` ✅
- `invoke('set_device_id', { deviceId: device_id })` matches Rust `fn set_device_id(device_id: String)` ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-28-plan2-playback-spectrum.md`.

**Depends on Plan 1 being complete and all auth working.**

Which execution approach — subagent-driven or inline?
