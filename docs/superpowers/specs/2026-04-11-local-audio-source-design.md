# Local Audio Source — Design Spec
**Date:** 2026-04-11
**Status:** Approved

## Goal

Add a Local Files audio source alongside Spotify. The user picks which source to use; both can coexist (Spotify is paused when Local is active). All downstream features — player controls, NowPlaying, spectrum analyser, lyrics, display-window toasts — work identically regardless of source.

---

## Approach

Frontend-first. Rust adds one new command for directory scanning. The frontend handles playback via HTML5 `<audio>` served through Tauri's existing `asset://` protocol, and reads ID3 metadata with the `music-metadata` npm package.

---

## Architecture

Five changes/additions:

| Piece | Type | Notes |
|---|---|---|
| `src/lib/player-types.ts` | New file | Shared types moved out of `useSpotifyPlayer.ts` |
| `src-tauri/src/local_audio.rs` | New file | `scan_audio_folder` Rust command |
| `src/hooks/useLocalPlayer.ts` | New file | Local playback hook |
| `src/windows/control/ControlPanel.tsx` | Modified | Source state, source switch logic |
| Music card UI in `ControlPanel.tsx` | Modified | Source picker, local config UI |

The spectrum analyser, display window, lyrics, toasts, and hotkeys require no changes — they operate against the shared player interface.

---

## Shared Types (`src/lib/player-types.ts`)

Move `TrackInfo`, `PlayerState`, and `PlayerControls` from `useSpotifyPlayer.ts` to a new shared file. Update all consumers to import from the new location:

- `useSpotifyPlayer.ts`
- `useLocalPlayer.ts` (new)
- `useLyrics.ts`
- `components/PlayerControls.tsx`
- `windows/display/DisplayWindow.tsx`

`TrackInfo` shape is unchanged:

```ts
interface TrackInfo {
  id:       string   // Spotify: track ID; Local: file path (unique cache key)
  name:     string
  artists:  string
  albumArt: string   // URL or data URL; empty string if absent
  duration: number   // ms
}
```

---

## Rust: `scan_audio_folder` (`src-tauri/src/local_audio.rs`)

```rust
#[tauri::command]
pub fn scan_audio_folder(path: String, recursive: bool) -> Result<Vec<String>, String>
```

- Walks the directory using `std::fs` (no new crates).
- Filters entries by extension (case-insensitive): `mp3`, `wav`, `ogg`, `flac`, `m4a`, `aac`, `opus`.
- Returns paths as strings, sorted alphabetically.
- If `recursive` is true, descends into subdirectories depth-first.
- Returns an `Err` string if the path does not exist or cannot be read.
- Synchronous, no state, no watcher.

Registered in `main.rs` `invoke_handler`.

---

## `useLocalPlayer` Hook (`src/hooks/useLocalPlayer.ts`)

### Signature

```ts
function useLocalPlayer(
  playlist: string[],   // file paths, pre-ordered by ControlPanel
  active: boolean,      // false = paused and idle (Spotify is active)
): PlayerState & PlayerControls
```

### Playback

- Holds a `useRef<HTMLAudioElement>` created once via `new Audio()` (no DOM node needed).
- When `currentIndex` changes, sets `audio.src` to the `asset://localhost/<encoded-path>` URL and calls `audio.play()`.
- `audio.onended` advances to the next track (wraps at end of playlist).
- `audio.ontimeupdate` updates `positionMs`.
- `audio.volume` ↔ `setVolume`; `audio.currentTime` ↔ `seek`.

### Metadata

- On each `audio.onloadedmetadata`, fetches the asset URL as a `Blob` and calls `music-metadata`'s `parseBlob()`.
- Extracts: `title` (falls back to filename), `artist`, album art as a data URL (empty string if absent), duration.
- Populates `track: TrackInfo` with `id` = file path.

### Active flag

- When `active` becomes false: `audio.pause()`, stop emitting state changes.
- When `active` becomes true: resume from current position.

### Controls

| Control | Implementation |
|---|---|
| `togglePlay` | `audio.play()` / `audio.pause()` |
| `nextTrack` | advance index, wrap at end |
| `prevTrack` | decrement index, wrap at start |
| `seek(ms)` | `audio.currentTime = ms / 1000` |
| `setVolume(v)` | `audio.volume = v` |

### Error handling

- `audio.onerror`: log to console with file path and `audio.error` code/message so the user can inspect DevTools, then auto-advance to the next track.

---

## ControlPanel Changes

### Source state

```ts
const [source, setSource] = useState<'spotify' | 'local'>(
  () => (localStorage.getItem('pd_audio_source') as 'spotify' | 'local') ?? 'spotify'
)
```

Persisted to `localStorage` as `pd_audio_source`.

### Both hooks run always

React hooks cannot be called conditionally. Both `useSpotifyPlayer` and `useLocalPlayer` run on every render. The active source's state/controls are aliased as `player` and passed to child components. The inactive hook is idle.

### Spotify pause on switch

When `source` transitions to `'local'` and Spotify is currently playing, call `player.togglePlay()` immediately. No automatic resume when switching back — the user resumes manually.

### Local playlist construction

ControlPanel holds local folder config:
- `pd_local_audio_folder` (localStorage)
- `pd_local_audio_order`: `'alpha' | 'shuffle'` (localStorage)
- `pd_local_audio_recursive`: boolean (localStorage)

When the folder is picked or config changes, calls `invoke('scan_audio_folder', { path, recursive })` and applies order (sort or shuffle) to produce the `playlist` array passed to `useLocalPlayer`.

---

## Music Card UI

### Source picker

First element in the Music card body — a segmented control:

```
[ Spotify ]  [ Local Files ]
```

Styled like the existing RUNNING/PAUSED pill. Selected source highlighted in `#1db954`, inactive muted.

### LoginButton visibility

The `LoginButton` in the Music card header renders only when `source === 'spotify'`. When Local Files is active, the header right slot is empty.

### Local Files UI (when source === 'local')

1. **Folder picker** — reuses existing `FolderPicker` component.
2. **Config row** — order (`Alphabetical | Shuffle`) and recursive subfolders checkbox, mirroring the slideshow config style.
3. **`NowPlaying` + `PlayerControls`** — shown once a track is loaded, same components as Spotify.
4. **Volume + spectrum row** — identical to Spotify, driven by `useLocalPlayer` state.

---

## Lyrics

No changes to `useLyrics`. It queries LRCLIB with `track.artists`, `track.name`, and `track.duration`, and caches by `track.id`. For local files, these come from ID3 tags; `track.id` is the file path. If a file has no artist/title tags, LRCLIB returns `not_found` — the existing graceful fallback.

---

## Supported Audio Formats

Whatever Chromium/WebView2 can decode natively:

| Format | Notes |
|---|---|
| MP3 | Mandatory |
| WAV | Uncompressed |
| OGG Vorbis | Open format |
| FLAC | Lossless |
| AAC / M4A | Via WebView2 (Edge codec) |
| Opus | Modern codec |

---

## New localStorage Keys

| Key | Values | Default |
|---|---|---|
| `pd_audio_source` | `'spotify'`, `'local'` | `'spotify'` |
| `pd_local_audio_folder` | path string | — |
| `pd_local_audio_order` | `'alpha'`, `'shuffle'` | `'shuffle'` |
| `pd_local_audio_recursive` | `'true'`, `'false'` | `'true'` |

---

## New npm Dependency

- **`music-metadata`** — reads ID3v1/v2, Vorbis comments, MP4 tags, FLAC tags. Used only in `useLocalPlayer`.
