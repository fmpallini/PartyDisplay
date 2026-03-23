# Tauri SDK Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate that Spotify Web Playback SDK works in Tauri's WebView2 and that WASAPI loopback from the Rust backend can capture system audio and stream real-time FFT data to the frontend.

**Architecture:** Minimal Tauri v2 app with a single window. Rust backend captures system audio via WASAPI loopback, runs FFT with `rustfft`, and emits frequency bins to the frontend over Tauri events. Frontend loads the Spotify Web Playback SDK, accepts a pasted token, and renders a live spectrum canvas using the Tauri event data. No automated tests — manual validation checklist at the end.

**Tech Stack:** Tauri 2, Rust, cpal 0.15 (WASAPI loopback), rustfft 6, Spotify Web Playback SDK, plain HTML/JS (no build step)

---

## Prerequisites (human action required before starting)

1. Install Rust: `winget install Rustlang.Rustup` → `rustup default stable`
2. Confirm WebView2 is installed (pre-installed on Windows 11 — check via `winget list Microsoft.EdgeWebView2Runtime`)
3. Install VS Build Tools with "Desktop development with C++" workload (required by Rust on Windows)
4. Node.js already installed (confirmed)

---

## File Map

**spike-tauri/**
- Create: `spike-tauri/.gitignore` — ignore build artifacts and node_modules
- Create: `spike-tauri/package.json` — npm scripts wrapping Tauri CLI
- Create: `spike-tauri/index.html` — frontend: SDK player + paste-token form + spectrum canvas
- Create: `spike-tauri/src-tauri/Cargo.toml` — Rust deps: tauri 2, cpal, rustfft, serde
- Create: `spike-tauri/src-tauri/build.rs` — Tauri build script (boilerplate)
- Create: `spike-tauri/src-tauri/tauri.conf.json` — Tauri v2 config: window, CSP off, withGlobalTauri
- Create: `spike-tauri/src-tauri/capabilities/default.json` — Tauri v2 capability grant for core APIs
- Create: `spike-tauri/src-tauri/src/main.rs` — Tauri app entry + `start_audio_capture` command + WASAPI loopback + FFT

---

## Phase 1 — Scaffold

> Purpose: get `npm run dev` compiling and opening a blank window before touching any feature code.

### Task 1: Create project scaffold

**Files:**
- Create: `spike-tauri/.gitignore`
- Create: `spike-tauri/package.json`
- Create: `spike-tauri/src-tauri/Cargo.toml`
- Create: `spike-tauri/src-tauri/build.rs`
- Create: `spike-tauri/src-tauri/tauri.conf.json`
- Create: `spike-tauri/src-tauri/capabilities/default.json`

- [ ] **Step 1: Create `spike-tauri/.gitignore`**

```
node_modules/
src-tauri/target/
src-tauri/gen/
```

- [ ] **Step 2: Create `spike-tauri/package.json`**

```json
{
  "name": "spike-tauri",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  }
}
```

- [ ] **Step 3: Create `spike-tauri/src-tauri/Cargo.toml`**

```toml
[package]
name = "party-display-spike"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri    = { version = "2", features = ["devtools"] }
serde    = { version = "1", features = ["derive"] }
serde_json = "1"
cpal     = "0.15"
rustfft  = "6"
```

- [ ] **Step 4: Create `spike-tauri/src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5: Create `spike-tauri/src-tauri/tauri.conf.json`**

```json
{
  "productName": "party-display-spike",
  "version": "0.0.1",
  "identifier": "com.partydisplay.spike",
  "build": {
    "frontendDist": ".."
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "label": "main",
        "title": "Party Display Spike — Tauri",
        "width": 1000,
        "height": 750
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": false
  }
}
```

- [ ] **Step 6: Create `spike-tauri/src-tauri/capabilities/default.json`**

```json
{
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default"
  ]
}
```

- [ ] **Step 7: Create a minimal `spike-tauri/src-tauri/src/main.rs` to verify the scaffold compiles**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 8: Create a placeholder `spike-tauri/index.html`**

```html
<!DOCTYPE html>
<html><body style="background:#111;color:#eee;font-family:monospace;padding:20px">
  <h2 style="color:#1db954">Party Display Spike — Tauri</h2>
  <p>Scaffold OK</p>
</body></html>
```

- [ ] **Step 9: Install npm deps and verify it opens**

```bash
cd spike-tauri
npm install
npm run dev
```

Expected: Tauri window opens showing "Scaffold OK". Rust compiles without errors (first build takes a few minutes).

- [ ] **Step 10: Commit**

```bash
git add spike-tauri/
git commit -m "feat(spike-tauri): scaffold — Tauri v2 compiles and opens window"
```

---

## Phase 2 — Rust Backend: WASAPI Loopback + FFT

> Purpose: validate that WASAPI loopback capture works and FFT data reaches the frontend.

### Task 2: WASAPI loopback command

**Files:**
- Modify: `spike-tauri/src-tauri/src/main.rs`

- [ ] **Step 1: Replace `main.rs` with the full implementation**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{FftPlanner, num_complex::Complex};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_audio_capture])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Called from the frontend to start WASAPI loopback capture.
/// Spawns a thread — returns immediately, capture runs indefinitely.
#[tauri::command]
fn start_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        if let Err(e) = run_loopback(app) {
            eprintln!("Loopback error: {e}");
        }
    });
    Ok(())
}

fn run_loopback(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let host = cpal::default_host();
    // On Windows, default_host() is WASAPI.
    // Calling build_input_stream on a RENDER device = loopback capture.
    let device = host
        .default_output_device()
        .ok_or("No default output device found")?;

    println!("Loopback device: {}", device.name().unwrap_or_default());

    let config   = device.default_output_config()?;
    let channels = config.channels() as usize;
    // Explicitly request F32 — avoids silent failure on devices that default to I16/I32.
    let stream_config = cpal::StreamConfig {
        channels:    config.channels(),
        sample_rate: config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    println!(
        "Stream config: {}Hz, {} channels (format forced to F32)",
        stream_config.sample_rate.0, channels
    );

    const FFT_SIZE: usize = 1024;
    const EMIT_BINS: usize = 64;

    let fft = Arc::new(FftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE));
    let sample_buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));

    let fft_ref   = fft.clone();
    let buf_ref   = sample_buf.clone();
    let app_clone = app.clone();

    let stream = device
        .build_input_stream::<f32, _, _>(
            &stream_config,
            move |data: &[f32], _| {
                let mut buf = buf_ref.lock().unwrap();

                // Mix interleaved channels down to mono
                for chunk in data.chunks(channels.max(1)) {
                    buf.push(chunk.iter().sum::<f32>() / chunk.len() as f32);
                }

                // Process every full FFT_SIZE window
                while buf.len() >= FFT_SIZE {
                    let block: Vec<f32> = buf.drain(..FFT_SIZE).collect();

                    // Apply Hann window and convert to complex
                    let mut input: Vec<Complex<f32>> = block
                        .iter()
                        .enumerate()
                        .map(|(i, &s)| {
                            let w = 0.5
                                * (1.0
                                    - (2.0 * std::f32::consts::PI * i as f32
                                        / (FFT_SIZE as f32 - 1.0))
                                        .cos());
                            Complex { re: s * w, im: 0.0 }
                        })
                        .collect();

                    fft_ref.process(&mut input);

                    // Magnitude in dB for the positive-frequency half
                    let mags: Vec<f32> = input[..FFT_SIZE / 2]
                        .iter()
                        .map(|c| {
                            let m = c.norm() / FFT_SIZE as f32;
                            if m > 1e-10 {
                                20.0 * m.log10()
                            } else {
                                -100.0
                            }
                        })
                        .collect();

                    // Downsample to EMIT_BINS by taking the max in each band
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

    // Park this thread — stream is kept alive by staying in scope
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd spike-tauri
npm run dev
```

Expected: compiles, window opens. No errors about missing traits or unknown crates.

- [ ] **Step 3: Commit**

```bash
git add spike-tauri/src-tauri/src/main.rs
git commit -m "feat(spike-tauri): WASAPI loopback + FFT command"
```

---

## Phase 3 — Frontend

> Purpose: Spotify SDK + paste-token flow + spectrum canvas wired to Tauri events.

### Task 3: Replace placeholder index.html

**Files:**
- Modify: `spike-tauri/index.html`

- [ ] **Step 1: Replace `spike-tauri/index.html` with the full frontend**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Party Display Spike — Tauri</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: monospace; padding: 20px; background: #111; color: #eee; margin: 0; }
    h2 { color: #1db954; margin: 0 0 16px; }
    button {
      background: #1db954; color: #000; border: none; border-radius: 20px;
      padding: 10px 24px; font-weight: bold; cursor: pointer; font-size: 14px;
      margin-right: 8px;
    }
    button:disabled { background: #444; color: #888; cursor: default; }
    .row { margin: 6px 0; }
    label { color: #aaa; }
    input[type=text] {
      width: 100%; padding: 8px; background: #222; color: #eee;
      border: 1px solid #444; border-radius: 4px; font-family: monospace; font-size: 13px;
    }
    canvas { display: block; width: 100%; height: 140px; background: #000; border-radius: 4px; margin: 12px 0; }
    pre {
      background: #1a1a1a; padding: 10px; border-radius: 4px;
      white-space: pre-wrap; max-height: 180px; overflow-y: auto; font-size: 12px;
    }
    #tokenForm { margin-bottom: 14px; }
    #tokenForm p { color: #aaa; margin: 0 0 6px; }
    a { color: #1db954; }
    code { background: #2a2a2a; padding: 1px 4px; border-radius: 3px; }
    .section { margin-top: 14px; }
  </style>
</head>
<body>
  <h2>Party Display Spike — Tauri</h2>

  <!-- ── Token form ── -->
  <div id="tokenForm">
    <p>
      Get a token at
      <a href="https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started"
         target="_blank">Spotify SDK docs</a>
      → <strong>Get token</strong> → scope: <code>streaming</code>
    </p>
    <input id="tokenInput" type="text" placeholder="Paste Spotify access token" />
    <button id="startBtn" style="margin-top:8px">Start Player</button>
  </div>

  <!-- ── Status ── -->
  <div class="row"><label>Status: </label><span id="status">Paste a token above.</span></div>
  <div class="row"><label>Track:  </label><span id="track">—</span></div>

  <!-- ── WASAPI capture ── -->
  <div class="section">
    <button id="captureBtn" disabled>Start WASAPI Capture</button>
    <span id="captureStatus" style="color:#aaa;font-size:13px">Start the player first</span>
  </div>

  <!-- ── Spectrum ── -->
  <canvas id="spectrum"></canvas>
  <div class="row"><label>FFT: </label><span id="fftLabel">—</span></div>

  <!-- ── Log ── -->
  <pre id="log"></pre>

  <script src="https://sdk.scdn.co/spotify-player.js"></script>

  <script>
    const $ = id => document.getElementById(id);

    const log = (...a) => {
      $('log').textContent += a.join(' ') + '\n';
      $('log').scrollTop = $('log').scrollHeight;
      console.log(...a);
    };

    // ── Spotify player ─────────────────────────────────────────────────────

    $('startBtn').addEventListener('click', () => {
      const token = $('tokenInput').value.trim();
      if (!token) { alert('Paste a token first.'); return; }
      $('tokenForm').style.display = 'none';
      log('Initialising Spotify player...');
      initPlayer(token);
    });

    function initPlayer(token) {
      window.onSpotifyWebPlaybackSDKReady = () => { log('SDK ready'); startPlayer(token); };
      if (window.Spotify) startPlayer(token);
    }

    function startPlayer(token) {
      const player = new Spotify.Player({
        name: 'Party Display Spike (Tauri)',
        getOAuthToken: cb => cb(token),
        volume: 0.5,
      });

      player.addListener('ready', ({ device_id }) => {
        $('status').textContent = `✅ Connected — device_id: ${device_id}`;
        log('ready — device_id:', device_id);
        $('captureBtn').disabled = false;
        $('captureStatus').textContent = 'Click to start WASAPI loopback';
      });

      player.addListener('not_ready',          ({ device_id }) => log('not_ready:', device_id));
      player.addListener('player_state_changed', state => {
        if (!state) return;
        const t = state.track_window.current_track;
        $('track').textContent = `${t.name} — ${t.artists.map(a => a.name).join(', ')}`;
        log('state:', t.name, state.paused ? '(paused)' : '(playing)', '| pos:', state.position);
      });
      player.addListener('initialization_error', e => log('init_error:', JSON.stringify(e)));
      player.addListener('authentication_error',  e => log('auth_error:', JSON.stringify(e)));
      player.addListener('account_error',         e => log('account_error:', JSON.stringify(e)));
      player.addListener('playback_error',        e => log('playback_error:', JSON.stringify(e)));

      player.connect().then(ok => log('connect result:', ok));
    }

    // ── WASAPI capture ──────────────────────────────────────────────────────

    $('captureBtn').addEventListener('click', async () => {
      $('captureBtn').disabled = true;
      $('captureStatus').textContent = 'Starting...';
      try {
        await window.__TAURI__.core.invoke('start_audio_capture');
        $('captureStatus').textContent = '✅ Capturing — play a track';
        log('WASAPI loopback started');
      } catch (e) {
        $('captureStatus').textContent = '❌ ' + e;
        $('captureBtn').disabled = false;
        log('Capture error:', e);
      }
    });

    // ── Spectrum visualiser ─────────────────────────────────────────────────

    const canvas  = $('spectrum');
    const ctx2d   = canvas.getContext('2d');

    // Resize canvas pixels to match CSS layout
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        canvas.width  = e.contentRect.width;
        canvas.height = e.contentRect.height;
      }
    });
    ro.observe(canvas);

    window.__TAURI__.event.listen('fft-data', ({ payload: bins }) => {
      const sum = bins.reduce((a, b) => a + Math.max(0, b + 100), 0);
      $('fftLabel').textContent = sum > 0
        ? `${sum.toFixed(0)} ✅ non-zero — WASAPI tap works!`
        : `${sum.toFixed(0)} (zero — play a track)`;

      const w = canvas.width, h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      const bw = w / bins.length;
      bins.forEach((db, i) => {
        const level  = Math.max(0, Math.min(1, (db + 100) / 100));
        const barH   = level * h;
        ctx2d.fillStyle = `hsl(${120 - level * 120}, 100%, 45%)`;
        ctx2d.fillRect(i * bw, h - barH, bw - 1, barH);
      });
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Run and confirm window looks right**

```bash
npm run dev
```

Expected: token form + disabled capture button visible. No JS console errors.

- [ ] **Step 3: Commit**

```bash
git add spike-tauri/index.html
git commit -m "feat(spike-tauri): frontend — SDK player + spectrum canvas + Tauri event wiring"
```

---

## Phase 4 — Manual Validation

> Run through this checklist and record results in `spike-tauri/notes.md`.

### Task 4: Validate each hypothesis

- [ ] **Step 1: Get a fresh Spotify token**

Go to: https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started
Click **Get token** → scope `streaming` → copy token (valid ~1 hour)

- [ ] **Step 2: Start the app**

```bash
cd spike-tauri && npm run dev
```

- [ ] **Step 3: Validate SDK + WebView2 + Widevine**

1. Paste token → click **Start Player**
2. In Spotify app (phone/desktop), look for device **"Party Display Spike (Tauri)"**
3. Select it and play a playlist
4. Confirm: music plays with no skipping, no `playback_error` in the log
5. Record in notes: `Widevine via WebView2: YES / NO`

- [ ] **Step 4: Validate WASAPI loopback**

1. While music plays, click **Start WASAPI Capture**
2. Watch the spectrum canvas — bars should animate in real time
3. Check the **FFT** row — should show a non-zero number
4. Record in notes: `WASAPI loopback FFT: YES (non-zero) / NO (zero or error)`

> **If Step 3 failed (no audio from Spotify — DRM blocked):** the two hypotheses are independent.
> Validate WASAPI loopback separately: open a YouTube video or play any system audio,
> then click **Start WASAPI Capture**. The spectrum should still animate from that audio source.
> Record: `WASAPI loopback (non-Spotify audio): YES / NO` — this confirms the Rust pipeline
> regardless of whether WebView2's Widevine passes Spotify's license check.

- [ ] **Step 5: Write `spike-tauri/notes.md`** with findings from both validations

- [ ] **Step 6: Commit results**

```bash
git add spike-tauri/
git commit -m "feat(spike-tauri): validated — record findings in notes.md"
```
