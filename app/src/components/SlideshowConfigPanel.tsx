export interface SlideshowConfig {
  fixedSec:   number
  order:      'shuffle' | 'alpha'
  subfolders: boolean
}

export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  fixedSec:   5,
  order:      'shuffle',
  subfolders: false,
}

interface Props {
  config:         SlideshowConfig
  onChange:       (c: SlideshowConfig) => void
  hasPhotos:      boolean
  paused:         boolean
  onTogglePause:  () => void
}

const label: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#ccc', fontSize: 14,
}

const numInput: React.CSSProperties = {
  width: 56, background: '#222', border: '1px solid #444', color: '#eee',
  borderRadius: 4, padding: '3px 6px', fontFamily: 'monospace', fontSize: 13,
}

export function SlideshowConfigPanel({ config, onChange, hasPhotos, paused, onTogglePause }: Props) {
  function set(patch: Partial<SlideshowConfig>) {
    onChange({ ...config, ...patch })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Slideshow
        </p>
        <button
          onClick={onTogglePause}
          title="Space bar"
          style={{
            background: paused ? '#e74c3c22' : '#1db95422',
            border: `1px solid ${paused ? '#e74c3c' : '#1db954'}`,
            color: paused ? '#e74c3c' : '#1db954',
            borderRadius: 4, padding: '2px 10px', cursor: 'pointer',
            fontFamily: 'monospace', fontSize: 12,
          }}
        >
          {paused ? '⏸ Paused' : '▶ Running'}
        </button>
      </div>

      {/* Advance interval */}
      <label style={label}>
        Advance every
        <input
          type="number" min={1} max={3600} value={config.fixedSec}
          onChange={e => set({ fixedSec: Math.max(1, Number(e.target.value)) })}
          style={numInput}
        />
        seconds
      </label>

      {/* Photo order */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
        <span style={{ color: '#888', fontSize: 12 }}>Order:</span>
        <label style={label}>
          <input type="radio" checked={config.order === 'shuffle'} onChange={() => set({ order: 'shuffle' })} />
          Shuffle
        </label>
        <label style={label}>
          <input type="radio" checked={config.order === 'alpha'} onChange={() => set({ order: 'alpha' })} />
          Alphabetic
        </label>
      </div>

      {/* Subfolders */}
      <label style={label}>
        <input
          type="checkbox"
          checked={config.subfolders}
          onChange={e => set({ subfolders: e.target.checked })}
        />
        Include subfolders
      </label>

      {!hasPhotos && (
        <p style={{ margin: 0, color: '#666', fontSize: 12 }}>Select a photo folder above to start the slideshow.</p>
      )}
    </div>
  )
}
