# Clock & Weather Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clock + weather overlay to the display window showing time, location, weather icon, and temperature, togglable via a `C` hotkey and Display Settings.

**Architecture:** Three new files (`WeatherIcon.tsx`, `useWeather.ts`, `ClockWeatherWidget.tsx`) plus five modified files. The `useWeather` hook fetches location via ip-api.com (or user-supplied city override) and weather from Open-Meteo, polling every 30 minutes. On API failure it retains last known data; on first failure it shows clock only. The widget is toggled via the existing `display-hotkey`/`useHotkeys` event bus pattern, identical to how the photo counter and battery overlays work.

**Tech Stack:** React, TypeScript, browser `fetch()`, Open-Meteo API (no key required), ip-api.com (no key required)

> **Note:** No commits — user wants to test before committing.

---

## File Map

| File | Change |
|------|--------|
| `app/src/components/WeatherIcon.tsx` | NEW — SVG icon component, maps WMO weather codes to 8 icon categories |
| `app/src/hooks/useWeather.ts` | NEW — location resolution, weather fetching, 30-min polling, error handling |
| `app/src/components/ClockWeatherWidget.tsx` | NEW — renders time + location + icon + temp; owns 1s clock tick |
| `app/src/components/DisplaySettingsPanel.tsx` | Add 5 new fields to interface, `readDisplaySettings`, and UI section |
| `app/src/hooks/useHotkeys.ts` | Add `onToggleClockWeather?` bound to `c`/`C` |
| `app/src/windows/control/ControlPanel.tsx` | Add `toggleClockWeather` callback; wire to hotkey + persistence |
| `app/src/windows/display/DisplayWindow.tsx` | Render `<ClockWeatherWidget>`; wire C hotkey via `display-hotkey` |
| `app/src/components/HelpPanel.tsx` | Add `{ key: 'C', action: 'Toggle clock & weather' }` |

---

### Task 1: Create WeatherIcon.tsx

**Files:**
- Create: `app/src/components/WeatherIcon.tsx`

- [ ] **Step 1: Create the file with all 8 icon variants and the WMO mapping**

Create `app/src/components/WeatherIcon.tsx` with this content:

```tsx
// WMO 4677 weather code → icon mapping
// 0        = clear sky     → Sun
// 1, 2     = partly cloudy → PartlyCloudy
// 3        = overcast      → Cloud
// 45, 48   = fog           → Fog
// 51–57    = drizzle       → Drizzle
// 61–67, 80–82 = rain      → Rain
// 71–77, 85–86 = snow      → Snow
// 95, 96, 99   = thunder   → Thunderstorm

interface IconProps { size: number }

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  viewBox: '0 0 24 24',
  width: size,
  height: size,
  fill: 'none',
  stroke: 'white',
  strokeWidth: '1.5',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

function SunSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2"  x2="12" y2="5"  />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2"  y1="12" x2="5"  y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="5.22"  y1="5.22"  x2="7.34"  y2="7.34"  />
      <line x1="16.66" y1="16.66" x2="18.78" y2="18.78" />
      <line x1="5.22"  y1="18.78" x2="7.34"  y2="16.66" />
      <line x1="16.66" y1="7.34"  x2="18.78" y2="5.22"  />
    </svg>
  )
}

function PartlyCloudySvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      {/* Small sun rays in upper-left */}
      <circle cx="9" cy="7" r="2.5" />
      <line x1="9" y1="2" x2="9" y2="4" />
      <line x1="4" y1="7" x2="6" y2="7" />
      <line x1="5.93" y1="3.93" x2="7.34" y2="5.34" />
      {/* Cloud in front */}
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 0 9Z" />
    </svg>
  )
}

function CloudSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 0 9Z" />
    </svg>
  )
}

function FogSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <line x1="3" y1="19" x2="21" y2="19" />
      <line x1="5" y1="22" x2="19" y2="22" />
    </svg>
  )
}

function DrizzleSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <line x1="8"  y1="18" x2="8"  y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="16" y1="18" x2="16" y2="21" />
    </svg>
  )
}

function RainSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <line x1="8"  y1="18" x2="6"  y2="22" />
      <line x1="12" y1="18" x2="10" y2="22" />
      <line x1="16" y1="18" x2="14" y2="22" />
    </svg>
  )
}

function SnowSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      {/* Three snowflake crosses */}
      <line x1="8"  y1="18" x2="8"  y2="22" />
      <line x1="6"  y1="20" x2="10" y2="20" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="10" y1="20" x2="14" y2="20" />
      <line x1="16" y1="18" x2="16" y2="22" />
      <line x1="14" y1="20" x2="18" y2="20" />
    </svg>
  )
}

function ThunderstormSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <polyline points="13,17 11,21 14,21 12,24" />
    </svg>
  )
}

export function WeatherIcon({ code, size = 22 }: { code: number; size?: number }) {
  if (code === 0)                                           return <SunSvg size={size} />
  if (code <= 2)                                           return <PartlyCloudySvg size={size} />
  if (code === 3)                                          return <CloudSvg size={size} />
  if (code === 45 || code === 48)                          return <FogSvg size={size} />
  if (code >= 51 && code <= 57)                            return <DrizzleSvg size={size} />
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return <RainSvg size={size} />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <SnowSvg size={size} />
  if (code === 95 || code === 96 || code === 99)           return <ThunderstormSvg size={size} />
  return <CloudSvg size={size} />  // fallback for unknown codes
}
```

