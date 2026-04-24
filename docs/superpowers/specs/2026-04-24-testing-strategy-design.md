# Testing Strategy Design — party-display

**Date:** 2026-04-24
**Scope:** Unit tests (frontend + backend) + manual E2E checklist for release

---

## Context

Tauri v2 desktop app (Windows). React 19 + TypeScript + Vite frontend. Rust backend (13 modules). Zero existing tests. Release is a manual process producing a standalone `party-display.exe`.

Key features: Spotify/local/DLNA/SMTC players, lyrics, butterchurn visualizer, slideshow, weather/battery/clock widgets, hotkeys.

---

## Decisions

| Concern | Decision |
|---------|----------|
| Frontend test runner | Vitest (native Vite integration, ESM) |
| Component testing | React Testing Library + jest-dom |
| Tauri IPC mocking | `vi.mock('@tauri-apps/api/core')` shared helper |
| Rust test mechanism | `#[cfg(test)]` inline + `tauri::test::mock_builder()` for command handlers |
| E2E approach | Structured manual checklist at release step 4 |
| CI | None — tests run locally, added to pre-work in RELEASE_GUIDELINES.md |
| Test file layout | Dedicated `app/src/__tests__/` and inline Rust `#[cfg(test)]` blocks |

---

## Directory Layout

```
app/src/__tests__/
  helpers/
    tauri-mock.ts       # shared vi.mock('@tauri-apps/api/core') setup + typed invoke stubs
    render.tsx          # custom RTL render() wrapper
  lib/
    utils.test.ts
    spotify-auth.test.ts
    player-types.test.ts
  hooks/
    useAuth.test.ts
    useLyrics.test.ts
    useLocalPlayer.test.ts
    useSpotifyPlayer.test.ts
    useExternalPlayer.test.ts
    useWeather.test.ts
    useBattery.test.ts
    useHotkeys.test.ts
  components/
    NowPlaying.test.tsx
    LyricsOverlay.test.tsx
    PlayerControls.test.tsx
    SongToast.test.tsx
    ClockWeatherWidget.test.tsx

docs/testing/
  release-checklist.md  # manual E2E checklist (linked from RELEASE_GUIDELINES.md)
```

Rust: `#[cfg(test)]` blocks inline at bottom of each `.rs` file.

---

## Frontend Unit Tests

### New devDependencies

```json
"vitest": "^2",
"@testing-library/react": "^16",
"@testing-library/user-event": "^14",
"@testing-library/jest-dom": "^6",
"jsdom": "^26"
```

Vitest config added to `vite.config.ts`:

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./src/__tests__/helpers/tauri-mock.ts'],
  globals: true,
}
```

`npm test` script: `"test": "vitest run"`.

### Tauri IPC Mock (`tauri-mock.ts`)

`vi.mock('@tauri-apps/api/core')` with a typed `mockInvoke` helper that returns configurable responses per command name. All hook tests import this shared mock — no per-file mock boilerplate.

### Lib (pure functions — no mocking)

| File | Coverage |
|------|----------|
| `utils.ts` | All exported functions; formatters, parsers, edge cases (null/empty/boundary values) |
| `spotify-auth.ts` | Token expiry check, PKCE code verifier/challenge generation, redirect URL builder |
| `player-types.ts` | Type guards and discriminated union helpers |

### Hooks (mock Tauri IPC)

| Hook | What to test |
|------|-------------|
| `useLyrics` | Fetch → parse → display state; empty lyrics; fetch error path |
| `useLocalPlayer` | Play/pause/next/prev state transitions; end-of-queue behavior |
| `useSpotifyPlayer` | Auth state → playback state; token refresh trigger |
| `useExternalPlayer` | SMTC event → TrackInfo mapping; stale event guard (no re-emit same track) |
| `useAuth` | Login sets tokens; logout clears tokens; stored token loaded on mount |
| `useWeather` | Fetch success renders data; fetch failure returns error state; stale cache served |
| `useBattery` | Level thresholds (low/critical); charging state toggle; unavailable on desktop |
| `useHotkeys` | Key bindings registered on mount; correct IPC command fired per key; bindings cleaned up on unmount |

### Components (React Testing Library)

| Component | What to test |
|-----------|-------------|
| `NowPlaying` | Renders title + artist; handles missing fields gracefully (no crash on undefined) |
| `LyricsOverlay` | Displays lyrics lines; hides when empty; resets scroll on track change |
| `PlayerControls` | All buttons render; click fires correct `invoke` call via mock |
| `SongToast` | Appears on track change prop; auto-dismisses after timeout |
| `ClockWeatherWidget` | Renders formatted time; shows correct weather icon for condition codes |

Visualizer (`VisualizerCanvas`) and Slideshow (`SlideshowView`) skipped — canvas/WebGL not meaningful in jsdom.

---

## Backend Unit Tests

`cargo test` runs all `#[cfg(test)]` blocks.

