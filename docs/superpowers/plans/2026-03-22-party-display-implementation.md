# Party Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Party Display — an Electron app that registers as a Spotify Connect device and shows a fullscreen photo slideshow on a projector/TV, validated first via a minimal SDK spike.

**Architecture:** Two phases. Phase 1 is a self-contained spike in `spike/` that validates Spotify Web Playback SDK behavior inside Electron's Chromium renderer (device registration, audio playback, AudioContext/FFT access). Phase 2 scaffolds the full app with two windows (Control Panel + Display Window), OAuth PKCE, slideshow engine, and SDK integration — informed by spike findings.

**Tech Stack:** Electron, Electron Forge (Vite plugin), React, TypeScript, Vite, Vitest, Spotify Web Playback SDK, Web Audio API, electron-store, keytar

---

## Prerequisites (human action required before starting)

1. Register a Spotify Developer App at https://developer.spotify.com/dashboard — note the `client_id`.
2. Add `party-display://callback` as a Redirect URI in the app settings.
3. For Phase 1 only: obtain a short-lived access token from https://developer.spotify.com/console/get-track/ (click "Get Token", select `streaming` scope). You will paste this into `spike/index.html`.

---

## File Map

**Phase 1 — Spike**
- Create: `spike/main.mjs` — minimal Electron main (no TypeScript, no build step)
- Create: `spike/index.html` — renderer: loads SDK, initializes player, tests AudioContext
- Create: `spike/notes.md` — findings: AudioContext access method, Electron quirks

**Phase 2 — Full App**
- Modify: `.gitignore` — add `node_modules/`, `.vite/`, `out/` entries
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `forge.config.ts` — Electron Forge + Vite plugin, two renderers
- Create: `vite.main.config.ts` — Vite config for main process
- Create: `vite.preload.config.ts` — Vite config for preload script
- Create: `vite.renderer.config.ts` — shared renderer Vite config (React)
- Create: `src/main/index.ts` — Electron main entry
- Create: `src/main/ipc.ts` — typed IPC channel names and payload types (source of truth)
- Create: `src/main/settings.ts` — electron-store wrapper
- Create: `src/main/windows.ts` — BrowserWindow creation/management
- Create: `src/main/spotify-auth.ts` — OAuth 2.0 PKCE, custom protocol, token refresh
- Create: `src/main/slideshow.ts` — folder reader, shuffled queue, interval timer
- Create: `src/preload/index.ts` — contextBridge exposing typed IPC to renderers
- Create: `src/control-panel/index.html`
- Create: `src/control-panel/main.tsx` — React root
- Create: `src/control-panel/App.tsx` — top-level component
- Create: `src/control-panel/spotify-player.ts` — SDK init, AnalyserNode, FFT forwarding
- Create: `src/control-panel/components/LoginButton.tsx`
- Create: `src/control-panel/components/StatusIndicator.tsx`
- Create: `src/control-panel/components/FolderPicker.tsx`
- Create: `src/control-panel/components/MonitorSelector.tsx`
- Create: `src/control-panel/components/VolumeSlider.tsx`
- Create: `src/display/index.html`
- Create: `src/display/main.tsx` — React root
- Create: `src/display/App.tsx` — top-level component
- Create: `src/display/components/SlideshowView.tsx`
- Create: `src/display/components/NowPlayingOverlay.tsx`
- Create: `tests/slideshow.test.ts`
- Create: `tests/spotify-auth.test.ts`

---

## Phase 1 — Web Playback SDK Spike

> **Purpose:** Validate SDK behavior in Electron before committing to the full app architecture. This is manual validation — no automated tests.

### Task 1: Create the spike Electron main

**Files:**
- Create: `spike/main.mjs`

- [ ] **Step 1: Create `spike/main.mjs`**

```js
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.openDevTools({ mode: 'detach' });
});

app.on('window-all-closed', () => app.quit());
```

> Note: `--autoplay-policy=no-user-gesture-required` is critical — without it, Chromium blocks the SDK's AudioContext until a user gesture, which breaks device registration.

- [ ] **Step 2: Create a minimal `spike/package.json`**

```json
{
  "name": "party-display-spike",
  "version": "0.0.1",
  "main": "main.mjs",
  "type": "module"
}
```

- [ ] **Step 3: Create `spike/.gitignore`**

```
node_modules/
package-lock.json
```

This must exist before the next npm install to prevent committing `node_modules`.

- [ ] **Step 4: Install Electron in the spike directory**

```bash
cd spike && npm install --save-dev electron@latest
```

Expected: `node_modules/` created, `package-lock.json` written. Both are gitignored.

- [ ] **Step 5: Commit**

```bash
cd .. && git add spike/main.mjs spike/package.json spike/.gitignore
git commit -m "feat(spike): minimal Electron main for SDK validation"
```

---

### Task 2: Create the spike renderer

**Files:**
- Create: `spike/index.html`

