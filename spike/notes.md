# SDK Spike Findings

Date: 2026-03-22

---

## Phase 1 — Electron spike (castlabs Electron + Widevine)

### Device Registration
- Did the device appear in Spotify Connect? YES
- Time to appear after `connect()`: ~2–3 seconds

### Audio Playback
- Did audio play? YES — but with systematic skipping
- Root cause: every track failed with a generic `{"message":"Playback error"}` at ~1000ms.
  Pattern was consistent: SDK buffers ~1s upfront before needing a valid Widevine license
  response from Spotify's server. The license request failed on every track.
- Conclusion: castlabs Electron's Widevine CDM did not satisfy Spotify's license server.
  Standard npm Electron has the same problem. Electron is not a viable foundation.

### AudioContext / FFT Access
- All attempts to tap the audio stream failed.
- See Phase 2 (Browser) for root cause.

---

## Phase 2 — Browser spike (Chrome + HTTPS local server)

### Device Registration
- Did the device appear in Spotify Connect? YES
- Time to appear after `connect()`: ~2–3 seconds

### Audio Playback
- Did audio play reliably? YES — no skipping, no DRM errors
- Tracks only change when the user manually skips
- Conclusion: Chrome's native Widevine is fully compatible with Spotify's license server.
  The browser is the correct foundation.

### OAuth / PKCE
- PKCE redirect flow is blocked for `https://localhost` — Spotify's authorization server
  returns "redirect_uri: Insecure" even though the URI uses HTTPS.
- Root cause: Spotify treats `https://localhost` as insecure (likely expects `http://localhost`
  per RFC 8252 for loopback, but their dashboard no longer lets you register `http://` URIs).
- Workaround for spike: paste a short-lived token from the Spotify developer console.
- Fix for Phase 2: desktop wrapper (Tauri/Electron) uses a custom protocol callback
  (e.g. `party-display://callback`) which Spotify's dashboard allows and has no HTTPS issue.

### AudioContext / FFT Access
- `document.querySelectorAll('audio, video')` → 0 elements
- `new Audio()` constructor intercept → never called by SDK
- `document.createElement('audio/video')` intercept → never called by SDK
- `HTMLMediaElement.prototype.play` intercept → never called by SDK
- `AudioNode.prototype.connect` intercept → never fired
- Chrome Web Audio Inspector → "No Web Audio API usage detected" while music plays
- Root cause: the SDK injects a **cross-origin iframe** (`sdk.scdn.co`) and plays audio
  entirely inside it via HTMLMediaElement + MSE. The parent page has zero access to the
  iframe's document, prototypes, or audio graph. This is intentional DRM sandboxing.
- Conclusion: real-time audio tap via Web Audio API is **not achievable** with the
  Spotify Web Playback SDK. This is a hard SDK limitation, not an environment issue.

### Beat Sync — Path Forward
- Use Spotify Web API `/audio-analysis/{id}` instead of real-time FFT.
- Returns pre-computed `beats[]`, `bars[]`, `sections[]` and `segments[]` with timestamps.
- Combined with `player.getCurrentState()` (gives position in ms), photo transitions
  can be synced to exact musical beats.
- This is more accurate than FFT (real musical structure vs amplitude spikes) and has
  zero performance overhead.

---

## Decisions for Phase 2

| Concern | Decision |
|---|---|
| Runtime | Browser (Chrome/Edge) inside a desktop wrapper (Tauri preferred, or Electron) |
| Audio playback | Spotify Web Playback SDK — works reliably in browser |
| OAuth | Custom protocol callback from desktop wrapper — no localhost HTTPS issue |
| Beat sync | Spotify Audio Analysis API + `getCurrentState()` position polling |
| Real-time FFT | Dropped — not achievable due to SDK cross-origin iframe sandboxing |
