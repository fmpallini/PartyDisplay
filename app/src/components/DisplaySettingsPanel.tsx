import { useEffect, useState } from 'react'
import { emit } from '@tauri-apps/api/event'

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

export interface DisplaySettings {
  toastDurationMs:    number
  songZoom:           number
  volumeZoom:         number
  transitionEffect:   TransitionEffect
  transitionDurationMs: number
}

export function readDisplaySettings(): DisplaySettings {
  return {
    toastDurationMs:    Number(localStorage.getItem('pd_toast_duration_ms')      ?? '5000'),
    songZoom:           Number(localStorage.getItem('pd_song_toast_zoom')         ?? '1.7'),
    volumeZoom:         Number(localStorage.getItem('pd_volume_toast_zoom')       ?? '1.7'),
    transitionEffect:   (localStorage.getItem('pd_transition_effect') as TransitionEffect) ?? 'fade',
    transitionDurationMs: Number(localStorage.getItem('pd_transition_duration_ms') ?? '500'),
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

const label: React.CSSProperties = {
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

export function DisplaySettingsPanel() {
  const [settings, setSettings] = useState<DisplaySettings>(readDisplaySettings)

  // Sync to localStorage and notify display window on every settings change
  useEffect(() => {
    localStorage.setItem('pd_toast_duration_ms',      String(settings.toastDurationMs))
    localStorage.setItem('pd_song_toast_zoom',         String(settings.songZoom))
    localStorage.setItem('pd_volume_toast_zoom',       String(settings.volumeZoom))
    localStorage.setItem('pd_transition_effect',       settings.transitionEffect)
    localStorage.setItem('pd_transition_duration_ms',  String(settings.transitionDurationMs))
    emit('display-settings-changed', settings).catch(console.error)
  }, [settings])

  function set(patch: Partial<DisplaySettings>) {
    setSettings(s => ({ ...s, ...patch }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        Display
      </p>

      {/* Toast duration */}
      <label style={label}>
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
      <label style={label}>
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
      <label style={label}>
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
      <label style={label}>
        Transition
        <select
          value={settings.transitionEffect}
          onChange={e => set({ transitionEffect: e.target.value as TransitionEffect })}
          style={selectInput}
        >
          {TRANSITION_EFFECTS.map(({ value, label: lbl }) => (
            <option key={value} value={value}>{lbl}</option>
          ))}
        </select>
      </label>

      {/* Transition duration */}
      <label style={label}>
        Transition duration
        <input
          type="number" min={0.1} max={5} step={0.1}
          value={settings.transitionDurationMs / 1000}
          onChange={e => set({ transitionDurationMs: Math.min(5000, Math.max(100, Math.round(Number(e.target.value) * 1000))) })}
          style={numInput}
        />
        s
      </label>
    </div>
  )
}