- [ ] **Step 1: Create `spike/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SDK Spike</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #111; color: #eee; }
    #status, #track, #fft, #log { margin: 12px 0; padding: 8px; background: #222; border-radius: 4px; }
    h2 { color: #1db954; }
  </style>
</head>
<body>
  <h2>Spotify Web Playback SDK Spike</h2>

  <div><strong>Status:</strong> <span id="status">Waiting for SDK...</span></div>
  <div><strong>Track:</strong> <span id="track">—</span></div>
  <div><strong>FFT sum (non-zero = audio tapped):</strong> <span id="fft">—</span></div>
  <pre id="log"></pre>

  <script src="https://sdk.scdn.co/spotify-player.js"></script>
  <script>
    // PASTE a short-lived access token here (from developer.spotify.com/console, streaming scope)
    const TOKEN = 'PASTE_TOKEN_HERE';

    const log = (...args) => {
      document.getElementById('log').textContent += args.join(' ') + '\n';
      console.log(...args);
    };

    window.onSpotifyWebPlaybackSDKReady = () => {
      log('SDK ready');

      const player = new Spotify.Player({
        name: 'Party Display Spike',
        getOAuthToken: cb => cb(TOKEN),
        volume: 0.5,
      });

      player.addListener('ready', ({ device_id }) => {
        document.getElementById('status').textContent = `✅ Connected — device_id: ${device_id}`;
        log('ready', device_id);
        // Device should now appear in Spotify Connect on the same account
        tryTapAudio();
      });

      player.addListener('not_ready', ({ device_id }) => {
        document.getElementById('status').textContent = `⚠️ Not ready: ${device_id}`;
        log('not_ready', device_id);
      });

      player.addListener('player_state_changed', state => {
        if (!state) return;
        const { current_track } = state.track_window;
        document.getElementById('track').textContent =
          `${current_track.name} — ${current_track.artists.map(a => a.name).join(', ')}`;
        log('state_changed:', current_track.name);
      });

      player.addListener('initialization_error', ({ message }) => log('init_error:', message));
      player.addListener('authentication_error', ({ message }) => log('auth_error:', message));
      player.addListener('account_error', ({ message }) => log('account_error: (Premium required)', message));

      player.connect().then(ok => log('connect result:', ok));
    };

    function tryTapAudio() {
      // Attempt 1: find an audio element the SDK created and tap it via createMediaElementSource
      const audioEls = Array.from(document.querySelectorAll('audio'));
      log('audio elements found:', audioEls.length);

      if (audioEls.length > 0) {
        try {
          const ctx = new AudioContext();
          const src = ctx.createMediaElementSource(audioEls[0]);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          analyser.connect(ctx.destination);
          log('✅ AudioContext approach 1 (MediaElementSource) succeeded');
          runFFT(analyser);
          return;
        } catch (e) {
          log('approach 1 failed:', e.message);
        }
      }

      // Attempt 2: capture via getUserMedia / AudioWorklet (fallback, unlikely to work here)
      log('⚠️ No audio element found — FFT tapping not confirmed. Document in notes.md.');
      document.getElementById('fft').textContent = 'Could not tap — see notes.md';
    }

    function runFFT(analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const sum = data.reduce((a, b) => a + b, 0);
        document.getElementById('fft').textContent = `${sum} ${sum > 0 ? '✅ non-zero' : '(zero — play a track to test)'}`;
        requestAnimationFrame(tick);
      };
      tick();
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Paste your short-lived token** into the `TOKEN` constant on line with `PASTE_TOKEN_HERE`.

- [ ] **Step 3: Run the spike**

```bash
cd spike && npx electron main.mjs
```

Expected: Electron window opens. DevTools show "SDK ready" and a `device_id` in the log panel.

- [ ] **Step 4: Open Spotify on any device logged into the same account → Connect to "Party Display Spike"**

Expected: Audio plays through the host machine. `track` div updates with song name.

- [ ] **Step 5: Confirm FFT**

Expected: `fft` div shows a non-zero number while music plays.

- [ ] **Step 6: Commit renderer**

```bash
git add spike/index.html
git commit -m "feat(spike): renderer with SDK init, AudioContext tap, FFT display"
```

---

### Task 3: Document spike findings

**Files:**
- Create: `spike/notes.md`

- [ ] **Step 1: Create `spike/notes.md` with findings**

Use the template below — fill in the actual results from running the spike:

```markdown
# SDK Spike Findings

Date: 2026-03-22

## Device Registration
- Did the device appear in Spotify Connect? [YES / NO]
- Time to appear after `connect()`: [N seconds]

## Audio Playback
- Did audio play through the host machine when selected in Spotify? [YES / NO]
- Notes:

## AudioContext / FFT Access
- Did `document.querySelectorAll('audio')` find the SDK's audio element? [YES / NO, count: N]
- Did `createMediaElementSource` succeed? [YES / NO]
- Did FFT sum go non-zero during playback? [YES / NO]
- If Approach 1 failed — what was the error message?

## Electron-specific Quirks
- Was `--autoplay-policy=no-user-gesture-required` needed? [YES / NO]
- Any other issues:

## Decision for Phase 2
- AudioContext strategy: [MediaElementSource / fallback approach / TBD]
```

- [ ] **Step 2: Commit findings**

```bash
git add spike/notes.md
git commit -m "docs(spike): record Web Playback SDK findings"
```

> **Stop here and review `spike/notes.md` before proceeding to Phase 2.** If AudioContext tapping failed, the FFT approach in Phase 2 must be adjusted. Update the plan accordingly.

---

## Phase 2 — Full Electron App

> Assumes spike findings confirmed device registration works and AudioContext approach is known.

### Task 4: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `forge.config.ts`, `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`

- [ ] **Step 1: Update root `.gitignore`**

Add these lines to the existing `c:/Users/fmpal/vcup2/.gitignore`:

```
# Electron / Vite build output
node_modules/
.vite/
out/
```

- [ ] **Step 2: Initialize the project**

Run from the repo root (`vcup2/`):

```bash
npm init -y
```

- [ ] **Step 3: Install dependencies**

```bash
npm install react react-dom electron-store keytar
npm install --save-dev \
  electron@latest \
  @electron-forge/cli \
  @electron-forge/maker-squirrel \
  @electron-forge/plugin-vite \
  vite \
  @vitejs/plugin-react \
  typescript \
  vitest \
  @vitest/ui \
  @types/react \
  @types/react-dom
```

> `react`, `react-dom`, `electron-store`, and `keytar` are runtime dependencies — they go in `dependencies`, not `devDependencies`, so Electron Forge includes them in packaged builds.

- [ ] **Step 4: Add scripts to `package.json`**

Open `package.json` and set these fields:

```json
{
  "name": "party-display",
  "version": "0.1.0",
  "description": "Spotify Connect device + photo slideshow for parties",
  "main": ".vite/build/main/index.js",
  "scripts": {
    "start": "electron-forge start",
    "build": "electron-forge build",
    "package": "electron-forge package",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "type": "commonjs"
}
```

- [ ] **Step 5: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "sourceMap": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*", "tests/**/*", "forge.config.ts", "vite.*.config.ts"]
}
```

- [ ] **Step 6: Create `forge.config.ts`**

```typescript
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Party Display',
    executableName: 'party-display',
    protocols: [{ name: 'Party Display', schemes: ['party-display'] }],
  },
  makers: [new MakerSquirrel({ name: 'PartyDisplay' })],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [
        { name: 'control_panel', config: 'vite.renderer.config.ts' },
        { name: 'display', config: 'vite.renderer.config.ts' },
      ],
    }),
  ],
};

export default config;
```

- [ ] **Step 7: Create `vite.main.config.ts`**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: { lib: { entry: 'src/main/index.ts', formats: ['cjs'] } },
});
```

- [ ] **Step 8: Create `vite.preload.config.ts`**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: { lib: { entry: 'src/preload/index.ts', formats: ['cjs'] } },
});
```

