# Party Display — Implementation Design
# Project Code-Name: VCUP2

**Date:** 2026-03-21
**Status:** Approved
**Relates to:** [2026-03-21-party-display-design.md](./2026-03-21-party-display-design.md)

---

## Goal

Implement the Party Display app as defined in the product spec. This document covers the implementation approach, phase sequence, and architecture decisions for reaching the **vertical slice milestone**: Electron app running, slideshow playing from a local folder, and the app registered as a Spotify Connect device with audio playing.

---

## Spotify Integration: Web Playback SDK (replaces librespot)

The product spec originally specified librespot as a sidecar binary. This has been replaced with the **Spotify Web Playback SDK**, which runs entirely in Electron's Chromium renderer. No binary, no Rust toolchain required.

**Trade-offs vs librespot:**

| | librespot | Web Playback SDK |
|--|-----------|-----------------|
| Binary dependency | Yes (Windows x64) | None |
| Auth method | Username/password | OAuth 2.0 PKCE |
| Audio output | System audio device | Chromium audio (Web Audio API) |
| FFT/visualizer data | PCM pipe → Node FFT | Web Audio `AnalyserNode` (in renderer) |
| Official Spotify support | No (ToS grey area) | Yes |
| Spotify Premium required | Yes | Yes |

The Web Audio `AnalyserNode` approach for FFT is actually cleaner in an Electron context than a PCM pipe — frequency data is available directly in the renderer where the visualizers render.

---

## Prerequisites

Before Phase 1 can begin:

