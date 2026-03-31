# Clock & Weather Widget — Design Spec

**Date:** 2026-03-30

## Overview

Add a clock + weather overlay to the display window. Shows the current time, location name, a weather condition icon, and current temperature. Togglable via `C` hotkey and a checkbox in Display Settings. Position is configurable (4 corners), defaulting to bottom-left.

---

## Visual Layout

```
┌─────────────────────────────┐
│  04:13                      │
│  Milano, Italy              │
│  ☁️  1°C                    │
└─────────────────────────────┘
```

- Semi-transparent dark pill: `rgba(0,0,0,0.45)`, `backdropFilter: blur(2px)`
- Time: large monospace font
- Location: smaller, system-ui
- Weather icon (SVG) + temperature: bottom line
- If weather unavailable (API failed or still loading): location and weather line hidden — clock only
- `pointerEvents: none`, `zIndex: 15`

---

## Data Sources

All fetching via browser `fetch()` — no Rust changes required.

| Purpose | URL |
|---|---|
| IP geolocation | `https://ip-api.com/json/` → `{ lat, lon, city, country }` |
| City geocoding (override) | `https://geocoding-api.open-meteo.com/v1/search?name=<city>&count=1` → `{ results[0].latitude, longitude, name, country }` |
| Weather | `https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y&current=temperature_2m,weather_code&temperature_unit=celsius\|fahrenheit` |

---

## Data Flow

1. On mount: read `pd_cw_city` from `localStorage`
2. If city is set → geocode via Open-Meteo → get lat/lon + resolved display name
3. If no city → fetch `ip-api.com/json/` → get lat/lon + city/country name
4. Fetch weather from Open-Meteo with resolved lat/lon and configured temp unit
5. Poll weather + location every 30 minutes via `setInterval`
6. On any API failure: retain last known weather data (or null if first fetch); show clock only if no weather data available. Retry automatically on the next 30-minute cycle.
7. Clock ticks every second via a separate `setInterval` in the widget component

---

## Settings

New fields added to `DisplaySettings` in `DisplaySettingsPanel.tsx`:

| Field | Type | Default | localStorage key |
|---|---|---|---|
| `clockWeatherVisible` | `boolean` | `true` | `pd_cw_visible` |
| `clockWeatherPosition` | `TrackPosition` | `'bottom-left'` | `pd_cw_position` |
| `clockWeatherTimeFormat` | `'12h' \| '24h'` | `'24h'` | `pd_cw_time_format` |
| `clockWeatherTempUnit` | `'celsius' \| 'fahrenheit'` | `'celsius'` | `pd_cw_temp_unit` |
| `clockWeatherCity` | `string` | `''` | `pd_cw_city` |

`TrackPosition` (`'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'`) is already defined — reuse it.

### Display Settings Panel UI — "Clock & Weather" section

- Checkbox: "Show on display" `(C to toggle)`
- Select: Position (Top left / Top right / Bottom left / Bottom right)
- Select: Time format (24h / 12h)
- Select: Temperature (°C / °F)
- Text input: City (placeholder: "Auto-detect by IP")

---

## WMO Weather Code → Icon Mapping

Open-Meteo returns WMO 4677 weather codes. Map to 8 icon categories:

| Codes | Condition | Icon |
|---|---|---|
| 0 | Clear sky | Sun |
| 1, 2 | Partly cloudy | Sun + cloud |
| 3 | Overcast | Cloud |
| 45, 48 | Fog | Fog/mist |
| 51–57 | Drizzle | Cloud + light rain |
| 61–67, 80–82 | Rain | Cloud + rain |
| 71–77, 85–86 | Snow | Cloud + snow |
| 95, 96, 99 | Thunderstorm | Cloud + lightning |

Icons implemented as inline SVG in `WeatherIcon.tsx`. White strokes, no fill, consistent with the overlay's light-on-dark style.

---

## New Files

| File | Responsibility |
|---|---|
| `app/src/hooks/useWeather.ts` | Location resolution, weather fetching, 30-min polling, error handling |
| `app/src/components/ClockWeatherWidget.tsx` | Renders time, location, icon, temperature; owns the 1-second clock tick |
| `app/src/components/WeatherIcon.tsx` | Maps WMO code → SVG icon component |

---

## Modified Files

| File | Change |
|---|---|
| `DisplaySettingsPanel.tsx` | Add 5 new fields to `DisplaySettings` interface, `readDisplaySettings`, and UI section |
| `ControlPanel.tsx` | Add `toggleClockWeather` callback; wire to `useHotkeys` and `display-hotkey 'clock'` handler |
| `DisplayWindow.tsx` | Render `<ClockWeatherWidget>`; wire `C` hotkey via `display-hotkey 'clock'` |
| `useHotkeys.ts` | Add `onToggleClockWeather?` bound to `c`/`C` |
| `HelpPanel.tsx` | Add `{ key: 'C', action: 'Toggle clock & weather' }` |

---

## Error Handling

- IP geolocation failure → no location name, no weather; clock displayed alone
- City geocoding failure (bad city name) → fall back to IP geolocation silently
- Weather fetch failure → retain last known data if available, otherwise clock only
- All retries happen automatically on the 30-minute poll cycle — no manual retry UI

---

## Out of Scope

- No wind, humidity, or forecast data
- No animated icons
- No date display
