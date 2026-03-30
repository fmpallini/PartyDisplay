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

export type TrackPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

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
  trackOverlayVisible:  boolean
  trackFont:            string
  trackFontSize:        number
  trackPosition:        TrackPosition
  trackColor:           string
  trackBgColor:         string
  trackBgOpacity:       number
  photoCounterVisible:  boolean
}

export function readDisplaySettings(): DisplaySettings {
  return {
    toastDurationMs:      Number(localStorage.getItem('pd_toast_duration_ms')      ?? '5000'),
    songZoom:             Number(localStorage.getItem('pd_song_toast_zoom')         ?? '1.7'),
    volumeZoom:           Number(localStorage.getItem('pd_volume_toast_zoom')       ?? '1.7'),
    transitionEffect:     (localStorage.getItem('pd_transition_effect') as TransitionEffect) ?? 'random',
    transitionDurationMs: Number(localStorage.getItem('pd_transition_duration_ms') ?? '500'),
    imageFit:             (localStorage.getItem('pd_image_fit') as ImageFit)         ?? 'contain',
    spectrumVisible:      localStorage.getItem('pd_spectrum_visible') === 'true',
    spectrumStyle:        (localStorage.getItem('pd_spectrum_style') as SpectrumStyle) ?? 'bars',
    spectrumTheme:        (localStorage.getItem('pd_spectrum_theme') as SpectrumTheme) ?? 'energy',
    spectrumHeightPct:    Number(localStorage.getItem('pd_spectrum_height_pct') ?? '10'),
    batteryVisible:       localStorage.getItem('pd_battery_visible') === 'true',
    batterySize:          Number(localStorage.getItem('pd_battery_size') ?? '36'),
    trackOverlayVisible:  (localStorage.getItem('pd_track_overlay_visible') ?? 'true') === 'true',
    trackFont:            localStorage.getItem('pd_track_font') ?? 'system-ui',
    trackFontSize:        Number(localStorage.getItem('pd_track_font_size') ?? '14'),
    trackPosition:        (localStorage.getItem('pd_track_position') as TrackPosition) ?? 'top-left',
    trackColor:           localStorage.getItem('pd_track_color') ?? '#ffffff',
    trackBgColor:         localStorage.getItem('pd_track_bg_color') ?? '#000000',
    trackBgOpacity:       Number(localStorage.getItem('pd_track_bg_opacity') ?? '0.5'),
    photoCounterVisible:  localStorage.getItem('pd_photo_counter_visible') !== 'false',
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
  { value: 'energy',  label: 'Energy (green→red)' },
  { value: 'cyan',    label: 'Cyan'               },
  { value: 'fire',    label: 'Fire'               },
  { value: 'white',   label: 'White'              },
  { value: 'rainbow', label: 'Rainbow'            },
  { value: 'purple',  label: 'Purple'             },
]

// ── Shared style primitives ───────────────────────────────────────────────────

const fieldLabel: React.CSSProperties = {
  fontSize: 11, color: '#777', marginBottom: 3, display: 'block',
}

const numInput: React.CSSProperties = {
  width: 52, background: '#242424', border: '1px solid #333', color: '#e8e8e8',
  borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit', fontSize: 12,
}

const selectInput: React.CSSProperties = {
  width: '100%', background: '#242424', border: '1px solid #333', color: '#e8e8e8',
  borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
}

const inlineRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, color: '#ccc', fontSize: 12,
}

const subHead: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2,
  color: '#555', margin: '6px 0 4px',
}

const checkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#ccc', fontSize: 13,
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  settings: DisplaySettings
  onChange: (s: DisplaySettings) => void
}