---

### Task 2: Create useWeather.ts

**Files:**
- Create: `app/src/hooks/useWeather.ts`

- [ ] **Step 1: Create the file**

Create `app/src/hooks/useWeather.ts` with this content:

```ts
import { useEffect, useState } from 'react'

export interface WeatherData {
  locationName: string
  temperature: number   // value in the unit requested (celsius or fahrenheit)
  weatherCode: number   // WMO 4677 code
}

async function resolveLocation(city: string): Promise<{ lat: number; lon: number; name: string }> {
  if (city.trim()) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1`
      const res = await fetch(url)
      const json = await res.json()
      if (json.results?.length) {
        const r = json.results[0]
        return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country}` }
      }
    } catch {
      // fall through to IP geolocation
    }
  }
  // IP geolocation fallback
  const res = await fetch('https://ip-api.com/json/')
  const json = await res.json()
  return { lat: json.lat, lon: json.lon, name: `${json.city}, ${json.country}` }
}

async function fetchWeatherData(
  city: string,
  tempUnit: 'celsius' | 'fahrenheit',
): Promise<WeatherData> {
  const { lat, lon, name } = await resolveLocation(city)
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=${tempUnit}`
  const res = await fetch(url)
  const json = await res.json()
  return {
    locationName: name,
    temperature: json.current.temperature_2m,
    weatherCode: json.current.weather_code,
  }
}

