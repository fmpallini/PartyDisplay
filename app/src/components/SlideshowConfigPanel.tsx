export interface SlideshowConfig {
  fixedSec:   number
  order:      'shuffle' | 'alpha'
  subfolders: boolean
}

export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  fixedSec:   5,
  order:      'alpha',
  subfolders: true,
}

interface Props {
  config:        SlideshowConfig
  onChange:      (c: SlideshowConfig) => void
  hasPhotos:     boolean
  showSubfolders?: boolean
}

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: 13,
}

const numInput: React.CSSProperties = {
  width: 52, background: '#242424', border: '1px solid #333', color: '#e8e8e8',
  borderRadius: 4, padding: '4px 6px', fontFamily: 'inherit', fontSize: 13,
}

export function SlideshowConfigPanel({ config, onChange, hasPhotos, showSubfolders = true }: Props) {
  function set(patch: Partial<SlideshowConfig>) {
    onChange({ ...config, ...patch })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Advance interval */}
      <label style={row}>
        Advance every
        <input
          type="number" min={1} max={3600} value={config.fixedSec}
          onChange={e => set({ fixedSec: Math.max(1, Number(e.target.value)) })}
          style={numInput}
        />
        seconds
      </label>

      {/* Photo order */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ color: '#666', fontSize: 12 }}>Order</span>
        <label style={{ ...row, cursor: 'pointer' }}>
          <input type="radio" checked={config.order === 'shuffle'} onChange={() => set({ order: 'shuffle' })} style={{ accentColor: '#1db954' }} />
          Shuffle
        </label>
        <label style={{ ...row, cursor: 'pointer' }}>
          <input type="radio" checked={config.order === 'alpha'} onChange={() => set({ order: 'alpha' })} style={{ accentColor: '#1db954' }} />
          Alphabetic
        </label>
      </div>

      {/* Subfolders — only meaningful for local file system */}
      {showSubfolders && (
        <label style={{ ...row, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.subfolders}
            onChange={e => set({ subfolders: e.target.checked })}
            style={{ accentColor: '#1db954' }}
          />
          Include subfolders
        </label>
      )}

      {!hasPhotos && (
        <p style={{ margin: 0, color: '#444', fontSize: 11 }}>
          Select a folder above to start the slideshow.
        </p>
      )}
    </div>
  )
}
