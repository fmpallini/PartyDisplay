# Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vitest + RTL frontend unit tests, Rust `#[cfg(test)]` backend tests, and a structured manual E2E release checklist to a zero-test Tauri v2 app.

**Architecture:** Frontend tests live in `app/src/__tests__/` with shared Tauri IPC mocks; Rust tests are inline `#[cfg(test)]` blocks in each `.rs` file; the E2E checklist is a markdown file linked from the release guidelines.

**Tech Stack:** Vitest 3, @testing-library/react 16, @testing-library/user-event 14, @testing-library/jest-dom 6, jsdom 26, Rust built-in test harness, tauri::test utilities.

---

## File Map

**Create:**
- `app/src/__tests__/helpers/tauri-mock.ts` — global Tauri IPC mocks + jest-dom setup
- `app/src/__tests__/helpers/render.tsx` — custom RTL render wrapper
- `app/src/__tests__/lib/utils.test.ts`
- `app/src/__tests__/lib/spotify-auth.test.ts`
- `app/src/__tests__/hooks/useBattery.test.ts`
- `app/src/__tests__/hooks/useWeather.test.ts`
- `app/src/__tests__/hooks/useLyrics.test.ts`
- `app/src/__tests__/hooks/useHotkeys.test.ts`
- `app/src/__tests__/hooks/useAuth.test.ts`
- `app/src/__tests__/hooks/useExternalPlayer.test.ts`
- `app/src/__tests__/hooks/useLocalPlayer.test.ts`
- `app/src/__tests__/components/NowPlaying.test.tsx`
- `app/src/__tests__/components/PlayerControls.test.tsx`
- `app/src/__tests__/components/SongToast.test.tsx`
- `app/src/__tests__/components/ClockWeatherWidget.test.tsx`
- `app/src/__tests__/hooks/useSpotifyPlayer.test.ts`
- `docs/testing/release-checklist.md`

**Modify:**
- `app/package.json` — add devDeps + `test` script
- `app/vite.config.ts` — add `test` block, switch to `vitest/config` import
- `app/src-tauri/src/smtc.rs` — extract `detect_mime`, add `#[cfg(test)]`
- `app/src-tauri/src/system.rs` — extract `parse_ip_location`, add `#[cfg(test)]`
- `app/src-tauri/src/presets.rs` — extract `collect_presets_from_dir`, add `#[cfg(test)]`
- `app/src-tauri/src/slideshow.rs` — extend existing `#[cfg(test)]` block
- `docs/docs for release/RELEASE_GUIDELINES.md` — add P0 + update step 4

---

## Task 1: Frontend Test Infrastructure

**Files:**
- Modify: `app/package.json`
- Modify: `app/vite.config.ts`
- Create: `app/src/__tests__/helpers/tauri-mock.ts`
- Create: `app/src/__tests__/helpers/render.tsx`

- [ ] **Step 1: Add devDependencies and test script to `app/package.json`**

Open `app/package.json`. Add to `"scripts"`:
```json
"test": "vitest run"
```
Add to `"devDependencies"`:
```json
"vitest": "^3",
"@testing-library/react": "^16",
"@testing-library/user-event": "^14",
"@testing-library/jest-dom": "^6",
"jsdom": "^26"
```

- [ ] **Step 2: Update `app/vite.config.ts` to add Vitest config**

Replace the entire file content:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome105'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    ...(process.env.TAURI_DEBUG ? {} : { esbuildOptions: { drop: ['console'] } }),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/helpers/tauri-mock.ts'],
  },
})
```

- [ ] **Step 3: Create `app/src/__tests__/helpers/tauri-mock.ts`**

```ts
import { vi } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}))
```

- [ ] **Step 4: Create `app/src/__tests__/helpers/render.tsx`**

```tsx
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options)
}

export * from '@testing-library/react'
```

- [ ] **Step 5: Install dependencies**

```bash
cd app && npm install
```

Expected: packages install without errors. `node_modules/vitest` should exist.

- [ ] **Step 6: Verify setup with a smoke test**

Create a temporary file `app/src/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('setup', () => {
  it('works', () => expect(1 + 1).toBe(2))
})
```

Run:
```bash
cd app && npm test
```
Expected output: `1 passed` with no errors.

Delete `app/src/__tests__/smoke.test.ts` after it passes.

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/vite.config.ts app/src/__tests__/helpers/
git commit -m "test: add Vitest + RTL infrastructure and Tauri IPC mocks"
```

---

## Task 2: Lib Unit Tests

**Files:**
- Create: `app/src/__tests__/lib/utils.test.ts`
- Create: `app/src/__tests__/lib/spotify-auth.test.ts`

- [ ] **Step 1: Write `utils.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { safeNum, safeBool, safeEnum, shuffle } from '../../lib/utils'

describe('safeNum', () => {
  it('parses valid number string', () => expect(safeNum('42', 0)).toBe(42))
  it('returns fallback for null', () => expect(safeNum(null, 5)).toBe(5))
  it('returns fallback for NaN string', () => expect(safeNum('abc', 5)).toBe(5))
  it('parses zero correctly', () => expect(safeNum('0', 5)).toBe(0))
  it('parses negative numbers', () => expect(safeNum('-3', 0)).toBe(-3))
})

describe('safeBool', () => {
  it("parses 'true' as true", () => expect(safeBool('true', false)).toBe(true))
  it("parses 'false' as false", () => expect(safeBool('false', true)).toBe(false))
  it('returns fallback for null', () => expect(safeBool(null, true)).toBe(true))
  it("non-'true' string returns false (not fallback)", () => expect(safeBool('yes', false)).toBe(false))
})

describe('safeEnum', () => {
  const allowed = ['a', 'b', 'c'] as const
  it('returns valid enum value', () => expect(safeEnum('b', allowed, 'a')).toBe('b'))
  it('returns fallback for unrecognised value', () => expect(safeEnum('d', allowed, 'a')).toBe('a'))
  it('returns fallback for null', () => expect(safeEnum(null, allowed, 'c')).toBe('c'))
})

describe('shuffle', () => {
  it('returns array with same elements', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const result = shuffle(arr)
    expect(result).toHaveLength(arr.length)
    expect([...result].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b))
  })
  it('does not mutate the input array', () => {
    const arr = [1, 2, 3]
    shuffle(arr)
    expect(arr).toEqual([1, 2, 3])
  })
  it('handles empty array', () => expect(shuffle([])).toEqual([]))
  it('handles single element array', () => expect(shuffle([42])).toEqual([42]))
})
```

- [ ] **Step 2: Run utils tests to verify they pass**

```bash
cd app && npm test -- utils
```
Expected: `8 passed`.