export function useWeather(
  tempUnit: 'celsius' | 'fahrenheit',
  city: string,
): WeatherData | null {
  const [data, setData] = useState<WeatherData | null>(null)

  useEffect(() => {
    let cancelled = false

    async function doFetch() {
      try {
        const result = await fetchWeatherData(city, tempUnit)
        if (!cancelled) setData(result)
      } catch {
        // retain last known data on failure — don't call setData
      }
    }

    // Clear data immediately on city/unit change so widget shows clock-only
    // while the new fetch is in flight
    setData(null)
    doFetch()
    const id = setInterval(doFetch, 30 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [city, tempUnit])

  return data
}
```

---

### Task 3: Create ClockWeatherWidget.tsx

**Files:**
- Create: `app/src/components/ClockWeatherWidget.tsx`

- [ ] **Step 1: Create the file**

Create `app/src/components/ClockWeatherWidget.tsx` with this content:

```tsx
import { useEffect, useState } from 'react'
import type { TrackPosition } from './DisplaySettingsPanel'
import type { WeatherData } from '../hooks/useWeather'
import { WeatherIcon } from './WeatherIcon'

function formatTime(date: Date, format: '12h' | '24h'): string {
  if (format === '24h') {
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  let h = date.getHours()
  const m = String(date.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

interface Props {
  timeFormat: '12h' | '24h'
  position: TrackPosition
  tempUnit: 'celsius' | 'fahrenheit'
  weather: WeatherData | null
}

export function ClockWeatherWidget({ timeFormat, position, tempUnit, weather }: Props) {
  const [time, setTime] = useState(() => formatTime(new Date(), timeFormat))

  useEffect(() => {
    function tick() { setTime(formatTime(new Date(), timeFormat)) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timeFormat])

  const posStyle: React.CSSProperties = {
    top:    position.startsWith('top')    ? 16 : undefined,
    bottom: position.startsWith('bottom') ? 16 : undefined,
    left:   position.endsWith('left')     ? 16 : undefined,
    right:  position.endsWith('right')    ? 16 : undefined,
  }

  const unitLabel = tempUnit === 'celsius' ? '°C' : '°F'

  return (
    <div style={{
      position: 'absolute',
      ...posStyle,
      zIndex: 15,
      pointerEvents: 'none',
      padding: '8px 14px',
      borderRadius: 12,
      background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(2px)',
      color: '#fff',
      minWidth: 110,
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: 1 }}>
        {time}
      </div>
      {weather && (
        <>
          <div style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12,
            opacity: 0.8,
            marginTop: 5,
            whiteSpace: 'nowrap',
          }}>
            {weather.locationName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <WeatherIcon code={weather.weatherCode} size={20} />
            <span style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 15 }}>
              {Math.round(weather.temperature)}{unitLabel}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
```

---

### Task 4: Extend DisplaySettings in DisplaySettingsPanel.tsx

**Files:**
- Modify: `app/src/components/DisplaySettingsPanel.tsx`

- [ ] **Step 1: Add 5 fields to the `DisplaySettings` interface**

In `app/src/components/DisplaySettingsPanel.tsx`, find the `DisplaySettings` interface (ends with `photoCounterVisible: boolean`) and add after it:

```ts
  clockWeatherVisible:    boolean
  clockWeatherPosition:   TrackPosition
  clockWeatherTimeFormat: '12h' | '24h'
  clockWeatherTempUnit:   'celsius' | 'fahrenheit'
  clockWeatherCity:       string
```

The full interface now ends:
```ts
  photoCounterVisible:    boolean
  clockWeatherVisible:    boolean
  clockWeatherPosition:   TrackPosition
  clockWeatherTimeFormat: '12h' | '24h'
  clockWeatherTempUnit:   'celsius' | 'fahrenheit'
  clockWeatherCity:       string
}
```

- [ ] **Step 2: Add defaults to `readDisplaySettings`**

In `readDisplaySettings()`, find the last line (`photoCounterVisible: ...`) and add after it:

```ts
    clockWeatherVisible:    localStorage.getItem('pd_cw_visible') !== 'false',
    clockWeatherPosition:   (localStorage.getItem('pd_cw_position') as TrackPosition) ?? 'bottom-left',
    clockWeatherTimeFormat: (localStorage.getItem('pd_cw_time_format') as '12h' | '24h') ?? '24h',
    clockWeatherTempUnit:   (localStorage.getItem('pd_cw_temp_unit') as 'celsius' | 'fahrenheit') ?? 'celsius',
    clockWeatherCity:       localStorage.getItem('pd_cw_city') ?? '',
```

- [ ] **Step 3: Add "Clock & Weather" section to the settings panel UI**

In `DisplaySettingsPanel.tsx`, at the very end of the returned JSX (after the closing `</label>` of the Photo counter section and before the closing `</div>` of the component), add:

```tsx
      {/* ── Clock & weather ───────────────────────────────────────────── */}
      <p style={subHead}>Clock &amp; weather <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(C to toggle)</span></p>

      <label style={{ ...checkRow, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.clockWeatherVisible}
          onChange={e => set({ clockWeatherVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show on display
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        <div>
          <span style={fieldLabel}>Position</span>
          <select value={settings.clockWeatherPosition}
            onChange={e => set({ clockWeatherPosition: e.target.value as TrackPosition })}
            style={selectInput}>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Time format</span>
          <select value={settings.clockWeatherTimeFormat}
            onChange={e => set({ clockWeatherTimeFormat: e.target.value as '12h' | '24h' })}
            style={selectInput}>
            <option value="24h">24h</option>
            <option value="12h">12h</option>
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Temperature</span>
          <select value={settings.clockWeatherTempUnit}
            onChange={e => set({ clockWeatherTempUnit: e.target.value as 'celsius' | 'fahrenheit' })}
            style={selectInput}>
            <option value="celsius">°C</option>
            <option value="fahrenheit">°F</option>
          </select>
        </div>
        <div>
          <span style={fieldLabel}>City</span>
          <input
            type="text"
            value={settings.clockWeatherCity}
            onChange={e => set({ clockWeatherCity: e.target.value })}
            placeholder="Auto-detect by IP"
            style={{ ...selectInput, width: '100%' }}
          />
        </div>
      </div>
```

---

### Task 5: Add onToggleClockWeather to useHotkeys.ts

**Files:**
- Modify: `app/src/hooks/useHotkeys.ts`

- [ ] **Step 1: Add field to `Handlers` interface, destructure it, add key binding, update deps array**

Replace the entire file `app/src/hooks/useHotkeys.ts` with:

```ts
import { useEffect } from 'react'

interface Handlers {
  onNext:                   () => void
  onPrev:                   () => void
  onTogglePause:            () => void
  onToggleSpectrum?:        () => void
  onToggleTrackOverlay?:    () => void
  onToggleFullscreen?:      () => void
  onToggleBattery?:         () => void
  onTogglePhotoCounter?:    () => void
  onToggleClockWeather?:    () => void
}

export function useHotkeys({ onNext, onPrev, onTogglePause, onToggleSpectrum, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter, onToggleClockWeather }: Handlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't steal keys when the user is typing in a form element
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case 'ArrowRight':  e.preventDefault(); onNext();                    break
        case 'ArrowLeft':   e.preventDefault(); onPrev();                    break
        case ' ':           e.preventDefault(); onTogglePause();             break
        case 's': case 'S': e.preventDefault(); onToggleSpectrum?.();        break
        case 't': case 'T': e.preventDefault(); onToggleTrackOverlay?.();    break
        case 'f': case 'F': e.preventDefault(); onToggleFullscreen?.();      break
        case 'b': case 'B': e.preventDefault(); onToggleBattery?.();         break
        case 'p': case 'P': e.preventDefault(); onTogglePhotoCounter?.();    break
        case 'c': case 'C': e.preventDefault(); onToggleClockWeather?.();    break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onNext, onPrev, onTogglePause, onToggleSpectrum, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter, onToggleClockWeather])
}
```

---

### Task 6: Wire toggleClockWeather in ControlPanel.tsx

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx`

- [ ] **Step 1: Add `toggleClockWeather` callback**

In `ControlPanel.tsx`, find `togglePhotoCounter`:
```ts
  const togglePhotoCounter = useCallback(() => {
    setDisplaySettings(s => ({ ...s, photoCounterVisible: !s.photoCounterVisible }))
  }, [])
```

Add after it:
```ts
  const toggleClockWeather = useCallback(() => {
    setDisplaySettings(s => ({ ...s, clockWeatherVisible: !s.clockWeatherVisible }))
  }, [])
```

- [ ] **Step 2: Add to `useHotkeys` call**

Find the `useHotkeys({...})` call (currently ends with `onTogglePhotoCounter: togglePhotoCounter`) and add:
```ts
    onToggleClockWeather: toggleClockWeather,
```

- [ ] **Step 3: Add to `display-hotkey` listener**

Find the `listen<{ action: string }>('display-hotkey', ...)` handler (currently ends with `if (payload.action === 'counter') togglePhotoCounter()`). Add after it:
```ts
      if (payload.action === 'clock') toggleClockWeather()
```

Also add `toggleClockWeather` to the `useEffect` dependency array. Find:
```ts
  }, [doNext, doPrev, togglePause, toggleSpectrum, toggleTrackOverlay, toggleBattery, togglePhotoCounter])
```
Replace with:
```ts
  }, [doNext, doPrev, togglePause, toggleSpectrum, toggleTrackOverlay, toggleBattery, togglePhotoCounter, toggleClockWeather])
```

- [ ] **Step 4: Add 5 localStorage persistence lines**

In the `useEffect(() => { ... }, [displaySettings])` block that calls `localStorage.setItem` for all settings, find the last line:
```ts
    localStorage.setItem('pd_photo_counter_visible',   String(displaySettings.photoCounterVisible))
```
Add after it:
```ts
    localStorage.setItem('pd_cw_visible',              String(displaySettings.clockWeatherVisible))
    localStorage.setItem('pd_cw_position',             displaySettings.clockWeatherPosition)
    localStorage.setItem('pd_cw_time_format',          displaySettings.clockWeatherTimeFormat)
    localStorage.setItem('pd_cw_temp_unit',            displaySettings.clockWeatherTempUnit)
    localStorage.setItem('pd_cw_city',                 displaySettings.clockWeatherCity)
```

---

### Task 7: Render ClockWeatherWidget in DisplayWindow.tsx

**Files:**
- Modify: `app/src/windows/display/DisplayWindow.tsx`

- [ ] **Step 1: Add imports**

At the top of `DisplayWindow.tsx`, after the existing imports, add:

```ts
import { useWeather } from '../../hooks/useWeather'
import { ClockWeatherWidget } from '../../components/ClockWeatherWidget'
```

- [ ] **Step 2: Call `useWeather` inside the component**

In `DisplayWindow`, after the `battery = useBattery()` line, add:

```ts
  const weather = useWeather(displaySettings.clockWeatherTempUnit, displaySettings.clockWeatherCity)
```

- [ ] **Step 3: Add `onToggleClockWeather` to `useHotkeys`**

Find the `useHotkeys({...})` call (currently ends with `onTogglePhotoCounter: ...`). Add:

```ts
    onToggleClockWeather: () => emit('display-hotkey', { action: 'clock' }).catch(console.error),
```

- [ ] **Step 4: Render the widget**

After the `{displaySettings.photoCounterVisible && photoCounter !== null && (...)}` block, add:

```tsx
      {displaySettings.clockWeatherVisible && (
        <ClockWeatherWidget
          timeFormat={displaySettings.clockWeatherTimeFormat}
          position={displaySettings.clockWeatherPosition}
          tempUnit={displaySettings.clockWeatherTempUnit}
          weather={weather}
        />
      )}
```

---

### Task 8: Add C hotkey to HelpPanel.tsx

**Files:**
- Modify: `app/src/components/HelpPanel.tsx`

- [ ] **Step 1: Add entry to HOTKEYS array**

Find the `{ key: 'P', action: 'Toggle photo counter' }` line and add after it:

```ts
  { key: 'C',         action: 'Toggle clock & weather' },
```

---

### Task 9: Manual verification

- [ ] Run `cd app && npm run dev` (or `npx tauri dev` from repo root)
- [ ] Open the display window — clock widget should appear at bottom-left showing current time
- [ ] Wait a few seconds — location and weather should appear below the time
- [ ] Press `C` — widget should hide/show
- [ ] Open Display Settings → scroll to "Clock & weather" section
- [ ] Toggle checkbox — widget hides/shows on display
- [ ] Change position (e.g. top-right) — widget moves on display in real time
- [ ] Change time format to 12h — clock shows AM/PM format
- [ ] Change temperature unit to °F — temperature updates on next poll (or reload)
- [ ] Enter a city name (e.g. "London") — weather updates to show London data
- [ ] Clear the city — weather reverts to IP geolocation
- [ ] Open Help panel — `C` should appear in the hotkeys table
- [ ] Simulate API failure: in browser DevTools, block `ip-api.com` and `open-meteo.com`, reload — widget should show clock only without crashing
