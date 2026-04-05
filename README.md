# Party Display

> A vibe coding exercise — building a real Spotify-connected party display, driven entirely by AI agents.

---

## What is this?

![Party Display v0.6.0](docs/docs%20for%20release/sample%20image.png)

Party Display is a desktop application that registers as a **Spotify Connect device** and shows a fullscreen photo slideshow on a projector or TV, synchronized to the music playing. Think of it as a smart jukebox backdrop — your photos, your playlist, your party.

The app is built on **Tauri v2** (Windows), using the **Spotify Web Playback SDK** for device registration and playback, **WASAPI loopback** (via Rust) for real-time spectrum visualization, and **LRCLIB** for synchronized lyrics display.

---

## Building from source

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Rust](https://rustup.rs) | stable | Install via rustup |
| [Node.js](https://nodejs.org) | 18+ | npm included |
| Windows 10/11 | — | WASAPI loopback is Windows-only |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | — | Pre-installed on Windows 11; download for Windows 10 |

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create a new app
2. In the app settings, add this redirect URI:
   ```
   http://127.0.0.1:7357/callback
   ```
3. Copy your **Client ID**

### 2. Configure the environment

Create a file at `app/.env.local`:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

> This file is gitignored and never committed. It is the only configuration required.

### 3. Install dependencies and run

```bash
cd app
npm install
npm run tauri dev
```

### 4. Build for release

```bash
cd app
npm run tauri build
```

The output binary will be at `app/src-tauri/target/release/party-display.exe`.

> **Note:** The first Rust build takes several minutes — subsequent builds are incremental.

---

## This is a vibe coding exercise

This project is an experiment in **agentic software development** applied to a non-trivial problem. The goal is not just to build the app — it's to explore how far AI agents can go when the problem involves:

- External service integrations (Spotify OAuth, Web Playback SDK, Widevine DRM)
- System-level concerns (audio capture, native desktop runtime)
- Real unknowns that require investigation, not just code generation

Every spike, plan, and implementation task in this repo was driven by **Claude Code** and its agent ecosystem. The human role was product direction, validation, and unblocking — not writing code.

---

## Agents involved

| Agent | Role |
|---|---|
| **Claude Code** (main session) | Architect, debugger, coordinator — ran the entire project loop |
| **Implementer subagents** | Executed individual implementation tasks in isolated context windows |
| **Spec reviewer subagents** | Verified each task matched the plan before proceeding |
| **Code quality reviewer subagents** | Reviewed implementation quality after spec compliance |
| **Explore subagents** | Searched the codebase and gathered evidence during debugging |

The agent workflow followed the **superpowers skill suite** — `writing-plans` to design tasks, `subagent-driven-development` to execute them with two-stage review, and `systematic-debugging` to avoid guessing when things broke.

---

## The spikes

Before writing a single line of production code, three validation spikes were run to answer hard questions about the tech stack.

### Spike 1 — Electron + castlabs Widevine (first attempt)

**Question:** Can the Spotify Web Playback SDK run inside Electron?

**Findings:**
- Device registration worked
- Audio played — but every track failed with a `playback_error` at ~1 second, then auto-skipped
- Root cause: the castlabs Electron Widevine CDM was rejected by Spotify's license server at the DRM renewal boundary
- The Web Audio FFT tap also failed — the SDK sandboxes audio inside a **cross-origin iframe**, making `AudioContext` access impossible from the parent page

**Decision:** Drop Electron.

---

### Spike 2 — Browser (Node.js HTTPS + Chrome)

**Question:** Does the SDK work properly in a real browser?

**Findings:**
- Playback was flawless — zero skipping, no DRM errors (Chrome's native Widevine is fully compatible)
- Confirmed the cross-origin iframe limitation: Chrome's Web Audio Inspector showed **"No Web Audio API usage detected"** while music played
- OAuth PKCE redirect to `https://localhost` was blocked by Spotify ("redirect_uri: Insecure") — a known Spotify quirk around loopback URIs

**Decision:** Browser runtime is valid, but needs a desktop wrapper for OAuth and the audio tap problem needs a different solution.

---

### Spike 3 — Tauri v2 ✅

**Question:** Does Tauri's WebView2 satisfy Spotify's Widevine DRM? Can Rust capture system audio via WASAPI loopback?

**Findings:**
- **WebView2 + Widevine:** Device registered instantly, music played with zero skipping. WebView2 (Edge's Chromium engine) ships a native, fully compatible Widevine CDM.
- **WASAPI loopback:** `cpal 0.15` + `rustfft 6` successfully captured system audio output, ran FFT, and streamed 64 frequency bins to the frontend via Tauri events. FFT sum: **753 non-zero** on first run.
- Live spectrum canvas animated in real time while Spotify played.

**Decision:** Tauri v2 on Windows is the confirmed foundation.

---

## Architecture

```
┌─────────────────────────────────────────┐
│              Tauri v2 App               │
│                                         │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │ Control Panel│  │  Display Window  │ │
│  │  (WebView2)  │  │   (WebView2)     │ │
│  │              │  │                  │ │
│  │ Spotify SDK  │  │ Photo Slideshow  │ │
│  │ OAuth / Auth │  │ Now Playing HUD  │ │
│  │ Volume / Skip│  │ Spectrum Canvas  │ │
│  └──────┬───────┘  └────────┬─────────┘ │
│         │                   │           │
│  ┌──────▼───────────────────▼─────────┐ │
│  │           Rust Backend             │ │
│  │                                    │ │
│  │  WASAPI loopback → FFT → events    │ │
│  │  OAuth PKCE + token refresh        │ │
│  │  Slideshow engine (folder watch)   │ │
│  │  IPC channels (typed)              │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Tech stack:** Tauri 2 · Rust · React · TypeScript · Vite · cpal · RustFFT · Spotify Web Playback SDK · Spotify Web API · LRCLIB · Open-Meteo · ip-api.com

---

## Project structure

```
vcup2/
├── app/                        # Production app (Tauri v2)
│   ├── src/                    # React + TypeScript frontend
│   │   ├── components/         # UI components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Spotify auth helpers
│   │   └── windows/            # Control panel + display window
│   ├── src-tauri/              # Rust backend
│   │   └── src/                # main, audio, auth, slideshow, system, window_manager
│   ├── .env.local              # ← YOU CREATE THIS (gitignored)
│   └── package.json
├── CLAUDE.md                   # Notes for Claude Code (version bump instructions etc.)
└── README.md
```

---

## Status

- [x] Spike 1 — Electron (abandoned)
- [x] Spike 2 — Browser (validated SDK + found FFT limitation)
- [x] Spike 3 — Tauri v2 (validated full stack) ✅
- [x] Phase 2 — Full app implementation (**v0.6.0**)

---

## v0.6.0 — Current features

### Spotify integration

- Registers as a **Spotify Connect device** via the Web Playback SDK running inside WebView2
- Full **OAuth PKCE** flow — browser opens for auth, redirect is caught by a loopback HTTP server on `127.0.0.1:7357`, tokens stored in the Windows credential store (keyring)
- Automatic **token refresh** — sessions survive app restarts without re-auth
- On connect, syncs the current Spotify session volume to the control panel slider
- **Now playing** card: album art, track name, artist, progress bar with seek
- Transport controls: play/pause, previous, next
- **Volume** slider with live feedback; volume changes emitted to the display window as toast notifications

### Photo slideshow

- Folder picker — watches a local folder for images (JPEG/PNG/WebP/GIF/BMP/TIFF)
- Optional **recursive subfolder** scan
- **Play order**: alphabetical (with resume-from-last across restarts) or shuffle
- Configurable **fixed display time** per photo (seconds)
- **8 transition effects**: fade, slide left/right/up/down, zoom in/out, blur — plus a **random** mode
- Configurable **transition duration**
- **Image fit**: fill (cover/crop) or letterbox (contain)

### Display window

- Runs in a separate window — intended for a second monitor, projector or TV
- **Fullscreen** toggle via double-click or `F`; `Esc` to exit
- Window position and fullscreen state **persisted** across restarts
- Position **validated against available monitors** on restore — repositioned to primary if the saved monitor is gone
- **Screensaver / sleep blocked** via `SetThreadExecutionState` while the display window is open

### Spectrum analyser overlay

- Real-time **WASAPI loopback** audio capture (Rust — no driver install needed)
- **64-bin FFT** with logarithmic frequency mapping (40 Hz – 16 kHz)
- Exponential smoothing with fast attack / slow decay for a polished look
- Two render styles: **bars** or **lines**
- Six colour themes: Energy, Cyan, Fire, White, Rainbow, Purple
- Configurable height as % of screen; toggled with `S`

### Lyrics

- Synchronized lyrics fetched from **LRCLIB** (free, no API key)
- **Overlay mode**: 3-line karaoke display (previous / current / next line) — center or lower-third
- **Split view mode**: photo on one side, full lyrics panel on the other (40/60 split, left or right)
- Split panel auto-scrolls to keep the current line centered with fade edges
- Falls back to static plain-text display if only unsynced lyrics are available
- Toggled with `L`

### Corner widgets

All four corner widgets support independent corner positioning and stack gracefully when assigned to the same corner:

- **Track overlay** (`T`) — artist + title pill, configurable font, size, colour, background opacity
- **Clock & weather** (`C`) — live clock (12h/24h) with current temperature and WMO weather icon; city auto-detected by IP or manually configured; powered by Open-Meteo
- **Battery** (`B`) — vertical phone-style SVG icon with 5-step colour scale; AC/charging indicator; configurable size

### Photo counter overlay

- `x / y` counter at top-center of the display window, toggled with `P`

### Song & volume toasts

- **Song changed toast**: album art + track name slides in on track change, auto-dismisses
- **Volume changed toast**: compact level indicator on volume change
- Configurable display duration and scale

### Control panel

- Card-based layout with sticky header and vertical scroll
- **Cards**: Music, Slideshow, Display Window, Display Settings (collapsible)
- All display settings live-synced to the display window without restart
- `?` help button: hotkeys reference, credits, reset option

---

## Hotkeys (display window)

| Key | Action |
|---|---|
| `→` / `←` | Next / previous photo |
| `Space` | Pause / resume slideshow |
| `F` | Toggle fullscreen |
| `S` | Toggle spectrum analyser |
| `T` | Toggle track overlay |
| `B` | Toggle battery icon |
| `P` | Toggle photo counter |
| `C` | Toggle clock & weather |
| `L` | Toggle lyrics |
| `Esc` | Exit fullscreen |
| Double-click | Toggle fullscreen |
| `Num 4` / `Num 6` | Previous / next Spotify track |
| `Num 5` | Play / pause Spotify |
| `Num +` / `Num −` | Volume up / down |

---

## Credits & open-source dependencies

| Name | Role |
|---|---|
| [Tauri v2](https://tauri.app) | Desktop app framework (Rust + WebView2) |
| [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) | Spotify Connect device registration and audio playback |
| [Spotify Web API](https://developer.spotify.com/documentation/web-api) | Playback state, volume, device info |
| [LRCLIB](https://lrclib.net) | Free, open synchronized lyrics API — no auth required |
| [Open-Meteo](https://open-meteo.com) | Free weather forecast API — no API key required |
| [ip-api.com](https://ip-api.com) | IP-based geolocation for weather auto-detect |
| [cpal](https://github.com/RustAudio/cpal) | Cross-platform audio I/O — WASAPI loopback capture |
| [RustFFT](https://github.com/ejmahler/RustFFT) | FFT for real-time spectrum analysis |
| [keyring-rs](https://github.com/hwchen/keyring-rs) | Secure credential storage via Windows Credential Store |
| [React](https://react.dev) | UI framework |
| [Vite](https://vitejs.dev) | Frontend build tooling |
| [TypeScript](https://www.typescriptlang.org) | Type-safe JavaScript |

---

## License

GNU AGPL v3 — see [LICENSE](LICENSE).
