# Plan: Lyrics Overlay via LRCLIB

**Branch:** `dev`  
**Date:** 2026-03-31

---

## Goal

Display synchronized lyrics on the display window while a Spotify track plays, fetched from the free [LRCLIB](https://lrclib.net) API (no auth required). Lines advance in real-time as the track plays.

---

## Architecture Overview

```
ControlPanel
  player.positionMs / player.paused
    │
    ├── emit('track-changed', { ..., positionMs })   ← extend existing event
    └── emit('playback-tick', { positionMs, paused }) ← new event, every 500 ms

DisplayWindow
  listen('track-changed')   → sets currentTrack + initial position
  listen('playback-tick')   → updates positionMs + paused state
    │
    └── useLyrics(track, positionMs)
          → fetches LRCLIB on track change
          → returns { lines, currentIndex, status }
              │
              └── LyricsOverlay component
```

---

## Step-by-Step Implementation

### Step 1 — Extend `track-changed` event payload

**File:** `app/src/windows/control/ControlPanel.tsx` (line ~188)

Add `positionMs` and `paused` to the emitted payload so the display window has correct initial position when a new track starts:

```ts
emit('track-changed', {
  name:      track.name,
  artists:   track.artists,
  albumArt:  track.albumArt,
  id:        track.id,         // ADD — needed for LRCLIB lookup
  duration:  track.duration,   // ADD — needed for LRCLIB lookup
  positionMs: player.positionMs,
  paused:    player.paused,
})
```

> **Note:** `track.id` is in `TrackInfo` but was not previously emitted. `duration` is also in `TrackInfo`. Both are needed.

---

### Step 2 — Emit `playback-tick` every 500 ms

**File:** `app/src/windows/control/ControlPanel.tsx`

Add a new `useEffect` that emits to the display window on every player tick. Only emit when something meaningful changes (position or paused state):

```ts
const prevTickRef = useRef({ positionMs: -1, paused: true })

useEffect(() => {
  const prev = prevTickRef.current
  if (prev.positionMs === player.positionMs && prev.paused === player.paused) return
  prevTickRef.current = { positionMs: player.positionMs, paused: player.paused }
  emit('playback-tick', { positionMs: player.positionMs, paused: player.paused }).catch(() => {})
}, [player.positionMs, player.paused])
```

This piggybacks on the existing 500 ms ticker in `useSpotifyPlayer` without adding a separate interval.

---

### Step 3 — Listen for `playback-tick` in DisplayWindow

**File:** `app/src/windows/display/DisplayWindow.tsx`

Add state and listener:

```ts
const [positionMs, setPositionMs] = useState(0)
const [isPaused,   setIsPaused]   = useState(true)

useEffect(() => {
  const unlisten = listen<{ positionMs: number; paused: boolean }>('playback-tick', ({ payload }) => {
    setPositionMs(payload.positionMs)
    setIsPaused(payload.paused)
  })
  return () => { unlisten.then(fn => fn()).catch(() => {}) }
}, [])
```

Also update the `track-changed` listener to capture `positionMs` from the richer payload.

---

### Step 4 — Create `useLyrics` hook

**New file:** `app/src/hooks/useLyrics.ts`

Responsibilities:
1. When `track` changes, fetch from LRCLIB
2. Parse the LRC format into `{ timeMs: number; text: string }[]`
3. Given `positionMs`, return the current line index

```ts
interface LyricLine {
  timeMs: number
  text:   string
}

type LyricsStatus = 'idle' | 'loading' | 'synced' | 'unsynced' | 'not_found' | 'error'

interface LyricsResult {
  lines:        LyricLine[]
  currentIndex: number   // -1 if before first line
  status:       LyricsStatus
}

export function useLyrics(track: TrackInfo | null, positionMs: number): LyricsResult
```

**LRCLIB API call:**
```
GET https://lrclib.net/api/get
  ?artist_name=<artists>
  &track_name=<name>
  &duration=<duration_seconds>
```

Response includes `syncedLyrics` (LRC format) and `plainLyrics` (fallback).  
Prefer `syncedLyrics`; fall back to `plainLyrics` as static display.

**LRC parsing:**
```
[00:14.32] First lyric line
[00:18.50] Second lyric line
```
Regex: `/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/`  
Convert to ms: `(min * 60 + sec) * 1000 + centiseconds * 10`

**Current line logic:**
```ts
const currentIndex = lines.findLastIndex(line => line.timeMs <= positionMs)
```

Cache the result by `track.id` so re-renders don't re-fetch.

---

### Step 5 — Create `LyricsOverlay` component

**New file:** `app/src/components/LyricsOverlay.tsx`

Display style: karaoke-style center screen, showing 3 lines:
- Previous line (dimmed, smaller)
- **Current line (full brightness, larger)**
- Next line (dimmed, smaller)

```tsx
interface Props {
  lines:        LyricLine[]
  currentIndex: number
  settings:     DisplaySettings   // for font, opacity, etc.
}
```

Layout:
- `position: absolute`, full width, centered vertically (or lower third)
- `zIndex: 20` — above corner widgets (15) and spectrum (10), below toasts (200)
- `pointerEvents: 'none'`
- Smooth transition: `transition: 'opacity 0.3s ease'` on lines

Visual:
- Container: `text-align: center`, semi-transparent background pill or none
- Current line: `fontSize: lyricsSize`, `opacity: 1`, `fontWeight: 600`
- Adjacent lines: `fontSize: lyricsSize * 0.75`, `opacity: 0.45`
- Two lines gap if `currentIndex === -1` (instrumental section)

---

### Step 6 — Add lyrics settings to `DisplaySettings`

**File:** `app/src/components/DisplaySettingsPanel.tsx`

Add to `DisplaySettings` interface:
```ts
lyricsVisible:   boolean           // default: false
lyricsSize:      number            // default: 32 (px)
lyricsOpacity:   number            // default: 0.9
lyricsPosition:  'center' | 'lower-third'  // default: 'lower-third'
```

Add `localStorage` keys:
```
pd_lyrics_visible    → 'false'
pd_lyrics_size       → 32
pd_lyrics_opacity    → 0.9
pd_lyrics_position   → 'lower-third'
```

Add to `ControlPanel`'s settings persistence block:
```ts
localStorage.setItem('pd_lyrics_visible',  String(displaySettings.lyricsVisible))
localStorage.setItem('pd_lyrics_size',     String(displaySettings.lyricsSize))
localStorage.setItem('pd_lyrics_opacity',  String(displaySettings.lyricsOpacity))
localStorage.setItem('pd_lyrics_position', displaySettings.lyricsPosition)
```

Add UI section in `DisplaySettingsPanel` after the clock/weather section:
- Toggle (visible)
- Position select (center / lower third)
- Font size (16–72 px)
- Opacity slider (0–1)

---

### Step 7 — Wire `LyricsOverlay` into `DisplayWindow`

**File:** `app/src/windows/display/DisplayWindow.tsx`

```tsx
const lyrics = useLyrics(currentTrack, positionMs)

// In JSX, after PhotoCounterOverlay:
{displaySettings.lyricsVisible && currentTrack && lyrics.status !== 'not_found' && (
  <LyricsOverlay
    lines={lyrics.lines}
    currentIndex={lyrics.currentIndex}
    settings={displaySettings}
  />
)}
```

---

### Step 8 — Update CSP

**File:** `app/src-tauri/tauri.conf.json`

Add `https://lrclib.net` to `connect-src`:

```json
"connect-src": "... https://lrclib.net"
```

---

## Data Flow Summary

```
Track changes in Spotify
  → ControlPanel receives via player_state_changed
  → emit('track-changed', { id, name, artists, albumArt, duration, positionMs, paused })
  → DisplayWindow: setCurrentTrack, setPositionMs, setIsPaused

useLyrics(currentTrack, positionMs):
  → On track change: fetch LRCLIB, parse LRC → lines[]
  → On every positionMs update: binary search → currentIndex

LyricsOverlay renders current ± 1 lines
```

---

## Files Touched

| File | Change |
|------|--------|
| `app/src/windows/control/ControlPanel.tsx` | Extend track-changed payload; add playback-tick emitter |
| `app/src/windows/display/DisplayWindow.tsx` | Add positionMs/paused state; listen playback-tick; render LyricsOverlay |
| `app/src/hooks/useLyrics.ts` | **NEW** — LRCLIB fetch + LRC parse + current line logic |
| `app/src/components/LyricsOverlay.tsx` | **NEW** — 3-line karaoke display component |
| `app/src/components/DisplaySettingsPanel.tsx` | Add 4 lyrics settings to interface + UI section |
| `app/src/windows/control/ControlPanel.tsx` | Persist 4 new localStorage keys |
| `app/src-tauri/tauri.conf.json` | Add lrclib.net to connect-src CSP |

---

## Edge Cases

| Case | Handling |
|------|----------|
| No synced lyrics, only plain | Show static text centered, status = `'unsynced'` |
| Track not found in LRCLIB | Hide overlay entirely (status = `'not_found'`) |
| Instrumental gap (no current line) | Show nothing or a subtle `♪` |
| Track changes mid-line | `useLyrics` deps on `track.id` — cache clears, new fetch |
| Seek jump | `positionMs` updates instantly, `findLastIndex` recalculates |
| LRCLIB rate-limit / error | Log + set status = `'error'`; overlay hides |
| Track with no ID (edge) | Guard: skip fetch if `!track.id` |

---

## Not in Scope

- Caching lyrics to disk (network call per session is fine for now)
- Styling customization beyond size/opacity/position
- Karaoke word-level highlighting (LRCLIB supports `[A:]` enhanced LRC — future feature)
