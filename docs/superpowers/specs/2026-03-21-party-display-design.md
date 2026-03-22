# Party Display — Product Spec
# Project Code-Name: VCUP2 - Vibe Coding Unnamed Project 2

**Date:** 2026-03-21
**Status:** Approved

---

## Problem

When hosting a party with a computer connected to a projector and sound system, there is no single app that simultaneously handles both music playback and photo display. Users must choose one or the other: a music streaming app for audio, or a slideshow app for visuals. This creates a fragmented experience and requires manual switching between tools.

---

## Solution

**Party Display** is a cross-platform desktop application (Electron) that unifies audio casting and visual display for parties. It registers itself as a Spotify Connect device — so anyone at the party can cast music directly from their Spotify app to the host's computer — while simultaneously showing a full-screen photo slideshow on the connected projector or TV.

---

## Windows

The app runs two windows:

| Window | Description |
|--------|-------------|
| **Control Panel** | Small floating window on the host's screen. Used to log in to Spotify, select the photo folder, configure settings, switch display modes, and adjust volume (via librespot volume control). Includes a monitor selector to assign the Display Window to a specific screen (uses Electron `screen.getAllDisplays()`). |
| **Display Window** | Fullscreen window on the selected display (projector or TV). Shows the photo slideshow and optional overlays. |

---

## Core Modules

| Module | Responsibility |
|--------|---------------|
| **Spotify Connect** | Uses the Spotify Web Playback SDK (runs in Electron's Chromium renderer). Registers the computer as a named Spotify Connect device. Authenticates via Spotify OAuth 2.0 PKCE flow; refresh token stored in OS keychain. Streams audio through Chromium's Web Audio API. Exposes real-time track state (name, artist, album art, position) via SDK player state events. Device name is configurable by the user (default: `"Party Display"`). |
| **Slideshow Engine** | Reads a user-selected local folder, builds a shuffled queue of images (supported formats: JPEG, PNG, WebP, GIF — animated GIFs play as static first frame), and advances them on a configurable timer (default: 30 seconds). Loops continuously. Designed with a transition hook interface to support future transition effects without requiring a structural refactor. |
| **Audio Visualizer** | Renders real-time visualizations driven by audio frequency data. The Web Playback SDK's audio stream is tapped via Web Audio API `AnalyserNode` in the Control Panel renderer; FFT data is forwarded to the Display Window renderer via IPC for Canvas / WebGL rendering. |
| **Settings Store** | Persists user preferences (photo folder path, slideshow interval, active display mode, device name, selected monitor) using `electron-store`. |
| **Main Process** | Electron main process: spawns and manages the librespot child process, manages both windows, enumerates available displays, exposes file system APIs (folder picker dialog) to renderers via IPC. |

---

## Display Modes

Switchable from the Control Panel at any time:

| Mode | Description |
|------|-------------|
| `clean` | Photos only — no overlay |
| `now-playing` | Corner widget showing album art, track name, and artist |
| `spectrum` | Audio frequency bar chart driven by real-time FFT data — classic equalizer look. FFT computed from Web Audio `AnalyserNode` in the Control Panel renderer, forwarded to Display Window via IPC. |
| `psychedelic` | Shader-based generative visuals (geometry and color driven by bass, mid, and treble frequency bands) — inspired by Winamp Milkdrop. Driven by the same FFT pipeline as `spectrum`. |

---

## Data Flow

1. App launches → Control Panel opens
2. User clicks Login → OAuth 2.0 PKCE flow opens Spotify auth page; callback captured via custom protocol handler → access + refresh tokens stored
3. Web Playback SDK initializes in the Control Panel renderer with the access token; the device appears as a Connect device in any Spotify client logged into the same account
4. User selects which monitor to use for the Display Window; Display Window opens fullscreen on that screen
5. User opens a folder picker → selects photo directory → slideshow begins
6. A party guest (sharing the host's Spotify account) opens Spotify → selects `"Party Display"` as the output speaker → SDK streams audio through Chromium's Web Audio API
7. An `AnalyserNode` taps the SDK's audio stream in the Control Panel renderer → FFT computed per animation frame → frequency band data sent to Display Window via IPC → feeds the active visualization overlay in real time

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Spotify token expiry | Silent background token refresh |
| Empty or unreadable folder | Placeholder screen shown with a prompt to select a folder |
| Spotify device disconnect | Retry with exponential backoff; status indicator shown in Control Panel |
| librespot process crash | Restart with exponential backoff; status indicator shown in Control Panel |
| Audio pipe unavailable | Fall back to `clean` mode; log the failure |

---

## V1 Scope

The following are **included** in V1:

- Spotify Connect device registration and audio playback
- Photo slideshow from a local folder (JPEG, PNG, WebP, GIF)
- Monitor selection for the Display Window
- Display modes: `clean`, `now-playing`, `spectrum`, `psychedelic`
- Volume control from the Control Panel (host must be able to adjust volume without leaving the app)
- Configurable device name and slideshow interval
- Settings persistence

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron |
| UI framework | React + Vite |
| Spotify integration | Spotify Web Playback SDK (official, runs in Electron renderer) |
| Spotify auth | OAuth 2.0 PKCE + custom protocol handler |
| Audio analysis | Web Audio API `AnalyserNode` → FFT in Control Panel renderer |
| Visualization rendering | Canvas / WebGL |
| Settings persistence | electron-store |
| Build & packaging | Electron Forge (with Vite plugin) |

---

## Requirements

- Spotify Premium account
- Spotify Developer App (`client_id`) — register at developer.spotify.com; add `party-display://callback` as a Redirect URI
- Node.js for development
- Target platform: Windows x64 (V1 only)

---

## Open Questions

- **Spotify integration approach**: ✅ Resolved — use the official Spotify Web Playback SDK (runs in Electron's Chromium renderer). No binary dependency. Replaces original librespot design.
- **Guest access**: ✅ Accepted — guests use the host's Spotify account. Premium account required.
- **Credential storage**: ✅ Resolved — store OAuth refresh token after first login using the OS keychain via `keytar` (Electron-compatible native module). Falls back to `electron-store` with encryption if keytar is unavailable.

---

## Future Roadmap (out of V1 scope)

- Photo transition effects (fade, slide, zoom)
- Google Photos shared album integration
- BPM-synced slideshow speed
- Keyboard shortcuts for display mode switching