- [ ] **Step 9: Create `vite.renderer.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
```

- [ ] **Step 10: Verify the project starts**

```bash
npm start
```

Expected: Electron launches (even if no window appears yet — the main entry doesn't exist, so it may error). The build step completing without TypeScript errors is the goal.

- [ ] **Step 11: Commit scaffold**

```bash
git add package.json tsconfig.json forge.config.ts vite.*.config.ts
git commit -m "feat: scaffold Electron Forge project with Vite + React + TS"
```

---

### Task 5: IPC type definitions

**Files:**
- Create: `src/main/ipc.ts`

> This is the single source of truth for all IPC channels. Both main and renderer import from here — no magic strings elsewhere.

- [ ] **Step 1: Create `src/main/ipc.ts`**

```typescript
// IPC channel names and payload types — import from here everywhere, never hardcode strings

export const IPC = {
  NEXT_IMAGE: 'next-image',
  TRACK_CHANGED: 'track-changed',
  FFT_DATA: 'fft-data',
  SET_VOLUME: 'set-volume',
  PLAYER_STATUS: 'player-status',
  START_LOGIN: 'start-login',
  OPEN_FOLDER_DIALOG: 'open-folder-dialog',
  GET_DISPLAYS: 'get-displays',
  SET_DISPLAY: 'set-display',
  GET_SETTINGS: 'get-settings',
  SET_SETTINGS: 'set-settings',
  // Note: GET_ACCESS_TOKEN is an intentional addition to the spec's channel list.
  // The Web Playback SDK needs a fresh access token from the renderer, but only
  // the main process holds credentials. This channel bridges that gap.
  GET_ACCESS_TOKEN: 'get-access-token',
} as const;

export type IpcChannels = typeof IPC;

export interface TrackInfo {
  trackName: string;
  artist: string;
}

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export type PlayerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Settings {
  folderPath: string | null;
  slideshowInterval: number; // ms, default 30000
  deviceName: string; // default "Party Display"
  selectedMonitorId: number | null;
  displayMode: 'clean' | 'now-playing' | 'spectrum' | 'psychedelic';
  volume: number; // 0–1
}

export type FftBands = { bass: number; mid: number; treble: number };
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat: add typed IPC channel definitions"
```

---

### Task 6: Settings module

**Files:**
- Create: `src/main/settings.ts`
- Create: `tests/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-store so tests don't hit the filesystem
const data: Record<string, unknown> = {};

vi.mock('electron-store', () => ({
  default: class {
    get(key: string, def: unknown) { return key in data ? data[key] : def; }
    set(key: string, val: unknown) { data[key] = val; }
  },
}));

import { getSettings, setSetting } from '../src/main/settings';

describe('settings', () => {
  beforeEach(() => {
    // Reset shared mock state between tests
    Object.keys(data).forEach(k => delete data[k]);
  });

  it('returns defaults when nothing is stored', () => {
    const s = getSettings();
    expect(s.slideshowInterval).toBe(30000);
    expect(s.deviceName).toBe('Party Display');
    expect(s.displayMode).toBe('clean');
    expect(s.volume).toBe(0.8);
    expect(s.folderPath).toBeNull();
    expect(s.selectedMonitorId).toBeNull();
  });

  it('persists a setting', () => {
    setSetting('deviceName', 'My Party Box');
    expect(getSettings().deviceName).toBe('My Party Box');
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
npm test -- tests/settings.test.ts
```

Expected: FAIL — `Cannot find module '../src/main/settings'`

- [ ] **Step 3: Implement `src/main/settings.ts`**

```typescript
import Store from 'electron-store';
import type { Settings } from './ipc';

const DEFAULTS: Settings = {
  folderPath: null,
  slideshowInterval: 30_000,
  deviceName: 'Party Display',
  selectedMonitorId: null,
  displayMode: 'clean',
  volume: 0.8,
};

const store = new Store<Settings>({ defaults: DEFAULTS });

export function getSettings(): Settings {
  return {
    folderPath: store.get('folderPath', DEFAULTS.folderPath),
    slideshowInterval: store.get('slideshowInterval', DEFAULTS.slideshowInterval),
    deviceName: store.get('deviceName', DEFAULTS.deviceName),
    selectedMonitorId: store.get('selectedMonitorId', DEFAULTS.selectedMonitorId),
    displayMode: store.get('displayMode', DEFAULTS.displayMode),
    volume: store.get('volume', DEFAULTS.volume),
  };
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  store.set(key, value);
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
npm test -- tests/settings.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.ts tests/settings.test.ts
git commit -m "feat: add settings module with electron-store and tests"
```

---

### Task 7: Slideshow engine

**Files:**
- Create: `src/main/slideshow.ts`
- Create: `tests/slideshow.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/slideshow.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// electron is not available in Vitest (Node env) — mock it so the module loads
vi.mock('electron', () => ({
  BrowserWindow: class {},
}));

vi.mock('fs', () => ({
  default: { readdirSync: vi.fn(), statSync: vi.fn(() => ({ isFile: () => true })) },
  readdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true })),
}));

import * as fs from 'fs';
import { buildQueue, filterImages } from '../src/main/slideshow';

describe('filterImages', () => {
  it('keeps JPEG, PNG, WebP, GIF files', () => {
    const files = ['photo.jpg', 'photo.jpeg', 'photo.png', 'photo.webp', 'photo.gif'];
    expect(filterImages('/folder', files)).toHaveLength(5);
  });

  it('excludes non-image files', () => {
    const files = ['doc.txt', 'video.mp4', 'image.bmp'];
    expect(filterImages('/folder', files)).toHaveLength(0);
  });

  it('returns absolute paths', () => {
    const files = ['photo.jpg'];
    const result = filterImages('/my/folder', files);
    expect(result[0]).toBe(path.join('/my/folder', 'photo.jpg'));
  });
});

describe('buildQueue', () => {
  it('returns a permutation of the input (same elements, same length)', () => {
    const images = Array.from({ length: 10 }, (_, i) => `img${i}.jpg`);
    const queue = buildQueue(images);
    expect(queue).toHaveLength(images.length);
    expect([...queue].sort()).toEqual([...images].sort());
  });

  it('shuffles when Math.random is mocked to produce a known swap', () => {
    // Mock Math.random to always return 0 — this causes Fisher-Yates to
    // swap each element with index 0, producing a reversed-ish result
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const images = ['a.jpg', 'b.jpg', 'c.jpg'];
    const queue = buildQueue(images);
    expect(queue).not.toEqual(images); // should differ from original with this mock
    vi.restoreAllMocks();
  });

  it('returns a new array (does not mutate input)', () => {
    const images = ['a.jpg', 'b.jpg'];
    const queue = buildQueue(images);
    expect(queue).not.toBe(images);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/slideshow.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/slideshow.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';
import { IPC } from './ipc';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export function filterImages(folderPath: string, filenames: string[]): string[] {
  return filenames
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map(f => path.join(folderPath, f));
}

export function buildQueue(images: string[]): string[] {
  const queue = [...images];
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

export class Slideshow {
  private queue: string[] = [];
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private displayWindow: BrowserWindow | null = null;

  setDisplayWindow(win: BrowserWindow): void {
    this.displayWindow = win;
  }

  start(folderPath: string, intervalMs: number): void {
    this.stop();
    let filenames: string[];
    try {
      filenames = fs.readdirSync(folderPath);
    } catch {
      this.sendImage(null);
      return;
    }
    const images = filterImages(folderPath, filenames);
    if (images.length === 0) {
      this.sendImage(null);
      return;
    }
    this.queue = buildQueue(images);
    this.index = 0;
    this.sendImage(this.queue[0]);
    this.timer = setInterval(() => this.advance(), intervalMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.queue = [];
  }

  setInterval(intervalMs: number): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.advance(), intervalMs);
  }

  private advance(): void {
    this.index = (this.index + 1) % this.queue.length;
    this.sendImage(this.queue[this.index]);
  }

  private sendImage(filePath: string | null): void {
    if (!this.displayWindow || this.displayWindow.isDestroyed()) return;
    const url = filePath ? `file://${filePath.replace(/\\/g, '/')}` : null;
    this.displayWindow.webContents.send(IPC.NEXT_IMAGE, url);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- tests/slideshow.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/slideshow.ts tests/slideshow.test.ts
git commit -m "feat: add slideshow engine with shuffle queue and tests"
```

---

### Task 8: Spotify OAuth module

**Files:**
- Create: `src/main/spotify-auth.ts`
- Create: `tests/spotify-auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/spotify-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, parseCallbackUrl } from '../src/main/spotify-auth';

