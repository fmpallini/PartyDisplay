# Local Audio Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Local Files audio source alongside Spotify, with folder scanning, ID3 metadata reading, and the same player controls / display-window integration.

**Architecture:** A new Rust command scans audio directories using `std::fs`. A new `useLocalPlayer` hook drives an HTML5 `<audio>` element via Tauri's `asset://` protocol and reads ID3 tags with the `music-metadata` npm package, implementing the same `PlayerState & PlayerControls` interface as `useSpotifyPlayer`. ControlPanel runs both hooks simultaneously and routes the active source's state to all consumers. No downstream components (lyrics, display window, toasts, hotkeys) require changes.

**Tech Stack:** React 18, TypeScript, Tauri v2, Rust std::fs, music-metadata (npm v9+), HTML5 Audio API, Tauri asset:// protocol

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/src/lib/player-types.ts` | **Create** | Shared TrackInfo, PlayerState, PlayerControls types |
| `app/src/lib/utils.ts` | **Modify** | Add `shuffle<T>` helper |
| `app/src/hooks/useSpotifyPlayer.ts` | **Modify** | Re-export types from player-types.ts instead of defining them |
| `app/src/hooks/useLyrics.ts` | **Modify** | Import TrackInfo from player-types.ts |
| `app/src/components/PlayerControls.tsx` | **Modify** | Import TrackInfo from player-types.ts |
| `app/src/windows/display/DisplayWindow.tsx` | **Modify** | Replace inline TrackInfo with import from player-types.ts |
| `app/src/hooks/useLocalPlayer.ts` | **Create** | Local audio playback hook |
| `app/src-tauri/src/local_audio.rs` | **Create** | scan_audio_folder Rust command |
| `app/src-tauri/src/main.rs` | **Modify** | Add `mod local_audio`, register command |
| `app/src-tauri/capabilities/default.json` | **Modify** | Add core:asset:allow permission |
| `app/src/windows/control/ControlPanel.tsx` | **Modify** | Source state, both hooks, switching logic, playlist scanning, UI |

---

## Task 1: Add music-metadata npm dependency

**Files:**
- Modify: `app/package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
cd app
npm install music-metadata
```

Expected output: package added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Verify the import resolves**

Add a temporary import at the top of any existing `.ts` file, run `npm run build` (or `npx tsc --noEmit`), confirm no resolution error, then remove the temporary import.

```ts
// temporary — just check it resolves
import { parseBlob } from 'music-metadata'
```

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "chore: add music-metadata dependency"
```

---

## Task 2: Extract shared player types

**Files:**
- Create: `app/src/lib/player-types.ts`
- Modify: `app/src/hooks/useSpotifyPlayer.ts`
- Modify: `app/src/hooks/useLyrics.ts`
- Modify: `app/src/components/PlayerControls.tsx`
- Modify: `app/src/windows/display/DisplayWindow.tsx`
- Modify: `app/src/lib/utils.ts`

- [ ] **Step 1: Create `app/src/lib/player-types.ts`**

```ts
export interface TrackInfo {
  id:       string   // Spotify: track ID; Local Files: file path
  name:     string
  artists:  string
  albumArt: string   // URL or data URL; empty string if absent
  duration: number   // ms
}

export interface PlayerState {
  ready:      boolean
  deviceId:   string | null
  track:      TrackInfo | null
  paused:     boolean
  positionMs: number
  volume:     number   // 0–1
  error:      string | null
}

export interface PlayerControls {
  togglePlay: () => void
  nextTrack:  () => void
  prevTrack:  () => void
  seek:       (ms: number) => void
  setVolume:  (v: number) => void
}
```

- [ ] **Step 2: Update `useSpotifyPlayer.ts` to re-export from the shared file**

Remove the three interface definitions and replace with a re-export:

```ts
export type { TrackInfo, PlayerState, PlayerControls } from '../lib/player-types'
```

Keep the rest of the file unchanged. The `useSpotifyPlayer` function signature and return type remain the same.

- [ ] **Step 3: Update `useLyrics.ts`**

Change:
```ts
import type { TrackInfo } from './useSpotifyPlayer'
```
To:
```ts
import type { TrackInfo } from '../lib/player-types'
```

- [ ] **Step 4: Update `components/PlayerControls.tsx`**