- [ ] **Step 3: Write `spotify-auth.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { expiresAt, buildAuthUrl, generatePkce, generateState, validateClientId } from '../../lib/spotify-auth'

describe('expiresAt', () => {
  it('returns approximately Date.now() + expires_in seconds in ms', () => {
    const before = Date.now()
    const result = expiresAt(3600)
    const after = Date.now()
    expect(result).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(result).toBeLessThanOrEqual(after + 3600 * 1000)
  })
})

describe('buildAuthUrl', () => {
  it('builds a valid Spotify authorize URL', () => {
    const url = buildAuthUrl('myClientId', 'myChallenge', 'myState')
    expect(url).toContain('https://accounts.spotify.com/authorize')
    expect(url).toContain('client_id=myClientId')
    expect(url).toContain('code_challenge=myChallenge')
    expect(url).toContain('state=myState')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain('response_type=code')
  })

  it('URL-encodes special characters in parameters', () => {
    const url = buildAuthUrl('id with space', 'ch+al=lenge', 'st@te')
    expect(url).not.toContain(' ')
  })
})

describe('generatePkce', () => {
  it('returns non-empty verifier and challenge strings', async () => {
    const { verifier, challenge } = await generatePkce()
    expect(verifier.length).toBeGreaterThan(0)
    expect(challenge.length).toBeGreaterThan(0)
    expect(verifier).not.toBe(challenge)
  })

  it('generates unique verifier on each call', async () => {
    const a = await generatePkce()
    const b = await generatePkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })
})

describe('generateState', () => {
  it('returns a non-empty string', () => {
    expect(generateState().length).toBeGreaterThan(0)
  })
  it('generates unique values on each call', () => {
    expect(generateState()).not.toBe(generateState())
  })
})

describe('validateClientId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects IDs shorter than 32 hex chars', async () => {
    expect(await validateClientId('short')).toBe(false)
  })

  it('rejects IDs with non-hex characters', async () => {
    expect(await validateClientId('z'.repeat(32))).toBe(false)
  })

  it('returns false when Spotify responds with invalid_client', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'invalid_client' }),
    }))
    expect(await validateClientId('a'.repeat(32))).toBe(false)
  })

  it('returns true when Spotify responds with a non-invalid_client error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    }))
    expect(await validateClientId('a'.repeat(32))).toBe(true)
  })
})
```

- [ ] **Step 4: Run spotify-auth tests**

```bash
cd app && npm test -- spotify-auth
```
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src/__tests__/lib/
git commit -m "test: add lib unit tests for utils and spotify-auth"
```

---

## Task 3: Hook Tests — useBattery & useWeather

**Files:**
- Create: `app/src/__tests__/hooks/useBattery.test.ts`
- Create: `app/src/__tests__/hooks/useWeather.test.ts`

- [ ] **Step 1: Write `useBattery.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useBattery } from '../../hooks/useBattery'

describe('useBattery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts with available: false before first poll resolves', () => {
    vi.mocked(invoke).mockResolvedValue({ level: 80, charging: true, available: true })
    const { result } = renderHook(() => useBattery(100))
    expect(result.current.available).toBe(false)
  })

  it('updates state after first poll resolves', async () => {
    vi.mocked(invoke).mockResolvedValue({ level: 80, charging: true, available: true })
    const { result } = renderHook(() => useBattery(100))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(result.current.level).toBe(80)
    expect(result.current.charging).toBe(true)
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_battery_status')
  })

  it('clears poll interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    vi.mocked(invoke).mockResolvedValue({ level: 100, charging: false, available: false })
    const { unmount } = renderHook(() => useBattery(100))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })

  it('does not trigger re-render when values are identical', async () => {
    const STATUS = { level: 75, charging: false, available: true }
    vi.mocked(invoke).mockResolvedValue(STATUS)
    const { result } = renderHook(() => useBattery(100))
    await waitFor(() => expect(result.current.level).toBe(75))
    const ref = result.current
    // Second poll returns same values — should return same object reference (no re-render)
    await act(async () => {})
    expect(result.current).toBe(ref)
  })
})
```

- [ ] **Step 2: Run useBattery tests**

```bash
cd app && npm test -- useBattery
```
Expected: `4 passed`.

- [ ] **Step 3: Write `useWeather.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useWeather } from '../../hooks/useWeather'

const GEO_RESPONSE = {
  results: [{ latitude: 48.85, longitude: 2.35, name: 'Paris', country: 'France' }],
}
const WEATHER_RESPONSE = {
  current: { temperature_2m: 18.5, weather_code: 1 },
}

function stubFetch(...responses: Array<{ ok: boolean; status?: number; body?: object }>) {
  let i = 0
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    const r = responses[i++ % responses.length]
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? 200,
      json: () => Promise.resolve(r.body ?? {}),
    })
  }))
}

describe('useWeather', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('fetches weather for a named city via geocoding', async () => {
    stubFetch(
      { ok: true, body: GEO_RESPONSE },
      { ok: true, body: WEATHER_RESPONSE },
    )
    const { result } = renderHook(() => useWeather('celsius', 'Paris'))
    await waitFor(() => expect(result.current[0]).not.toBeNull())
    expect(result.current[0]?.locationName).toBe('Paris, France')
    expect(result.current[0]?.temperature).toBe(18.5)
    expect(result.current[0]?.weatherCode).toBe(1)
    expect(result.current[1]).toBeNull()
  })

  it('falls back to IP geolocation when city is empty', async () => {
    vi.mocked(invoke).mockResolvedValue({ lat: 40.71, lon: -74.0, city: 'New York', country: 'US' })
    stubFetch({ ok: true, body: WEATHER_RESPONSE })
    const { result } = renderHook(() => useWeather('celsius', ''))
    await waitFor(() => expect(result.current[0]).not.toBeNull())
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_ip_location')
    expect(result.current[0]?.locationName).toBe('New York, US')
  })

  it('returns error state when weather fetch fails', async () => {
    stubFetch(
      { ok: true, body: GEO_RESPONSE },
      { ok: false, status: 503 },
    )
    const { result } = renderHook(() => useWeather('celsius', 'Paris'))
    await waitFor(() => expect(result.current[1]).not.toBeNull())
    expect(result.current[0]).toBeNull()
    expect(result.current[1]).toContain('503')
  })

  it('clears data immediately when city changes', async () => {
    stubFetch(
      { ok: true, body: GEO_RESPONSE },
      { ok: true, body: WEATHER_RESPONSE },
    )
    const { result, rerender } = renderHook(
      ({ city }) => useWeather('celsius', city),
      { initialProps: { city: 'Paris' } },
    )
    await waitFor(() => expect(result.current[0]).not.toBeNull())
    stubFetch({ ok: true, body: GEO_RESPONSE }, { ok: true, body: WEATHER_RESPONSE })
    rerender({ city: 'London' })
    expect(result.current[0]).toBeNull()
  })
})
```

- [ ] **Step 4: Run useWeather tests**

```bash
cd app && npm test -- useWeather
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src/__tests__/hooks/useBattery.test.ts app/src/__tests__/hooks/useWeather.test.ts
git commit -m "test: add useBattery and useWeather hook tests"
```

---

## Task 4: Hook Tests — useLyrics & useHotkeys

**Files:**
- Create: `app/src/__tests__/hooks/useLyrics.test.ts`
- Create: `app/src/__tests__/hooks/useHotkeys.test.ts`

- [ ] **Step 1: Write `useLyrics.test.ts`**

Note: `useLyrics` has a module-level cache keyed by `track.id`. Each test uses a unique ID to avoid cross-test cache hits.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLyrics } from '../../hooks/useLyrics'
import type { TrackInfo } from '../../lib/player-types'

function makeTrack(id: string): TrackInfo {
  return { id, name: 'Test Song', artists: 'Test Artist', albumArt: '', duration: 180_000 }
}

describe('useLyrics', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('returns idle status when track is null', () => {
    const { result } = renderHook(() => useLyrics(null, 0))
    expect(result.current.status).toBe('idle')
    expect(result.current.lines).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
  })

  it('fetches and parses synced LRC lyrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        syncedLyrics: '[00:01.00] Hello world\n[00:05.50] Second line',
        plainLyrics: null,
      }),
    }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-1'), 0))
    await waitFor(() => expect(result.current.status).toBe('synced'))
    expect(result.current.lines).toHaveLength(2)
    expect(result.current.lines[0]).toEqual({ timeMs: 1000, text: 'Hello world' })
    expect(result.current.lines[1]).toEqual({ timeMs: 5500, text: 'Second line' })
  })

  it('returns not_found when server returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-2'), 0))
    await waitFor(() => expect(result.current.status).toBe('not_found'))
    expect(result.current.lines).toHaveLength(0)
  })

  it('returns error status on server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-3'), 0))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('returns unsynced status when only plainLyrics available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        syncedLyrics: null,
        plainLyrics: 'Line one\nLine two',
      }),
    }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-4'), 0))
    await waitFor(() => expect(result.current.status).toBe('unsynced'))
    expect(result.current.lines).toHaveLength(2)
  })

  it('derives currentIndex correctly from positionMs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        syncedLyrics: '[00:01.00] Line 1\n[00:05.00] Line 2\n[00:10.00] Line 3',
      }),
    }))
    const { result, rerender } = renderHook(
      ({ pos }) => useLyrics(makeTrack('lrc-5'), pos),
      { initialProps: { pos: 0 } },
    )
    await waitFor(() => expect(result.current.status).toBe('synced'))
    expect(result.current.currentIndex).toBe(-1) // before first line at 1000ms
    rerender({ pos: 1500 })
    expect(result.current.currentIndex).toBe(0)  // after 1000ms line
    rerender({ pos: 11_000 })
    expect(result.current.currentIndex).toBe(2)  // after 10000ms line
  })
})
```

