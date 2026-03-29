import { useDisplayWindow } from '../hooks/useDisplayWindow'

export function DisplayWindowControls() {
  const {
    monitors, isOpen,
    selectedMonitor, setSelectedMonitor,
    fullscreen, setFullscreen,
    openWindow, closeWindow, error,
  } = useDisplayWindow()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Monitor + fullscreen row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {monitors.length > 1 && (
          <select
            value={selectedMonitor ?? ''}
            onChange={e => setSelectedMonitor(e.target.value)}
            style={selectStyle}
          >
            {monitors.map(m => (
              <option key={m.name} value={m.name}>
                {m.name}{m.is_primary ? ' (primary)' : ''} — {m.width}×{m.height}
              </option>
            ))}
          </select>
        )}
        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={fullscreen}
            onChange={e => setFullscreen(e.target.checked)}
            style={{ accentColor: '#1db954', cursor: 'pointer' }}
          />
          Fullscreen
        </label>
      </div>

      {/* Open / Close / Re-apply row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isOpen ? (
          <button onClick={() => openWindow()} style={{ ...btnBase, background: '#1db954', color: '#000', fontWeight: 700 }}>
            Open Display
          </button>
        ) : (
          <>
            <button onClick={closeWindow} style={{ ...btnBase, background: '#2a2a2a', color: '#aaa', border: '1px solid #333' }}>
              Close Display
            </button>
            <button onClick={() => openWindow()} style={{ ...btnBase, background: 'transparent', color: '#666', border: '1px solid #2a2a2a', fontSize: 11 }}>
              Re-apply
            </button>
          </>
        )}
      </div>

      {/* Status hints */}
      {monitors.length === 0 && <p style={hint}>Detecting monitors…</p>}
      {monitors.length === 1 && <p style={hint}>1 monitor — double-click display window to toggle fullscreen</p>}
      {error && <p style={{ ...hint, color: '#e74c3c' }}>{error}</p>}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  background: '#242424', color: '#e8e8e8', border: '1px solid #333',
  padding: '5px 8px', borderRadius: 5, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
}

const checkLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#ccc', fontSize: 13,
}

const btnBase: React.CSSProperties = {
  border: 'none', padding: '6px 14px', borderRadius: 5,
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
}

const hint: React.CSSProperties = {
  margin: 0, fontSize: 11, color: '#555',
}
