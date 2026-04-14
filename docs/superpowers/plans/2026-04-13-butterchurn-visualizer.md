# Butterchurn Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canvas spectrum analyser with a full MilkDrop-style Butterchurn visualizer that renders in the display window in three modes: photos-only, visualizer-only, and split (photos + visualizer side by side).

**Architecture:** Butterchurn runs entirely in the WebView2 frontend as a WebGL canvas. Audio is sourced from WASAPI loopback (already in Rust) — the backend now emits raw PCM chunks instead of FFT bins. An AudioWorklet bridges the Tauri event stream into the Web Audio graph that Butterchurn reads from. The display window owns the visualizer mode state, which cycles via the `M` hotkey and propagates through the existing display-settings-changed event.

**Tech Stack:** Butterchurn (WebGL MilkDrop), butterchurn-presets (bundled preset extraction), AudioWorklet API, Tauri v2 events, Rust/cpal WASAPI loopback.

---

> **Hotkey note:** `P` is already bound to photo counter toggle throughout the codebase. This plan uses `N` for "next preset" instead of the `P` mentioned in the brainstorm.
>
> **audio capture note:** `start_audio_capture` is currently only called when the Spotify player is ready, which means DLNA and local audio skip it. This plan also calls it from `DisplayWindow` on mount (the command is idempotent — safe to call multiple times).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `presets/*.json` (20 files at repo root) | Bundled presets extracted from butterchurn-presets |
| Create | `app/scripts/extract-presets.mjs` | One-time script to produce the JSON preset files |
| Create | `app/public/pcm-injector-processor.js` | AudioWorklet ring-buffer processor |
| Create | `app/src/butterchurn.d.ts` | TypeScript module declaration for butterchurn |
| Create | `app/src/hooks/useVisualizer.ts` | AudioContext + Butterchurn instance + PCM events + preset cycling |
| Create | `app/src/components/VisualizerCanvas.tsx` | Canvas element with resize observer; uses useVisualizer |
| Modify | `app/src-tauri/src/audio.rs` | Remove FFT; emit 512-sample raw PCM chunks as `pcm-data` |
| Modify | `app/src-tauri/Cargo.toml` | Remove `rustfft` dependency |
| Modify | `app/src-tauri/src/main.rs` | Register `get_presets` command |
| Create | `app/src-tauri/src/presets.rs` | `get_presets` Tauri command |
| Modify | `app/src/lib/storage-keys.ts` | Remove spectrum keys; add visualizer keys |
| Modify | `app/src/components/DisplaySettingsPanel.tsx` | Remove spectrum types/fields/UI; add visualizer types/fields/UI |
| Modify | `app/src/hooks/useHotkeys.ts` | Replace `onToggleSpectrum`→`onCycleVisualizerMode`; add `onNextPreset` |
| Modify | `app/src/windows/display/DisplayWindow.tsx` | Full visualizer integration: modes, M/N hotkeys, lyrics fallback, audio capture on mount |
| Modify | `app/src/windows/control/ControlPanel.tsx` | Remove spectrum; add presets state + visualizer section; update hotkey wiring |
| Modify | `app/src/components/HelpPanel.tsx` | Update hotkey reference: S→M (visualizer), add N (next preset) |
| Delete | `app/src/components/SpectrumCanvas.tsx` | Replaced by VisualizerCanvas |
| Delete | `app/src/hooks/useFftData.ts` | Replaced by PCM events in useVisualizer |

---

## Task 1 — Install Butterchurn packages

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Install packages**

```bash
cd app
npm install butterchurn butterchurn-presets
```

- [ ] **Step 2: Verify TypeScript can see them**

