# Slideshow & Display Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable toast duration/zoom, persistent folder/order/resume settings, subfolder scanning, and slideshow order (shuffle/alphabetic) with per-folder resume position.

**Architecture:** Flat `localStorage` keys for all settings. Backend gains a `recursive: bool` param on `watch_folder`. `usePhotoLibrary` gains `order`/`recursive` params and returns `initialPhoto` for resume. A new `DisplaySettingsPanel` component owns toast settings; `DisplayWindow` syncs via a `display-settings-changed` Tauri event.

**Tech Stack:** Rust (Tauri commands), React + TypeScript, Tauri v2 event system, `localStorage`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/src-tauri/src/slideshow.rs` | Modify | Add `recursive` param to `collect_photos` + `watch_folder`; store flag in `SlideshowState` |
| `app/src/components/SlideshowConfigPanel.tsx` | Modify | Add `order` + `subfolders` fields to `SlideshowConfig` type/defaults; add UI controls |
| `app/src/hooks/usePhotoLibrary.ts` | Modify | Accept `order`/`recursive`; return `initialPhoto`; write `pd_last_folder` on `setFolder` |
| `app/src/components/DisplaySettingsPanel.tsx` | Create | Toast duration + per-toast zoom controls; reads/writes localStorage; emits event |
| `app/src/components/SongToast.tsx` | Modify | Accept `displayMs` + `zoom` props |
| `app/src/components/VolumeToast.tsx` | Modify | Accept `displayMs` + `zoom` props |
| `app/src/windows/display/DisplayWindow.tsx` | Modify | Read display settings from localStorage; listen for `display-settings-changed` |
| `app/src/windows/control/ControlPanel.tsx` | Modify | Auto-load last folder; persist config; seed `indexRef` from `initialPhoto`; save last photo on advance |

---

## Task 1: Backend — add `recursive` to `collect_photos` and `watch_folder`

**Files:**
- Modify: `app/src-tauri/src/slideshow.rs`

- [ ] **Step 1: Add `recursive` field to `SlideshowState` and update `collect_photos`**

Replace the existing `SlideshowState` struct and `collect_photos` function with:

```rust
#[derive(Default)]
pub struct SlideshowState {
    pub folder:    Mutex<Option<PathBuf>>,
    pub photos:    Mutex<Vec<PathBuf>>,
    pub watcher:   Mutex<Option<RecommendedWatcher>>,
    pub recursive: Mutex<bool>,
}

pub fn collect_photos(folder: &PathBuf, recursive: bool) -> Vec<PathBuf> {
    let mut photos = Vec::new();
    collect_photos_inner(folder, recursive, &mut photos);
    photos.sort();
    photos
}

