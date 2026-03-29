# Slideshow & Display Settings — Design Spec
**Date:** 2026-03-29
**Status:** Approved

---

## Overview

Six feature areas are in scope:

1. Configurable toast duration (shared between song and volume toasts)
2. Per-toast zoom (separate scale multipliers for song toast and volume toast)
3. Remember last selected photo folder (auto-restore on launch)
4. Include-subfolders toggle (recursive vs. flat scan)
5. Slideshow photo order — shuffle or alphabetic
6. Resume last photo per folder in alphabetic mode

Additionally, the existing `SlideshowConfig` (mode, fixedSec, beatMinSec) will be persisted so it survives restarts.

---

## Persistence Strategy

All settings use flat `localStorage` keys (Option A). No store plugin, no abstraction layer. Reads happen on mount; writes happen immediately on change.

### Key Reference

| Key | JS type | Default | Purpose |
|-----|---------|---------|---------|
| `pd_last_folder` | `string` | — | Last picked folder path; restored on launch |
| `pd_subfolder` | `"true"/"false"` | `"false"` | Include subfolders when scanning |
| `pd_order` | `"shuffle"/"alpha"` | `"shuffle"` | Photo display order |
| `pd_last_photo` | JSON `Record<string,string>` | `{}` | folder path → last displayed photo (alpha mode only) |
| `pd_toast_duration_ms` | number as string | `"5000"` | Display duration for both toasts (ms) |
| `pd_song_toast_zoom` | number as string | `"1"` | Scale multiplier for song toast |
| `pd_volume_toast_zoom` | number as string | `"1"` | Scale multiplier for volume toast |
| `pd_slideshow_mode` | `"fixed"/"beat"` | `"fixed"` | Slideshow advance mode |
| `pd_slideshow_fixed_sec` | number as string | `"5"` | Fixed interval seconds |
| `pd_slideshow_beat_min_sec` | number as string | `"3"` | Beat mode minimum interval seconds |

---

## Backend Changes (`slideshow.rs`)

### `collect_photos(folder, recursive: bool) -> Vec<PathBuf>`
- `recursive: false` → current `read_dir` flat scan (unchanged behavior)
- `recursive: true` → recursive traversal using `std::fs` (no new crate); visits all subdirectories to any depth, collecting files matching `PHOTO_EXTENSIONS`

### `watch_folder(path, recursive, state, app)`
- Gains a `recursive: bool` parameter
- Passes it to `collect_photos`
- Uses `RecursiveMode::All` when `recursive: true`, `RecursiveMode::NonRecursive` when `false`
- File-system watcher callback also uses the new `collect_photos` signature

---

## Hook Changes (`usePhotoLibrary`)

**New parameters:** `order: 'shuffle' | 'alpha'`, `recursive: boolean`

**Behavior:**
- Passes `recursive` to `watch_folder` IPC call
- On receiving `photo-list` event or initial `get_photos`:
  - `alpha` → sort paths alphabetically
  - `shuffle` → Fisher-Yates shuffle
- When `order` prop changes → re-run sort or shuffle on current photo list; `initialPhoto` resets
- When a new folder is selected via `setFolder`:
  - Writes path to `pd_last_folder`
  - Re-runs sort/shuffle on the new list
- Returns `initialPhoto: string | null`:
  - In `alpha` mode: reads `pd_last_photo[folder]`, returns that path if it exists in the current list; otherwise `null`
  - In `shuffle` mode: always `null`

**Re-shuffle/re-sort triggers:**
- New folder selected → always re-run (shuffle or sort)
- `order` mode changes → re-run on current list
- Same folder + same mode → no change (preserves position for alpha)

---

## Frontend Component Changes

### `SlideshowConfig` (type in `SlideshowConfigPanel.tsx`)
Two new fields added:
```ts
order:      'shuffle' | 'alpha'   // default: 'shuffle'
subfolders: boolean               // default: false
```

### `SlideshowConfigPanel`
- New radio group: "Shuffle" / "Alphabetic" (controls `config.order`)
- New checkbox: "Include subfolders" (controls `config.subfolders`)

### New `DisplaySettingsPanel` component
Sits below `SlideshowConfigPanel` in `ControlPanel`. Manages its own state read from localStorage on mount.

Controls:
- **Toast duration** — number input in seconds (1–60s), converts to ms internally; labeled "Toast duration (s)"
- **Song toast size** — slider or number input, range 0.5–3.0, step 0.1; labeled "Song toast size"
- **Volume toast size** — same control; labeled "Volume toast size"

All three values are written to localStorage immediately on change and passed to the display window via Tauri events (see below).

### `SongToast` and `VolumeToast`
- `DISPLAY_MS` constant replaced by a prop `displayMs: number`
- New prop `zoom: number` — applied as `transform: scale(zoom)` on the root element with `transform-origin` set to the toast's anchor corner (bottom-left for song, bottom-right for volume)
- Both toasts receive their props from `DisplayWindow`, which reads them from localStorage on mount and listens for a `display-settings-changed` event for live updates

### `display-settings-changed` event
Emitted by `ControlPanel` whenever toast duration or zoom values change. Payload:
```ts
{ toastDurationMs: number, songZoom: number, volumeZoom: number }
```
`DisplayWindow` listens for this event and updates its local state, so changes in the control panel take effect immediately without requiring a display window restart.

---

## `ControlPanel` Wiring

- On mount:
  - Read `pd_last_folder` → if present, call `library.setFolder()` automatically
  - Read `pd_order`, `pd_subfolder` → seed `config` state
  - Read `pd_slideshow_mode`, `pd_slideshow_fixed_sec`, `pd_slideshow_beat_min_sec` → seed `config` state
- `indexRef` seeded from `library.initialPhoto` when a folder loads (finds index in `library.photos`)
- On each `doNext`/`doPrev`: if `config.order === 'alpha'` and `library.folder` is set, write current photo path to `pd_last_photo[folder]`
- `setConfig` wrapper also persists changed slideshow keys to localStorage
- When `config.order` or `library.folder` changes → `usePhotoLibrary` handles re-shuffle/re-sort internally; `ControlPanel` re-seeds `indexRef` from `library.initialPhoto`

---

## Files Touched

| File | Change |
|------|--------|
| `src-tauri/src/slideshow.rs` | Add `recursive` param to `collect_photos` and `watch_folder` |
| `src/hooks/usePhotoLibrary.ts` | Add `order`, `recursive` params; initialPhoto; localStorage writes |
| `src/components/SlideshowConfigPanel.tsx` | Add `order` + `subfolders` fields and UI controls |
| `src/components/DisplaySettingsPanel.tsx` | New component — toast duration, song zoom, volume zoom |
| `src/components/SongToast.tsx` | Add `displayMs` + `zoom` props |
| `src/components/VolumeToast.tsx` | Add `displayMs` + `zoom` props |
| `src/windows/display/DisplayWindow.tsx` | Read settings from localStorage + listen for `display-settings-changed` |
| `src/windows/control/ControlPanel.tsx` | Wiring: auto-load folder, persist config, seed indexRef, emit settings |