describe('generateCodeVerifier', () => {
  it('returns a 43-128 character string', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it('only contains URL-safe characters', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
});

describe('generateCodeChallenge', () => {
  it('returns a non-empty base64url string for a given verifier', async () => {
    const challenge = await generateCodeChallenge('test-verifier');
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/); // base64url, no padding
  });
});

describe('parseCallbackUrl', () => {
  it('extracts the code from a valid callback URL', () => {
    const result = parseCallbackUrl('party-display://callback?code=abc123&state=xyz');
    expect(result).toEqual({ code: 'abc123', error: null });
  });

  it('extracts error from a rejected callback', () => {
    const result = parseCallbackUrl('party-display://callback?error=access_denied');
    expect(result).toEqual({ code: null, error: 'access_denied' });
  });

  it('returns null code and error for unrecognized URL', () => {
    const result = parseCallbackUrl('party-display://callback');
    expect(result).toEqual({ code: null, error: null });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/spotify-auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/spotify-auth.ts`**

```typescript
import { shell, protocol, net } from 'electron';
import crypto from 'crypto';

// ─── PKCE helpers ────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url').slice(0, 128);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return Buffer.from(hash).toString('base64url');
}

export function parseCallbackUrl(url: string): { code: string | null; error: string | null } {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error');
  return { code, error };
}

// ─── OAuth flow ───────────────────────────────────────────────────────────────

const REDIRECT_URI = 'party-display://callback';
const SCOPES = 'streaming user-read-email user-read-private';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

let clientId = '';
let accessToken: string | null = null;
let refreshToken: string | null = null;
let tokenExpiry = 0;

export function configure(id: string): void {
  clientId = id;
}

export async function startLoginFlow(): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('scope', SCOPES);

  shell.openExternal(authUrl.toString());

  // Wait for the custom protocol callback (registered in main/index.ts)
  // The callback handler calls exchangeCode()
  // Store verifier so the callback can use it
  (global as Record<string, unknown>).__pkce_verifier = verifier;
}

export async function exchangeCode(code: string): Promise<void> {
  const verifier = (global as Record<string, unknown>).__pkce_verifier as string;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });

  const res = await net.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const json = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  accessToken = json.access_token;
  refreshToken = json.refresh_token;
  tokenExpiry = Date.now() + json.expires_in * 1000 - 60_000; // refresh 60s early

  await persistRefreshToken(refreshToken);
}

export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  if (refreshToken) return silentRefresh();
  throw new Error('Not authenticated');
}

async function silentRefresh(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken!,
    client_id: clientId,
  });

  const res = await net.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    accessToken = null;
    refreshToken = null;
    throw new Error('Token refresh failed — re-login required');
  }

  const json = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  accessToken = json.access_token;
  if (json.refresh_token) {
    refreshToken = json.refresh_token;
    await persistRefreshToken(refreshToken);
  }
  tokenExpiry = Date.now() + json.expires_in * 1000 - 60_000;
  return accessToken;
}

export function logout(): void {
  accessToken = null;
  refreshToken = null;
  tokenExpiry = 0;
  clearPersistedToken();
}

// ─── Credential storage ───────────────────────────────────────────────────────

const KEYCHAIN_SERVICE = 'party-display';
const KEYCHAIN_ACCOUNT = 'refresh-token';

// ─── Credential storage helpers ───────────────────────────────────────────────
// Primary: keytar (OS keychain). Fallback: electron-store (token stored in
// plaintext in the app's userData — acceptable for a dev/party tool, not for
// production software handling high-value credentials).