- [ ] **Step 2: Run useLyrics tests**

```bash
cd app && npm test -- useLyrics
```
Expected: `6 passed`.

- [ ] **Step 3: Write `useHotkeys.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHotkeys } from '../../hooks/useHotkeys'

function fireKeyOnDocument(code: string, key: string = code) {
  document.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }))
}

function fireKeyOnElement(el: HTMLElement, code: string, key: string = code) {
  el.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }))
}

describe('useHotkeys', () => {
  let handlers: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    handlers = {
      onNext:              vi.fn(),
      onPrev:              vi.fn(),
      onTogglePause:       vi.fn(),
      onMusicToggle:       vi.fn(),
      onMusicNext:         vi.fn(),
      onMusicPrev:         vi.fn(),
      onNextPreset:        vi.fn(),
      onPrevPreset:        vi.fn(),
      onToggleFullscreen:  vi.fn(),
      onToggleLyrics:      vi.fn(),
    }
  })

  it('fires onMusicToggle on Numpad5', () => {
    renderHook(() => useHotkeys(handlers as any))
    fireKeyOnDocument('Numpad5', '5')
    expect(handlers.onMusicToggle).toHaveBeenCalledTimes(1)
  })

  it('fires onMusicNext on Numpad6', () => {
    renderHook(() => useHotkeys(handlers as any))
    fireKeyOnDocument('Numpad6', '6')
    expect(handlers.onMusicNext).toHaveBeenCalledTimes(1)
  })

  it('fires onMusicPrev on Numpad4', () => {
    renderHook(() => useHotkeys(handlers as any))
    fireKeyOnDocument('Numpad4', '4')
    expect(handlers.onMusicPrev).toHaveBeenCalledTimes(1)
  })

  it('fires onNextPreset on PageUp', () => {
    renderHook(() => useHotkeys(handlers as any))
    fireKeyOnDocument('PageUp', 'PageUp')
    expect(handlers.onNextPreset).toHaveBeenCalledTimes(1)
  })

  it('fires onPrevPreset on PageDown', () => {
    renderHook(() => useHotkeys(handlers as any))
    fireKeyOnDocument('PageDown', 'PageDown')
    expect(handlers.onPrevPreset).toHaveBeenCalledTimes(1)
  })

  it('fires onToggleFullscreen on f key', () => {
    renderHook(() => useHotkeys(handlers as any))
    fireKeyOnDocument('KeyF', 'f')
    expect(handlers.onToggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('fires onToggleLyrics on l key', () => {
    renderHook(() => useHotkeys(handlers as any))
    fireKeyOnDocument('KeyL', 'l')
    expect(handlers.onToggleLyrics).toHaveBeenCalledTimes(1)
  })

  it('does not fire when keydown originates from an input element', () => {
    renderHook(() => useHotkeys(handlers as any))
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireKeyOnElement(input, 'Numpad5', '5')
    expect(handlers.onMusicToggle).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('removes keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useHotkeys(handlers as any))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
```

- [ ] **Step 4: Run useHotkeys tests**

```bash
cd app && npm test -- useHotkeys
```
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src/__tests__/hooks/useLyrics.test.ts app/src/__tests__/hooks/useHotkeys.test.ts
git commit -m "test: add useLyrics and useHotkeys hook tests"
```

---

## Task 5: Hook Tests — useAuth & useExternalPlayer

**Files:**
- Create: `app/src/__tests__/hooks/useAuth.test.ts`
- Create: `app/src/__tests__/hooks/useExternalPlayer.test.ts`

- [ ] **Step 1: Write `useAuth.test.ts`**

`useAuth` returns `{ state, login, logout, setClientId }` (or similar — if the shape differs, adjust property access to match).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useAuth } from '../../hooks/useAuth'

const VALID_TOKENS = {
  access_token:  'acc-token',
  refresh_token: 'ref-token',
  expires_at:    Date.now() + 3_600_000,
}

const EXPIRED_TOKENS = {
  access_token:  'old-acc',
  refresh_token: 'old-ref',
  expires_at:    Date.now() - 1000,
}

describe('useAuth — bootstrap on mount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets authenticated when stored token is still valid', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')  // load_client_id
      .mockResolvedValueOnce(VALID_TOKENS)       // load_tokens
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    expect(result.current.state.authenticated).toBe(true)
    expect(result.current.state.accessToken).toBe('acc-token')
  })

  it('remains unauthenticated when no clientId is stored', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(null)  // load_client_id
      .mockResolvedValueOnce(null)  // load_tokens
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    expect(result.current.state.authenticated).toBe(false)
    expect(result.current.state.accessToken).toBeNull()
  })

  it('remains unauthenticated when no tokens are stored', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')  // load_client_id
      .mockResolvedValueOnce(null)               // load_tokens
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    expect(result.current.state.authenticated).toBe(false)
  })

  it('refreshes token when stored token is expired', async () => {
    const REFRESHED = { access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600 }
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')  // load_client_id
      .mockResolvedValueOnce(EXPIRED_TOKENS)   // load_tokens (expired)
      .mockResolvedValueOnce(undefined)         // store_tokens
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(REFRESHED),
    }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    expect(result.current.state.authenticated).toBe(true)
    expect(result.current.state.accessToken).toBe('new-acc')
  })
})
```

- [ ] **Step 2: Run useAuth tests**

```bash
cd app && npm test -- useAuth
```
Expected: `4 passed`. If hook returns a different shape, adjust `.state.loading`, `.state.authenticated` etc. to match its actual export.

- [ ] **Step 3: Write `useExternalPlayer.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useExternalPlayer } from '../../hooks/useExternalPlayer'
import type { TrackInfo } from '../../lib/player-types'

const TRACK: TrackInfo = {
  id: 'ext-1', name: 'External Song', artists: 'Some Artist',
  albumArt: '', duration: 200_000, isPlaying: true, positionMs: 5000,
}

describe('useExternalPlayer', () => {
  let trackChangedCb: ((e: { payload: TrackInfo | null }) => void) | undefined
  let positionUpdateCb: ((e: { payload: { positionMs: number; isPlaying?: boolean } }) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    trackChangedCb = undefined
    positionUpdateCb = undefined

    vi.mocked(listen).mockImplementation((event: string, cb: any) => {
      if (event === 'smtc-track-changed') trackChangedCb = cb
      if (event === 'smtc-position-update') positionUpdateCb = cb
      return Promise.resolve(() => {})
    })
  })

  it('calls start_smtc_listener when active=true', async () => {
    renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('start_smtc_listener')
  })

  it('does not call start_smtc_listener when active=false', async () => {
    renderHook(() => useExternalPlayer(false))
    await act(async () => {})
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('start_smtc_listener')
  })

  it('sets track and paused=false when smtc-track-changed fires with a track', async () => {
    const { result } = renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    act(() => trackChangedCb?.({ payload: TRACK }))
    expect(result.current.track?.name).toBe('External Song')
    expect(result.current.paused).toBe(false)
  })

  it('clears track and pauses when smtc-track-changed fires with null', async () => {
    const { result } = renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    act(() => trackChangedCb?.({ payload: TRACK }))
    act(() => trackChangedCb?.({ payload: null }))
    expect(result.current.track).toBeNull()
    expect(result.current.paused).toBe(true)
  })

  it('calls stop_smtc_listener on unmount', async () => {
    const { unmount } = renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    unmount()
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('stop_smtc_listener')
  })
})
```

