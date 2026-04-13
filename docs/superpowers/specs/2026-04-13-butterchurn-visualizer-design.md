# Butterchurn Visualizer — Design Spec

**Date:** 2026-04-13
**Status:** Approved

---

## Overview

Replace the existing canvas-based spectrum analyzer with a full MilkDrop-style
visualizer powered by [Butterchurn](https://github.com/jberg/butterchurn) — a
JavaScript/WebGL reimplementation of MilkDrop that runs natively in WebView2.
The visualizer renders inside the existing display window, all overlays (track
info, clock, battery, lyrics, etc.) remain on top, and the user cycles between
three display modes using the `M` hotkey.

Audio is sourced from WASAPI loopback (system output device), making the
visualizer source-agnostic — it works with Spotify, local files, DLNA, and any
other audio that routes through the default Windows output.

---

## 1. Display Modes

The `M` hotkey cycles through three modes:

| Mode | Behaviour |
|---|---|
| `photos` | Slideshow only. No visualizer. Default on launch. |
| `visualizer` | Butterchurn canvas fills the entire display window. Slideshow hidden but continues advancing in the background. |
| `split` | Slideshow occupies 60% of the window; Butterchurn occupies 40%. Side is configurable (left/right) in the control panel. |

All existing overlays — track info, photo counter, clock/weather, battery, song
toast, volume toast, lyrics overlay — render on top of everything in all modes.

The existing fullscreen toggle (double-click / Escape) and all other hotkeys are
unchanged.

### Lyrics interaction in split mode

When `mode === 'split'` and lyrics is configured to display as a side panel
(`lyricsSplit === true`), the side panel is suppressed and lyrics fall back to
the overlay mode on the photo pane. Returning to `photos` or `visualizer` mode
restores the lyrics side panel.

---

## 2. Hotkeys

| Key | Action |
|---|---|
| `M` | Cycle visualizer mode: `photos` → `visualizer` → `split` → `photos` |
| `P` | Advance to the next preset (Butterchurn blend transition, ~2.7 s) |

The previous `S` hotkey (spectrum toggle) is removed.

---

## 3. Audio Pipeline

### Rust backend (`audio.rs`)

- WASAPI loopback capture is retained unchanged (source-agnostic system audio).
- FFT computation is removed entirely.
- Instead of emitting `fft-data` (64 FFT bins), the backend emits `pcm-data`
  events containing raw float32 PCM samples in chunks of **512 samples**.
- At 44.1 kHz this produces ~86 events/second (~172 KB/s) — within the Tauri
  event bridge budget.
- `rustfft` is removed from `Cargo.toml`. `cpal` is retained.

### Frontend audio bridge

```
pcm-data Tauri event  (Float32Array, 512 samples)
  → useVisualizer hook
    → postMessage to AudioWorkletNode
      → pcm-injector-processor.js  (ring buffer, outputs samples)
        → Butterchurn AnalyserNode
          → visualizer.render()  on requestAnimationFrame
```

A single `AudioContext` is created when the display window mounts and lives for
the session. The `AudioWorklet` processor holds a ring buffer to absorb jitter
between Tauri events and the Web Audio render quantum.

---

## 4. Preset Management

### Folder

Presets live in `<exe_dir>/presets/` — next to the application binary. This
folder is included in the release zip and ships with the **top 20 rated
projectM `.milk` presets**. Users manage the folder manually (add/remove
`.milk` files) to customise the library.

### Loading

A new Tauri command `get_presets` reads the presets folder at app launch and
returns `Vec<{ name: String, content: String }>`. Butterchurn's built-in
`.milk` parser (`butterchurn.valueToObject`) parses the files in the frontend —
no offline conversion step required.

### State persistence

`visualizerPresetIndex` is stored in `DisplaySettings` (localStorage). If the
saved index no longer exists after folder changes, the app falls back to index 0.

### Preset cycling

`P` hotkey (and a "Next preset" button in the control panel) advances the index
and calls `visualizer.loadPreset(preset, 2.7)` for a smooth blend. The preset
name is shown briefly using a toast (reusing or mirroring `SongToast` styling).

---

## 5. Component & Code Changes

### New files

| File | Purpose |
|---|---|
| `src/components/VisualizerCanvas.tsx` | Butterchurn `<canvas>` component. Accepts `mode` and `splitSide` props. Owns the `requestAnimationFrame` render loop. |
| `src/hooks/useVisualizer.ts` | Creates `AudioContext`, registers AudioWorklet, owns Butterchurn instance, handles `pcm-data` events and preset cycling. |
| `public/pcm-injector-processor.js` | `AudioWorkletProcessor` with a ring buffer. Must be in `public/` so Tauri's asset protocol can serve it at a stable URL. |

### Modified files

| File | Change |
|---|---|
| `src-tauri/src/audio.rs` | Remove FFT; emit `pcm-data` (raw float32 chunks of 512 samples) instead of `fft-data`. |
| `src-tauri/Cargo.toml` | Remove `rustfft`. |
| `src/windows/display/DisplayWindow.tsx` | Replace `SpectrumCanvas` + `useFftData` with `VisualizerCanvas` + `useVisualizer`. Add `M` mode cycling. Add lyrics fallback logic for split mode. |
| `src/components/DisplaySettingsPanel.tsx` | Remove all spectrum fields (`spectrumVisible`, `spectrumStyle`, `spectrumTheme`, `spectrumHeightPct`). Add `visualizerMode`, `visualizerSplitSide`, `visualizerPresetIndex`. |
| `src/hooks/useHotkeys.ts` | Replace `onToggleSpectrum` with `onCycleVisualizerMode`; add `onNextPreset`. |
| Control panel UI | Remove spectrum settings section. Add visualizer section: current preset name + "Next preset" button. |

### Removed files

| File | Reason |
|---|---|
| `src/components/SpectrumCanvas.tsx` | Replaced by `VisualizerCanvas`. |
| `src/hooks/useFftData.ts` | No longer needed. |

### npm additions

- `butterchurn` — core visualizer library
- `butterchurn-presets` — not used at runtime; may be referenced during development to extract the bundled top-20 `.milk` files into the `presets/` folder

---

## 6. Out of Scope

- Preset browser UI in the control panel (folder is managed manually)
- WASAPI fallback for DRM-protected audio (not applicable — loopback captures rendered output)
- Visualizer on the control panel window
- Cross-platform support (app is Windows-only; WASAPI loopback is Windows-only)