Change:
```ts
import type { TrackInfo } from '../hooks/useSpotifyPlayer'
```
To:
```ts
import type { TrackInfo } from '../lib/player-types'
```

- [ ] **Step 5: Update `windows/display/DisplayWindow.tsx`**

Remove the inline interface at line 22:
```ts
interface TrackInfo { name: string; artists: string; id: string; duration: number; albumArt: string }
```
Add import at the top with the other imports:
```ts
import type { TrackInfo } from '../../lib/player-types'
```

- [ ] **Step 6: Add `shuffle` to `app/src/lib/utils.ts`**

Append to the file:

```ts
/** Fisher-Yates shuffle — returns a new shuffled array, does not mutate the input. */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
```

- [ ] **Step 7: Verify the build compiles cleanly**

```bash
cd app
npm run build
```

Expected: no TypeScript errors. Fix any import mismatches before continuing.

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/player-types.ts app/src/lib/utils.ts \
        app/src/hooks/useSpotifyPlayer.ts app/src/hooks/useLyrics.ts \
        app/src/components/PlayerControls.tsx \
        app/src/windows/display/DisplayWindow.tsx
git commit -m "refactor: extract shared player types to player-types.ts; add shuffle util"
```

---

## Task 3: Rust scan_audio_folder command

**Files:**
- Create: `app/src-tauri/src/local_audio.rs`
- Modify: `app/src-tauri/src/main.rs`

- [ ] **Step 1: Create `app/src-tauri/src/local_audio.rs`**

```rust
use std::fs;
use std::path::Path;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "ogg", "flac", "m4a", "aac", "opus",
];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn collect_audio_files(dir: &Path, recursive: bool, out: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(err) => {
            eprintln!("[local_audio] cannot read {:?}: {err}", dir);
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_audio_files(&path, recursive, out);
        } else if path.is_file() && is_audio_file(&path) {
            if let Some(s) = path.to_str() {
                out.push(s.to_owned());
            }
        }
    }
}

/// Scan a directory for audio files and return their absolute paths, sorted alphabetically.
/// Supported extensions: mp3, wav, ogg, flac, m4a, aac, opus (case-insensitive).
#[tauri::command]
pub fn scan_audio_folder(path: String, recursive: bool) -> Result<Vec<String>, String> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }
    let mut files = Vec::new();
    collect_audio_files(dir, recursive, &mut files);
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;

    #[test]
    fn test_scan_returns_sorted_audio_files() {
        let dir = std::env::temp_dir().join("pd_test_audio");
        fs::create_dir_all(&dir).unwrap();
        // Create dummy audio files
        for name in &["charlie.mp3", "alpha.flac", "bravo.wav"] {
            File::create(dir.join(name)).unwrap().write_all(b"").unwrap();
        }
        // Create a non-audio file that should be excluded
        File::create(dir.join("ignore.txt")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), false).unwrap();

        assert_eq!(result.len(), 3);
        assert!(result[0].ends_with("alpha.flac"));
        assert!(result[1].ends_with("bravo.wav"));
        assert!(result[2].ends_with("charlie.mp3"));

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_scan_recursive() {
        let dir = std::env::temp_dir().join("pd_test_audio_rec");
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        File::create(dir.join("root.mp3")).unwrap().write_all(b"").unwrap();
        File::create(sub.join("nested.mp3")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), true).unwrap();
        assert_eq!(result.len(), 2);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_scan_nonrecursive_excludes_subdirs() {
        let dir = std::env::temp_dir().join("pd_test_audio_norec");
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        File::create(dir.join("root.mp3")).unwrap().write_all(b"").unwrap();
        File::create(sub.join("nested.mp3")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), false).unwrap();
        assert_eq!(result.len(), 1);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_scan_missing_path_returns_err() {
        let result = scan_audio_folder("/nonexistent/path/xyz".to_owned(), false);
        assert!(result.is_err());
    }

    #[test]
    fn test_scan_case_insensitive_extensions() {
        let dir = std::env::temp_dir().join("pd_test_audio_case");
        fs::create_dir_all(&dir).unwrap();
        File::create(dir.join("track.MP3")).unwrap().write_all(b"").unwrap();
        File::create(dir.join("track.Flac")).unwrap().write_all(b"").unwrap();

        let result = scan_audio_folder(dir.to_str().unwrap().to_owned(), false).unwrap();
        assert_eq!(result.len(), 2);

        fs::remove_dir_all(&dir).unwrap();
    }
}
```

- [ ] **Step 2: Register the module and command in `main.rs`**

Add `mod local_audio;` with the other mod declarations at the top of `main.rs`:

```rust
mod local_audio;
```

Add `local_audio::scan_audio_folder` to the `invoke_handler` macro (alongside the existing commands):

```rust
local_audio::scan_audio_folder,
```

- [ ] **Step 3: Run the Rust tests**

```bash
cd app/src-tauri
cargo test local_audio
```

Expected: 5 tests pass.

- [ ] **Step 4: Verify the app still compiles**

```bash
cd app/src-tauri
cargo build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/local_audio.rs app/src-tauri/src/main.rs
git commit -m "feat: add scan_audio_folder Rust command with tests"
```

---

## Task 4: Configure Tauri asset protocol

**Files:**
- Modify: `app/src-tauri/capabilities/default.json`

The `asset://` protocol is already enabled via the `protocol-asset` Cargo feature, but the capabilities file must explicitly grant access. Without this, `<audio src="asset://...">` will be blocked by Tauri's security layer.