async function persistRefreshToken(token: string): Promise<void> {
  try {
    const keytar = await import('keytar');
    await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, token);
  } catch {
    // keytar unavailable (e.g., missing native build tools on Windows dev env)
    // Fall back to electron-store
    try {
      const Store = (await import('electron-store')).default;
      const store = new Store();
      store.set('refreshToken', token);
    } catch {
      console.warn('keytar and electron-store fallback both failed; token not persisted');
    }
  }
}

export async function loadPersistedToken(): Promise<void> {
  let token: string | null = null;
  try {
    const keytar = await import('keytar');
    token = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  } catch {
    // keytar unavailable — try electron-store fallback
    try {
      const Store = (await import('electron-store')).default;
      const store = new Store();
      token = (store.get('refreshToken') as string | undefined) ?? null;
    } catch { /* no stored token */ }
  }
  if (token) {
    refreshToken = token;
    await silentRefresh();
  }
}

function clearPersistedToken(): void {
  import('keytar')
    .then(k => k.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT))
    .catch(async () => {
      try {
        const Store = (await import('electron-store')).default;
        new Store().delete('refreshToken');
      } catch { /* ignore */ }
    });
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- tests/spotify-auth.test.ts
```

Expected: all tests pass (PKCE and URL parsing tests; OAuth flow tests are integration-only).

- [ ] **Step 5: Commit**

```bash
git add src/main/spotify-auth.ts tests/spotify-auth.test.ts
git commit -m "feat: add Spotify OAuth PKCE module with tests"
```

---

### Task 9: Windows module

**Files:**
- Create: `src/main/windows.ts`

- [ ] **Step 1: Create `src/main/windows.ts`**

```typescript
import { BrowserWindow, screen } from 'electron';
import path from 'path';

// Electron Forge Vite plugin injects VITE_DEV_SERVER_URL at dev time.
// In production builds, we load from the built renderer output path.

let controlPanel: BrowserWindow | null = null;
let displayWindow: BrowserWindow | null = null;

export function createControlPanel(): BrowserWindow {
  controlPanel = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: false,
    alwaysOnTop: false,
    title: 'Party Display — Control Panel',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    controlPanel.loadURL(process.env['VITE_DEV_SERVER_URL'] + 'control_panel/');
  } else {
    controlPanel.loadFile(path.join(__dirname, '../renderer/control_panel/index.html'));
  }

  controlPanel.on('closed', () => { controlPanel = null; });
  return controlPanel;
}

export function createDisplayWindow(monitorId?: number | null): BrowserWindow {
  const displays = screen.getAllDisplays();
  const target = monitorId != null
    ? (displays.find(d => d.id === monitorId) ?? displays[0])
    : displays[displays.length > 1 ? 1 : 0]; // prefer secondary display

  displayWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    fullscreen: true,
    frame: false,
    title: 'Party Display',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    displayWindow.loadURL(process.env['VITE_DEV_SERVER_URL'] + 'display/');
  } else {
    displayWindow.loadFile(path.join(__dirname, '../renderer/display/index.html'));
  }

  displayWindow.on('closed', () => { displayWindow = null; });
  return displayWindow;
}

export function getControlPanel(): BrowserWindow | null { return controlPanel; }
export function getDisplayWindow(): BrowserWindow | null { return displayWindow; }

export function getAllDisplays() {
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: `Display ${d.id} (${d.bounds.width}×${d.bounds.height})`,
    bounds: d.bounds,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/windows.ts
git commit -m "feat: add windows module (Control Panel + Display Window)"
```

---

### Task 10: Preload script

**Files:**
- Create: `src/preload/index.ts`

> The preload script is the bridge between the main process and the renderer. It uses `contextBridge` to expose a typed `ipc` API — renderers never call `ipcRenderer` directly.

- [ ] **Step 1: Create `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc';
import type { Settings, PlayerStatus, TrackInfo, FftBands, DisplayInfo } from '../main/ipc';

contextBridge.exposeInMainWorld('ipc', {
  // Control Panel → Main
  startLogin: () => ipcRenderer.invoke(IPC.START_LOGIN),
  openFolderDialog: () => ipcRenderer.invoke(IPC.OPEN_FOLDER_DIALOG) as Promise<string | null>,
  getDisplays: () => ipcRenderer.invoke(IPC.GET_DISPLAYS) as Promise<DisplayInfo[]>,
  setDisplay: (id: number) => ipcRenderer.invoke(IPC.SET_DISPLAY, id),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS) as Promise<Settings>,
  setSetting: (key: keyof Settings, value: unknown) => ipcRenderer.invoke(IPC.SET_SETTINGS, key, value),
  setVolume: (v: number) => ipcRenderer.send(IPC.SET_VOLUME, v),
  getAccessToken: () => ipcRenderer.invoke(IPC.GET_ACCESS_TOKEN) as Promise<string>,

  // Control Panel → Main (relayed to Display Window)
  sendTrackChanged: (track: TrackInfo) => ipcRenderer.send(IPC.TRACK_CHANGED, track),

  // Main → Control Panel listeners
  onPlayerStatus: (cb: (status: PlayerStatus) => void) =>
    ipcRenderer.on(IPC.PLAYER_STATUS, (_, s) => cb(s)),

  // Main → Display listeners
  onNextImage: (cb: (url: string | null) => void) =>
    ipcRenderer.on(IPC.NEXT_IMAGE, (_, url) => cb(url)),
  onTrackChanged: (cb: (track: TrackInfo) => void) =>
    ipcRenderer.on(IPC.TRACK_CHANGED, (_, t) => cb(t)),
  onFftData: (cb: (bands: FftBands) => void) =>
    ipcRenderer.on(IPC.FFT_DATA, (_, b) => cb(b)),

  // Control Panel → Display (volume from Control Panel via player.setVolume, no IPC needed)
});
```

- [ ] **Step 2: Add global type declaration for renderers**

Create `src/renderer.d.ts`:

```typescript
import type { Settings, PlayerStatus, TrackInfo, FftBands, DisplayInfo } from './main/ipc';