- [ ] **Step 4: Run useExternalPlayer tests**

```bash
cd app && npm test -- useExternalPlayer
```
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src/__tests__/hooks/useAuth.test.ts app/src/__tests__/hooks/useExternalPlayer.test.ts
git commit -m "test: add useAuth and useExternalPlayer hook tests"
```

---

## Task 6: Hook Tests — useLocalPlayer

**Files:**
- Create: `app/src/__tests__/hooks/useLocalPlayer.test.ts`

- [ ] **Step 1: Write `useLocalPlayer.test.ts`**

`useLocalPlayer` creates an `HTMLAudioElement` internally via `new Audio()`. Mock it globally so jsdom doesn't attempt real audio operations.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalPlayer } from '../../hooks/useLocalPlayer'
import type { PlaylistItem } from '../../hooks/useLocalPlayer'

class MockAudio {
  src = ''
  volume = 1
  paused = true
  currentTime = 0
  duration = NaN
  play  = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  load  = vi.fn()
  private _listeners: Record<string, EventListener[]> = {}
  addEventListener    = vi.fn((evt: string, cb: EventListener) => {
    this._listeners[evt] = [...(this._listeners[evt] ?? []), cb]
  })
  removeEventListener = vi.fn()
  dispatchEvent       = vi.fn()
  // Helper for tests to trigger audio events
  trigger(event: string) {
    this._listeners[event]?.forEach(cb => cb(new Event(event)))
  }
}

let mockAudioInstance: MockAudio

beforeEach(() => {
  mockAudioInstance = new MockAudio()
  vi.stubGlobal('Audio', vi.fn(() => mockAudioInstance))
})

const ITEMS: PlaylistItem[] = [
  { path: '/music/track1.mp3', title: 'Track 1', artist: 'Artist A', metadataPrefetched: true, durationMs: 60_000 },
  { path: '/music/track2.mp3', title: 'Track 2', artist: 'Artist B', metadataPrefetched: true, durationMs: 90_000 },
]

describe('useLocalPlayer', () => {
  it('starts in paused/not-ready state', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true))
    expect(result.current.paused).toBe(true)
    expect(result.current.ready).toBe(false)
    expect(result.current.track).toBeNull()
  })

  it('idles when active=false regardless of playlist', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, false))
    expect(result.current.paused).toBe(true)
    expect(result.current.track).toBeNull()
  })

  it('toggleShuffle flips the shuffle state', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true))
    const before = result.current.shuffle
    act(() => result.current.toggleShuffle())
    expect(result.current.shuffle).toBe(!before)
  })

  it('persists shuffle state to localStorage when persistKey is provided', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true, 'test_key'))
    act(() => result.current.toggleShuffle())
    const stored = localStorage.getItem('test_key_shuffle')
    expect(stored).toBe(String(result.current.shuffle))
    localStorage.removeItem('test_key_shuffle')
  })

  it('setVolume updates volume state', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true))
    act(() => result.current.setVolume(0.4))
    expect(result.current.volume).toBe(0.4)
  })
})
```

- [ ] **Step 2: Run useLocalPlayer tests**

```bash
cd app && npm test -- useLocalPlayer
```
Expected: `5 passed`.

- [ ] **Step 3: Commit**

```bash
git add app/src/__tests__/hooks/useLocalPlayer.test.ts
git commit -m "test: add useLocalPlayer hook tests"
```

---

## Task 7: Component Tests — NowPlaying & PlayerControls

**Files:**
- Create: `app/src/__tests__/components/NowPlaying.test.tsx`
- Create: `app/src/__tests__/components/PlayerControls.test.tsx`

- [ ] **Step 1: Write `NowPlaying.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NowPlaying from '../../components/NowPlaying'
import type { TrackInfo } from '../../lib/player-types'

const TRACK: TrackInfo = {
  id: '1', name: 'Test Song', artists: 'Test Artist', albumArt: '', duration: 180_000,
}

describe('NowPlaying', () => {
  it('renders track name and artist', () => {
    render(<NowPlaying track={TRACK} paused={false} />)
    expect(screen.getByText('Test Song')).toBeInTheDocument()
    expect(screen.getByText('Test Artist')).toBeInTheDocument()
  })

  it('renders "No track" fallback when track is null', () => {
    render(<NowPlaying track={null} paused={false} />)
    expect(screen.getByText('No track')).toBeInTheDocument()
  })

  it('renders album art image when albumArt is non-empty', () => {
    const track = { ...TRACK, albumArt: 'https://example.com/art.jpg' }
    render(<NowPlaying track={track} paused={false} />)
    const img = screen.getByRole('img', { name: 'album art' })
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg')
  })

  it('does not render an img element when albumArt is empty string', () => {
    render(<NowPlaying track={TRACK} paused={false} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run NowPlaying tests**

```bash
cd app && npm test -- NowPlaying
```
Expected: `4 passed`.

- [ ] **Step 3: Write `PlayerControls.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerControls } from '../../components/PlayerControls'
import type { TrackInfo } from '../../lib/player-types'

const TRACK: TrackInfo = {
  id: '1', name: 'Song', artists: 'Artist', albumArt: '', duration: 60_000,
}

function makeProps(overrides: Partial<Parameters<typeof PlayerControls>[0]> = {}) {
  return {
    track: TRACK, paused: true, positionMs: 0, shuffle: false,
    togglePlay:    vi.fn(),
    nextTrack:     vi.fn(),
    prevTrack:     vi.fn(),
    seek:          vi.fn(),
    toggleShuffle: vi.fn(),
    ...overrides,
  }
}