- [ ] **Step 1: Update `app/src-tauri/capabilities/default.json`**

Add `"core:asset:allow"` to the permissions array. The `allow` scope of `**` permits any local path the user picks at runtime, which is appropriate for a music player:

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
    "dialog:default",
    {
      "identifier": "core:asset:allow",
      "allow": [{ "path": "**" }]
    }
  ]
}
```

- [ ] **Step 2: Rebuild to verify no capability errors**

```bash
cd app/src-tauri
cargo build
```

Expected: no errors or warnings about unknown permissions.

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/capabilities/default.json
git commit -m "feat: grant asset protocol access for local audio playback"
```

---

## Task 5: Implement useLocalPlayer hook

**Files:**
- Create: `app/src/hooks/useLocalPlayer.ts`

- [ ] **Step 1: Create `app/src/hooks/useLocalPlayer.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseBlob } from 'music-metadata'
import type { TrackInfo, PlayerState, PlayerControls } from '../lib/player-types'

/** Convert an absolute file path to a Tauri asset:// URL. */
function pathToAssetUrl(filePath: string): string {
  return (
    'asset://localhost/' +
    filePath
      .replace(/\\/g, '/')
      .split('/')
      .map((seg, i) =>
        // Preserve Windows drive letter (e.g. "C:") as-is; encode everything else
        i === 0 && /^[a-zA-Z]:$/.test(seg) ? seg : encodeURIComponent(seg)
      )
      .join('/')
  )
}

/** Extract the filename without extension from a path. Used as a title fallback. */
function stemFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

const IDLE_STATE: PlayerState = {
  ready: false, deviceId: null, track: null,
  paused: true, positionMs: 0, volume: 0.8, error: null,
}

/**
 * Plays a pre-ordered playlist of local audio files via an HTML5 Audio element
 * served through Tauri's asset:// protocol.
 *
 * @param playlist  Ordered array of absolute file paths.
 * @param active    When false the hook pauses audio and idles (Spotify is active).
 */
export function useLocalPlayer(
  playlist: string[],
  active: boolean,
): PlayerState & PlayerControls {
  const [state, setState] = useState<PlayerState>(IDLE_STATE)

  const audioRef    = useRef<HTMLAudioElement>(new Audio())
  const indexRef    = useRef(0)
  const activeRef   = useRef(active)
  const albumArtRef = useRef<string>('')  // tracks the current object URL so we can revoke it

  activeRef.current = active

  // ── Load track by playlist index ──────────────────────────────────────────
  const loadIndex = useCallback((idx: number, autoPlay = false) => {
    if (playlist.length === 0) return
    const i = ((idx % playlist.length) + playlist.length) % playlist.length
    indexRef.current = i
    const path = playlist[i]
    audioRef.current.src = pathToAssetUrl(path)
    audioRef.current.load()
    if (autoPlay) audioRef.current.play().catch(() => {})
  }, [playlist])

  // ── Audio event listeners (set up once, stable for app lifetime) ──────────
  useEffect(() => {
    const audio = audioRef.current

    const onLoadedMetadata = async () => {
      const path = playlist[indexRef.current]  // read via closure — playlist is stable per render
      const url  = pathToAssetUrl(path)

      let name     = stemFromPath(path)
      let artists  = ''
      let albumArt = ''
      const duration = audio.duration * 1000

      try {
        const response = await fetch(url)
        const blob     = await response.blob()
        const meta     = await parseBlob(blob)

        if (meta.common.title)  name    = meta.common.title
        if (meta.common.artist) artists = meta.common.artist

        const pic = meta.common.picture?.[0]
        if (pic) {
          // Revoke previous object URL to avoid memory leaks
          if (albumArtRef.current) URL.revokeObjectURL(albumArtRef.current)
          const picBlob = new Blob([pic.data], { type: pic.format })
          albumArt = URL.createObjectURL(picBlob)
          albumArtRef.current = albumArt
        }
      } catch (err) {
        console.warn('[useLocalPlayer] metadata parse failed for', path, err)
      }

      setState(s => ({
        ...s,
        ready: true,
        track: { id: path, name, artists, albumArt, duration },
        positionMs: 0,
        error: null,
      }))
    }

    const onTimeUpdate = () => {
      setState(s => ({ ...s, positionMs: audio.currentTime * 1000 }))
    }

    const onPlay  = () => setState(s => ({ ...s, paused: false }))
    const onPause = () => setState(s => ({ ...s, paused: true  }))

    const onEnded = () => {
      const nextIdx = indexRef.current + 1
      loadIndex(nextIdx, activeRef.current)
    }

    const onError = () => {
      const path = playlist[indexRef.current]
      const err  = audio.error
      console.error(
        `[useLocalPlayer] error on "${path}" — code=${err?.code ?? '?'} ` +
        `message="${err?.message ?? 'unknown'}" — skipping to next track`
      )
      setState(s => ({ ...s, error: `Skipped: ${stemFromPath(path)}` }))
      const nextIdx = indexRef.current + 1
      if (nextIdx < playlist.length) {
        loadIndex(nextIdx, activeRef.current)
      }
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate',     onTimeUpdate)
    audio.addEventListener('play',           onPlay)
    audio.addEventListener('pause',          onPause)
    audio.addEventListener('ended',          onEnded)
    audio.addEventListener('error',          onError)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate',     onTimeUpdate)
      audio.removeEventListener('play',           onPlay)
      audio.removeEventListener('pause',          onPause)
      audio.removeEventListener('ended',          onEnded)
      audio.removeEventListener('error',          onError)
      audio.pause()
      audio.src = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist, loadIndex])

  // ── Load first track when playlist changes ────────────────────────────────
  useEffect(() => {
    if (playlist.length === 0) {
      setState(IDLE_STATE)
      return
    }
    loadIndex(0, false)   // load but don't auto-play; user must press play or switch source
  }, [playlist, loadIndex])

  // ── Pause / resume when active flag changes ───────────────────────────────
  useEffect(() => {
    if (active && audioRef.current.src) {
      audioRef.current.play().catch(() => {})
    } else if (!active) {
      audioRef.current.pause()
    }
  }, [active])

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (audio.paused) audio.play().catch(() => {})
    else              audio.pause()
  }, [])

  const nextTrack = useCallback(() => {
    loadIndex(indexRef.current + 1, activeRef.current)
  }, [loadIndex])

  const prevTrack = useCallback(() => {
    loadIndex(indexRef.current - 1, activeRef.current)
  }, [loadIndex])

  const seek = useCallback((ms: number) => {
    audioRef.current.currentTime = ms / 1000
    setState(s => ({ ...s, positionMs: ms }))
  }, [])

  const setVolume = useCallback((v: number) => {
    audioRef.current.volume = v
    setState(s => ({ ...s, volume: v }))
  }, [])

  return { ...state, togglePlay, nextTrack, prevTrack, seek, setVolume }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd app
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useLocalPlayer.ts
git commit -m "feat: implement useLocalPlayer hook (HTML5 Audio + music-metadata)"
```