- **Node.js** (LTS) and npm
- **Spotify Developer App** — register an app at [developer.spotify.com](https://developer.spotify.com) to get a `client_id`. Add `party-display://callback` as a Redirect URI in the app settings.
- A Spotify Premium account

---

## Approach

**SDK spike first.** Validate the Web Playback SDK in a minimal standalone context before building the full Electron app. The SDK's behavior inside Electron's renderer (autoplay policy, AudioContext access, device registration) has nuances worth confirming before committing to the full architecture.

---

## Phase Sequence

### Phase 1 — Web Playback SDK Spike (standalone renderer)

A minimal single-file Electron app in `spike/` that loads the Web Playback SDK and validates Spotify Connect device registration and audio playback.

**Success criteria:**
- Device appears in Spotify Connect on the host account
- Playing a track from Spotify causes audio output on the host machine
- `player.getCurrentState()` returns track name and artist
- An `AnalyserNode` can be connected to the playback stream and returns non-zero FFT data

**Deliverables:**

| File | Purpose |
|------|---------|
| `spike/index.html` | Minimal renderer: loads SDK, initializes player with hardcoded token, logs state events |
| `spike/main.mjs` | Minimal Electron main: opens a single window, no IPC needed |
| `spike/notes.md` | Findings: autoplay behavior, AudioContext access, any Electron-specific quirks |

**Key technical challenge — AudioContext + Web Playback SDK:**
The Web Playback SDK manages its own internal `AudioContext`. Connecting an `AnalyserNode` requires access to that context, which is not officially exposed. The spike must confirm whether the SDK's audio can be tapped via `AudioContext.createMediaStreamSource` or a similar approach — and document the result in `spike/notes.md`.

**Note on auth for the spike:** The spike uses a manually obtained short-lived access token (generated once via the Spotify OAuth playground) to avoid implementing the full OAuth flow before we've validated the SDK. The real OAuth flow is implemented in Phase 2.

### Phase 2 — Electron App + Slideshow + SDK Wired

Scaffold the full Electron application, implement OAuth, build the slideshow engine, and integrate the Web Playback SDK into the Control Panel renderer.

**Success criteria:**
- Control Panel window opens on the host's primary display; Display Window opens fullscreen on a user-selected monitor
- User completes OAuth login in Control Panel; the app registers as a Spotify Connect device
- librespot connection status → SDK player status (connecting / connected / error) shown in Control Panel
- Folder selected via folder picker starts the slideshow; images advance on the configured timer
- `now-playing` overlay shows track name and artist; album art is explicitly deferred (a `now-playing` overlay without album art satisfies this criterion)
- Volume slider in Control Panel adjusts playback volume via `player.setVolume()`

---

## Architecture

### Project Structure

```
vcup2/
├── spike/
│   ├── index.html
│   ├── main.mjs
│   └── notes.md
├── src/
│   ├── main/
│   │   ├── index.ts          # Electron main entry point
│   │   ├── windows.ts        # BrowserWindow creation and management
│   │   ├── spotify-auth.ts   # OAuth PKCE flow, token refresh, custom protocol handler
│   │   ├── slideshow.ts      # Folder reader, shuffled queue, timer
│   │   ├── ipc.ts            # Typed IPC channel definitions (single source of truth)
│   │   └── settings.ts       # electron-store wrapper
│   ├── control-panel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── components/       # Login, FolderPicker, MonitorSelector, VolumeSlider, StatusIndicator
│   │   └── spotify-player.ts # Web Playback SDK init, AnalyserNode setup, FFT forwarding
│   └── display/
│       ├── index.html
│       ├── main.tsx
│       └── components/       # SlideshowView, NowPlayingOverlay
├── electron.vite.config.ts
├── forge.config.ts
└── package.json
```

### Main Process Modules

**`spotify-auth.ts`**
- Implements OAuth 2.0 PKCE flow for Spotify
- Registers a custom protocol handler (`party-display://`) to capture the redirect after login
- Exchanges auth code for access + refresh tokens
- Handles silent token refresh before expiry
- Stores refresh token via `keytar` (OS keychain); falls back to encrypted `electron-store`
- Exposes: `startLoginFlow()`, `getAccessToken()`, `logout()`

**`slideshow.ts`**
- Reads a user-selected folder; filters to JPEG, PNG, WebP, GIF
- Builds a shuffled queue; loops on exhaustion
- Advances on a configurable timer (default: 30s) using `setInterval`
- Sends `next-image` IPC event with a `file://` URL to the display renderer
- Exposes: `start(folderPath, intervalMs)`, `stop()`, `setInterval(ms)`

**`ipc.ts`**
- Single file defining all IPC channel names and TypeScript types
- Both main and renderer import from here — no magic strings elsewhere
- Channels defined (vertical slice): `next-image`, `track-changed`, `fft-data`, `set-volume`, `player-status`, `start-login`, `open-folder-dialog`, `get-displays`, `set-display`, `get-settings`, `set-settings`

**`settings.ts`**
- Wraps `electron-store`
- Persists: `folderPath`, `slideshowInterval`, `deviceName`, `selectedMonitor`, `displayMode`, `volume`

**`windows.ts`**
- Creates Control Panel window (small, floating, always-on-top)
- Creates Display Window (fullscreen on selected monitor)
- Uses `screen.getAllDisplays()` for monitor enumeration

### Control Panel Renderer

**`spotify-player.ts`** (runs in Control Panel renderer, not main process)
- Loads the Web Playback SDK script tag
- Initializes `Spotify.Player` with device name and token callback (requests fresh token from main via IPC)
- Connects an `AnalyserNode` to the playback audio stream (mechanism confirmed in spike)
- Runs FFT on each animation frame; forwards frequency band data to Display Window via `fft-data` IPC
- Emits `track-changed` IPC events with `{ trackName, artist }` on player state changes
- Exposes `setVolume(n)` wired to `player.setVolume()`

**Control Panel React app** — communicates to main exclusively via IPC:
- Spotify login button (triggers `start-login` → OAuth flow in main)
- Folder picker (triggers `dialog.showOpenDialog` in main via IPC)
- Monitor selector dropdown
- Volume slider
- Display mode switcher (clean / now-playing / spectrum / psychedelic)
- Player status indicator (connecting / connected / error)

### Display Window Renderer

React app, fullscreen:
- Vertical slice scope: `clean` mode (photo only) and `now-playing` overlay (track name + artist; no album art)
- Receives `next-image`, `track-changed`, and `fft-data` IPC events; renders accordingly

### Credential Storage

- Spotify refresh token stored via `keytar` (OS keychain)
- Fallback if `keytar` native build fails: `electron-store` with AES encryption (app-level key)
- On launch: load stored refresh token → silently obtain fresh access token → auto-start SDK player

---

## Error Handling (Vertical Slice Scope)

| Scenario | Behavior |
|----------|----------|
| OAuth login cancelled | Stay on login screen; no error shown |
| Token refresh failure | Re-prompt login; Control Panel shows `error` status |
| SDK player disconnect | Retry silently; status indicator shows `connecting` |
| Empty / unreadable folder | Display Window shows centered prompt: "Select a folder to begin" |
| Unreadable image file | Skip silently, log to console |
| `keytar` unavailable | Fall back to encrypted `electron-store` |
| AudioContext unavailable | FFT data not forwarded; visualizer modes degrade gracefully |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron (via Electron Forge + Vite plugin) |
| UI framework | React + Vite |
| Spotify integration | Spotify Web Playback SDK (official, runs in renderer) |
| Spotify auth | OAuth 2.0 PKCE + custom protocol handler |
| Audio analysis | Web Audio API `AnalyserNode` (in Control Panel renderer) |
| Settings persistence | electron-store |
| Credential storage | keytar (OS keychain) |
| Build & packaging | Electron Forge (with Vite plugin) |
| Language | TypeScript throughout |

---

## Out of Scope (Post-Vertical-Slice, Deferred from V1)

The following are in the V1 product spec but deferred past the vertical slice milestone:

- `spectrum` and `psychedelic` display modes — depend on `fft-data` IPC pipeline (infrastructure built in Phase 2, rendering deferred)
- Album art in `now-playing` overlay — requires fetching album art URL from player state or Spotify Web API
- Volume persistence on app restart (settings key exists; wiring `player.setVolume()` on SDK init is deferred)

The following are post-V1:

- Photo transition effects (fade, slide, zoom)
- BPM-synced slideshow speed
- Google Photos shared album integration
- Keyboard shortcuts for display mode switching