fn collect_photos_inner(folder: &PathBuf, recursive: bool, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(folder) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_photos_inner(&path, recursive, out);
        } else if path.is_file()
            && path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| PHOTO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false)
        {
            out.push(path);
        }
    }
}
```

- [ ] **Step 2: Update `watch_folder` to accept and store `recursive`**

Replace the existing `watch_folder` command:

```rust
#[tauri::command]
pub fn watch_folder(
    path: String,
    recursive: bool,
    state: tauri::State<Arc<SlideshowState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let photos = collect_photos(&folder, recursive);
    {
        let mut f = state.folder.lock().unwrap();
        *f = Some(folder.clone());
        let mut p = state.photos.lock().unwrap();
        *p = photos.clone();
        let mut r = state.recursive.lock().unwrap();
        *r = recursive;
    }

    let payload = PhotoListPayload {
        paths: photos.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
    };
    app.emit("photo-list", payload.clone()).map_err(|e| e.to_string())?;

    let state_arc = Arc::clone(&*state);
    let app2 = app.clone();
    let folder2 = folder.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            use notify::EventKind::*;
            match event.kind {
                Create(_) | Remove(_) | Modify(notify::event::ModifyKind::Name(_)) => {
                    let is_recursive = *state_arc.recursive.lock().unwrap();
                    let new_photos = collect_photos(&folder2, is_recursive);
                    let mut p = state_arc.photos.lock().unwrap();
                    *p = new_photos.clone();
                    let payload = PhotoListPayload {
                        paths: new_photos.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
                    };
                    let _ = app2.emit("photo-list", payload);
                }
                _ => {}
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let watch_mode = if recursive {
        RecursiveMode::All
    } else {
        RecursiveMode::NonRecursive
    };
    watcher.watch(&folder, watch_mode).map_err(|e| e.to_string())?;

    *state.watcher.lock().unwrap() = Some(watcher);
    Ok(())
}
```

- [ ] **Step 3: Update existing test and add recursive test**

Replace the `#[cfg(test)]` block at the bottom of `slideshow.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collect_photos_filters_extensions() {
        let dir = std::env::temp_dir().join("party_display_test_flat");
        fs::create_dir_all(&dir).unwrap();

        let keep = ["a.jpg", "b.jpeg", "c.png", "d.webp"];
        let skip = ["e.txt", "f.mp4", "g.pdf"];

        for name in keep.iter().chain(skip.iter()) {
            fs::write(dir.join(name), b"").unwrap();
        }

        let result = collect_photos(&dir, false);
        let names: Vec<&str> = result
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();

        for k in &keep { assert!(names.contains(k), "expected {k}"); }
        for s in &skip { assert!(!names.contains(s), "did not expect {s}"); }

        for name in keep.iter().chain(skip.iter()) {
            let _ = fs::remove_file(dir.join(name));
        }
    }

    #[test]
    fn collect_photos_recursive_finds_nested() {
        let root = std::env::temp_dir().join("party_display_test_recursive");
        let sub  = root.join("sub");
        fs::create_dir_all(&sub).unwrap();

        fs::write(root.join("top.jpg"), b"").unwrap();
        fs::write(sub.join("nested.png"), b"").unwrap();
        fs::write(sub.join("skip.txt"), b"").unwrap();

        let flat      = collect_photos(&root, false);
        let recursive = collect_photos(&root, true);

        let flat_names: Vec<&str> = flat.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        let rec_names: Vec<&str> = recursive.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();

        assert!(flat_names.contains(&"top.jpg"));
        assert!(!flat_names.contains(&"nested.png"), "flat should not find nested");

        assert!(rec_names.contains(&"top.jpg"));
        assert!(rec_names.contains(&"nested.png"), "recursive should find nested");
        assert!(!rec_names.contains(&"skip.txt"));

        let _ = fs::remove_file(root.join("top.jpg"));
        let _ = fs::remove_file(sub.join("nested.png"));
        let _ = fs::remove_file(sub.join("skip.txt"));
        let _ = fs::remove_dir(&sub);
        let _ = fs::remove_dir(&root);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd app && cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass including `collect_photos_recursive_finds_nested`.

- [ ] **Step 5: Commit**

```bash
cd app && git add src-tauri/src/slideshow.rs
git commit -m "feat(backend): add recursive scanning to watch_folder and collect_photos"
```

---

## Task 2: Extend `SlideshowConfig` type with `order` and `subfolders`

**Files:**
- Modify: `app/src/components/SlideshowConfigPanel.tsx`

- [ ] **Step 1: Update the `SlideshowConfig` interface and defaults**

Replace the top of `SlideshowConfigPanel.tsx` (the interface and default export):

```typescript
export interface SlideshowConfig {
  mode:       'fixed' | 'beat'
  fixedSec:   number
  beatMinSec: number
  order:      'shuffle' | 'alpha'
  subfolders: boolean
}

export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  mode:       'fixed',
  fixedSec:   5,
  beatMinSec: 3,
  order:      'shuffle',
  subfolders: false,
}
```

- [ ] **Step 2: Add `order` and `subfolders` UI controls to the panel**

Replace the full `SlideshowConfigPanel` function body (keep existing `label`/`numInput` style constants):

```typescript
export function SlideshowConfigPanel({ config, onChange, hasPhotos, paused, onTogglePause }: Props) {
  function set(patch: Partial<SlideshowConfig>) {
    onChange({ ...config, ...patch })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Slideshow
        </p>
        <button
          onClick={onTogglePause}
          title="Space bar"
          style={{
            background: paused ? '#e74c3c22' : '#1db95422',
            border: `1px solid ${paused ? '#e74c3c' : '#1db954'}`,
            color: paused ? '#e74c3c' : '#1db954',
            borderRadius: 4, padding: '2px 10px', cursor: 'pointer',
            fontFamily: 'monospace', fontSize: 12,
          }}
        >
          {paused ? '⏸ Paused' : '▶ Running'}
        </button>
      </div>

      {/* Advance mode */}
      <label style={label}>
        <input type="radio" checked={config.mode === 'fixed'} onChange={() => set({ mode: 'fixed' })} />
        Fixed — every
        <input
          type="number" min={1} max={3600} value={config.fixedSec}
          onChange={e => set({ fixedSec: Math.max(1, Number(e.target.value)) })}
          style={numInput} disabled={config.mode !== 'fixed'}
        />
        seconds
      </label>

      <label style={label}>
        <input type="radio" checked={config.mode === 'beat'} onChange={() => set({ mode: 'beat' })} />
        Follow beat — min
        <input
          type="number" min={1} max={60} value={config.beatMinSec}
          onChange={e => set({ beatMinSec: Math.max(1, Number(e.target.value)) })}
          style={numInput} disabled={config.mode !== 'beat'}
        />
        seconds between changes
      </label>

      {/* Photo order */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
        <span style={{ color: '#888', fontSize: 12 }}>Order:</span>
        <label style={label}>
          <input type="radio" checked={config.order === 'shuffle'} onChange={() => set({ order: 'shuffle' })} />
          Shuffle
        </label>
        <label style={label}>
          <input type="radio" checked={config.order === 'alpha'} onChange={() => set({ order: 'alpha' })} />
          Alphabetic
        </label>
      </div>

      {/* Subfolders */}
      <label style={label}>
        <input
          type="checkbox"
          checked={config.subfolders}
          onChange={e => set({ subfolders: e.target.checked })}
        />
        Include subfolders
      </label>

      {!hasPhotos && (
        <p style={{ margin: 0, color: '#666', fontSize: 12 }}>Select a photo folder above to start the slideshow.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd app && git add src/components/SlideshowConfigPanel.tsx
git commit -m "feat(ui): add order and subfolders fields to SlideshowConfig"
```

---

## Task 3: Update `usePhotoLibrary` — order, recursive, initialPhoto, persistence

**Files:**
- Modify: `app/src/hooks/usePhotoLibrary.ts`

- [ ] **Step 1: Rewrite `usePhotoLibrary`**

Replace the entire file content:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface PhotoLibraryState {
  folder:       string | null
  photos:       string[]
  initialPhoto: string | null
}

interface Options {
  order:     'shuffle' | 'alpha'
  recursive: boolean
}

export function usePhotoLibrary({ order, recursive }: Options) {
  const [state, setState] = useState<PhotoLibraryState>({
    folder: null, photos: [], initialPhoto: null,
  })

  // Keep refs so event-handler closures always see latest values without re-subscribing
  const orderRef     = useRef(order)
  const folderRef    = useRef<string | null>(null)
  orderRef.current   = order

  function applyOrder(
    rawPaths: string[],
    folderPath: string | null,
  ): { photos: string[]; initialPhoto: string | null } {
    if (orderRef.current === 'alpha') {
      const sorted      = [...rawPaths].sort()
      const saved       = folderPath ? getSavedLastPhoto(folderPath) : null
      const initialPhoto = saved && sorted.includes(saved) ? saved : null
      return { photos: sorted, initialPhoto }
    }
    return { photos: shuffle([...rawPaths]), initialPhoto: null }
  }

  // On mount: fetch whatever the watcher already has
  useEffect(() => {
    invoke<string[]>('get_photos').then(paths => {
      if (paths.length > 0) {
        const { photos, initialPhoto } = applyOrder(paths, folderRef.current)
        setState(s => ({ ...s, photos, initialPhoto }))
      }
    }).catch(() => {})
  }, [])

  // Re-apply order when `order` prop changes (re-sort or re-shuffle current list)
  useEffect(() => {
    setState(s => {
      if (s.photos.length === 0) return s
      const { photos, initialPhoto } = applyOrder(s.photos, s.folder)
      return { ...s, photos, initialPhoto }
    })
  }, [order])

  // Listen for file-system watcher updates
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>('photo-list', ({ payload }) => {
      const { photos, initialPhoto } = applyOrder(payload.paths, folderRef.current)
      setState(s => ({ ...s, photos, initialPhoto }))
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const setFolder = useCallback(async (folder: string) => {
    folderRef.current = folder
    setState(s => ({ ...s, folder }))
    localStorage.setItem('pd_last_folder', folder)
    await invoke('watch_folder', { path: folder, recursive })
    // initial list arrives via photo-list event
  }, [recursive])

  return { ...state, setFolder }
}

function getSavedLastPhoto(folder: string): string | null {
  const raw = localStorage.getItem('pd_last_photo')
  if (!raw) return null
  try {
    const map: Record<string, string> = JSON.parse(raw)
    return map[folder] ?? null
  } catch {
    return null
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
```

- [ ] **Step 2: Commit**

```bash
cd app && git add src/hooks/usePhotoLibrary.ts
git commit -m "feat(hook): add order/recursive/initialPhoto/persistence to usePhotoLibrary"
```

---

## Task 4: Create `DisplaySettingsPanel` component

**Files:**
- Create: `app/src/components/DisplaySettingsPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useEffect, useState } from 'react'
import { emit } from '@tauri-apps/api/event'

export interface DisplaySettings {
  toastDurationMs: number
  songZoom:        number
  volumeZoom:      number
}

export function readDisplaySettings(): DisplaySettings {
  return {
    toastDurationMs: Number(localStorage.getItem('pd_toast_duration_ms') ?? '5000'),
    songZoom:        Number(localStorage.getItem('pd_song_toast_zoom')    ?? '1'),
    volumeZoom:      Number(localStorage.getItem('pd_volume_toast_zoom')  ?? '1'),
  }
}

const label: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: 14,
}

const numInput: React.CSSProperties = {
  width: 56, background: '#222', border: '1px solid #444', color: '#eee',
  borderRadius: 4, padding: '3px 6px', fontFamily: 'monospace', fontSize: 13,
}

export function DisplaySettingsPanel() {
  const [settings, setSettings] = useState<DisplaySettings>(readDisplaySettings)

  // Sync to localStorage and notify display window
  useEffect(() => {
    localStorage.setItem('pd_toast_duration_ms', String(settings.toastDurationMs))
    localStorage.setItem('pd_song_toast_zoom',    String(settings.songZoom))
    localStorage.setItem('pd_volume_toast_zoom',  String(settings.volumeZoom))
    emit('display-settings-changed', settings).catch(console.error)
  }, [settings])

  function set(patch: Partial<DisplaySettings>) {
    setSettings(s => ({ ...s, ...patch }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        Display
      </p>

      {/* Toast duration */}
      <label style={label}>
        Toast duration
        <input
          type="number" min={1} max={60}
          value={Math.round(settings.toastDurationMs / 1000)}
          onChange={e => set({ toastDurationMs: Math.max(1, Number(e.target.value)) * 1000 })}
          style={numInput}
        />
        s
      </label>

      {/* Song toast zoom */}
      <label style={label}>
        Song toast size
        <input
          type="number" min={0.5} max={3} step={0.1}
          value={settings.songZoom}
          onChange={e => set({ songZoom: Math.min(3, Math.max(0.5, Number(e.target.value))) })}
          style={numInput}
        />
        ×
      </label>

      {/* Volume toast zoom */}
      <label style={label}>
        Volume toast size
        <input
          type="number" min={0.5} max={3} step={0.1}
          value={settings.volumeZoom}
          onChange={e => set({ volumeZoom: Math.min(3, Math.max(0.5, Number(e.target.value))) })}
          style={numInput}
        />
        ×
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd app && git add src/components/DisplaySettingsPanel.tsx
git commit -m "feat(ui): add DisplaySettingsPanel for toast duration and zoom settings"
```

---

## Task 5: Update `SongToast` and `VolumeToast` — add `displayMs` and `zoom` props

**Files:**
- Modify: `app/src/components/SongToast.tsx`
- Modify: `app/src/components/VolumeToast.tsx`

- [ ] **Step 1: Update `SongToast`**

Replace the entire file:

```typescript
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export interface TrackChangedPayload {
  name:     string
  artists:  string
  albumArt: string
}

interface Props {
  displayMs: number
  zoom:      number
}

export function SongToast({ displayMs, zoom }: Props) {
  const [track, setTrack]     = useState<TrackChangedPayload | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unlisten = listen<TrackChangedPayload>('track-changed', ({ payload }) => {
      setTrack(payload)
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), displayMs)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [displayMs])

  if (!track) return null

  return (
    <div style={{
      position:        'fixed',
      bottom:          32,
      left:            32,
      display:         'flex',
      alignItems:      'center',
      gap:             12,
      background:      'rgba(0,0,0,0.78)',
      backdropFilter:  'blur(10px)',
      borderRadius:    12,
      padding:         '10px 16px 10px 10px',
      zIndex:          200,
      maxWidth:        320,
      opacity:         visible ? 1 : 0,
      transform:       `scale(${zoom})`,
      transformOrigin: 'bottom left',
      transition:      'opacity 0.4s ease',
      pointerEvents:   'none',
    }}>
      {track.albumArt && (
        <img
          src={track.albumArt}
          alt=""
          style={{ width: 52, height: 52, borderRadius: 6, flexShrink: 0, objectFit: 'cover' }}
        />
      )}
      <div style={{ overflow: 'hidden' }}>
        <div style={{
          color: '#fff', fontWeight: 700, fontSize: 14,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {track.name}
        </div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>{track.artists}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `VolumeToast`**

Replace the entire file:

```typescript
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export interface VolumeChangedPayload {
  volume: number  // 0–1
}

interface Props {
  displayMs: number
  zoom:      number
}

export function VolumeToast({ displayMs, zoom }: Props) {
  const [volume, setVolume]   = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unlisten = listen<VolumeChangedPayload>('volume-changed', ({ payload }) => {
      setVolume(payload.volume)
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), displayMs)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [displayMs])

  const pct  = Math.round(volume * 100)
  const icon = volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'

  return (
    <div style={{
      position:        'fixed',
      bottom:          32,
      right:           32,
      display:         'flex',
      alignItems:      'center',
      gap:             10,
      background:      'rgba(0,0,0,0.78)',
      backdropFilter:  'blur(10px)',
      borderRadius:    10,
      padding:         '10px 16px',
      zIndex:          200,
      minWidth:        160,
      opacity:         visible ? 1 : 0,
      transform:       `scale(${zoom})`,
      transformOrigin: 'bottom right',
      transition:      'opacity 0.4s ease',
      pointerEvents:   'none',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          height: 4, background: '#333', borderRadius: 2, overflow: 'hidden', marginBottom: 4,
        }}>
          <div style={{
            width: `${pct}%`, height: '100%', background: '#1db954',
            borderRadius: 2, transition: 'width 0.15s ease',
          }} />
        </div>
        <div style={{ color: '#aaa', fontSize: 12 }}>{pct}%</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd app && git add src/components/SongToast.tsx src/components/VolumeToast.tsx
git commit -m "feat(ui): add displayMs and zoom props to SongToast and VolumeToast"
```

---

## Task 6: Update `DisplayWindow` — wire display settings to toasts

**Files:**
- Modify: `app/src/windows/display/DisplayWindow.tsx`

- [ ] **Step 1: Rewrite `DisplayWindow`**

Replace the entire file:

```typescript
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'
import { readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary({ order: 'shuffle', recursive: false })
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)

  function handleDoubleClick() {
    invoke('toggle_display_fullscreen').catch(console.error)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') invoke('exit_display_fullscreen').catch(console.error)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Live-update display settings from control panel
  useEffect(() => {
    const unlisten = listen<DisplaySettings>('display-settings-changed', ({ payload }) => {
      setDisplaySettings(payload)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  useHotkeys({
    onNext:        () => emit('display-hotkey', { action: 'next'  }).catch(console.error),
    onPrev:        () => emit('display-hotkey', { action: 'prev'  }).catch(console.error),
    onTogglePause: () => emit('display-hotkey', { action: 'pause' }).catch(console.error),
  })

  return (
    <div style={{ width: '100vw', height: '100vh' }} onDoubleClick={handleDoubleClick}>
      <SlideshowView photos={photos} />
      <SongToast
        displayMs={displaySettings.toastDurationMs}
        zoom={displaySettings.songZoom}
      />
      <VolumeToast
        displayMs={displaySettings.toastDurationMs}
        zoom={displaySettings.volumeZoom}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd app && git add src/windows/display/DisplayWindow.tsx
git commit -m "feat(display): wire display settings and zoom to toasts in DisplayWindow"
```

---

## Task 7: Update `ControlPanel` — full wiring

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx`

- [ ] **Step 1: Update imports and config initializer**

At the top of `ControlPanel.tsx`, replace the existing imports and the `ControlPanel` function opening (through the first `useState` for `config`):

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import LoginButton from '../../components/LoginButton'
import NowPlaying from '../../components/NowPlaying'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { FolderPicker } from '../../components/FolderPicker'
import { DisplayWindowControls } from '../../components/DisplayWindowControls'
import { PlayerControls } from '../../components/PlayerControls'
import { SlideshowConfigPanel, DEFAULT_SLIDESHOW_CONFIG } from '../../components/SlideshowConfigPanel'
import { DisplaySettingsPanel } from '../../components/DisplaySettingsPanel'
import type { SlideshowConfig } from '../../components/SlideshowConfigPanel'
import { useAuth } from '../../hooks/useAuth'
import { useFftData } from '../../hooks/useFftData'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useBeatScheduler } from '../../hooks/useBeatScheduler'
import { useHotkeys } from '../../hooks/useHotkeys'
import { advancePhoto } from '../../hooks/useDisplaySync'

function readSlideshowConfig(): SlideshowConfig {
  return {
    mode:       (localStorage.getItem('pd_slideshow_mode') as SlideshowConfig['mode'])
                  ?? DEFAULT_SLIDESHOW_CONFIG.mode,
    fixedSec:   Number(localStorage.getItem('pd_slideshow_fixed_sec')     ?? DEFAULT_SLIDESHOW_CONFIG.fixedSec),
    beatMinSec: Number(localStorage.getItem('pd_slideshow_beat_min_sec')  ?? DEFAULT_SLIDESHOW_CONFIG.beatMinSec),
    order:      (localStorage.getItem('pd_order') as SlideshowConfig['order'])
                  ?? DEFAULT_SLIDESHOW_CONFIG.order,
    subfolders: localStorage.getItem('pd_subfolder') === 'true',
  }
}

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error: authError, login, logout } = useAuth()
  const player  = useSpotifyPlayer(authenticated ? accessToken : null)
  const bins    = useFftData()
  const [config, setConfigState] = useState<SlideshowConfig>(readSlideshowConfig)
  const library = usePhotoLibrary({ order: config.order, recursive: config.subfolders })
```

- [ ] **Step 2: Add `setConfig` wrapper that persists to localStorage**

After the `library` line, replace the existing `setConfig` / `useState` for config and the `slideshowPaused` state:

```typescript
  const [slideshowPaused, setSlideshowPaused] = useState(false)

  function setConfig(c: SlideshowConfig) {
    setConfigState(c)
    localStorage.setItem('pd_slideshow_mode',         c.mode)
    localStorage.setItem('pd_slideshow_fixed_sec',    String(c.fixedSec))
    localStorage.setItem('pd_slideshow_beat_min_sec', String(c.beatMinSec))
    localStorage.setItem('pd_order',                  c.order)
    localStorage.setItem('pd_subfolder',              String(c.subfolders))
  }
```

- [ ] **Step 3: Update `showAt` to save last photo in alpha mode**

Replace the existing `showAt` callback:

```typescript
  const showAt = useCallback((idx: number) => {
    if (library.photos.length === 0) return
    const i = ((idx % library.photos.length) + library.photos.length) % library.photos.length
    indexRef.current = i
    const photo = library.photos[i]
    advancePhoto(photo).catch(console.error)
    if (config.order === 'alpha' && library.folder) {
      const raw = localStorage.getItem('pd_last_photo')
      const map: Record<string, string> = raw ? JSON.parse(raw) : {}
      map[library.folder] = photo
      localStorage.setItem('pd_last_photo', JSON.stringify(map))
    }
  }, [library.photos, library.folder, config.order])
```

- [ ] **Step 4: Add effect to seed `indexRef` and show initial photo when photos load**

Add this effect after the existing `doNext`/`doPrev`/`togglePause` declarations:

```typescript
  // Seed indexRef from resume position (or 0) whenever the photo list changes
  useEffect(() => {
    if (library.photos.length === 0) return
    const startIdx = library.initialPhoto
      ? Math.max(0, library.photos.indexOf(library.initialPhoto))
      : 0
    showAt(startIdx)
  }, [library.photos])
```

- [ ] **Step 5: Add effect to auto-load last folder on mount**

Add this effect (runs once on mount):

```typescript
  useEffect(() => {
    const lastFolder = localStorage.getItem('pd_last_folder')
    if (lastFolder) library.setFolder(lastFolder)
  }, [])
```

- [ ] **Step 6: Add `DisplaySettingsPanel` to the JSX**

In the return JSX, add `<DisplaySettingsPanel />` after `<SlideshowConfigPanel ... />`:

```tsx
        <SlideshowConfigPanel
          config={config}
          onChange={setConfig}
          hasPhotos={library.photos.length > 0}
          paused={slideshowPaused}
          onTogglePause={togglePause}
        />
        <DisplaySettingsPanel />
        <DisplayWindowControls />
```

- [ ] **Step 7: Commit**

```bash
cd app && git add src/windows/control/ControlPanel.tsx
git commit -m "feat(control): persist config, auto-load last folder, resume position, wire display settings panel"
```

---

## Task 8: Build verification

- [ ] **Step 1: Run TypeScript type check**

```bash
cd app && npm run build 2>&1 | head -60
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 2: Run Tauri dev to smoke-test**

```bash
cd app && npm run tauri dev
```

Manual checks:
1. Pick a folder — it persists after restarting the app
2. Switch to Alphabetic order — photos sort; browse a few; restart — resumes at last photo
3. Switch to Shuffle — photos re-shuffle; restart — starts at photo 0
4. Enable "Include subfolders" — photos from subdirectories appear
5. Change Toast duration and zoom — toasts in display window reflect new values immediately
6. SlideshowConfig (mode, fixedSec, beatMinSec) persists across restarts

- [ ] **Step 3: Final commit if any fixups were needed**

```bash
cd app && git add -p
git commit -m "fix: address build issues from display settings integration"
```
