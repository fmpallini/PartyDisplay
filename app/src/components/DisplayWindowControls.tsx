import { useDisplayWindow } from '../hooks/useDisplayWindow'

const btn: React.CSSProperties = {
  border: 'none', padding: '8px 18px', borderRadius: 4,
  cursor: 'pointer', fontWeight: 'bold', fontFamily: 'monospace',
}

export function DisplayWindowControls() {
  const {
    monitors, isOpen,
    selectedMonitor, setSelectedMonitor,
    fullscreen, setFullscreen,
    openWindow, closeWindow, error,
  } = useDisplayWindow()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

        {/* Monitor picker — only shown when >1 monitor */}
        {monitors.length > 1 && (
          <select
            value={selectedMonitor ?? ''}
            onChange={e => setSelectedMonitor(e.target.value)}
            style={{ background: '#222', color: '#eee', border: '1px solid #444',
                     padding: '6px 10px', borderRadius: 4, fontFamily: 'monospace' }}
          >
            {monitors.map(m => (
              <option key={m.name} value={m.name}>
                {m.name}{m.is_primary ? ' (primary)' : ''} — {m.width}×{m.height}
              </option>
            ))}
          </select>
        )}

        {/* Fullscreen toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={fullscreen}
            onChange={e => setFullscreen(e.target.checked)}
          />
          Fullscreen
        </label>

        {/* Open / Close */}
        {!isOpen ? (
          <button
            onClick={() => openWindow()}
            style={{ ...btn, background: '#1db954', color: '#000' }}
          >
            Open Display
          </button>
        ) : (
          <button
            onClick={closeWindow}
            style={{ ...btn, background: '#444', color: '#eee' }}
          >
            Close Display
          </button>
        )}

        {/* Re-open on different monitor / toggle fullscreen while open */}
        {isOpen && (
          <button
            onClick={() => openWindow()}
            style={{ ...btn, background: '#333', color: '#aaa', fontSize: 12 }}
          >
            Re-apply
          </button>
        )}
      </div>

      {monitors.length === 0 && (
        <p style={{ color: '#666', fontSize: 12, margin: 0 }}>Detecting monitors…</p>
      )}
      {monitors.length === 1 && (
        <p style={{ color: '#666', fontSize: 12, margin: 0 }}>
          1 monitor detected — double-click display window to toggle fullscreen
        </p>
      )}
      {error && <p style={{ color: '#e74c3c', fontSize: 12, margin: 0 }}>❌ {error}</p>}
    </div>
  )
}