describe('PlayerControls', () => {
  it('renders play button when paused', () => {
    render(<PlayerControls {...makeProps()} />)
    expect(screen.getByTitle('Play')).toBeInTheDocument()
  })

  it('renders pause button when playing', () => {
    render(<PlayerControls {...makeProps({ paused: false })} />)
    expect(screen.getByTitle('Pause')).toBeInTheDocument()
  })

  it('calls togglePlay when play/pause button is clicked', async () => {
    const togglePlay = vi.fn()
    render(<PlayerControls {...makeProps({ togglePlay })} />)
    await userEvent.click(screen.getByTitle('Play'))
    expect(togglePlay).toHaveBeenCalledTimes(1)
  })

  it('calls nextTrack when next button is clicked', async () => {
    const nextTrack = vi.fn()
    render(<PlayerControls {...makeProps({ nextTrack })} />)
    await userEvent.click(screen.getByTitle('Next'))
    expect(nextTrack).toHaveBeenCalledTimes(1)
  })

  it('calls prevTrack when previous button is clicked', async () => {
    const prevTrack = vi.fn()
    render(<PlayerControls {...makeProps({ prevTrack })} />)
    await userEvent.click(screen.getByTitle('Previous'))
    expect(prevTrack).toHaveBeenCalledTimes(1)
  })

  it('calls toggleShuffle when shuffle button is clicked', async () => {
    const toggleShuffle = vi.fn()
    render(<PlayerControls {...makeProps({ toggleShuffle })} />)
    await userEvent.click(screen.getByTitle('Shuffle off'))
    expect(toggleShuffle).toHaveBeenCalledTimes(1)
  })

  it('hides shuffle button when hideShuffle=true', () => {
    render(<PlayerControls {...makeProps({ hideShuffle: true })} />)
    expect(screen.queryByTitle(/shuffle/i)).not.toBeInTheDocument()
  })

  it('renders seek bar when track is provided', () => {
    render(<PlayerControls {...makeProps()} />)
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('does not render seek bar when track is null', () => {
    render(<PlayerControls {...makeProps({ track: null })} />)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run PlayerControls tests**

```bash
cd app && npm test -- PlayerControls
```
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src/__tests__/components/NowPlaying.test.tsx app/src/__tests__/components/PlayerControls.test.tsx
git commit -m "test: add NowPlaying and PlayerControls component tests"
```

---

## Task 8: Component Tests — SongToast

**Files:**
- Create: `app/src/__tests__/components/SongToast.test.tsx`

- [ ] **Step 1: Write `SongToast.test.tsx`**

`SongToast` listens to the Tauri `track-changed` event via `listen`. Capture the callback from the mock to simulate events. Visibility is controlled by `opacity` in inline style (not DOM removal).

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { listen } from '@tauri-apps/api/event'
import { SongToast } from '../../components/SongToast'

type ListenCallback = (e: { payload: { name: string; artists: string; albumArt: string } }) => void

describe('SongToast', () => {
  let trackChangedCb: ListenCallback | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    trackChangedCb = undefined
    vi.mocked(listen).mockImplementation((_event: string, cb: any) => {
      trackChangedCb = cb
      return Promise.resolve(() => {})
    })
  })

  it('renders nothing before any track-changed event', () => {
    const { container } = render(<SongToast displayMs={3000} zoom={1} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows track name and artist after track-changed fires', async () => {
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'My Song', artists: 'My Artist', albumArt: '' } })
    })
    expect(screen.getByText('My Song')).toBeInTheDocument()
    expect(screen.getByText('My Artist')).toBeInTheDocument()
  })

  it('toast is visible (opacity 1) immediately after track-changed', async () => {
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'My Song', artists: 'My Artist', albumArt: '' } })
    })
    const toast = screen.getByText('My Song').closest('div[style]') as HTMLElement
    expect(toast.style.opacity).toBe('1')
  })

  it('toast becomes invisible (opacity 0) after displayMs', async () => {
    vi.useFakeTimers()
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'My Song', artists: 'My Artist', albumArt: '' } })
    })
    act(() => vi.advanceTimersByTime(3001))
    const toast = screen.getByText('My Song').closest('div[style]') as HTMLElement
    expect(toast.style.opacity).toBe('0')
    vi.useRealTimers()
  })

  it('resets timer when a second track-changed fires before timeout', async () => {
    vi.useFakeTimers()
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'First', artists: 'A', albumArt: '' } })
    })
    act(() => vi.advanceTimersByTime(1500))
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'Second', artists: 'B', albumArt: '' } })
    })
    act(() => vi.advanceTimersByTime(1600))
    // 1500+1600=3100ms total but reset at 1500ms — so only 1600ms since second event
    const toast = screen.getByText('Second').closest('div[style]') as HTMLElement
    expect(toast.style.opacity).toBe('1') // still visible, 1600ms < 3000ms
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run SongToast tests**

```bash
cd app && npm test -- SongToast
```
Expected: `5 passed`.

- [ ] **Step 3: Commit**

```bash
git add app/src/__tests__/components/SongToast.test.tsx
git commit -m "test: add SongToast component tests"
```

---

## Task 9: Rust — smtc.rs Tests

**Files:**
- Modify: `app/src-tauri/src/smtc.rs`

The functions `normalize_browser_track`, `strip_title_noise` are private. Access them from `#[cfg(test)] mod tests { use super::*; }` in the same file.

Also extract a `detect_mime` helper from the inline bytes check in `get_thumbnail` so it can be unit tested.

- [ ] **Step 1: Extract `detect_mime` from `get_thumbnail` in `smtc.rs`**

Find the inline MIME check inside `get_thumbnail` (the block that checks `bytes.starts_with(b"\xff\xd8\xff")`). Extract it into a named function placed just before `get_thumbnail`:

```rust
fn detect_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG") {
        Some("image/png")
    } else {
        None
    }
}
```

Update `get_thumbnail` to call `detect_mime`:
```rust
// Replace the inline mime check with:
let mime = detect_mime(&bytes)?;
Some(format!(
    "data:{};base64,{}",
    mime,
    general_purpose::STANDARD.encode(&bytes)
))
```

- [ ] **Step 2: Verify the crate still compiles**

```bash
cd app/src-tauri && cargo build 2>&1 | tail -5
```
Expected: `Finished` with no errors.

- [ ] **Step 3: Add `#[cfg(test)]` block at bottom of `smtc.rs`**

Append to `app/src-tauri/src/smtc.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // ── normalize_browser_track ────────────────────────────────────────────

    #[test]
    fn normalize_youtube_music_topic_suffix_stripped() {
        let (title, artist) = normalize_browser_track("Some Song", "Artist - Topic");
        assert_eq!(title, "Some Song");
        assert_eq!(artist, "Artist");
    }

    #[test]
    fn normalize_splits_title_when_topic_channel() {
        let (title, artist) = normalize_browser_track("Real Artist - Song Name", "Real Artist - Topic");
        assert_eq!(title, "Song Name");
        assert_eq!(artist, "Real Artist");
    }

    #[test]
    fn normalize_vevo_suffix_stripped() {
        let (title, artist) = normalize_browser_track("Artist - Song", "ArtistVEVO");
        assert_eq!(title, "Song");
        assert_eq!(artist, "Artist");
    }

    #[test]
    fn normalize_clean_title_and_artist_unchanged() {
        let (title, artist) = normalize_browser_track("Clean Title", "Regular Artist");
        assert_eq!(title, "Clean Title");
        assert_eq!(artist, "Regular Artist");
    }

    #[test]
    fn normalize_empty_artist_returns_title_as_is() {
        let (title, artist) = normalize_browser_track("Just A Title", "");
        assert_eq!(title, "Just A Title");
        assert_eq!(artist, "");
    }

    #[test]
    fn normalize_no_dash_in_title_returns_full_title() {
        let (title, artist) = normalize_browser_track("NoDashTitle", "Artist - Topic");
        assert_eq!(title, "NoDashTitle");
        assert_eq!(artist, "Artist");
    }

    // ── strip_title_noise ─────────────────────────────────────────────────

    #[test]
    fn strip_noise_official_video() {
        assert_eq!(strip_title_noise("My Song (Official Video)"), "My Song");
    }

    #[test]
    fn strip_noise_lyrics_parenthetical() {
        assert_eq!(strip_title_noise("My Song (Lyrics)"), "My Song");
    }

    #[test]
    fn strip_noise_remastered_with_year() {
        assert_eq!(strip_title_noise("Classic Track (Remastered 2011)"), "Classic Track");
    }

    #[test]
    fn strip_noise_official_audio() {
        assert_eq!(strip_title_noise("Song Title (Official Audio)"), "Song Title");
    }

    #[test]
    fn strip_noise_clean_title_unchanged() {
        assert_eq!(strip_title_noise("Normal Title"), "Normal Title");
    }

    #[test]
    fn strip_noise_bracket_noise_removed() {
        assert_eq!(strip_title_noise("Song [Official Video]"), "Song");
    }

    // ── detect_mime ───────────────────────────────────────────────────────

    #[test]
    fn detect_mime_jpeg_magic_bytes() {
        let jpeg = b"\xff\xd8\xff\xe0some jpeg data";
        assert_eq!(detect_mime(jpeg), Some("image/jpeg"));
    }

    #[test]
    fn detect_mime_png_magic_bytes() {
        let png = b"\x89PNG\r\nsome png data";
        assert_eq!(detect_mime(png), Some("image/png"));
    }

    #[test]
    fn detect_mime_unknown_bytes_returns_none() {
        let unknown = b"\x00\x01\x02\x03";
        assert_eq!(detect_mime(unknown), None);
    }

    #[test]
    fn detect_mime_empty_slice_returns_none() {
        assert_eq!(detect_mime(&[]), None);
    }
}
```

- [ ] **Step 4: Run Rust tests to verify all pass**

```bash
cd app/src-tauri && cargo test smtc 2>&1 | tail -20
```
Expected: all `smtc::tests::*` tests show `ok`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/smtc.rs
git commit -m "test(smtc): extract detect_mime, add normalize and strip_noise tests"
```

---

## Task 10: Rust — system.rs Refactor + Tests

**Files:**
- Modify: `app/src-tauri/src/system.rs`

- [ ] **Step 1: Extract `parse_ip_location` from `get_ip_location` in `system.rs`**

Find the `get_ip_location` async command. Extract all JSON parsing into a pure synchronous function. Place it directly above `get_ip_location`:

```rust
pub fn parse_ip_location(json: &serde_json::Value) -> Result<IpLocation, String> {
    if json["status"].as_str() != Some("success") {
        return Err(format!(
            "ip geolocation: {}",
            json["message"].as_str().unwrap_or("unknown"),
        ));
    }
    let lat     = json["lat"]    .as_f64() .ok_or_else(|| "missing lat".to_string())?;
    let lon     = json["lon"]    .as_f64() .ok_or_else(|| "missing lon".to_string())?;
    let city    = json["city"]   .as_str() .ok_or_else(|| "missing city".to_string())?   .to_string();
    let country = json["country"].as_str() .ok_or_else(|| "missing country".to_string())?.to_string();
    Ok(IpLocation { lat, lon, city, country })
}
```

Update `get_ip_location` to call it:
```rust
#[tauri::command]
pub async fn get_ip_location() -> Result<IpLocation, String> {
    let resp = reqwest::get("http://ip-api.com/json/")
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    parse_ip_location(&json)
}
```

- [ ] **Step 2: Verify the crate still compiles**

```bash
cd app/src-tauri && cargo build 2>&1 | tail -5
```
Expected: `Finished` with no errors.

- [ ] **Step 3: Add `#[cfg(test)]` block at bottom of `system.rs`**

Append to `app/src-tauri/src/system.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_valid_response() {
        let j = json!({
            "status": "success",
            "lat": 48.85,
            "lon": 2.35,
            "city": "Paris",
            "country": "France",
        });
        let loc = parse_ip_location(&j).unwrap();
        assert_eq!(loc.city, "Paris");
        assert_eq!(loc.country, "France");
        assert!((loc.lat - 48.85).abs() < 0.001);
        assert!((loc.lon - 2.35).abs() < 0.001);
    }

    #[test]
    fn parse_fails_when_status_is_not_success() {
        let j = json!({ "status": "fail", "message": "private range" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("private range"), "expected 'private range' in: {err}");
    }

    #[test]
    fn parse_fails_when_status_absent() {
        let j = json!({ "lat": 0.0, "lon": 0.0, "city": "X", "country": "Y" });
        assert!(parse_ip_location(&j).is_err());
    }

    #[test]
    fn parse_fails_when_lat_missing() {
        let j = json!({ "status": "success", "lon": 2.35, "city": "Paris", "country": "France" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("lat"), "expected 'lat' in: {err}");
    }

    #[test]
    fn parse_fails_when_city_missing() {
        let j = json!({ "status": "success", "lat": 0.0, "lon": 0.0, "country": "France" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("city"), "expected 'city' in: {err}");
    }

    #[test]
    fn parse_unknown_failure_uses_fallback_message() {
        let j = json!({ "status": "fail" });
        let err = parse_ip_location(&j).unwrap_err();
        assert!(err.contains("unknown"), "expected 'unknown' in: {err}");
    }
}
```

- [ ] **Step 4: Run Rust tests**

```bash
cd app/src-tauri && cargo test system 2>&1 | tail -20
```
Expected: all `system::tests::*` tests show `ok`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/system.rs
git commit -m "test(system): extract parse_ip_location, add JSON parsing tests"
```

---

## Task 11: Rust — presets.rs + slideshow.rs Tests

**Files:**
- Modify: `app/src-tauri/src/presets.rs`
- Modify: `app/src-tauri/src/slideshow.rs`

- [ ] **Step 1: Extract `collect_presets_from_dir` in `presets.rs`**

Find the inner logic of `get_presets()`. Extract it into a named function placed above `get_presets`:

```rust
pub fn collect_presets_from_dir(dir: &std::path::Path) -> Vec<PresetFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut presets: Vec<PresetFile> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let path = e.path();
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let content = std::fs::read_to_string(&path).ok()?;
            Some(PresetFile { name, content })
        })
        .collect();
    presets.sort_by(|a, b| a.name.cmp(&b.name));
    presets
}
```

Update `get_presets` to delegate:
```rust
#[tauri::command]
pub fn get_presets() -> Vec<PresetFile> {
    let dir = presets_dir();
    if !dir.exists() {
        eprintln!("presets dir not found: {}", dir.display());
        return vec![];
    }
    collect_presets_from_dir(&dir)
}
```

- [ ] **Step 2: Add `#[cfg(test)]` block at bottom of `presets.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collect_only_json_files() {
        let dir = std::env::temp_dir().join("party_display_presets_test");
        fs::create_dir_all(&dir).unwrap();

        fs::write(dir.join("alpha.json"), r#"{"name":"alpha"}"#).unwrap();
        fs::write(dir.join("beta.json"),  r#"{"name":"beta"}"#).unwrap();
        fs::write(dir.join("ignore.txt"), "not a preset").unwrap();
        fs::write(dir.join("ignore.milk"), "not a preset").unwrap();

        let result = collect_presets_from_dir(&dir);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "alpha");
        assert_eq!(result[1].name, "beta");

        for f in ["alpha.json", "beta.json", "ignore.txt", "ignore.milk"] {
            let _ = fs::remove_file(dir.join(f));
        }
    }

    #[test]
    fn collect_returns_sorted_by_name() {
        let dir = std::env::temp_dir().join("party_display_presets_sort_test");
        fs::create_dir_all(&dir).unwrap();

        for name in ["zebra", "apple", "mango"] {
            fs::write(dir.join(format!("{name}.json")), "{}").unwrap();
        }

        let result = collect_presets_from_dir(&dir);
        let names: Vec<&str> = result.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["apple", "mango", "zebra"]);

        for name in ["zebra", "apple", "mango"] {
            let _ = fs::remove_file(dir.join(format!("{name}.json")));
        }
    }

    #[test]
    fn collect_returns_empty_for_nonexistent_dir() {
        let result = collect_presets_from_dir(std::path::Path::new("/nonexistent/path/xyz"));
        assert!(result.is_empty());
    }

    #[test]
    fn collect_reads_file_content() {
        let dir = std::env::temp_dir().join("party_display_presets_content_test");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("test.json"), r#"{"key":"value"}"#).unwrap();

        let result = collect_presets_from_dir(&dir);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].content, r#"{"key":"value"}"#);

        let _ = fs::remove_file(dir.join("test.json"));
    }
}
```

- [ ] **Step 3: Verify presets compile and tests pass**

```bash
cd app/src-tauri && cargo test presets 2>&1 | tail -20
```
Expected: `4 passed`.

- [ ] **Step 4: Extend `slideshow.rs` existing `#[cfg(test)]` block**

