# Party Display

> A vibe coding exercise — building a full-featured party display, driven entirely by AI agents.

[![Tests](https://github.com/fmpallini/PartyDisplay/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/fmpallini/PartyDisplay/actions/workflows/test.yml)
[![Dependabot Updates](https://github.com/fmpallini/PartyDisplay/actions/workflows/dependabot/dependabot-updates/badge.svg?branch=master)](https://github.com/fmpallini/PartyDisplay/actions/workflows/dependabot/dependabot-updates)
[![CodeQL](https://github.com/fmpallini/PartyDisplay/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/fmpallini/PartyDisplay/actions/workflows/codeql.yml)

---

## What is this?

![Screenshot of Party Display at version v0.9.9](docs/docs%20for%20release/sample_image.png)

Party Display is a desktop party utility — a jukebox that throws psychedelic MilkDrop visualizations and your personal photos onto a projector or TV, synced to whatever music is playing. Use any audio source: play from a local folder, stream from a DLNA/UPnP media server, let any external app or website drive the sound, or connect native Spotify integration if you want it. Think of it as a full party backdrop that actually reacts to sound.

The app is built on **Tauri v2** (Windows), using **WASAPI loopback** (via Rust) for real-time spectrum visualization, the **Spotify Web Playback SDK** for optional Spotify Connect device registration, and **LRCLIB** for synchronized lyrics display.

---

## Key features

- **Spotify Connect** — registers as a real Spotify device via the Web Playback SDK inside WebView2; full OAuth PKCE with tokens stored in the Windows credential store and automatic refresh across restarts; Client ID entered at runtime via a guided setup screen (no build-time configuration needed)
- **External audio source** — pass-through mode that forwards system-wide media and volume keys (play/pause, next/prev, volume up/down) via Windows virtual-key codes; WASAPI loopback still drives the visualizer; song info (title, artist, album art) and lyrics fetched automatically via Windows System Media Transport Controls (SMTC) — requires Windows 10 build 1903+
- **Local audio files** — plays a local folder of audio files (MP3, FLAC, WAV, OGG, M4A, AAC, OPUS) through the built-in HTML5 player; reads embedded metadata (title, artist, album art); alphabetical or shuffle order; optional recursive scan
- **DLNA / UPnP media** — discovers UPnP/DLNA servers on the local network; browse their containers directly in the control panel; stream audio tracks and photos from any DLNA server (NAS, media server, etc.) via a local HTTP proxy that handles range requests for seeking
- **Photo slideshow** — watches a local folder or a DLNA container for images (JPEG, PNG, WebP, GIF, BMP, TIFF); shuffle or alphabetical order with resume; 8 transition effects; configurable timing and image fit
- **MilkDrop visualizer** — Butterchurn WebGL visualizer driven by real-time WASAPI loopback capture (no driver install); three modes: photos only, photo/visualizer split view, fullscreen; 100 bundled presets, add more by dropping `.json` MilkDrop preset files in the `presets/` folder next to the exe; cycle presets manually (PgUp / PgDn), on every track change, or on a configurable timer
- **Synchronized lyrics** — fetched from LRCLIB (no API key); overlay mode (3-line karaoke) or split-view mode (full scrolling panel alongside the photo); falls back to static text when sync data is unavailable
- **Corner widgets** — track overlay (artist + title + progress), clock & weather (Open-Meteo, auto-detected or manual city), battery indicator; all four corners supported with graceful stacking
- **Song & volume toasts** — brief on-screen notifications on track change and volume adjustment, with configurable duration and scale
- **Display window** — designed for a second monitor, projector, or TV; features native one-click Miracast/TV casting that automatically routes the window and fullscreens it; position persisted across restarts and validated against connected monitors; screensaver/sleep blocked while open
- **Live settings sync** — all display settings update instantly on the display window without restart; control panel card layout with collapsible sections
- **Phone remote control** — browser-based remote served over Wi-Fi; control playback, volume, slideshow, presets, and display toggles from any phone on the local network; QR code for quick access

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

Three validation spikes were run before writing any production code. The first attempt used Electron with the castlabs Widevine CDM: device registration worked, but every track failed with a DRM error at the license renewal boundary and auto-skipped. The Spotify Web Playback SDK also sandboxes audio inside a cross-origin iframe, making any `AudioContext` tap from the parent page impossible — ruling out browser-native FFT entirely. The second spike ran the SDK directly in Chrome: DRM worked flawlessly (Chrome ships a native Widevine CDM), confirming that Electron's non-native CDM was the culprit. However the iframe audio limitation persisted, and Spotify rejects plain `http://localhost` OAuth redirect URIs as insecure — a desktop wrapper was still needed. The third spike tested Tauri v2 on Windows: WebView2 (Edge's Chromium engine) carries a fully compatible Widevine CDM, playback was clean, and Rust's `cpal` + WASAPI loopback successfully captured system audio output and fed a real-time FFT to the frontend.

**Confirmed stack:** Tauri v2 on Windows, with WASAPI loopback for spectrum analysis.

The main limitation inherited from this exploration is that the spectrum analyzer taps the Windows audio output mix — not the SDK's internal audio graph. This works well in practice but means the visualizer reacts to all system audio, not exclusively to Spotify.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Tauri v2 App                          │
│                                                              │
│  ┌───────────────────────┐   ┌──────────────────────────┐   │
│  │    Control Panel      │   │      Display Window      │   │
│  │      (WebView2)       │   │        (WebView2)        │   │
│  │                       │   │                          │   │
│  │  Audio sources:       │   │  Photo slideshow         │   │
│  │  · Spotify SDK        │   │  MilkDrop (WebGL)        │   │
│  │  · Local files        │   │  Now playing HUD         │   │
│  │  · DLNA stream        │   │  Lyrics overlay (LRCLIB) │   │
│  │  · External app       │   │  Clock · weather         │   │
│  │                       │   │  · battery               │   │
│  │  Volume · skip        │   │                          │   │
│  └──────────┬────────────┘   └──────────────┬───────────┘   │
│             │           IPC                 │               │
│  ┌──────────▼───────────────────────────────▼────────────┐  │
│  │                     Rust Backend                       │  │
│  │                                                        │  │
│  │  WASAPI loopback → FFT → spectrum events               │  │
│  │  OAuth PKCE + token refresh (Credential Store)         │  │
│  │  Slideshow engine (folder watch · DLNA images)         │  │
│  │  Local audio scanner (ID3 / FLAC / M4A metadata)       │  │
│  │  DLNA/UPnP discovery + HTTP range proxy                │  │
│  │  SMTC bridge (external app metadata · media keys)      │  │
│  │  Remote server (Wi-Fi browser remote · QR code)        │  │
│  │  Window manager (multi-monitor · Miracast cast)        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

The two WebView2 windows are independent renderer processes that communicate through the Rust backend via Tauri IPC commands and broadcast events. The control panel owns the Spotify SDK instance and forwards playback state to the display window; the display window is purely a consumer — it renders but issues no Spotify API calls of its own.

**Tech stack:** Tauri 2 · Rust · React · TypeScript · Vite · cpal · Butterchurn · rupnp · notify · music-metadata · Spotify Web Playback SDK · Spotify Web API · LRCLIB · Open-Meteo · ip-api.com

---

## Project structure

```
vcup2/
├── app/                        # Tauri v2 application
│   ├── src/                    # React + TypeScript frontend
│   │   ├── components/         # UI components (toasts, overlays, widgets, panels)
│   │   ├── hooks/              # Custom React hooks (player, lyrics, weather, FFT…)
│   │   ├── lib/                # IPC helpers, Spotify auth, shared utilities
│   │   └── windows/            # Entry points: control panel + display window
│   ├── src-tauri/              # Rust backend (two crates)
│   │   ├── src/                # Tauri app crate: main · auth · audio · media_keys · remote_server · window_manager
│   │   └── party-display-core/ # Pure Rust lib (no Tauri deps, unit-testable): dlna · dlna_proxy · local_audio · presets · slideshow · smtc · system
│   └── package.json
├── presets/                    # MilkDrop preset JSONs (bundled next to exe at release)
├── docs/
│   └── docs for release/       # README.txt, LICENSE.txt, sample screenshot
├── release/                    # Built release zips (gitignored)
├── CLAUDE.md                   # AI agent instructions (release procedure, conventions)
└── README.md
```

---

## Building from source

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Rust](https://rustup.rs) | stable | Install via rustup |
| [Node.js](https://nodejs.org) | 18+ | npm included |
| Windows 10/11 | — | WASAPI loopback is Windows-only |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | — | Pre-installed on Windows 11; download for Windows 10 |

### 1. Install dependencies and run

```bash
cd app
npm install
npm run tauri dev
```

### 2. Build for release

```bash
cd app
npm run tauri build
```

The output binary will be at `app/src-tauri/target/x86_64-pc-windows-msvc/release/party-display.exe`.

> **Note:** The first Rust build takes several minutes — subsequent builds are incremental.

### 3. Run tests

**Frontend** (Vitest):
```bash
cd app
npm test
```

**Backend** (Rust):
```bash
cd app/src-tauri
cargo test --workspace
```

---

## Verifying a release

Every release zip is built by GitHub Actions directly from the signed tag and attested via [Sigstore](https://sigstore.dev). You can cryptographically verify that the file you downloaded was produced by this repo's CI pipeline — not assembled on someone's machine.

**Requirements:** [GitHub CLI](https://cli.github.com) (`gh`)

```bash
gh attestation verify party-display-vX.Y.Z.zip --repo fmpallini/PartyDisplay
```

A passing result confirms the artifact's provenance. Replace `vX.Y.Z` with the version you downloaded.

You can also verify the SHA-256 checksum against `checksums.txt` bundled in the same release:

```powershell
# PowerShell
(Get-FileHash party-display-vX.Y.Z.zip -Algorithm SHA256).Hash.ToLower()
```

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
| [Butterchurn](https://github.com/jberg/butterchurn) | MilkDrop-style WebGL visualizer |
| [cpal](https://github.com/RustAudio/cpal) | Cross-platform audio I/O — WASAPI loopback capture |
| [rupnp](https://github.com/jakobhellermann/rupnp) | UPnP/DLNA device discovery and browsing |
| [notify](https://github.com/notify-rs/notify) | File system watcher for photo folder |
| [keyring-rs](https://github.com/hwchen/keyring-rs) | Secure credential storage via Windows Credential Store |
| [music-metadata](https://github.com/borewit/music-metadata) | Embedded audio tag parsing (ID3, FLAC, M4A, etc.) |
| [React](https://react.dev) | UI framework |
| [Vite](https://vitejs.dev) | Frontend build tooling |
| [TypeScript](https://www.typescriptlang.org) | Type-safe JavaScript |

---

## License

GNU AGPL v3 — see [LICENSE](LICENSE).