### Pure logic (no mocking required)

| Module | What to test |
|--------|-------------|
| `smtc.rs` | `normalize_browser_track`: YouTube Music " - Topic" suffix stripping, VEVO suffix, title/artist split from "Artist - Song" format, artist-only title (no dash), empty artist |
| `smtc.rs` | `strip_title_noise`: removes `(Official Video)`, `(Lyrics)`, `(Remastered 2011)`, nested parens, leaves clean titles unchanged |
| `smtc.rs` | MIME detection from raw bytes: JPEG magic `\xff\xd8\xff`, PNG magic `\x89PNG`, unknown bytes returns `None` |
| `slideshow.rs` | `collect_photos`: filters by extension (jpg/jpeg/png/webp/gif/bmp), case-insensitive match, recursive vs flat, non-photo files excluded *(scaffold already exists)* |
| `auth.rs` | `TokenPayload` serde round-trip: serialize → deserialize → fields match *(already written)* |
| `system.rs` | Extract JSON parsing from `get_ip_location` into `parse_ip_location(json: &Value)` pure fn; test valid JSON, missing fields, wrong types |

### Command handler tests via `tauri::test::mock_builder()`

| Module | What to test |
|--------|-------------|
| `slideshow.rs` | `get_photos` returns paths from `SlideshowState`; `watch_folder` with temp dir populates state correctly, rejects non-directory path |
| `presets.rs` | Preset list/load command with temp directory fixture |

### Skipped (OS-bound)

| Module | Reason |
|--------|--------|
| `audio.rs` | Requires real WASAPI/cpal audio device |
| `smtc.rs` command handlers | WinRT COM init, no mock available |
| `auth.rs` command handlers | Windows keyring (integration-level) |
| `media_keys.rs` | Win32 input simulation |
| `window_manager.rs` | Tauri window lifecycle |
| `dlna.rs` / `dlna_proxy.rs` | Network/UPnP |

---

## E2E Manual Checklist

Stored at `docs/testing/release-checklist.md`. Linked from `RELEASE_GUIDELINES.md` step 4.

Each item: checkbox + expected result. Failure = stop release, file bug.

> **Note:** Each section maps to a future automated scenario (tauri-driver + Playwright). Keep items atomic with clear pass/fail criteria to ease that migration.

### 1. App Launch
- [ ] App opens without crash
- [ ] Control panel renders, no console errors visible
- [ ] Display window opens from Display Window Controls

### 2. Spotify Player
- [ ] Login flow completes (OAuth redirect returns to app)
- [ ] Now Playing shows track title and artist
- [ ] Lyrics appear and advance in sync with playback
- [ ] Play/pause/next/prev controls respond correctly
- [ ] SongToast appears on track change

### 3. Local Player
- [ ] Folder picker selects a directory
- [ ] Audio files from folder appear and play
- [ ] Play/pause/skip controls work
- [ ] Visualizer (butterchurn) animates to audio

### 4. External Player (SMTC)
- [ ] Play media in browser (YouTube or Spotify Web)
- [ ] Track info appears in Now Playing within ~3 seconds
- [ ] Artist/title normalized: no "- Topic", "VEVO", "(Official Video)"
- [ ] Stopping media in browser clears Now Playing

### 5. DLNA Browser
- [ ] DLNA sources discoverable on local network *(skip if no device available)*
- [ ] Selecting a source initiates playback

### 6. Slideshow
- [ ] Folder picker loads photos into slideshow
- [ ] Slideshow cycles images in display window
- [ ] Recursive toggle correctly includes/excludes subfolders

### 7. Visualizer Presets
- [ ] Preset list populates from `presets/` folder
- [ ] Switching preset changes the active visualization

### 8. Widgets
- [ ] Clock shows correct local time
- [ ] Weather shows city name and condition icon
- [ ] Battery shows level (or graceful N/A on desktop)

### 9. Settings Persistence
- [ ] Change a display setting
- [ ] Restart app
- [ ] Setting retained after restart

### 10. Hotkeys
- [ ] Play/pause hotkey triggers correct playback action
- [ ] At least one other hotkey (next/prev) fires correct command

---

## Release Process Changes

### RELEASE_GUIDELINES.md — Pre-work

Add as **P0** (before existing P1):

```
P0. Run tests
- `cd app && npm test` — all frontend tests must pass.
- `cd app/src-tauri && cargo test` — all Rust tests must pass.
Do not proceed if any test fails.
```

### RELEASE_GUIDELINES.md — Step 4

Replace current placeholder text with:

```
**4. Test against release build**
Work through every item in `docs/testing/release-checklist.md` using the built `party-display.exe`.
Do not proceed until all items are checked off.
```