interface Window {
  ipc: {
    startLogin: () => Promise<void>;
    openFolderDialog: () => Promise<string | null>;
    getDisplays: () => Promise<DisplayInfo[]>;
    setDisplay: (id: number) => Promise<void>;
    getSettings: () => Promise<Settings>;
    setSetting: (key: keyof Settings, value: unknown) => Promise<void>;
    setVolume: (v: number) => void;
    getAccessToken: () => Promise<string>;
    sendTrackChanged: (track: TrackInfo) => void;
    onPlayerStatus: (cb: (status: PlayerStatus) => void) => void;
    onNextImage: (cb: (url: string | null) => void) => void;
    onTrackChanged: (cb: (track: TrackInfo) => void) => void;
    onFftData: (cb: (bands: FftBands) => void) => void;
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/renderer.d.ts
git commit -m "feat: add preload contextBridge and renderer type declarations"
```

---

### Task 11: Main process entry point

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Create `src/main/index.ts`**

```typescript
import { app, ipcMain, dialog, protocol } from 'electron';
import { createControlPanel, createDisplayWindow, getDisplayWindow, getAllDisplays } from './windows';
import { getSettings, setSetting } from './settings';
import { Slideshow } from './slideshow';
import { configure, startLoginFlow, exchangeCode, getAccessToken, loadPersistedToken, parseCallbackUrl } from './spotify-auth';
import { IPC } from './ipc';
import type { Settings } from './ipc';

// ─── Config ───────────────────────────────────────────────────────────────────
// Set your Spotify client_id here (or load from env)
const CLIENT_ID = process.env['SPOTIFY_CLIENT_ID'] ?? '';

configure(CLIENT_ID);

// ─── Protocol handler for OAuth callback ──────────────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient('party-display', process.execPath, [process.argv[1]!]);
} else {
  app.setAsDefaultProtocolClient('party-display');
}

const slideshow = new Slideshow();

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  await loadPersistedToken().catch(() => {});

  const cp = createControlPanel();
  const settings = getSettings();
  const dw = createDisplayWindow(settings.selectedMonitorId);
  slideshow.setDisplayWindow(dw);

  if (settings.folderPath) {
    slideshow.start(settings.folderPath, settings.slideshowInterval);
  }
});

app.on('open-url', (_, url) => handleCallback(url)); // macOS
app.on('second-instance', (_, argv) => {
  const url = argv.find(a => a.startsWith('party-display://'));
  if (url) handleCallback(url);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ─── Callback handler ─────────────────────────────────────────────────────────
async function handleCallback(url: string): Promise<void> {
  const { code, error } = parseCallbackUrl(url);
  if (error || !code) return;
  try {
    await exchangeCode(code);
    // Notify Control Panel that login succeeded
    const cp = (await import('./windows')).getControlPanel();
    cp?.webContents.send(IPC.PLAYER_STATUS, 'connecting');
  } catch (e) {
    console.error('Token exchange failed', e);
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle(IPC.START_LOGIN, () => startLoginFlow());

ipcMain.handle(IPC.GET_ACCESS_TOKEN, () => getAccessToken());

ipcMain.handle(IPC.OPEN_FOLDER_DIALOG, async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0]!;
  setSetting('folderPath', folder);
  const dw = getDisplayWindow();
  if (dw) slideshow.start(folder, getSettings().slideshowInterval);
  return folder;
});

ipcMain.handle(IPC.GET_DISPLAYS, () => getAllDisplays());

ipcMain.handle(IPC.SET_DISPLAY, (_, id: number) => {
  setSetting('selectedMonitorId', id);
});

ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());

ipcMain.handle(IPC.SET_SETTINGS, (_, key: keyof Settings, value: Settings[typeof key]) => {
  setSetting(key, value);
  if (key === 'slideshowInterval') slideshow.setInterval(value as number);
});

// ─── IPC relay: Control Panel → Display Window ────────────────────────────────
// The renderer cannot send IPC directly to another renderer window.
// These handlers relay Control Panel events to the Display Window.

ipcMain.on(IPC.TRACK_CHANGED, (_, trackInfo: TrackInfo) => {
  getDisplayWindow()?.webContents.send(IPC.TRACK_CHANGED, trackInfo);
});

ipcMain.on(IPC.SET_VOLUME, (_, volume: number) => {
  // Volume is set directly in the renderer via player.setVolume().
  // This handler persists the value so it's available on restart.
  setSetting('volume', volume);
});
```

> These relay handlers are critical for the `now-playing` overlay to update. Without `TRACK_CHANGED` relay, the Display Window never receives track state. Without `SET_VOLUME` on main, the volume setting is not persisted.

Also add the missing import to the top of `src/main/index.ts`:

```typescript
import type { TrackInfo } from './ipc';
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add main process entry point with IPC handlers"
```

---

### Task 12: Spotify player (Control Panel renderer)

**Files:**
- Create: `src/control-panel/spotify-player.ts`

> This runs in the renderer (not the main process). It loads the Web Playback SDK, initializes the player, sets up the AnalyserNode, and forwards FFT data and track state via IPC. The exact AudioContext approach is informed by `spike/notes.md`.

- [ ] **Step 1: Create `src/control-panel/spotify-player.ts`**

```typescript
import { IPC } from '../main/ipc';
import type { FftBands } from '../main/ipc';

declare global { interface Window { Spotify: typeof Spotify; onSpotifyWebPlaybackSDKReady: () => void; } }
declare const Spotify: {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyPlayer;
};
interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  setVolume(v: number): Promise<void>;
  getCurrentState(): Promise<unknown>;
  addListener(event: string, cb: (data: unknown) => void): void;
}

let player: SpotifyPlayer | null = null;

