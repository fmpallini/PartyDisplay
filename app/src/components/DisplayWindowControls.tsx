import { useDisplayWindow } from '../hooks/useDisplayWindow'
import { invoke } from '@tauri-apps/api/core'
import { message } from '@tauri-apps/plugin-dialog'

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

      {/* Open / Close row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {!isOpen ? (
          <button onClick={() => openWindow()} style={{ ...btnBase, background: '#1db954', color: '#000', fontWeight: 700 }}>
            Open Display
          </button>
        ) : (
          <button onClick={closeWindow} style={{ ...btnBase, background: '#2a2a2a', color: '#aaa', border: '1px solid #333' }}>
            Close Display
          </button>
        )}
        <button 
          onClick={() => {
            message('Tip for Miracast audio:\n\nIf the sound doesn\'t automatically play on your TV after connecting, click the Speaker icon in your Windows taskbar (bottom right) and select your TV as the output device.\n\nThe visualizer will automatically switch to the new audio output!', { title: 'Cast to TV Tips', kind: 'info' })
              .then(() => invoke('trigger_cast_flyout'))
              .catch(console.error)
          }} 
          style={{ ...btnBase, background: '#2a2a2a', color: '#aaa', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: 4 }}
          title="Opens the Windows Cast menu (Win+K) to connect to a Miracast display (Roku, Fire Stick, Smart TVs)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
            <polyline points="17 2 12 7 7 2"></polyline>
          </svg>
          Cast to TV
        </button>
        <button 
          onClick={() => {
            message('To cast to a Chromecast device:\n\n1. Open Google Chrome or Microsoft Edge.\n2. Click the 3-dots menu (⋮) in the top right.\n3. Select "Cast..." (or "Save and share > Cast").\n4. Click the "Sources" dropdown and select "Cast screen".\n5. Choose your Chromecast device from the list.\n\nYour entire screen (including the Party Display window) will now be mirrored to your TV!', { title: 'Chromecast Instructions', kind: 'info' }).catch(console.error)
          }} 
          style={{ ...btnBase, background: '#2a2a2a', color: '#aaa', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: 4 }}
          title="Show instructions for casting to a Chromecast device"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path>
            <line x1="2" y1="20" x2="2.01" y2="20"></line>
          </svg>
          Chromecast
        </button>
      </div>

      {/* Status hints */}
      {monitors.length === 0 && <p style={hint}>Detecting monitors…</p>}
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
