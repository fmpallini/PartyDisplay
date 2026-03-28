# Party Display

> A vibe coding exercise — building a real Spotify-connected party display, driven entirely by AI agents.

---

## What is this?

Party Display is a desktop application that registers as a **Spotify Connect device** and shows a fullscreen photo slideshow on a projector or TV, synchronized to the music playing. Think of it as a smart jukebox backdrop — your photos, your playlist, your party.

The app is being built on **Tauri v2** (Windows), using the **Spotify Web Playback SDK** for device registration and audio, **WASAPI loopback** (via Rust) for real-time spectrum visualization, and the **Spotify Audio Analysis API** for beat-synchronized photo transitions.

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

### Spike 1 — Electron + castlabs Widevine (`spike/` — first attempt)

**Question:** Can the Spotify Web Playback SDK run inside Electron?

**Findings:**
- Device registration worked
- Audio played — but every track failed with a `playback_error` at ~1 second, then auto-skipped
- Root cause: the castlabs Electron Widevine CDM was rejected by Spotify's license server at the DRM renewal boundary
- The Web Audio FFT tap also failed — the SDK sandboxes audio inside a **cross-origin iframe**, making `AudioContext` access impossible from the parent page

**Decision:** Drop Electron.

---

### Spike 2 — Browser (Node.js HTTPS + Chrome) (`spike/`)

**Question:** Does the SDK work properly in a real browser?

**Findings:**
- Playback was flawless — zero skipping, no DRM errors (Chrome's native Widevine is fully compatible)
- Confirmed the cross-origin iframe limitation: Chrome's Web Audio Inspector showed **"No Web Audio API usage detected"** while music played
- OAuth PKCE redirect to `https://localhost` was blocked by Spotify ("redirect_uri: Insecure") — a known Spotify quirk around loopback URIs

**Decision:** Browser runtime is valid, but needs a desktop wrapper for OAuth and the audio tap problem needs a different solution.

---

### Spike 3 — Tauri v2 (`spike-tauri/`) ✅

**Question:** Does Tauri's WebView2 satisfy Spotify's Widevine DRM? Can Rust capture system audio via WASAPI loopback?

**Findings:**
- **WebView2 + Widevine:** Device registered instantly, music played with zero skipping. WebView2 (Edge's Chromium engine) ships a native, fully compatible Widevine CDM.
- **WASAPI loopback:** `cpal 0.15` + `rustfft 6` successfully captured system audio output, ran FFT, and streamed 64 frequency bins to the frontend via Tauri events. FFT sum: **753 non-zero** on first run.
- Live spectrum canvas animated in real time while Spotify played.

**Decision:** Tauri v2 on Windows is the confirmed foundation.

![Spike 3 — Tauri v2 running on Windows](spike-tauri/spike_tauri_windows.png)

*Live capture: Spotify SDK connected, WASAPI loopback active, spectrum canvas animating — FFT sum 753 non-zero on first run.*

---

## Architecture (Phase 2)

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
│  │  Spotify Audio Analysis API        │ │
│  │  OAuth PKCE + token refresh        │ │
│  │  Slideshow engine (folder watch)   │ │
│  │  IPC channels (typed)              │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Tech stack:** Tauri 2 · Rust · React · TypeScript · Vite · cpal · rustfft · Spotify Web Playback SDK · Spotify Web API

---

## Project structure

```
vcup2/
├── spike/              # Spike 2: browser validation (Node.js + Chrome)
├── spike-tauri/        # Spike 3: Tauri v2 validation ✅ (confirmed stack)
├── docs/
│   └── superpowers/
│       └── plans/      # Agent-generated implementation plans
└── README.md
```

---

## Status

- [x] Spike 1 — Electron (abandoned)
- [x] Spike 2 — Browser (validated SDK + found FFT limitation)
- [x] Spike 3 — Tauri v2 (validated full stack) ✅
- [ ] Phase 2 — Full app implementation