export async function initSpotifyPlayer(): Promise<void> {
  await loadSdk();

  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new window.Spotify.Player({
      name: (window as Window).ipc ? 'Party Display' : 'Party Display',
      getOAuthToken: async (cb) => {
        const token = await window.ipc.getAccessToken();
        cb(token);
      },
      volume: 0.8,
    });

    (player as SpotifyPlayer & { addListener: (e: string, cb: (d: unknown) => void) => void })
      .addListener('ready', (data: unknown) => {
        const { device_id } = data as { device_id: string };
        console.log('Spotify player ready, device_id:', device_id);
        window.ipc.onPlayerStatus as unknown; // status sent from main after token exchange
        connectAnalyserNode();
      });

    (player as SpotifyPlayer & { addListener: (e: string, cb: (d: unknown) => void) => void })
      .addListener('player_state_changed', (state: unknown) => {
        if (!state) return;
        const s = state as { track_window: { current_track: { name: string; artists: { name: string }[] } } };
        const { current_track } = s.track_window;
        (window as Window).ipc && window.ipc.setSetting('displayMode', 'clean'); // no-op, just checking ipc
        // Send track info to main process, which relays it to the Display Window.
        // (Renderer → renderer IPC must go via main.)
        window.ipc.setSetting; // type check only — actual send via ipcRenderer below
        // The preload exposes no direct send for TRACK_CHANGED, so we piggyback
        // through a lightweight workaround: the preload will expose a sendTrackChanged
        // helper. Add to preload/index.ts: sendTrackChanged: (t) => ipcRenderer.send(IPC.TRACK_CHANGED, t)
        (window as unknown as { ipc: { sendTrackChanged: (t: { trackName: string; artist: string }) => void } })
          .ipc.sendTrackChanged({
            trackName: current_track.name,
            artist: current_track.artists[0]?.name ?? '',
          });
      });

    player!.connect();
  };
}

export async function setVolume(v: number): Promise<void> {
  await player?.setVolume(v);
}

function loadSdk(): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('script[src*="spotify-player"]')) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

// ─── AudioContext / FFT ───────────────────────────────────────────────────────

function connectAnalyserNode(): void {
  // Strategy from spike/notes.md: use createMediaElementSource on the SDK's audio element
  const audioEls = Array.from(document.querySelectorAll('audio'));
  if (audioEls.length === 0) {
    console.warn('No audio element found — FFT not available');
    return;
  }
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audioEls[0]!);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    startFftLoop(analyser);
  } catch (e) {
    console.warn('AudioContext setup failed:', e);
  }
}