```bash
cd app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (butterchurn doesn't ship types yet — we add them in Task 8).

- [ ] **Step 3: Commit**

```bash
cd app
git add package.json package-lock.json
git commit -m "chore: install butterchurn and butterchurn-presets"
```

---

## Task 2 — Extract 20 bundled presets

**Files:**
- Create: `app/scripts/extract-presets.mjs`
- Create: `presets/*.json` (20 files at repo root `c:\Users\fmpal\vcup2\presets\`)

- [ ] **Step 1: Create the extraction script**

Create `app/scripts/extract-presets.mjs`:

```js
// Run from the app/ directory: node scripts/extract-presets.mjs
import butterchurnPresets from 'butterchurn-presets'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', '..', 'presets')
fs.mkdirSync(outDir, { recursive: true })

const allPresets = butterchurnPresets.getPresets()
const names = Object.keys(allPresets).slice(0, 20)

for (const name of names) {
  // Strip characters that are invalid in Windows filenames
  const filename = name.replace(/[/\\?%*:|"<>]/g, '_') + '.json'
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(allPresets[name]))
  console.log('  wrote', filename)
}

console.log(`\nExtracted ${names.length} presets to ${outDir}`)
```

- [ ] **Step 2: Run the script**

```bash
cd app
node scripts/extract-presets.mjs
```

Expected output:
```
  wrote <name1>.json
  wrote <name2>.json
  ...
Extracted 20 presets to ...\vcup2\presets
```

Verify: `ls ../presets/*.json | wc -l` should print `20`.

- [ ] **Step 3: Commit the presets and script**

```bash
git add presets/ app/scripts/extract-presets.mjs
git commit -m "feat: add 20 bundled MilkDrop presets from butterchurn-presets"
```

---

## Task 3 — Add visualizer keys to storage-keys.ts

**Files:**
- Modify: `app/src/lib/storage-keys.ts`

- [ ] **Step 1: Add three new keys** (keep spectrum keys — they're removed in Task 14)

Open `app/src/lib/storage-keys.ts`. After the `// Spectrum analyser` block (lines 29-32), add a new block:

```typescript
  // Visualizer
  visualizerMode:        'pd_visualizer_mode',
  visualizerSplitSide:   'pd_visualizer_split_side',
  visualizerPresetIndex: 'pd_visualizer_preset_index',
```

- [ ] **Step 2: Verify build**

```bash
cd app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/storage-keys.ts
git commit -m "feat: add visualizer storage keys"
```

---

## Task 4 — Add visualizer fields to DisplaySettings (additive)

**Files:**
- Modify: `app/src/components/DisplaySettingsPanel.tsx`

At this point we add new fields only — spectrum fields stay until Task 14.

- [ ] **Step 1: Add new types and constants**

After line 5 (`export type { SpectrumTheme, SpectrumStyle }`), add:

```typescript
export type VisualizerMode = 'photos' | 'visualizer' | 'split'

const VISUALIZER_MODE_VALUES  = ['photos', 'visualizer', 'split'] as const
const VISUALIZER_SIDE_VALUES  = ['left', 'right'] as const
```

- [ ] **Step 2: Add new fields to the DisplaySettings interface**

Inside the `DisplaySettings` interface, after `spectrumHeightPct: number`, add:

```typescript
  visualizerMode:        VisualizerMode
  visualizerSplitSide:   'left' | 'right'
  visualizerPresetIndex: number
```

- [ ] **Step 3: Add new fields to readDisplaySettings**

Inside `readDisplaySettings()`, after the `spectrumHeightPct` line, add:

```typescript
    visualizerMode:        safeEnum(localStorage.getItem(KEYS.visualizerMode),        VISUALIZER_MODE_VALUES,  'photos'),
    visualizerSplitSide:   safeEnum(localStorage.getItem(KEYS.visualizerSplitSide),   VISUALIZER_SIDE_VALUES,  'right'),
    visualizerPresetIndex: safeNum(localStorage.getItem(KEYS.visualizerPresetIndex),  0),
```

- [ ] **Step 4: Verify build**

```bash
cd app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (new fields have defaults; existing code ignores them).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/DisplaySettingsPanel.tsx
git commit -m "feat: add visualizerMode/splitSide/presetIndex to DisplaySettings"
```

---

## Task 5 — Replace FFT with raw PCM emission in Rust

**Files:**
- Modify: `app/src-tauri/src/audio.rs`
- Modify: `app/src-tauri/Cargo.toml`

- [ ] **Step 1: Rewrite audio.rs**

Replace the entire contents of `app/src-tauri/src/audio.rs` with:

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

/// True while a loopback capture thread is running.
static CAPTURE_RUNNING: AtomicBool = AtomicBool::new(false);

/// Called from the frontend to start WASAPI loopback capture.
/// Spawns a thread and returns immediately. Safe to call multiple times.
#[tauri::command]
pub fn start_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    if CAPTURE_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(()); // Already running.
    }
    std::thread::spawn(move || {
        if let Err(e) = run_loopback(app.clone()) {
            eprintln!("Loopback error: {e}");
            let _ = app.emit("audio-capture-error", e.to_string());
        }
        CAPTURE_RUNNING.store(false, Ordering::SeqCst);
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

    const CHUNK_SIZE: usize = 512;

    let sample_buf = Arc::new(Mutex::new(Vec::<f32>::new()));
    let buf_ref    = sample_buf.clone();
    let app_clone  = app.clone();

    let stream = device.build_input_stream::<f32, _, _>(
        &stream_config,
        move |data: &[f32], _| {
            let mut buf = buf_ref.lock().unwrap_or_else(|e| e.into_inner());
            // Mix down to mono
            for chunk in data.chunks(channels.max(1)) {
                buf.push(chunk.iter().sum::<f32>() / chunk.len() as f32);
            }
            // Emit in 512-sample chunks
            while buf.len() >= CHUNK_SIZE {
                let chunk: Vec<f32> = buf.drain(..CHUNK_SIZE).collect();
                let _ = app_clone.emit("pcm-data", &chunk);
            }
        },
        |err| eprintln!("WASAPI stream error: {err}"),
        None,
    )
    .map_err(|e| format!("Failed to open loopback stream: {e}"))?;

    stream.play()?;
    println!("✅ WASAPI loopback capture started (PCM mode)");
    loop { std::thread::sleep(std::time::Duration::from_secs(3600)); }
}
```

- [ ] **Step 2: Remove rustfft from Cargo.toml**

In `app/src-tauri/Cargo.toml`, delete the line:
```toml
rustfft    = "6"
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd app
npm run tauri build -- --no-bundle 2>&1 | tail -20
```

Expected: `Finished` with no errors. (Build may take a minute.)

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/audio.rs app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock
git commit -m "feat(audio): emit raw PCM chunks instead of FFT bins; remove rustfft"
```

---

## Task 6 — Add get_presets Tauri command

**Files:**
- Create: `app/src-tauri/src/presets.rs`
- Modify: `app/src-tauri/src/main.rs`

- [ ] **Step 1: Create presets.rs**

Create `app/src-tauri/src/presets.rs`:

```rust
use std::path::PathBuf;

/// Returns the path to the presets folder.
///
/// Release: looks for `presets/` next to the executable.
/// Dev:     falls back to `<CARGO_MANIFEST_DIR>/../../presets` (repo root).
fn presets_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        let candidate = exe
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("presets");
        if candidate.exists() {
            return candidate;
        }
    }
    // Compile-time fallback for dev builds: repo root / presets
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("presets")
}

#[derive(serde::Serialize)]
pub struct PresetFile {
    pub name:    String,
    pub content: String,
}

/// Reads all `.json` files from the presets folder next to the exe.
/// Returns each file's name (without extension) and raw content string.
#[tauri::command]
pub fn get_presets() -> Vec<PresetFile> {
    let dir = presets_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        eprintln!("presets dir not found: {}", dir.display());
        return vec![];
    };
    let mut presets: Vec<PresetFile> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let path = e.path();
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let content = std::fs::read_to_string(&path).ok()?;
            Some(PresetFile { name, content })
        })
        .collect();
    presets.sort_by(|a, b| a.name.cmp(&b.name));
    presets
}
```

- [ ] **Step 2: Register the module and command in main.rs**

In `app/src-tauri/src/main.rs`, add `mod presets;` after the other `mod` declarations (around line 7):

```rust
mod presets;
```

Then add `presets::get_presets` to the `invoke_handler` list (after `clear_webview_data,`):

```rust
            presets::get_presets,
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd app
npm run tauri build -- --no-bundle 2>&1 | tail -10
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/presets.rs app/src-tauri/src/main.rs
git commit -m "feat(presets): add get_presets Tauri command"
```

---

## Task 7 — Create AudioWorklet PCM ring-buffer processor

**Files:**
- Create: `app/public/pcm-injector-processor.js`

The worklet bridges Tauri's `pcm-data` events (arriving on the main thread) into the Web Audio render thread. It uses a ring buffer to absorb timing jitter.

- [ ] **Step 1: Create the file**

Create `app/public/pcm-injector-processor.js`:

```js
// AudioWorklet processor that accepts PCM samples posted from the main thread
// and outputs them into the Web Audio render graph for Butterchurn to analyse.
class PcmInjectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // Ring buffer: holds ~185 ms of audio at 44.1 kHz (8192 samples)
    this._buf       = new Float32Array(8192)
    this._writePos  = 0
    this._readPos   = 0
    this._available = 0

    this.port.onmessage = ({ data }) => {
      // data is a Float32Array of 512 samples sent from the main thread
      for (let i = 0; i < data.length; i++) {
        this._buf[this._writePos] = data[i]
        this._writePos = (this._writePos + 1) % this._buf.length
        if (this._available < this._buf.length) {
          this._available++
        } else {
          // Overflow: advance read pointer (drop oldest sample)
          this._readPos = (this._readPos + 1) % this._buf.length
        }
      }
    }
  }

  process(_inputs, outputs) {
    const ch = outputs[0]?.[0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      if (this._available > 0) {
        ch[i] = this._buf[this._readPos]
        this._readPos   = (this._readPos + 1) % this._buf.length
        this._available--
      } else {
        ch[i] = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-injector-processor', PcmInjectorProcessor)
```

- [ ] **Step 2: Verify the file is accessible**

Start the dev server and confirm the file is reachable:

```bash
cd app
npm run dev &
curl -s http://localhost:1420/pcm-injector-processor.js | head -3
```

Expected: first line of the file is printed. Kill the dev server (`kill %1`).

- [ ] **Step 3: Commit**

```bash
git add app/public/pcm-injector-processor.js
git commit -m "feat: add pcm-injector AudioWorklet processor"
```

---

## Task 8 — Add TypeScript declarations for butterchurn

**Files:**
- Create: `app/src/butterchurn.d.ts`

- [ ] **Step 1: Create the declaration file**

Create `app/src/butterchurn.d.ts`:

```typescript
declare module 'butterchurn' {
  export interface Visualizer {
    connectAudio(sourceNode: AudioNode): void
    loadPreset(preset: Record<string, unknown>, blendTime: number): void
    render(): void
    setRendererSize(width: number, height: number): void
  }

  export interface ButterchurnStatic {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      options: { width: number; height: number },
    ): Visualizer
  }

  const butterchurn: ButterchurnStatic
  export default butterchurn
}
```

- [ ] **Step 2: Verify build**

```bash
cd app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/butterchurn.d.ts
git commit -m "feat: add TypeScript declarations for butterchurn"
```

---

## Task 9 — Create useVisualizer hook

**Files:**
- Create: `app/src/hooks/useVisualizer.ts`

- [ ] **Step 1: Create the hook**

Create `app/src/hooks/useVisualizer.ts`:

```typescript
import { useEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * Manages the Butterchurn visualizer lifecycle for a given canvas element.
 * Creates an AudioContext + AudioWorklet on mount, loads presets from the
 * Tauri `get_presets` command, feeds incoming `pcm-data` events into the
 * worklet, and drives Butterchurn's render loop.
 *
 * Preset cycling is driven externally: the caller passes a new `presetIndex`
 * prop and the hook syncs with a 2.7-second blend transition.
 */