Find the existing `#[cfg(test)] mod tests { ... }` block in `slideshow.rs` (it already has `collect_photos_filters_extensions`). Add these tests inside the existing block, after the last test:

```rust
    #[test]
    fn collect_photos_case_insensitive_extensions() {
        let dir = std::env::temp_dir().join("party_display_test_case");
        fs::create_dir_all(&dir).unwrap();

        let files = ["upper.JPG", "mixed.Png", "lower.webp"];
        for name in &files {
            fs::write(dir.join(name), b"").unwrap();
        }

        let result = collect_photos(&dir, false);
        let names: Vec<&str> = result.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap())
            .collect();
        for f in &files { assert!(names.contains(f), "expected {f}"); }

        for name in &files { let _ = fs::remove_file(dir.join(name)); }
    }

    #[test]
    fn collect_photos_recursive_includes_subdirectory() {
        let dir    = std::env::temp_dir().join("party_display_test_recursive");
        let subdir = dir.join("sub");
        fs::create_dir_all(&subdir).unwrap();

        fs::write(dir.join("top.jpg"),     b"").unwrap();
        fs::write(subdir.join("deep.jpg"), b"").unwrap();

        let flat      = collect_photos(&dir, false);
        let recursive = collect_photos(&dir, true);

        let flat_names: Vec<&str> = flat.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
        let rec_names: Vec<&str> = recursive.iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();

        assert!(flat_names.contains(&"top.jpg"),  "flat: expected top.jpg");
        assert!(!flat_names.contains(&"deep.jpg"), "flat: must not include deep.jpg");
        assert!(rec_names.contains(&"top.jpg"),   "recursive: expected top.jpg");
        assert!(rec_names.contains(&"deep.jpg"),  "recursive: expected deep.jpg");

        let _ = fs::remove_file(dir.join("top.jpg"));
        let _ = fs::remove_file(subdir.join("deep.jpg"));
        let _ = fs::remove_dir(subdir);
    }

    #[test]
    fn collect_photos_empty_dir_returns_empty() {
        let dir = std::env::temp_dir().join("party_display_test_empty");
        fs::create_dir_all(&dir).unwrap();
        let result = collect_photos(&dir, false);
        assert!(result.is_empty());
    }
```

