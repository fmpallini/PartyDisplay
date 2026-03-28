# Tauri Spike Findings

Date: 2026-03-28

## Result: BOTH hypotheses validated ✅

---

## Hypothesis 1 — Spotify SDK + WebView2 + Widevine

- Did the device register in Spotify Connect? YES
- Did music play without skipping? YES — flawless, no `playback_error` events
- Root cause of Electron skipping confirmed: castlabs Widevine CDM was incompatible
  with Spotify's license server. WebView2 (Edge's Chromium) has a native, fully
  compatible Widevine CDM that satisfies Spotify's DRM requirements out of the box.

**Decision: Tauri on Windows is the correct runtime foundation.**

---

## Hypothesis 2 — WASAPI Loopback FFT

- Did `cpal::default_host().default_output_device().build_input_stream()` open a
  loopback capture on the render device? YES
- Did FFT data flow to the frontend via Tauri events? YES
- FFT sum while playing: 753 (non-zero) ✅
- Live spectrum canvas animated in real time while music played

**Implementation that worked:**
- `cpal 0.15` — `build_input_stream::<f32, _, _>` on the default output device
- `rustfft 6` — Hann-windowed 1024-point FFT, downsampled to 64 bins
- `app.emit("fft-data", &bins)` — Tauri event to frontend
- `window.__TAURI__.event.listen('fft-data', ...)` — frontend canvas draw

**Decision: WASAPI loopback via Rust backend is the real-time visualization solution.**

---

## OAuth — Path Forward

- Spike used paste-token (short-lived token from Spotify developer console)
- Phase 2 will use PKCE via a Tauri deep-link plugin:
  - Register `party-display://` protocol in `tauri.conf.json`
  - Open Spotify auth in system browser via `tauri-plugin-shell`
  - `tauri-plugin-deep-link` intercepts `party-display://callback?code=...`
  - Main window exchanges code for token (no localhost HTTPS needed)

---

## Decisions for Phase 2

| Concern                  | Decision                                                   |
|--------------------------|------------------------------------------------------------|
| Runtime                  | Tauri v2 on Windows (WebView2)                             |
| Audio playback           | Spotify Web Playback SDK — works flawlessly in WebView2    |
| DRM / Widevine           | Native in WebView2 — no castlabs or workarounds needed     |
| Real-time visualization  | WASAPI loopback in Rust → rustfft → Tauri events → canvas  |
| Beat sync (structural)   | Spotify Audio Analysis API + getCurrentState() position    |
| OAuth                    | PKCE + tauri-plugin-deep-link + custom protocol            |
| macOS / Linux            | Out of scope — WKWebView has no Widevine                   |
