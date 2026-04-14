import type { SpectrumTheme, SpectrumStyle } from './SpectrumCanvas'
import { safeBool, safeEnum, safeNum } from '../lib/utils'
import { KEYS } from '../lib/storage-keys'

export type { SpectrumTheme, SpectrumStyle }

export type VisualizerMode = 'photos' | 'visualizer' | 'split'

const VISUALIZER_MODE_VALUES  = ['photos', 'visualizer', 'split'] as const
const VISUALIZER_SIDE_VALUES  = ['left', 'right'] as const

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
  visualizerMode:        VisualizerMode
  visualizerSplitSide:   'left' | 'right'
  visualizerPresetIndex: number
  batteryVisible:       boolean
  batterySize:          number
  batteryPosition:      TrackPosition
  trackOverlayVisible:  boolean
  trackFontSize:        number
  trackPosition:        TrackPosition
  trackColor:           string
  trackBgColor:         string
  trackBgOpacity:       number
  photoCounterVisible:  boolean
  clockWeatherVisible:    boolean
  clockWeatherPosition:   TrackPosition
  clockWeatherTimeFormat: '12h' | '24h'
  clockWeatherTempUnit:   'celsius' | 'fahrenheit'
  clockWeatherCity:       string
  lyricsVisible:          boolean
  lyricsSize:             number
  lyricsOpacity:          number
  lyricsPosition:         'center' | 'lower-third'
  lyricsSplit:            boolean
  lyricsSplitSide:        'left' | 'right'
}


const TRANSITION_EFFECT_VALUES = ['fade','slide-left','slide-right','slide-up','slide-down','zoom-in','zoom-out','blur','random'] as const
const IMAGE_FIT_VALUES          = ['cover', 'contain'] as const
const SPECTRUM_STYLE_VALUES     = ['bars', 'lines'] as const
const SPECTRUM_THEME_VALUES     = ['energy', 'cyan', 'fire', 'white', 'rainbow', 'purple'] as const
const TRACK_POSITION_VALUES     = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
const TIME_FORMAT_VALUES        = ['12h', '24h'] as const
const TEMP_UNIT_VALUES          = ['celsius', 'fahrenheit'] as const
const LYRICS_POSITION_VALUES    = ['center', 'lower-third'] as const
const LYRICS_SIDE_VALUES        = ['left', 'right'] as const