export function DisplaySettingsPanel({ settings, onChange }: Props) {
  function set(patch: Partial<DisplaySettings>) {
    onChange({ ...settings, ...patch })
  }

  function n(v: string): number {
    const x = Number(v)
    return isNaN(x) ? 0 : x
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── 2-column grid for the 6 main controls ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>

        <div>
          <span style={fieldLabel}>Toast duration</span>
          <label style={inlineRow}>
            <input type="number" min={1} max={60}
              value={Math.round(settings.toastDurationMs / 1000)}
              onChange={e => set({ toastDurationMs: Math.min(60, Math.max(1, n(e.target.value))) * 1000 })}
              style={numInput}
            /> s
          </label>
        </div>

        <div>
          <span style={fieldLabel}>Image fit</span>
          <select value={settings.imageFit} onChange={e => set({ imageFit: e.target.value as ImageFit })} style={selectInput}>
            <option value="cover">Fill (crop)</option>
            <option value="contain">Fit (letterbox)</option>
          </select>
        </div>

        <div>
          <span style={fieldLabel}>Song toast size</span>
          <label style={inlineRow}>
            <input type="number" min={0.5} max={3} step={0.1}
              value={settings.songZoom}
              onChange={e => set({ songZoom: Math.min(3, Math.max(0.5, n(e.target.value))) })}
              style={numInput}
            /> ×
          </label>
        </div>

        <div>
          <span style={fieldLabel}>Volume toast size</span>
          <label style={inlineRow}>
            <input type="number" min={0.5} max={3} step={0.1}
              value={settings.volumeZoom}
              onChange={e => set({ volumeZoom: Math.min(3, Math.max(0.5, n(e.target.value))) })}
              style={numInput}
            /> ×
          </label>
        </div>

        <div>
          <span style={fieldLabel}>Transition</span>
          <select value={settings.transitionEffect}
            onChange={e => set({ transitionEffect: e.target.value as TransitionEffect })}
            style={selectInput}
          >
            {TRANSITION_EFFECTS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <span style={fieldLabel}>Transition duration</span>
          <label style={inlineRow}>
            <input type="number" min={0.1} max={5} step={0.1}
              value={settings.transitionDurationMs / 1000}
              onChange={e => set({ transitionDurationMs: Math.min(5000, Math.max(100, Math.round(n(e.target.value) * 1000))) })}
              style={numInput}
            /> s
          </label>
        </div>

      </div>

      {/* ── Spectrum ──────────────────────────────────────────────────── */}
      <p style={subHead}>Spectrum <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(S to toggle)</span></p>

      <label style={{ ...checkRow, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.spectrumVisible}
          onChange={e => set({ spectrumVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show on display
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        <div>
          <span style={fieldLabel}>Style</span>
          <select value={settings.spectrumStyle} onChange={e => set({ spectrumStyle: e.target.value as SpectrumStyle })} style={selectInput}>
            <option value="bars">Bars</option>
            <option value="lines">Lines</option>
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Theme</span>
          <select value={settings.spectrumTheme} onChange={e => set({ spectrumTheme: e.target.value as SpectrumTheme })} style={selectInput}>
            {SPECTRUM_THEMES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Height</span>
          <label style={inlineRow}>
            <input type="number" min={5} max={50} step={1}
              value={settings.spectrumHeightPct}
              onChange={e => set({ spectrumHeightPct: Math.min(50, Math.max(5, n(e.target.value))) })}
              style={numInput}
            /> % of screen
          </label>
        </div>
      </div>

      {/* ── Battery ───────────────────────────────────────────────────── */}
      <p style={subHead}>Battery</p>

      <label style={{ ...checkRow, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.batteryVisible}
          onChange={e => set({ batteryVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show on display
      </label>

      <div>
        <span style={fieldLabel}>Icon size</span>
        <label style={inlineRow}>
          <input type="number" min={16} max={80} step={2}
            value={settings.batterySize}
            onChange={e => set({ batterySize: Math.min(80, Math.max(16, n(e.target.value))) })}
            style={numInput}
          /> px
        </label>
      </div>

      {/* ── Track overlay ─────────────────────────────────────────────── */}
      <p style={subHead}>Track overlay <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(T to toggle)</span></p>

      <label style={{ ...checkRow, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.trackOverlayVisible}
          onChange={e => set({ trackOverlayVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show on display
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        <div>
          <span style={fieldLabel}>Font</span>
          <select value={settings.trackFont} onChange={e => set({ trackFont: e.target.value })} style={selectInput}>
            <option value="system-ui">System UI</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
            <option value="Impact, sans-serif">Impact</option>
            <option value="'Courier New', monospace">Courier</option>
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Font size</span>
          <label style={inlineRow}>
            <input type="number" min={10} max={96} step={2}
              value={settings.trackFontSize}
              onChange={e => set({ trackFontSize: Math.min(96, Math.max(10, n(e.target.value))) })}
              style={numInput}
            /> px
          </label>
        </div>
        <div>
          <span style={fieldLabel}>Position</span>
          <select value={settings.trackPosition} onChange={e => set({ trackPosition: e.target.value as TrackPosition })} style={selectInput}>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
          </select>
        </div>
        <div>
          <span style={fieldLabel}>BG opacity</span>
          <label style={inlineRow}>
            <input type="number" min={0} max={1} step={0.05}
              value={settings.trackBgOpacity}
              onChange={e => set({ trackBgOpacity: Math.min(1, Math.max(0, n(e.target.value))) })}
              style={numInput}
            />
          </label>
        </div>
        <div>
          <span style={fieldLabel}>Text color</span>
          <label style={inlineRow}>
            <input type="color" value={settings.trackColor}
              onChange={e => set({ trackColor: e.target.value })}
              style={{ width: 36, height: 28, padding: 2, background: '#242424', border: '1px solid #333', borderRadius: 4, cursor: 'pointer' }}
            />
            <span style={{ color: '#666', fontSize: 11 }}>{settings.trackColor}</span>
          </label>
        </div>
        <div>
          <span style={fieldLabel}>BG color</span>
          <label style={inlineRow}>
            <input type="color" value={settings.trackBgColor}
              onChange={e => set({ trackBgColor: e.target.value })}
              style={{ width: 36, height: 28, padding: 2, background: '#242424', border: '1px solid #333', borderRadius: 4, cursor: 'pointer' }}
            />
            <span style={{ color: '#666', fontSize: 11 }}>{settings.trackBgColor}</span>
          </label>
        </div>
      </div>

      {/* ── Photo counter ─────────────────────────────────────────────── */}
      <p style={subHead}>Photo counter <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(P to toggle)</span></p>

      <label style={{ ...checkRow, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.photoCounterVisible}
          onChange={e => set({ photoCounterVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show on display
      </label>

    </div>
  )
}