export function useVisualizer(
  canvasRef: RefObject<HTMLCanvasElement>,
  presetIndex: number,
) {
  const vizRef           = useRef<import('butterchurn').Visualizer | null>(null)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const workletRef       = useRef<AudioWorkletNode | null>(null)
  const rafRef           = useRef<number>(0)
  // Track which preset index was last loaded so we can distinguish first
  // load (blend=0) from user-driven changes (blend=2.7 seconds).
  const lastLoadedRef    = useRef<number>(-1)
  const [presets, setPresets] = useState<{ name: string; data: Record<string, unknown> }[]>([])

  // Load preset list once on mount
  useEffect(() => {
    invoke<{ name: string; content: string }[]>('get_presets')
      .then(raw => {
        const loaded = raw
          .filter(({ content }) => {
            try { JSON.parse(content); return true } catch { return false }
          })
          .map(({ name, content }) => ({ name, data: JSON.parse(content) as Record<string, unknown> }))
        setPresets(loaded)
      })
      .catch(e => console.error('[useVisualizer] get_presets failed:', e))
  }, [])

  // Initialize Butterchurn when canvas + presets are ready
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || presets.length === 0) return

    let cancelled = false

    async function init() {
      const butterchurn = (await import('butterchurn')).default
      const ctx = new AudioContext()
      audioCtxRef.current = ctx

      await ctx.audioWorklet.addModule('/pcm-injector-processor.js')
      if (cancelled) { ctx.close(); return }

      const worklet = new AudioWorkletNode(ctx, 'pcm-injector-processor')
      workletRef.current = worklet

      const viz = butterchurn.createVisualizer(ctx, canvas, {
        width:  canvas.width  || canvas.offsetWidth,
        height: canvas.height || canvas.offsetHeight,
      })
      viz.connectAudio(worklet)
      vizRef.current = viz

      const idx = Math.max(0, Math.min(presetIndex, presets.length - 1))
      viz.loadPreset(presets[idx].data, 0)
      lastLoadedRef.current = idx

      function render() {
        viz.render()
        rafRef.current = requestAnimationFrame(render)
      }
      rafRef.current = requestAnimationFrame(render)
    }

    init().catch(e => console.error('[useVisualizer] init failed:', e))

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      audioCtxRef.current?.close()
      audioCtxRef.current = null
      workletRef.current  = null
      vizRef.current      = null
      lastLoadedRef.current = -1
    }
    // Re-run only when the canvas element or preset list changes.
    // presetIndex changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, presets])

  // Sync external preset index changes with a blend transition.
  // Skips the initial load (already handled in the init effect above).
  useEffect(() => {
    const viz = vizRef.current
    if (!viz || presets.length === 0) return
    const idx = Math.max(0, Math.min(presetIndex, presets.length - 1))
    if (idx === lastLoadedRef.current) return   // already loaded — skip
    lastLoadedRef.current = idx
    viz.loadPreset(presets[idx].data, 2.7)
  }, [presetIndex, presets])

  // Forward PCM events from Tauri → AudioWorklet
  useEffect(() => {
    const unlisten = listen<number[]>('pcm-data', ({ payload }) => {
      workletRef.current?.port.postMessage(new Float32Array(payload))
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Notify Butterchurn when the canvas is resized
  const notifyResize = useCallback((w: number, h: number) => {
    vizRef.current?.setRendererSize(w, h)
  }, [])

  return { notifyResize }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useVisualizer.ts
git commit -m "feat: add useVisualizer hook (Butterchurn + AudioWorklet + PCM bridge)"
```

---

## Task 10 — Create VisualizerCanvas component

**Files:**
- Create: `app/src/components/VisualizerCanvas.tsx`

- [ ] **Step 1: Create the component**

Create `app/src/components/VisualizerCanvas.tsx`:

```typescript
import { useEffect, useRef } from 'react'
import { useVisualizer } from '../hooks/useVisualizer'

interface Props {
  presetIndex: number
  style?:      React.CSSProperties
}

export default function VisualizerCanvas({ presetIndex, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { notifyResize } = useVisualizer(canvasRef, presetIndex)

  // Keep Butterchurn's internal resolution in sync with the element's rendered size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const w = Math.round(width)
      const h = Math.round(height)
      canvas.width  = w
      canvas.height = h
      notifyResize(w, h)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [notifyResize])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width:   '100%',
        height:  '100%',
        background: '#000',
        ...style,
      }}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/VisualizerCanvas.tsx
git commit -m "feat: add VisualizerCanvas component"
```

---

## Task 11 — Update useHotkeys

**Files:**
- Modify: `app/src/hooks/useHotkeys.ts`

- [ ] **Step 1: Replace the interface and implementation**

Replace the entire contents of `app/src/hooks/useHotkeys.ts` with:

```typescript
import { useEffect } from 'react'

interface Handlers {
  onNext:                    () => void
  onPrev:                    () => void
  onTogglePause:             () => void
  onCycleVisualizerMode?:    () => void
  onNextPreset?:             () => void
  onToggleTrackOverlay?:     () => void
  onToggleFullscreen?:       () => void
  onToggleBattery?:          () => void
  onTogglePhotoCounter?:     () => void
  onToggleClockWeather?:     () => void
  onToggleLyrics?:           () => void
  onMusicPrev?:              () => void
  onMusicToggle?:            () => void
  onMusicNext?:              () => void
  onVolumeUp?:               () => void
  onVolumeDown?:             () => void
}

export function useHotkeys({
  onNext, onPrev, onTogglePause,
  onCycleVisualizerMode, onNextPreset,
  onToggleTrackOverlay, onToggleFullscreen,
  onToggleBattery, onTogglePhotoCounter, onToggleClockWeather, onToggleLyrics,
  onMusicPrev, onMusicToggle, onMusicNext, onVolumeUp, onVolumeDown,
}: Handlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.code) {
        case 'Numpad4':        e.preventDefault(); onMusicPrev?.();   return
        case 'Numpad5':        e.preventDefault(); onMusicToggle?.(); return
        case 'Numpad6':        e.preventDefault(); onMusicNext?.();   return
        case 'NumpadAdd':      e.preventDefault(); onVolumeUp?.();    return
        case 'NumpadSubtract': e.preventDefault(); onVolumeDown?.();  return
      }

      switch (e.key) {
        case 'ArrowRight':  e.preventDefault(); onNext();                       break
        case 'ArrowLeft':   e.preventDefault(); onPrev();                       break
        case ' ':           e.preventDefault(); onTogglePause();                break
        case 'm': case 'M': e.preventDefault(); onCycleVisualizerMode?.();      break
        case 'n': case 'N': e.preventDefault(); onNextPreset?.();               break
        case 't': case 'T': e.preventDefault(); onToggleTrackOverlay?.();       break
        case 'f': case 'F': e.preventDefault(); onToggleFullscreen?.();         break
        case 'b': case 'B': e.preventDefault(); onToggleBattery?.();            break
        case 'p': case 'P': e.preventDefault(); onTogglePhotoCounter?.();       break
        case 'c': case 'C': e.preventDefault(); onToggleClockWeather?.();       break
        case 'l': case 'L': e.preventDefault(); onToggleLyrics?.();             break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    onNext, onPrev, onTogglePause,
    onCycleVisualizerMode, onNextPreset,
    onToggleTrackOverlay, onToggleFullscreen,
    onToggleBattery, onTogglePhotoCounter, onToggleClockWeather, onToggleLyrics,
    onMusicPrev, onMusicToggle, onMusicNext, onVolumeUp, onVolumeDown,
  ])
}
```

- [ ] **Step 2: Check TypeScript — expect errors at call sites**

```bash
cd app
npx tsc --noEmit 2>&1 | grep "onToggleSpectrum"
```

Expected: two errors (one in `DisplayWindow.tsx`, one in `ControlPanel.tsx`) — these are fixed in Tasks 12 and 13.

- [ ] **Step 3: Commit (broken build — intentional, fixed next two tasks)**

```bash
git add app/src/hooks/useHotkeys.ts
git commit -m "feat(hotkeys): replace S/spectrum with M/visualizer-mode, add N/next-preset"
```

---

## Task 12 — Update DisplayWindow.tsx

**Files:**
- Modify: `app/src/windows/display/DisplayWindow.tsx`

This is the main integration task. Read the current file in full before making changes.

- [ ] **Step 1: Replace the file contents**

Replace the entire file with:

```typescript
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useBattery } from '../../hooks/useBattery'
import type { BatteryStatus } from '../../hooks/useBattery'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'
import VisualizerCanvas from '../../components/VisualizerCanvas'
import { BatteryWidget } from '../../components/BatteryWidget'
import { readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'
import { useWeather } from '../../hooks/useWeather'
import { ClockWeatherWidget } from '../../components/ClockWeatherWidget'
import { useLyrics } from '../../hooks/useLyrics'
import { LyricsOverlay } from '../../components/LyricsOverlay'
import { LyricsSplitPanel } from '../../components/LyricsSplitPanel'
import type { TrackInfo } from '../../lib/player-types'

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary({ order: 'shuffle', recursive: false })
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)
  const [currentTrack,    setCurrentTrack]    = useState<TrackInfo | null>(null)
  const [positionMs,      setPositionMs]      = useState(0)
  const [isPaused,        setIsPaused]        = useState(false)
  const [slideshowPaused, setSlideshowPaused] = useState(false)
  const [photoCounter, setPhotoCounter] = useState<{ index: number; total: number } | null>(null)
  const battery = useBattery()
  const [weather, weatherError] = useWeather(displaySettings.clockWeatherTempUnit, displaySettings.clockWeatherCity)

  // Start WASAPI loopback capture on mount so the visualizer works for all
  // audio sources (Spotify, DLNA, local), not just when the Spotify player fires.
  useEffect(() => {
    invoke('start_audio_capture').catch(console.error)
  }, [])

  const [winHeight, setWinHeight] = useState(window.innerHeight)
  useEffect(() => {
    const handler = () => setWinHeight(window.innerHeight)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const [isFullscreen, setIsFullscreen] = useState(false)

  function handleDoubleClick() {
    const next = !isFullscreen
    setIsFullscreen(next)
    invoke('set_display_fullscreen', { fullscreen: next }).catch(console.error)
    emit('fullscreen-changed', { fullscreen: next }).catch(console.error)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsFullscreen(false)
        invoke('exit_display_fullscreen').catch(console.error)
        emit('fullscreen-changed', { fullscreen: false }).catch(console.error)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const unlisten = listen<DisplaySettings>('display-settings-changed', ({ payload }) => {
      setDisplaySettings(payload)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useEffect(() => {
    const unlisten = listen<TrackInfo & { positionMs: number }>('track-changed', ({ payload }) => {
      setCurrentTrack({ name: payload.name, artists: payload.artists, id: payload.id, duration: payload.duration, albumArt: payload.albumArt ?? '' })
      setPositionMs(payload.positionMs ?? 0)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useEffect(() => {
    const unlisten = listen('track-cleared', () => {
      setCurrentTrack(null)
      setPositionMs(0)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useEffect(() => {
    const unlisten = listen<{ positionMs: number; paused: boolean }>('playback-tick', ({ payload }) => {
      setPositionMs(payload.positionMs)
      setIsPaused(payload.paused)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useEffect(() => {
    const unlisten = listen<{ paused: boolean }>('slideshow-state', ({ payload }) => {
      setSlideshowPaused(payload.paused)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useEffect(() => {
    const unlisten = listen<{ photo: string; index: number; total: number }>('photo-advance', ({ payload }) => {
      setPhotoCounter({ index: payload.index, total: payload.total })
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useEffect(() => {
    const unlisten = listen('photos-cleared', () => setPhotoCounter(null))
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useHotkeys({
    onNext:               () => emit('display-hotkey', { action: 'next'         }).catch(console.error),
    onPrev:               () => emit('display-hotkey', { action: 'prev'         }).catch(console.error),
    onTogglePause:        () => emit('display-hotkey', { action: 'pause'        }).catch(console.error),
    onCycleVisualizerMode:() => emit('display-hotkey', { action: 'mode'         }).catch(console.error),
    onNextPreset:         () => emit('display-hotkey', { action: 'next-preset'  }).catch(console.error),
    onToggleTrackOverlay: () => emit('display-hotkey', { action: 'track'        }).catch(console.error),
    onToggleFullscreen:   () => {
      const next = !isFullscreen
      setIsFullscreen(next)
      invoke('set_display_fullscreen', { fullscreen: next }).catch(console.error)
      emit('fullscreen-changed', { fullscreen: next }).catch(console.error)
    },
    onToggleBattery:      () => emit('display-hotkey', { action: 'battery'      }).catch(console.error),
    onTogglePhotoCounter: () => emit('display-hotkey', { action: 'counter'      }).catch(console.error),
    onToggleClockWeather: () => emit('display-hotkey', { action: 'clock'        }).catch(console.error),
    onToggleLyrics:       () => emit('display-hotkey', { action: 'lyrics'       }).catch(console.error),
    onMusicPrev:          () => emit('display-hotkey', { action: 'music-prev'   }).catch(console.error),
    onMusicToggle:        () => emit('display-hotkey', { action: 'music-toggle' }).catch(console.error),
    onMusicNext:          () => emit('display-hotkey', { action: 'music-next'   }).catch(console.error),
    onVolumeUp:           () => emit('display-hotkey', { action: 'vol-up'       }).catch(console.error),
    onVolumeDown:         () => emit('display-hotkey', { action: 'vol-down'     }).catch(console.error),
  })

  const lyrics = useLyrics(currentTrack, positionMs)
  const vizMode = displaySettings.visualizerMode

  // In visualizer split mode, if lyrics was configured as a side panel,
  // fall back to overlay mode by treating lyricsSplit as false.
  const effectiveLyricsSplit = displaySettings.lyricsSplit && vizMode !== 'split'

  // Normal photos-mode split (photo + lyrics side by side)
  const isLyricsSplitMode = vizMode === 'photos' && displaySettings.lyricsVisible && effectiveLyricsSplit

  // Shared overlays rendered on top in all modes
  function overlays(showPhotoBadges: boolean) {
    return (
      <>
        {showPhotoBadges && displaySettings.photoCounterVisible && photoCounter !== null && (
          <PhotoCounterOverlay index={photoCounter.index} total={photoCounter.total} />
        )}
        {displaySettings.lyricsVisible
          && lyrics.status !== 'not_found' && lyrics.status !== 'error' && lyrics.status !== 'idle'
          && !effectiveLyricsSplit && (
          <LyricsOverlay
            lines={lyrics.lines}
            currentIndex={lyrics.currentIndex}
            status={lyrics.status}
            settings={displaySettings}
          />
        )}
        <CornerOverlays
          displaySettings={displaySettings}
          currentTrack={currentTrack}
          positionMs={positionMs}
          isPaused={isPaused}
          weather={weather}
          weatherError={weatherError}
          battery={battery}
        />
        {showPhotoBadges && slideshowPaused && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 50,
          }}>
            <span style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 28, fontWeight: 700, letterSpacing: 4,
              color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase',
              textShadow: '0 2px 16px rgba(0,0,0,0.8)',
              background: 'rgba(0,0,0,0.45)', padding: '10px 28px', borderRadius: 10,
            }}>Paused</span>
          </div>
        )}
      </>
    )
  }

  function photoPane(fill: boolean) {
    return (
      <>
        <SlideshowView
          photos={photos}
          transitionEffect={displaySettings.transitionEffect}
          transitionDurationMs={displaySettings.transitionDurationMs}
          imageFit={displaySettings.imageFit}
          fillParent={fill}
        />
        {overlays(true)}
      </>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }} onDoubleClick={handleDoubleClick}>
      <SongToast   displayMs={displaySettings.toastDurationMs} zoom={displaySettings.songZoom}   />
      <VolumeToast displayMs={displaySettings.toastDurationMs} zoom={displaySettings.volumeZoom} />

      {/* ── photos mode ─────────────────────────────────────────────────────── */}
      {vizMode === 'photos' && (
        isLyricsSplitMode ? (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {displaySettings.lyricsSplitSide === 'right' ? (
              <>
                <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>{photoPane(true)}</div>
                <div style={{ width: '40%', height: '100%', flexShrink: 0 }}>
                  <LyricsSplitPanel lines={lyrics.lines} currentIndex={lyrics.currentIndex} status={lyrics.status} settings={displaySettings} />
                </div>
              </>
            ) : (
              <>
                <div style={{ width: '40%', height: '100%', flexShrink: 0 }}>
                  <LyricsSplitPanel lines={lyrics.lines} currentIndex={lyrics.currentIndex} status={lyrics.status} settings={displaySettings} />
                </div>
                <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>{photoPane(true)}</div>
              </>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>{photoPane(false)}</div>
        )
      )}

      {/* ── fullscreen visualizer mode ───────────────────────────────────────── */}
      {vizMode === 'visualizer' && (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Slideshow runs hidden so it keeps advancing */}
          <div style={{ display: 'none' }}>
            <SlideshowView photos={photos} transitionEffect="fade" transitionDurationMs={500} imageFit="cover" fillParent={false} />
          </div>
          <VisualizerCanvas
            presetIndex={displaySettings.visualizerPresetIndex}
            style={{ position: 'absolute', inset: 0 }}
          />
          {overlays(false)}
        </div>
      )}

      {/* ── split mode: photos + visualizer ─────────────────────────────────── */}
      {vizMode === 'split' && (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          {displaySettings.visualizerSplitSide === 'right' ? (
            <>
              <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>{photoPane(true)}</div>
              <div style={{ width: '40%', height: '100%', flexShrink: 0, position: 'relative' }}>
                <VisualizerCanvas
                  presetIndex={displaySettings.visualizerPresetIndex}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ width: '40%', height: '100%', flexShrink: 0, position: 'relative' }}>
                <VisualizerCanvas
                  presetIndex={displaySettings.visualizerPresetIndex}
                />
              </div>
              <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>{photoPane(true)}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Corner overlays ───────────────────────────────────────────────────────────

function CornerOverlays({ displaySettings, currentTrack, positionMs, isPaused, weather, weatherError, battery }: {
  displaySettings: DisplaySettings
  currentTrack: TrackInfo | null
  positionMs: number
  isPaused: boolean
  weather: import('../../hooks/useWeather').WeatherData | null
  weatherError: string | null
  battery: BatteryStatus
}) {
  type WidgetId = 'battery' | 'clock' | 'track'
  type Corner   = import('../../components/DisplaySettingsPanel').TrackPosition

  const corners = new Map<Corner, WidgetId[]>()
  function add(pos: Corner, id: WidgetId) {
    if (!corners.has(pos)) corners.set(pos, [])
    corners.get(pos)!.push(id)
  }

  if (displaySettings.batteryVisible)      add(displaySettings.batteryPosition,      'battery')
  if (displaySettings.clockWeatherVisible) add(displaySettings.clockWeatherPosition,  'clock')
  if (displaySettings.trackOverlayVisible && currentTrack) add(displaySettings.trackPosition, 'track')

  return (
    <>
      {[...corners.entries()].map(([pos, widgets]) => {
        const isBottom = pos.startsWith('bottom')
        const wrapStyle: React.CSSProperties = {
          position: 'absolute',
          top:    isBottom             ? undefined : 16,
          bottom: isBottom             ? 16        : undefined,
          left:   pos.endsWith('left') ? 16        : undefined,
          right:  pos.endsWith('right')? 16        : undefined,
          display: 'flex',
          flexDirection: isBottom ? 'column-reverse' : 'column',
          alignItems: pos.endsWith('left') ? 'flex-start' : 'flex-end',
          gap: 8, zIndex: 15, pointerEvents: 'none',
        }
        return (
          <div key={pos} style={wrapStyle}>
            {widgets.map(w => {
              if (w === 'battery') return <BatteryWidget key="battery" status={battery} size={displaySettings.batterySize} />
              if (w === 'clock')   return (
                <ClockWeatherWidget key="clock"
                  timeFormat={displaySettings.clockWeatherTimeFormat}
                  position={pos}
                  tempUnit={displaySettings.clockWeatherTempUnit}
                  weather={weather}
                  debugError={weatherError}
                  embedded
                />
              )
              if (w === 'track') return (
                <TrackOverlay key="track" track={currentTrack!} positionMs={positionMs} paused={isPaused} settings={displaySettings} embedded />
              )
              return null
            })}
          </div>
        )
      })}
    </>
  )
}

// ── Photo counter overlay ─────────────────────────────────────────────────────

function PhotoCounterOverlay({ index, total }: { index: number; total: number }) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 15, pointerEvents: 'none', padding: '4px 10px', borderRadius: 999,
      background: 'rgba(0,0,0,0.45)', color: '#fff', fontFamily: 'monospace',
      fontSize: 13, letterSpacing: '0.5px', backdropFilter: 'blur(2px)', whiteSpace: 'nowrap',
    }}>
      {index + 1}/{total}
    </div>
  )
}

// ── Track overlay ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(0,0,0,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function TrackOverlay({ track, positionMs, paused, settings, embedded }: {
  track: TrackInfo; positionMs: number; paused?: boolean; settings: DisplaySettings; embedded?: boolean
}) {
  const { trackPosition, trackFontSize, trackColor, trackBgColor, trackBgOpacity } = settings

  const posStyle: React.CSSProperties = embedded ? {} : {
    position: 'absolute',
    top:    trackPosition.startsWith('top')    ? 20 : undefined,
    bottom: trackPosition.startsWith('bottom') ? 20 : undefined,
    left:   trackPosition.endsWith('left')     ? 20 : undefined,
    right:  trackPosition.endsWith('right')    ? 20 : undefined,
  }

  const progressPct = track.duration > 0 ? Math.min(100, (positionMs / track.duration) * 100) : 0

  return (
    <div style={{
      ...posStyle, zIndex: 15, maxWidth: '45vw', padding: '8px 14px', borderRadius: 6,
      background: hexToRgba(trackBgColor, trackBgOpacity), color: trackColor,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: trackFontSize, fontWeight: 600, lineHeight: 1.3, pointerEvents: 'none',
      backdropFilter: trackBgOpacity > 0 ? 'blur(2px)' : 'none', overflow: 'hidden',
    }}>
      <div style={{ fontSize: trackFontSize * 0.65, opacity: 0.8, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {paused && <span style={{ flexShrink: 0 }}>⏸</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</span>
      </div>
      <div style={{ margin: '6px -14px -8px', height: 3, background: hexToRgba(trackColor, 0.2) }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: trackColor, transition: 'width 0.5s linear' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript — only ControlPanel errors should remain**

```bash
cd app
npx tsc --noEmit 2>&1 | grep -v ControlPanel
```

Expected: no errors outside ControlPanel.

- [ ] **Step 3: Commit**

```bash
git add app/src/windows/display/DisplayWindow.tsx
git commit -m "feat(display): integrate Butterchurn visualizer modes (photos/visualizer/split)"
```

---

## Task 13 — Update ControlPanel.tsx

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx`

This task makes four targeted edits to ControlPanel:

1. Remove `SpectrumCanvas` import and `useFftData` import/usage
2. Add `presets` state loaded from `get_presets`; add `cycleVisualizerMode` and `nextPreset` callbacks
3. Update `display-hotkey` handler: replace `spectrum` action with `mode`, add `next-preset` and `set-preset`
4. Update `useHotkeys` call: replace `onToggleSpectrum` with `onCycleVisualizerMode` and `onNextPreset`
5. Replace the inline `<SpectrumCanvas>` with a current-preset name label
6. Update the settings save effect: replace spectrum keys with visualizer keys
7. Add visualizer section to the Display Settings card (split side selector, preset name display)

- [ ] **Step 1: Remove SpectrumCanvas and useFftData imports**

Remove line 8: `import SpectrumCanvas from '../../components/SpectrumCanvas'`
Remove line 18: `import { useFftData } from '../../hooks/useFftData'`

- [ ] **Step 2: Add presets state and new callbacks**

After the `useEffect` block for audio capture (around line 337), add:

```typescript
  // ── Visualizer presets ────────────────────────────────────────────────────
  const [presets, setPresets] = useState<{ name: string }[]>([])
  useEffect(() => {
    invoke<{ name: string; content: string }[]>('get_presets')
      .then(raw => setPresets(raw.map(({ name }) => ({ name }))))
      .catch(console.error)
  }, [])

  const cycleVisualizerMode = useCallback(() => {
    setDisplaySettings(s => {
      const order: typeof s.visualizerMode[] = ['photos', 'visualizer', 'split']
      const next = order[(order.indexOf(s.visualizerMode) + 1) % order.length]
      return { ...s, visualizerMode: next }
    })
  }, [])

  const nextPreset = useCallback(() => {
    if (presets.length === 0) return
    setDisplaySettings(s => ({
      ...s,
      visualizerPresetIndex: (s.visualizerPresetIndex + 1) % presets.length,
    }))
  }, [presets.length])
```

- [ ] **Step 3: Remove the toggleSpectrum callback and the bins variable**

Remove the line: `const bins = useFftData()`
Remove the `toggleSpectrum` callback block:
```typescript
  const toggleSpectrum = useCallback(() => {
    setDisplaySettings(s => ({ ...s, spectrumVisible: !s.spectrumVisible }))
  }, [])
```

- [ ] **Step 4: Update the display-hotkey listener**

In the `listen<{ action: string }>('display-hotkey', ...)` handler, replace:
```typescript
      if (payload.action === 'spectrum') toggleSpectrum()
```
with:
```typescript
      if (payload.action === 'mode')        cycleVisualizerMode()
      if (payload.action === 'next-preset') nextPreset()
```

Also update the dependency array of that `useEffect` — replace `toggleSpectrum` with `cycleVisualizerMode, nextPreset`.

- [ ] **Step 5: Update useHotkeys call**

Replace:
```typescript
  useHotkeys({ onNext: doNext, onPrev: doPrev, onTogglePause: togglePause, onToggleSpectrum: toggleSpectrum, ...
```
with:
```typescript
  useHotkeys({ onNext: doNext, onPrev: doPrev, onTogglePause: togglePause, onCycleVisualizerMode: cycleVisualizerMode, onNextPreset: nextPreset, ...
```
(keep all other handlers unchanged)

- [ ] **Step 6: Update the settings-save effect**

In the `useEffect` that calls `localStorage.setItem(...)`, replace the four spectrum lines:
```typescript
    localStorage.setItem(KEYS.spectrumVisible,    String(displaySettings.spectrumVisible))
    localStorage.setItem(KEYS.spectrumStyle,      displaySettings.spectrumStyle)
    localStorage.setItem(KEYS.spectrumTheme,      displaySettings.spectrumTheme)
    localStorage.setItem(KEYS.spectrumHeightPct,  String(displaySettings.spectrumHeightPct))
```
with:
```typescript
    localStorage.setItem(KEYS.visualizerMode,        displaySettings.visualizerMode)
    localStorage.setItem(KEYS.visualizerSplitSide,   displaySettings.visualizerSplitSide)
    localStorage.setItem(KEYS.visualizerPresetIndex, String(displaySettings.visualizerPresetIndex))
```

- [ ] **Step 7: Replace the inline SpectrumCanvas with a preset label**

Find the block around line 639 (the `<SpectrumCanvas>` inside the player controls):
```tsx
              <div style={{ flex: 1, minWidth: 0 }}>
                <SpectrumCanvas bins={bins} height={16}
                  renderStyle={displaySettings.spectrumStyle}
                  theme={displaySettings.spectrumTheme}
                />
              </div>
```
Replace it with:
```tsx
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ color: '#555', fontSize: 11, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                  {presets[displaySettings.visualizerPresetIndex]?.name ?? '—'}
                </span>
              </div>
```

- [ ] **Step 8: Add visualizer controls to the Display Settings card**

In the DisplaySettingsPanel section (look for the `<DisplaySettingsPanel` component usage inside a `<Card>`), add a small "Visualizer" section above the Display Settings card header or directly inside it. Locate the `<Card label="Display settings"` block and add after `<DisplaySettingsPanel ...>`:

```tsx
              <div style={{ marginTop: 8, padding: '8px 0 0', borderTop: '1px solid #222' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#555', marginBottom: 6 }}>
                  Visualizer <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(M to cycle mode)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#777', fontSize: 12 }}>
                    {displaySettings.visualizerMode === 'photos'     && 'Photos only'}
                    {displaySettings.visualizerMode === 'visualizer' && 'Visualizer only'}
                    {displaySettings.visualizerMode === 'split'      && 'Split'}
                  </span>
                  <button
                    onClick={cycleVisualizerMode}
                    style={{ fontSize: 11, background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    Cycle mode
                  </button>
                  <button
                    onClick={nextPreset}
                    style={{ fontSize: 11, background: '#1a1a1a', border: '1px solid #333', color: '#ccc', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                    title="Next preset (N)"
                  >
                    Next preset
                  </button>
                </div>
                <div style={{ color: '#555', fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
                  Preset: {presets[displaySettings.visualizerPresetIndex]?.name ?? '—'} ({presets.length} loaded)
                </div>
              </div>
```

- [ ] **Step 9: Verify TypeScript — should be clean**

```bash
cd app
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add app/src/windows/control/ControlPanel.tsx
git commit -m "feat(control): remove spectrum; add visualizer mode cycling and preset display"
```

---

## Task 14 — Remove dead spectrum code and files

**Files:**
- Modify: `app/src/components/DisplaySettingsPanel.tsx`
- Modify: `app/src/lib/storage-keys.ts`
- Modify: `app/src/components/HelpPanel.tsx`
- Delete: `app/src/components/SpectrumCanvas.tsx`
- Delete: `app/src/hooks/useFftData.ts`

- [ ] **Step 1: Remove spectrum fields from DisplaySettings interface**

In `DisplaySettingsPanel.tsx`:

Remove line 1: `import type { SpectrumTheme, SpectrumStyle } from './SpectrumCanvas'`
Remove line 5: `export type { SpectrumTheme, SpectrumStyle }`

From the `DisplaySettings` interface, remove:
```typescript
  spectrumVisible:      boolean
  spectrumStyle:        SpectrumStyle
  spectrumTheme:        SpectrumTheme
  spectrumHeightPct:    number
```

Remove constants:
```typescript
const SPECTRUM_STYLE_VALUES     = ['bars', 'lines'] as const
const SPECTRUM_THEME_VALUES     = ['energy', 'cyan', 'fire', 'white', 'rainbow', 'purple'] as const
```

From `readDisplaySettings()`, remove:
```typescript
    spectrumVisible:      safeBool(localStorage.getItem(KEYS.spectrumVisible), false),
    spectrumStyle:        safeEnum(localStorage.getItem(KEYS.spectrumStyle),        SPECTRUM_STYLE_VALUES,    'bars'),
    spectrumTheme:        safeEnum(localStorage.getItem(KEYS.spectrumTheme),        SPECTRUM_THEME_VALUES,    'energy'),
    spectrumHeightPct:    safeNum(localStorage.getItem(KEYS.spectrumHeightPct),     10),
```

Remove the `SPECTRUM_THEMES` array constant and the entire Spectrum JSX section from the component (the block between the `{/* ── Spectrum ──`and `{/* ── Battery ──` comments, inclusive of the `<p>` and the two `<div>` grids).

- [ ] **Step 2: Remove spectrum keys from storage-keys.ts**

Remove these four lines from `storage-keys.ts`:
```typescript
  // Spectrum analyser
  spectrumVisible:     'pd_spectrum_visible',
  spectrumStyle:       'pd_spectrum_style',
  spectrumTheme:       'pd_spectrum_theme',
  spectrumHeightPct:   'pd_spectrum_height_pct',
```

- [ ] **Step 3: Update HelpPanel**

In `HelpPanel.tsx`:

Replace:
```typescript
  { key: 'S',         action: 'Toggle spectrum analyser'  },
```
with:
```typescript
  { key: 'M',         action: 'Cycle visualizer mode (photos / visualizer / split)' },
  { key: 'N',         action: 'Next visualizer preset'    },
```

Also find the credits line mentioning RustFFT and remove it:
```typescript
    { name: 'RustFFT',                   url: 'https://github.com/ejmahler/RustFFT',      role: 'FFT for real-time spectrum analysis' },
```

- [ ] **Step 4: Delete dead files**

```bash
rm app/src/components/SpectrumCanvas.tsx
rm app/src/hooks/useFftData.ts
```

- [ ] **Step 5: Verify clean build**

```bash
cd app
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove SpectrumCanvas, useFftData, and all spectrum settings"
```

---

## Task 15 — Smoke test

- [ ] **Step 1: Run the app**

```bash
cd app
npm run tauri dev
```

- [ ] **Step 2: Verify no console errors on startup**

Open DevTools in the control window. Expected: no red errors.

- [ ] **Step 3: Test mode cycling**

In the display window, press `M` three times. Expected sequence:
1. `photos` → slideshow visible, no visualizer
2. `visualizer` → Butterchurn fills the screen, slideshow hidden
3. `split` → slideshow on one side, Butterchurn on the other
4. Back to `photos`

- [ ] **Step 4: Test audio reactivity**

Play music via any source (Spotify, local, DLNA). Switch to `visualizer` mode. Expected: the Butterchurn animation reacts to the audio within ~1 second.

- [ ] **Step 5: Test preset cycling**

Press `N`. Expected: the visualizer transitions smoothly to a new preset over ~2.7 seconds. The current preset name updates in the control panel.

- [ ] **Step 6: Test overlays in all modes**

Verify that track info overlay, clock/weather, and battery widget are visible in all three modes.

- [ ] **Step 7: Test lyrics + split interaction**

Enable lyrics side panel. Switch to `split` visualizer mode. Expected: lyrics panel is suppressed and lyrics appear as overlay on the photo pane instead.

- [ ] **Step 8: Final commit if any fixes were needed**

If any bugs were found and fixed during testing:
```bash
git add -A
git commit -m "fix: resolve issues found during smoke test"
```