export function readDisplaySettings(): DisplaySettings {
  return {
    toastDurationMs:      safeNum(localStorage.getItem(KEYS.toastDurationMs),      5000),
    songZoom:             safeNum(localStorage.getItem(KEYS.songToastZoom),         1.7),
    volumeZoom:           safeNum(localStorage.getItem(KEYS.volumeToastZoom),       1.7),
    transitionEffect:     safeEnum(localStorage.getItem(KEYS.transitionEffect),     TRANSITION_EFFECT_VALUES, 'random'),
    transitionDurationMs: safeNum(localStorage.getItem(KEYS.transitionDurationMs), 500),
    imageFit:             safeEnum(localStorage.getItem(KEYS.imageFit),             IMAGE_FIT_VALUES,         'contain'),
    spectrumVisible:      safeBool(localStorage.getItem(KEYS.spectrumVisible), false),
    spectrumStyle:        safeEnum(localStorage.getItem(KEYS.spectrumStyle),        SPECTRUM_STYLE_VALUES,    'bars'),
    spectrumTheme:        safeEnum(localStorage.getItem(KEYS.spectrumTheme),        SPECTRUM_THEME_VALUES,    'energy'),
    spectrumHeightPct:    safeNum(localStorage.getItem(KEYS.spectrumHeightPct),     10),
    visualizerMode:        safeEnum(localStorage.getItem(KEYS.visualizerMode),        VISUALIZER_MODE_VALUES,  'photos'),
    visualizerSplitSide:   safeEnum(localStorage.getItem(KEYS.visualizerSplitSide),   VISUALIZER_SIDE_VALUES,  'right'),
    visualizerPresetIndex: safeNum(localStorage.getItem(KEYS.visualizerPresetIndex),  0),
    batteryVisible:       safeBool(localStorage.getItem(KEYS.batteryVisible), false),
    batterySize:          safeNum(localStorage.getItem(KEYS.batterySize),            36),
    batteryPosition:      safeEnum(localStorage.getItem(KEYS.batteryPosition),      TRACK_POSITION_VALUES,    'top-right'),
    trackOverlayVisible:  safeBool(localStorage.getItem(KEYS.trackOverlayVisible), true),
    trackFontSize:        safeNum(localStorage.getItem(KEYS.trackFontSize),         18),
    trackPosition:        safeEnum(localStorage.getItem(KEYS.trackPosition),        TRACK_POSITION_VALUES,    'top-left'),
    trackColor:           localStorage.getItem(KEYS.trackColor) ?? '#ffffff',
    trackBgColor:         localStorage.getItem(KEYS.trackBgColor) ?? '#000000',
    trackBgOpacity:       safeNum(localStorage.getItem(KEYS.trackBgOpacity),        0.5),
    photoCounterVisible:  safeBool(localStorage.getItem(KEYS.photoCounterVisible), true),
    clockWeatherVisible:    safeBool(localStorage.getItem(KEYS.cwVisible), true),
    clockWeatherPosition:   safeEnum(localStorage.getItem(KEYS.cwPosition),         TRACK_POSITION_VALUES,    'bottom-left'),
    clockWeatherTimeFormat: safeEnum(localStorage.getItem(KEYS.cwTimeFormat),      TIME_FORMAT_VALUES,       '24h'),
    clockWeatherTempUnit:   safeEnum(localStorage.getItem(KEYS.cwTempUnit),         TEMP_UNIT_VALUES,         'celsius'),
    clockWeatherCity:       localStorage.getItem(KEYS.cwCity) ?? '',
    lyricsVisible:          safeBool(localStorage.getItem(KEYS.lyricsVisible), false),
    lyricsSize:             safeNum(localStorage.getItem(KEYS.lyricsSize),    32),
    lyricsOpacity:          safeNum(localStorage.getItem(KEYS.lyricsOpacity), 0.9),
    lyricsPosition:         safeEnum(localStorage.getItem(KEYS.lyricsPosition),     LYRICS_POSITION_VALUES,   'lower-third'),
    lyricsSplit:            safeBool(localStorage.getItem(KEYS.lyricsSplit), false),
    lyricsSplitSide:        safeEnum(localStorage.getItem(KEYS.lyricsSplitSide),   LYRICS_SIDE_VALUES,       'right'),
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
  color: '#555', margin: '18px 0 4px',
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        <div>
          <span style={fieldLabel}>Position</span>
          <select value={settings.batteryPosition}
            onChange={e => set({ batteryPosition: e.target.value as TrackPosition })}
            style={selectInput}>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
          </select>
        </div>
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

      {/* ── Clock & weather ───────────────────────────────────────────────── */}
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

      {/* ── Lyrics ────────────────────────────────────────────────────────── */}
      <p style={subHead}>Lyrics <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(L to toggle)</span></p>

      <label style={{ ...checkRow, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.lyricsVisible}
          onChange={e => set({ lyricsVisible: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Show on display
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        <div>
          <span style={fieldLabel}>Position</span>
          <select value={settings.lyricsPosition}
            onChange={e => set({ lyricsPosition: e.target.value as 'center' | 'lower-third' })}
            style={selectInput}>
            <option value="lower-third">Lower third</option>
            <option value="center">Center</option>
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Font size</span>
          <label style={inlineRow}>
            <input type="number" min={16} max={72} step={2}
              value={settings.lyricsSize}
              onChange={e => set({ lyricsSize: Math.min(72, Math.max(16, n(e.target.value))) })}
              style={numInput}
            /> px
          </label>
        </div>
        <div>
          <span style={fieldLabel}>Opacity</span>
          <label style={inlineRow}>
            <input type="number" min={0.1} max={1} step={0.05}
              value={settings.lyricsOpacity}
              onChange={e => set({ lyricsOpacity: Math.min(1, Math.max(0.1, n(e.target.value))) })}
              style={numInput}
            />
          </label>
        </div>
      </div>

      <label style={{ ...checkRow, marginTop: 8, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.lyricsSplit}
          onChange={e => set({ lyricsSplit: e.target.checked })}
          style={{ accentColor: '#1db954', cursor: 'pointer' }}
        />
        Split view (photo + lyrics side by side)
      </label>

      {settings.lyricsSplit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          <div>
            <span style={fieldLabel}>Lyrics side</span>
            <select value={settings.lyricsSplitSide}
              onChange={e => set({ lyricsSplitSide: e.target.value as 'left' | 'right' })}
              style={selectInput}>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </div>
        </div>
      )}

    </div>
  )
}
