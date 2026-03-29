import { useEffect } from 'react'
import { emit } from '@tauri-apps/api/event'
import type { SpectrumTheme, SpectrumStyle } from './SpectrumCanvas'

export type { SpectrumTheme, SpectrumStyle }

export type TransitionEffect =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'blur'
  | 'random'

export type ImageFit = 'cover' | 'contain'

export interface DisplaySettings {
  toastDurationMs:      number
  songZoom:             number
  volumeZoom:           number
  transitionEffect:     TransitionEffect
  transitionDurationMs: number
  imageFit:             ImageFit
  spectrumVisible:      boolean
  spectrumStyle:        SpectrumStyle
  spectrumTheme:        SpectrumTheme
  spectrumHeightPct:    number
  batteryVisible:       boolean
  batterySize:          number
}

export function readDisplaySettings(): DisplaySettings {
  return {
    toastDurationMs:      Number(localStorage.getItem('pd_toast_duration_ms')      ?? '5000'),
    songZoom:             Number(localStorage.getItem('pd_song_toast_zoom')         ?? '1.7'),
    volumeZoom:           Number(localStorage.getItem('pd_volume_toast_zoom')       ?? '1.7'),
    transitionEffect:     (localStorage.getItem('pd_transition_effect') as TransitionEffect) ?? 'random',
    transitionDurationMs: Number(localStorage.getItem('pd_transition_duration_ms') ?? '500'),
    imageFit:             (localStorage.getItem('pd_image_fit') as ImageFit)         ?? 'cover',
    spectrumVisible:      localStorage.getItem('pd_spectrum_visible') === 'true',
    spectrumStyle:        (localStorage.getItem('pd_spectrum_style') as SpectrumStyle) ?? 'bars',
    spectrumTheme:        (localStorage.getItem('pd_spectrum_theme') as SpectrumTheme) ?? 'energy',
    spectrumHeightPct:    Number(localStorage.getItem('pd_spectrum_height_pct') ?? '10'),
    batteryVisible:       localStorage.getItem('pd_battery_visible') === 'true',
    batterySize:          Number(localStorage.getItem('pd_battery_size') ?? '36'),
  }
}

const TRANSITION_EFFECTS: { value: TransitionEffect; label: string }[] = [
  { value: 'random',      label: 'Random'      },
  { value: 'fade',        label: 'Fade'        },
  { value: 'slide-left',  label: 'Slide Left'  },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'slide-up',    label: 'Slide Up'    },
  { value: 'slide-down',  label: 'Slide Down'  },
  { value: 'zoom-in',     label: 'Zoom In'     },
  { value: 'zoom-out',    label: 'Zoom Out'    },
  { value: 'blur',        label: 'Blur'        },
]

const SPECTRUM_THEMES: { value: SpectrumTheme; label: string }[] = [
  { value: 'energy',  label: 'Energy (green→red)'  },
  { value: 'cyan',    label: 'Cyan'                },
  { value: 'fire',    label: 'Fire'                },
  { value: 'white',   label: 'White'               },
  { value: 'rainbow', label: 'Rainbow'             },
  { value: 'purple',  label: 'Purple'              },
]

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: 14,
}

const numInput: React.CSSProperties = {
  width: 56, background: '#222', border: '1px solid #444', color: '#eee',
  borderRadius: 4, padding: '3px 6px', fontFamily: 'monospace', fontSize: 13,
}

const selectInput: React.CSSProperties = {
  background: '#222', border: '1px solid #444', color: '#eee',
  borderRadius: 4, padding: '3px 6px', fontFamily: 'monospace', fontSize: 13,
  cursor: 'pointer',
}

const sectionHeader: React.CSSProperties = {
  margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1,
}

interface Props {
  settings: DisplaySettings
  onChange: (s: DisplaySettings) => void
}

