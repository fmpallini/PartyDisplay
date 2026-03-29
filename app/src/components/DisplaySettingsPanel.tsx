import { useEffect, useState } from 'react'
import { emit } from '@tauri-apps/api/event'

export interface DisplaySettings {
  toastDurationMs: number
  songZoom:        number
  volumeZoom:      number
}

export function readDisplaySettings(): DisplaySettings {
  return {
    toastDurationMs: Number(localStorage.getItem('pd_toast_duration_ms') ?? '5000'),
    songZoom:        Number(localStorage.getItem('pd_song_toast_zoom')    ?? '1'),
    volumeZoom:      Number(localStorage.getItem('pd_volume_toast_zoom')  ?? '1'),
  }
}

const label: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: 14,
}

const numInput: React.CSSProperties = {
  width: 56, background: '#222', border: '1px solid #444', color: '#eee',
  borderRadius: 4, padding: '3px 6px', fontFamily: 'monospace', fontSize: 13,
}

export function DisplaySettingsPanel() {
  const [settings, setSettings] = useState<DisplaySettings>(readDisplaySettings)

  // Sync to localStorage and notify display window on every settings change
  useEffect(() => {
    localStorage.setItem('pd_toast_duration_ms', String(settings.toastDurationMs))
    localStorage.setItem('pd_song_toast_zoom',    String(settings.songZoom))
    localStorage.setItem('pd_volume_toast_zoom',  String(settings.volumeZoom))
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
          onChange={e => set({ toastDurationMs: Math.max(1, Number(e.target.value)) * 1000 })}
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
    </div>
  )
}