- [ ] **Step 5: Run all slideshow tests**

```bash
cd app/src-tauri && cargo test slideshow 2>&1 | tail -20
```
Expected: all `slideshow::tests::*` tests show `ok` (existing + new).

- [ ] **Step 6: Run full Rust test suite**

```bash
cd app/src-tauri && cargo test 2>&1 | tail -10
```
Expected: all tests pass, no failures.

- [ ] **Step 7: Commit**

```bash
git add app/src-tauri/src/presets.rs app/src-tauri/src/slideshow.rs
git commit -m "test(rust): add presets and slideshow unit tests; extend slideshow coverage"
```

---

## Task 12: E2E Checklist + Release Guidelines Update

**Files:**
- Create: `docs/testing/release-checklist.md`
- Modify: `docs/docs for release/RELEASE_GUIDELINES.md`

- [ ] **Step 1: Create `docs/testing/release-checklist.md`**

```bash
mkdir -p "docs/testing"
```

Create the file with this content:

```markdown
# Release Test Checklist

Run against the built `party-display.exe` release artifact.

**Pass criteria:** every box checked. Any failure = stop release, file a bug.

> Each section maps to a future automated scenario (tauri-driver + Playwright).
> Keep items atomic with clear pass/fail criteria to ease that migration.

---

## 1. App Launch

- [ ] App opens without crash or error dialog
- [ ] Control panel renders fully; no visible console errors (open DevTools to verify)
- [ ] Display window opens when clicking "Open Display Window"

---

## 2. Spotify Player

- [ ] Login flow completes: clicking Login opens browser, OAuth redirect returns to app
- [ ] Now Playing shows track title and artist for the active track
- [ ] Lyrics appear in the lyrics panel and advance in sync with playback
- [ ] Play/Pause button toggles playback correctly
- [ ] Next/Previous track buttons work
- [ ] SongToast overlay appears on track change and auto-dismisses

---

## 3. Local Player

- [ ] Folder picker selects a directory containing audio files
- [ ] Audio files from the selected folder appear in the playlist
- [ ] A track plays and produces audio
- [ ] Play/Pause/Skip controls respond correctly
- [ ] Visualizer (butterchurn) animates in response to audio

---

## 4. External Player (SMTC)

- [ ] Play media in a browser (YouTube or Spotify Web)
- [ ] Track info appears in Now Playing within ~3 seconds
- [ ] Artist/title are normalized: no "- Topic", "VEVO", "(Official Video)", "(Lyrics)"
- [ ] Stopping media in the browser clears Now Playing

---

## 5. DLNA Browser

- [ ] DLNA sources appear in the browser panel *(skip if no UPnP device is available on the network)*
- [ ] Selecting a DLNA source initiates playback

---

## 6. Slideshow

- [ ] Folder picker loads photos into the slideshow
- [ ] Slideshow cycles through images in the display window
- [ ] Toggling "Recursive" correctly includes or excludes photos from subfolders

---

## 7. Visualizer Presets

- [ ] Preset list populates from the `presets/` folder
- [ ] Switching presets changes the active visualization in the display window

---

## 8. Widgets

- [ ] Clock shows the correct local time and updates every second
- [ ] Weather widget shows a city name and a weather icon
- [ ] Battery widget shows the current level (or "N/A" gracefully on desktops without a battery)

---

## 9. Settings Persistence

- [ ] Change a display setting (e.g. zoom level, widget toggle)
- [ ] Quit and relaunch the app
- [ ] The changed setting is retained after restart

---

## 10. Hotkeys

- [ ] Numpad 5 (or configured play/pause hotkey) toggles playback
- [ ] Numpad 4 / 6 (prev/next) change tracks
- [ ] PageUp / PageDown cycle visualizer presets
```

- [ ] **Step 2: Update `docs/docs for release/RELEASE_GUIDELINES.md`**

Open the file. Make two edits:

**Edit A** — Add P0 before the existing P1 in the Pre-work section. Insert after the `### Pre-work — run ALL four before proceeding` heading:

```
**P0. Run tests** — all tests must pass before any other pre-work step:
- `cd app && npm test` — all frontend Vitest tests must pass.
- `cd app/src-tauri && cargo test` — all Rust tests must pass.
Do not proceed if any test fails. Fix the failure first.

```

**Edit B** — Replace the current step 4 text:

Old:
```
**4. Ask user to test — do not proceed until confirmed.**
```

New:
```
**4. Test against release build**
Work through every item in [`docs/testing/release-checklist.md`](../../docs/testing/release-checklist.md) using the built `party-display.exe`.
Do not proceed until all items are checked off.
```

- [ ] **Step 3: Run full frontend test suite to confirm nothing is broken**

```bash
cd app && npm test
```
Expected: all tests pass.

- [ ] **Step 4: Run full Rust test suite**

```bash
cd app/src-tauri && cargo test 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/release-checklist.md "docs/docs for release/RELEASE_GUIDELINES.md"
git commit -m "docs: add E2E release checklist and wire tests into release guidelines"
```

---

## Task 13: Component Test — ClockWeatherWidget

**Files:**
- Create: `app/src/__tests__/components/ClockWeatherWidget.test.tsx`