function startFftLoop(analyser: AnalyserNode): void {
  const data = new Uint8Array(analyser.frequencyBinCount); // 128 bins
  const tick = () => {
    analyser.getByteFrequencyData(data);
    const third = Math.floor(data.length / 3);
    const avg = (start: number, end: number) =>
      data.slice(start, end).reduce((a, b) => a + b, 0) / (end - start) / 255;
    const bands: FftBands = {
      bass: avg(0, third),
      mid: avg(third, third * 2),
      treble: avg(third * 2, data.length),
    };
    // Send to display via main process relay (main listens on FFT_DATA and forwards)
    // For now, store on window for display to pick up via Electron IPC
    window.dispatchEvent(new CustomEvent('fft-update', { detail: bands }));
    requestAnimationFrame(tick);
  };
  tick();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/control-panel/spotify-player.ts
git commit -m "feat: add spotify-player module (SDK init, AnalyserNode, FFT)"
```

---

### Task 13: Control Panel UI

**Files:**
- Create: `src/control-panel/index.html`
- Create: `src/control-panel/main.tsx`
- Create: `src/control-panel/App.tsx`
- Create: `src/control-panel/components/StatusIndicator.tsx`
- Create: `src/control-panel/components/LoginButton.tsx`
- Create: `src/control-panel/components/FolderPicker.tsx`
- Create: `src/control-panel/components/MonitorSelector.tsx`
- Create: `src/control-panel/components/VolumeSlider.tsx`

- [ ] **Step 1: Create `src/control-panel/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Party Display — Control Panel</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui, sans-serif; background: #1a1a1a; color: #eee; padding: 16px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/control-panel/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initSpotifyPlayer } from './spotify-player';

initSpotifyPlayer().catch(console.error);

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 3: Create `src/control-panel/components/StatusIndicator.tsx`**

```tsx
import React from 'react';
import type { PlayerStatus } from '../../main/ipc';

const COLOR: Record<PlayerStatus, string> = {
  disconnected: '#888',
  connecting: '#f5a623',
  connected: '#1db954',
  error: '#e74c3c',
};

export function StatusIndicator({ status }: { status: PlayerStatus }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR[status] }} />
      <span style={{ fontSize: 13, color: '#aaa' }}>{status}</span>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/control-panel/components/LoginButton.tsx`**

```tsx
import React from 'react';

export function LoginButton({ onLogin }: { onLogin: () => void }) {
  return (
    <button
      onClick={onLogin}
      style={{
        background: '#1db954', color: '#000', border: 'none',
        borderRadius: 24, padding: '10px 24px', fontWeight: 700,
        fontSize: 14, cursor: 'pointer', width: '100%',
      }}
    >
      Log in with Spotify
    </button>
  );
}
```

- [ ] **Step 5: Create `src/control-panel/components/FolderPicker.tsx`**

```tsx
import React from 'react';

export function FolderPicker({ folderPath, onPick }: { folderPath: string | null; onPick: () => void }) {
  return (
    <div>
      <button
        onClick={onPick}
        style={{
          background: '#333', color: '#eee', border: '1px solid #555',
          borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
        }}
      >
        {folderPath ? 'Change folder' : 'Select photo folder'}
      </button>
      {folderPath && (
        <div style={{ fontSize: 12, color: '#888', marginTop: 4, wordBreak: 'break-all' }}>
          {folderPath}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `src/control-panel/components/MonitorSelector.tsx`**

```tsx
import React from 'react';
import type { DisplayInfo } from '../../main/ipc';

export function MonitorSelector({
  displays, selectedId, onChange,
}: {
  displays: DisplayInfo[];
  selectedId: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 4 }}>
        Display window monitor
      </label>
      <select
        value={selectedId ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        style={{ background: '#333', color: '#eee', border: '1px solid #555', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%' }}
      >
        {displays.map(d => (
          <option key={d.id} value={d.id}>{d.label}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/control-panel/components/VolumeSlider.tsx`**

```tsx
import React from 'react';
import { setVolume } from '../spotify-player';

export function VolumeSlider({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    onChange(v);
    setVolume(v);
    window.ipc.setSetting('volume', v);
  };

  return (
    <div>
      <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 4 }}>
        Volume: {Math.round(volume * 100)}%
      </label>
      <input type="range" min={0} max={1} step={0.01} value={volume} onChange={handle} style={{ width: '100%' }} />
    </div>
  );
}
```

- [ ] **Step 8: Create `src/control-panel/App.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import type { PlayerStatus, DisplayInfo, Settings } from '../main/ipc';
import { StatusIndicator } from './components/StatusIndicator';
import { LoginButton } from './components/LoginButton';
import { FolderPicker } from './components/FolderPicker';
import { MonitorSelector } from './components/MonitorSelector';
import { VolumeSlider } from './components/VolumeSlider';

export default function App() {
  const [status, setStatus] = useState<PlayerStatus>('disconnected');
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    window.ipc.getSettings().then(setSettings);
    window.ipc.getDisplays().then(setDisplays);
    window.ipc.onPlayerStatus(setStatus);
  }, []);

  const handleLogin = async () => {
    setStatus('connecting');
    await window.ipc.startLogin();
  };

  const handleFolderPick = async () => {
    const folder = await window.ipc.openFolderDialog();
    if (folder && settings) setSettings({ ...settings, folderPath: folder });
  };

  const handleMonitorChange = async (id: number) => {
    await window.ipc.setDisplay(id);
    if (settings) setSettings({ ...settings, selectedMonitorId: id });
  };

  const handleVolumeChange = (v: number) => {
    if (settings) setSettings({ ...settings, volume: v });
  };

  if (!settings) return <div style={{ color: '#888', padding: 24 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ color: '#1db954', fontSize: 18 }}>Party Display</h2>
      <StatusIndicator status={status} />
      {status === 'disconnected' || status === 'error' ? (
        <LoginButton onLogin={handleLogin} />
      ) : null}
      <FolderPicker folderPath={settings.folderPath} onPick={handleFolderPick} />
      <MonitorSelector
        displays={displays}
        selectedId={settings.selectedMonitorId}
        onChange={handleMonitorChange}
      />
      <VolumeSlider volume={settings.volume} onChange={handleVolumeChange} />
    </div>
  );
}
```

- [ ] **Step 9: Commit Control Panel**

```bash
git add src/control-panel/
git commit -m "feat: add Control Panel UI (login, folder picker, monitor selector, volume)"
```

---

### Task 14: Display Window

**Files:**
- Create: `src/display/index.html`
- Create: `src/display/main.tsx`
- Create: `src/display/App.tsx`
- Create: `src/display/components/SlideshowView.tsx`
- Create: `src/display/components/NowPlayingOverlay.tsx`

- [ ] **Step 1: Create `src/display/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Party Display</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #000; overflow: hidden; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root" style="width:100%;height:100%;"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/display/components/SlideshowView.tsx`**

```tsx
import React from 'react';

export function SlideshowView({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%', color: '#555', fontSize: 20,
      }}>
        Select a folder to begin
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <img
        src={imageUrl}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `src/display/components/NowPlayingOverlay.tsx`**

```tsx
import React from 'react';
import type { TrackInfo } from '../../main/ipc';

export function NowPlayingOverlay({ track }: { track: TrackInfo | null }) {
  if (!track) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 32, left: 32,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
      borderRadius: 12, padding: '12px 20px',
      color: '#fff', maxWidth: 360,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {track.trackName}
      </div>
      <div style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>
        {track.artist}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/display/App.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import type { TrackInfo, Settings } from '../main/ipc';
import { SlideshowView } from './components/SlideshowView';
import { NowPlayingOverlay } from './components/NowPlayingOverlay';

export default function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [displayMode, setDisplayMode] = useState<Settings['displayMode']>('clean');

  useEffect(() => {
    window.ipc.getSettings().then(s => setDisplayMode(s.displayMode));
    window.ipc.onNextImage(url => setImageUrl(url));
    window.ipc.onTrackChanged(t => setTrack(t));
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <SlideshowView imageUrl={imageUrl} />
      {displayMode === 'now-playing' && <NowPlayingOverlay track={track} />}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/display/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 6: Commit Display Window**

```bash
git add src/display/
git commit -m "feat: add Display Window (slideshow + now-playing overlay)"
```

---

### Task 15: Smoke test and final wiring verification

> Manual integration test — verify all vertical slice success criteria.

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: all tests pass (settings, slideshow, spotify-auth).

- [ ] **Step 2: Start the app**

```bash
npm start
```

Expected: Control Panel window appears. No console errors on launch.

- [ ] **Step 3: Verify OAuth flow**

Click "Log in with Spotify" → browser opens Spotify auth page → log in → browser redirects to `party-display://callback` → Control Panel status changes to `connecting`.

Expected: device "Party Display" appears in Spotify Connect on the same account.

- [ ] **Step 4: Verify slideshow**

Click "Select photo folder" → choose a folder with images → Display Window shows photos advancing.

Expected: images cycle, Display Window updates.

- [ ] **Step 5: Verify now-playing overlay**

The display mode switcher UI is deferred — switch to `now-playing` mode manually via DevTools in the Display Window:

```js
// In Display Window DevTools console:
window.ipc.setSetting('displayMode', 'now-playing')
// Then reload the Display Window (Ctrl+R) to pick up the new setting
```

Play a track via Spotify Connect → overlay shows track name and artist.

- [ ] **Step 6: Verify volume**

Move volume slider → playback volume changes.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: vertical slice complete — Spotify Connect + slideshow + now-playing overlay"
```

---

## Post-Vertical-Slice (deferred)

The following are explicitly **not** part of this plan but are in scope for V1:

> **FFT IPC pipeline is incomplete (intentional):** `startFftLoop` in `spotify-player.ts` dispatches a local DOM `CustomEvent` — it does NOT send via `FFT_DATA` IPC. To complete the pipeline when implementing spectrum/psychedelic modes, you must: (1) add `sendFftData: (b) => ipcRenderer.send(IPC.FFT_DATA, b)` to the preload, (2) declare it on `window.ipc` in `renderer.d.ts`, (3) add an `ipcMain.on(IPC.FFT_DATA, ...)` relay in `index.ts`, and (4) replace the `dispatchEvent` call in `startFftLoop` with `window.ipc.sendFftData(bands)`.

- `spectrum` and `psychedelic` display modes (FFT pipeline exists; Canvas/WebGL rendering deferred)
- Album art in `now-playing` overlay
- Display mode switcher UI in Control Panel
- Volume persistence on app restart
- Photo transition effects (post-V1)
- BPM-synced slideshow speed (post-V1)