---

## Task 6: ControlPanel — source state, both hooks, switching logic, playlist scanning

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx`

This task wires up the two hooks and the source-switching logic. The UI changes come in Task 7.

- [ ] **Step 1: Add imports at the top of `ControlPanel.tsx`**

Add these alongside the existing imports:

```ts
import { useLocalPlayer } from '../../hooks/useLocalPlayer'
import { shuffle } from '../../lib/utils'
```

- [ ] **Step 2: Add source + local audio config state inside `ControlPanel()`**

Add after the existing `useState` declarations:

```ts
const [source, setSource] = useState<'spotify' | 'local'>(
  () => (localStorage.getItem('pd_audio_source') as 'spotify' | 'local') ?? 'spotify'
)
const [localFolder,    setLocalFolderState] = useState<string | null>(
  () => localStorage.getItem('pd_local_audio_folder')
)
const [localOrder,     setLocalOrder]     = useState<'alpha' | 'shuffle'>(
  () => (localStorage.getItem('pd_local_audio_order') as 'alpha' | 'shuffle') ?? 'shuffle'
)
const [localRecursive, setLocalRecursive] = useState<boolean>(
  () => localStorage.getItem('pd_local_audio_recursive') !== 'false'
)
const [localPlaylist,  setLocalPlaylist]  = useState<string[]>([])
```

- [ ] **Step 3: Rename the existing `player` variable and add `useLocalPlayer`**

The existing line:
```ts
const player  = useSpotifyPlayer(authenticated ? accessToken : null)
```

Change to:
```ts
const spotifyPlayer = useSpotifyPlayer(authenticated ? accessToken : null)
const localPlayer   = useLocalPlayer(localPlaylist, source === 'local')
const player        = source === 'spotify' ? spotifyPlayer : localPlayer
```

- [ ] **Step 4: Add the Spotify-pause-on-switch effect**

Add after the existing `useEffect` blocks:

```ts
// Pause Spotify when user switches to Local Files
useEffect(() => {
  if (source === 'local' && !spotifyPlayer.paused) {
    spotifyPlayer.togglePlay()
  }
  localStorage.setItem('pd_audio_source', source)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [source])
```

- [ ] **Step 5: Add the folder-scan effect**

```ts
// Scan audio folder and rebuild playlist when folder or config changes
function setLocalFolder(folder: string) {
  setLocalFolderState(folder)
  localStorage.setItem('pd_local_audio_folder', folder)
}

useEffect(() => {
  if (!localFolder) return
  localStorage.setItem('pd_local_audio_order',     localOrder)
  localStorage.setItem('pd_local_audio_recursive', String(localRecursive))
  invoke<string[]>('scan_audio_folder', { path: localFolder, recursive: localRecursive })
    .then(paths => {
      setLocalPlaylist(localOrder === 'shuffle' ? shuffle(paths) : paths)
    })
    .catch(err => console.error('[ControlPanel] scan_audio_folder failed:', err))
}, [localFolder, localOrder, localRecursive])
```

- [ ] **Step 6: Verify the build compiles**

```bash
cd app
npm run build
```

Expected: no TypeScript errors. The app behaviour at runtime is still identical to before (UI changes come next).

- [ ] **Step 7: Commit**

```bash
git add app/src/windows/control/ControlPanel.tsx
git commit -m "feat: add source switching and local playlist scanning to ControlPanel"
```

---

## Task 7: Music card UI — source picker, conditional LoginButton, Local Files UI

**Files:**
- Modify: `app/src/components/FolderPicker.tsx`
- Modify: `app/src/windows/control/ControlPanel.tsx`

This task adds the visible UI for source selection and local file configuration.

- [ ] **Step 1: Generalise `FolderPicker` with optional label props**

`FolderPicker` currently hardcodes `"photo"` in the count and `"Select photo folder"` in the dialog title. Make both configurable with defaults that keep the slideshow card unchanged.

Replace the entire contents of `app/src/components/FolderPicker.tsx` with:

```tsx
import { open } from '@tauri-apps/plugin-dialog'

interface Props {
  folder:      string | null
  photoCount:  number
  onPick:      (folder: string) => void
  itemLabel?:  string   // default: 'photo'
  dialogTitle?: string  // default: 'Select photo folder'
}

export function FolderPicker({ folder, photoCount, onPick, itemLabel = 'photo', dialogTitle = 'Select photo folder' }: Props) {
  async function handleClick() {
    const selected = await open({ directory: true, multiple: false, title: dialogTitle })
    if (typeof selected === 'string' && selected) onPick(selected)
  }

  const shortPath = folder
    ? folder.replace(/\\/g, '/').split('/').slice(-2).join('/')
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={handleClick} style={btnStyle}>
          {folder ? 'Change folder' : 'Select folder'}
        </button>
        {folder && (
          <span style={{ color: '#1db954', fontWeight: 600, fontSize: 12 }}>
            {photoCount} {itemLabel}{photoCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {folder ? (
        <div title={folder} style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          …/{shortPath}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#444' }}>No folder selected</div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#242424',
  border: '1px solid #333',
  color: '#e8e8e8',
  borderRadius: 5,
  padding: '5px 12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 500,
}
```

The slideshow card's existing `<FolderPicker ... />` call needs no changes (defaults apply).

- [ ] **Step 3: Add the `sourcePill` style constant**

Add alongside the existing style constants (e.g. near `pauseBtn`):

```ts
const sourcePill = (active: boolean): React.CSSProperties => ({
  background:   active ? '#1db95418' : 'none',
  border:       `1px solid ${active ? '#1db95444' : '#2a2a2a'}`,
  color:        active ? '#1db954' : '#555',
  borderRadius: 4, padding: '2px 10px', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
})
```

- [ ] **Step 4: Update the Music card — add source picker and conditional LoginButton**

Find the Music card JSX. Replace:

```tsx
<Card label="Music" right={<LoginButton authenticated={authenticated} loading={loading} onLogin={login} onLogout={logout} />}>
```

With:

```tsx
<Card
  label="Music"
  right={source === 'spotify'
    ? <LoginButton authenticated={authenticated} loading={loading} onLogin={login} onLogout={logout} />
    : undefined
  }
>
  {/* Source picker */}
  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
    <button style={sourcePill(source === 'spotify')} onClick={() => setSource('spotify')}>Spotify</button>
    <button style={sourcePill(source === 'local')}   onClick={() => setSource('local')}>Local Files</button>
  </div>
```

- [ ] **Step 5: Add the Local Files UI branch**

The Music card body currently has:

```tsx
{!authenticated ? (
  <p ...>Connect Spotify to get started.</p>
) : !player.ready ? (
  <p ...>Waiting for Spotify device…</p>
) : (
  <>
    <NowPlaying ... />
    ...
  </>
)}
```

Wrap the entire existing Spotify block so it only renders when `source === 'spotify'`, and add the Local Files block:

```tsx
{source === 'spotify' ? (
  /* ── Spotify ── */
  !authenticated ? (
    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
      Connect Spotify to get started.
    </p>
  ) : !spotifyPlayer.ready ? (
    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
      Waiting for Spotify device…
    </p>
  ) : (
    <>
      <NowPlaying track={spotifyPlayer.track} paused={spotifyPlayer.paused} />
      {spotifyPlayer.track && (
        <PlayerControls
          track={spotifyPlayer.track}
          paused={spotifyPlayer.paused}
          positionMs={spotifyPlayer.positionMs}
          togglePlay={spotifyPlayer.togglePlay}
          nextTrack={spotifyPlayer.nextTrack}
          prevTrack={spotifyPlayer.prevTrack}
          seek={spotifyPlayer.seek}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range" min={0} max={1} step={0.02}
          value={spotifyPlayer.volume}
          onChange={e => spotifyPlayer.setVolume(Number(e.target.value))}
          style={{ width: 100, accentColor: '#1db954', cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ color: '#555', fontSize: 11, minWidth: 28 }}>
          {Math.round(spotifyPlayer.volume * 100)}%
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SpectrumCanvas bins={bins} height={22}
            renderStyle={displaySettings.spectrumStyle}
            theme={displaySettings.spectrumTheme}
          />
        </div>
      </div>
    </>
  )
) : (
  /* ── Local Files ── */
  <>
    <FolderPicker
      folder={localFolder}
      photoCount={localPlaylist.length}
      onPick={setLocalFolder}
      itemLabel="track"
      dialogTitle="Select audio folder"
    />
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#aaa' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input
          type="radio" name="local-order" value="alpha"
          checked={localOrder === 'alpha'}
          onChange={() => setLocalOrder('alpha')}
          style={{ accentColor: '#1db954' }}
        /> Alphabetical
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input
          type="radio" name="local-order" value="shuffle"
          checked={localOrder === 'shuffle'}
          onChange={() => setLocalOrder('shuffle')}
          style={{ accentColor: '#1db954' }}
        /> Shuffle
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={localRecursive}
          onChange={e => setLocalRecursive(e.target.checked)}
          style={{ accentColor: '#1db954' }}
        /> Subfolders
      </label>
    </div>
    {localPlayer.track && (
      <>
        <NowPlaying track={localPlayer.track} paused={localPlayer.paused} />
        <PlayerControls
          track={localPlayer.track}
          paused={localPlayer.paused}
          positionMs={localPlayer.positionMs}
          togglePlay={localPlayer.togglePlay}
          nextTrack={localPlayer.nextTrack}
          prevTrack={localPlayer.prevTrack}
          seek={localPlayer.seek}
        />
      </>
    )}
    {!localFolder && (
      <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
        Pick a folder to start playing.
      </p>
    )}
    {localFolder && localPlaylist.length === 0 && (
      <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
        No audio files found in this folder.
      </p>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="range" min={0} max={1} step={0.02}
        value={localPlayer.volume}
        onChange={e => localPlayer.setVolume(Number(e.target.value))}
        style={{ width: 100, accentColor: '#1db954', cursor: 'pointer', flexShrink: 0 }}
      />
      <span style={{ color: '#555', fontSize: 11, minWidth: 28 }}>
        {Math.round(localPlayer.volume * 100)}%
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <SpectrumCanvas bins={bins} height={22}
          renderStyle={displaySettings.spectrumStyle}
          theme={displaySettings.spectrumTheme}
        />
      </div>
    </div>
  </>
)}
```

- [ ] **Step 6: Verify the build compiles**

```bash
cd app
npm run build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/FolderPicker.tsx app/src/windows/control/ControlPanel.tsx
git commit -m "feat: add source picker UI and Local Files music card"
```

---

## Task 8: Smoke test

Run the app and verify the following manually:

- [ ] **Step 1: Launch the app**

```bash
cd app
npm run tauri dev
```

- [ ] **Step 2: Spotify source (regression check)**
  - Source picker shows `[Spotify] [Local Files]`, Spotify highlighted.
  - `LoginButton` appears in the Music card header.
  - Connecting Spotify and playing a track works as before.
  - Toasts, spectrum, track overlay, lyrics all function normally.

- [ ] **Step 3: Switch to Local Files**
  - Click `Local Files` in the source picker.
  - Spotify pauses if it was playing.
  - `LoginButton` disappears from the Music card header.
  - Folder picker and config controls appear.
  - "Pick a folder to start playing." shown when no folder is selected.

- [ ] **Step 4: Pick an audio folder**
  - Select a folder containing MP3s.
  - File count appears in the folder picker label (the `photoCount` prop on `FolderPicker` shows it).
  - First track loads: `NowPlaying` shows title and artist from ID3 tags.
  - Play/pause, next, previous, seek all work.
  - Volume slider controls audio volume.
  - Spectrum analyser reacts to the audio.

- [ ] **Step 5: Recursive + order options**
  - Toggle `Subfolders` — file count updates.
  - Switch between `Alphabetical` and `Shuffle` — playlist rebuilds.
  - Selections persist after reloading the app (`npm run tauri dev`).

- [ ] **Step 6: Track change events reach the display window**
  - Open the display window.
  - Playing a local file triggers the song toast.
  - Track overlay shows the correct title/artist.

- [ ] **Step 7: Error handling**
  - Rename an MP3 to `.mp3.broken` mid-session, trigger next-track — confirm nothing crashes and the app skips to the following track. Open DevTools (right-click → Inspect) and verify the `[useLocalPlayer] error on...` log line appears.

- [ ] **Step 8: Commit smoke-test fix (if any)**

If any bugs were found and fixed during the smoke test, commit the fixes before closing the branch.

```bash
git add -p   # stage only the fix hunks
git commit -m "fix: <description of smoke-test fix>"
```