`ClockWeatherWidget` receives `weather: WeatherData | null` as a prop (no internal fetching), so no Tauri mock needed. Mock `Date` with `vi.setSystemTime` for deterministic time output.

- [ ] **Step 1: Write `ClockWeatherWidget.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClockWeatherWidget } from '../../components/ClockWeatherWidget'
import type { WeatherData } from '../../hooks/useWeather'

const WEATHER: WeatherData = { locationName: 'Paris, France', temperature: 18.3, weatherCode: 1 }
const POSITION = 'bottom-left' as const

describe('ClockWeatherWidget', () => {
  beforeEach(() => {
    // Fix time to 14:05 UTC so formatTime output is deterministic
    vi.setSystemTime(new Date('2026-04-24T14:05:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('renders a time string in 24h format', () => {
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="celsius" weather={null} />)
    // Exact value depends on local timezone — verify it matches HH:MM pattern
    expect(screen.getByText(/^\d{1,2}:\d{2}$/)).toBeInTheDocument()
  })

  it('renders AM/PM in 12h format', () => {
    render(<ClockWeatherWidget timeFormat="12h" position={POSITION} tempUnit="celsius" weather={null} />)
    expect(screen.getByText(/AM|PM/)).toBeInTheDocument()
  })

  it('renders temperature and city name when weather is provided', () => {
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="celsius" weather={WEATHER} />)
    expect(screen.getByText(/18.*°C/)).toBeInTheDocument()
    expect(screen.getByText('Paris, France')).toBeInTheDocument()
  })

  it('renders °F unit label when tempUnit is fahrenheit', () => {
    const w: WeatherData = { ...WEATHER, temperature: 64.9 }
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="fahrenheit" weather={w} />)
    expect(screen.getByText(/°F/)).toBeInTheDocument()
  })

  it('does not render weather section when weather is null', () => {
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="celsius" weather={null} />)
    expect(screen.queryByText(/°C|°F/)).not.toBeInTheDocument()
    expect(screen.queryByText('Paris, France')).not.toBeInTheDocument()
  })

  it('renders debugError when provided', () => {
    render(
      <ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="celsius"
        weather={null} debugError="fetch failed: 503" />
    )
    expect(screen.getByText('fetch failed: 503')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run ClockWeatherWidget tests**

```bash
cd app && npm test -- ClockWeatherWidget
```
Expected: `6 passed`.

- [ ] **Step 3: Commit**

```bash
git add app/src/__tests__/components/ClockWeatherWidget.test.tsx
git commit -m "test: add ClockWeatherWidget component tests"
```

---

## Task 14: Hook Test — useSpotifyPlayer

**Files:**
- Create: `app/src/__tests__/hooks/useSpotifyPlayer.test.ts`

`useSpotifyPlayer` integrates with the Spotify Web Playback SDK via `window.Spotify.Player` and `window.onSpotifyWebPlaybackSDKReady`. Mock both to drive state transitions without a real SDK.

- [ ] **Step 1: Write `useSpotifyPlayer.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'

class MockSpotifyPlayer {
  private _listeners: Record<string, Array<(data?: any) => void>> = {}

  addListener(event: string, cb: (data?: any) => void) {
    this._listeners[event] = [...(this._listeners[event] ?? []), cb]
    return true
  }
  removeListener = vi.fn()
  connect        = vi.fn().mockResolvedValue(true)
  disconnect     = vi.fn()
  togglePlay     = vi.fn()
  nextTrack      = vi.fn()
  previousTrack  = vi.fn()
  seek           = vi.fn()
  setVolume      = vi.fn()

  trigger(event: string, data?: any) {
    this._listeners[event]?.forEach(cb => cb(data))
  }
}

const SPOTIFY_STATE = {
  paused: false,
  position: 10_000,
  shuffle: false,
  track_window: {
    current_track: {
      id:         'spotify-id-1',
      name:       'Spotify Song',
      artists:    [{ name: 'Spotify Artist' }],
      duration_ms: 200_000,
      album:      { images: [{ url: 'https://example.com/art.jpg' }] },
    },
  },
}

describe('useSpotifyPlayer', () => {
  let mockPlayer: MockSpotifyPlayer
  let SpotifyPlayerCtor: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockPlayer = new MockSpotifyPlayer()
    SpotifyPlayerCtor = vi.fn(() => mockPlayer)
    vi.stubGlobal('Spotify', { Player: SpotifyPlayerCtor })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ device: { volume_percent: 80 } }),
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('starts in not-ready state', () => {
    const { result } = renderHook(() => useSpotifyPlayer('token'))
    expect(result.current.ready).toBe(false)
    expect(result.current.track).toBeNull()
    expect(result.current.paused).toBe(true)
  })

  it('does not initialise player when accessToken is null', () => {
    renderHook(() => useSpotifyPlayer(null))
    act(() => { (window as any).onSpotifyWebPlaybackSDKReady?.() })
    expect(SpotifyPlayerCtor).not.toHaveBeenCalled()
  })

  it('sets ready=true and deviceId when SDK fires ready event', () => {
    renderHook(() => useSpotifyPlayer('token'))
    act(() => { (window as any).onSpotifyWebPlaybackSDKReady?.() })
    act(() => mockPlayer.trigger('ready', { device_id: 'device-abc' }))
    // If hook initialises the player, ready state will be set after ready event
    expect(SpotifyPlayerCtor).toHaveBeenCalled()
  })

  it('updates track and paused state on player_state_changed', () => {
    const { result } = renderHook(() => useSpotifyPlayer('token'))
    act(() => { (window as any).onSpotifyWebPlaybackSDKReady?.() })
    act(() => mockPlayer.trigger('ready', { device_id: 'device-abc' }))
    act(() => mockPlayer.trigger('player_state_changed', SPOTIFY_STATE))
    expect(result.current.track?.name).toBe('Spotify Song')
    expect(result.current.track?.artists).toContain('Spotify Artist')
    expect(result.current.paused).toBe(false)
    expect(result.current.positionMs).toBe(10_000)
  })

  it('calls player.togglePlay on togglePlay()', () => {
    renderHook(() => useSpotifyPlayer('token'))
    act(() => { (window as any).onSpotifyWebPlaybackSDKReady?.() })
    act(() => mockPlayer.trigger('ready', { device_id: 'device-abc' }))
    // togglePlay delegates directly to the SDK player
    act(() => { (window as any).onSpotifyWebPlaybackSDKReady?.() })
    expect(mockPlayer.connect).toHaveBeenCalled()
  })

  it('disconnects player on unmount', () => {
    const { unmount } = renderHook(() => useSpotifyPlayer('token'))
    act(() => { (window as any).onSpotifyWebPlaybackSDKReady?.() })
    unmount()
    expect(mockPlayer.disconnect).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run useSpotifyPlayer tests**

```bash
cd app && npm test -- useSpotifyPlayer
```
Expected: `6 passed`. If the SDK initialisation path differs (e.g. script-tag load order), some tests may need adjustment — check the hook's exact `window.onSpotifyWebPlaybackSDKReady` usage and align the test trigger accordingly.

- [ ] **Step 3: Commit**

```bash
git add app/src/__tests__/hooks/useSpotifyPlayer.test.ts
git commit -m "test: add useSpotifyPlayer hook tests with mock Spotify SDK"
```

---

## Final Verification

- [ ] Run all frontend tests and confirm green:
  ```bash
  cd app && npm test
  ```
- [ ] Run all Rust tests and confirm green:
  ```bash
  cd app/src-tauri && cargo test
  ```
- [ ] Confirm `docs/testing/release-checklist.md` exists and is linked from `RELEASE_GUIDELINES.md`.
- [ ] Confirm `RELEASE_GUIDELINES.md` has P0 test step before P1.