export function DisplaySettingsPanel({ settings, onChange }: Props) {
  // Sync to localStorage and notify display window whenever settings change
  useEffect(() => {
    localStorage.setItem('pd_toast_duration_ms',      String(settings.toastDurationMs))
    localStorage.setItem('pd_song_toast_zoom',         String(settings.songZoom))
    localStorage.setItem('pd_volume_toast_zoom',       String(settings.volumeZoom))
    localStorage.setItem('pd_transition_effect',       settings.transitionEffect)
    localStorage.setItem('pd_transition_duration_ms',  String(settings.transitionDurationMs))
    localStorage.setItem('pd_image_fit',               settings.imageFit)
    localStorage.setItem('pd_spectrum_visible',        String(settings.spectrumVisible))
    localStorage.setItem('pd_spectrum_style',          settings.spectrumStyle)
    localStorage.setItem('pd_spectrum_theme',          settings.spectrumTheme)
    localStorage.setItem('pd_spectrum_height_pct',     String(settings.spectrumHeightPct))
    localStorage.setItem('pd_battery_visible',         String(settings.batteryVisible))
    localStorage.setItem('pd_battery_size',            String(settings.batterySize))
    emit('display-settings-changed', settings).catch(console.error)
  }, [settings])

  function set(patch: Partial<DisplaySettings>) {
    onChange({ ...settings, ...patch })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={sectionHeader}>Display</p>

      {/* Toast duration */}
      <label style={labelStyle}>
        Toast duration
        <input
          type="number" min={1} max={60}
          value={Math.round(settings.toastDurationMs / 1000)}
          onChange={e => set({ toastDurationMs: Math.min(60, Math.max(1, Number(e.target.value))) * 1000 })}
          style={numInput}
        />
        s
      </label>

      {/* Song toast zoom */}
      <label style={labelStyle}>
        Song toast size
        <input
          type="number" min={0.5} max={3} step={0.1}
          value={settings.songZoom}
          onChange={e => set({ songZoom: Math.min(3, Math.max(0.5, Number(e.target.value))) })}
          style={numInput}
        />
        ×
      </label>

      {/* Volume toast zoom */}
      <label style={labelStyle}>
        Volume toast size
        <input
          type="number" min={0.5} max={3} step={0.1}
          value={settings.volumeZoom}
          onChange={e => set({ volumeZoom: Math.min(3, Math.max(0.5, Number(e.target.value))) })}
          style={numInput}
        />
        ×
      </label>

      {/* Transition effect */}
      <label style={labelStyle}>
        Transition
        <select
          value={settings.transitionEffect}
          onChange={e => set({ transitionEffect: e.target.value as TransitionEffect })}
          style={selectInput}
        >
          {TRANSITION_EFFECTS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      {/* Transition duration */}
      <label style={labelStyle}>
        Transition duration
        <input
          type="number" min={0.1} max={5} step={0.1}
          value={settings.transitionDurationMs / 1000}
          onChange={e => set({ transitionDurationMs: Math.min(5000, Math.max(100, Math.round(Number(e.target.value) * 1000))) })}
          style={numInput}
        />
        s
      </label>

      {/* Image fit */}
      <label style={labelStyle}>
        Image fit
        <select
          value={settings.imageFit}
          onChange={e => set({ imageFit: e.target.value as ImageFit })}
          style={selectInput}
        >
          <option value="cover">Fill screen (crop)</option>
          <option value="contain">Fit to screen (letterbox)</option>
        </select>
      </label>

      {/* ── Spectrum ─────────────────────────────────────────────────── */}
      <p style={{ ...sectionHeader, marginTop: 8 }}>Spectrum  <span style={{ color: '#555', fontSize: 11 }}>(S to toggle)</span></p>

      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={settings.spectrumVisible}
          onChange={e => set({ spectrumVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show spectrum on display
      </label>

      <label style={labelStyle}>
        Style
        <select
          value={settings.spectrumStyle}
          onChange={e => set({ spectrumStyle: e.target.value as SpectrumStyle })}
          style={selectInput}
        >
          <option value="bars">Bars</option>
          <option value="lines">Lines</option>
        </select>
      </label>

      <label style={labelStyle}>
        Theme
        <select
          value={settings.spectrumTheme}
          onChange={e => set({ spectrumTheme: e.target.value as SpectrumTheme })}
          style={selectInput}
        >
          {SPECTRUM_THEMES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Height
        <input
          type="number" min={5} max={50} step={1}
          value={settings.spectrumHeightPct}
          onChange={e => set({ spectrumHeightPct: Math.min(50, Math.max(5, Number(e.target.value))) })}
          style={numInput}
        />
        % of screen
      </label>

      {/* ── Battery widget ────────────────────────────────────────────── */}
      <p style={{ ...sectionHeader, marginTop: 8 }}>Battery</p>

      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={settings.batteryVisible}
          onChange={e => set({ batteryVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show battery icon on display
      </label>

      <label style={labelStyle}>
        Icon size
        <input
          type="number" min={16} max={80} step={2}
          value={settings.batterySize}
          onChange={e => set({ batterySize: Math.min(80, Math.max(16, Number(e.target.value))) })}
          style={numInput}
        />
        px
      </label>
    </div>
  )
}
