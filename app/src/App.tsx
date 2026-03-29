import { useEffect, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import ControlPanel from './windows/control/ControlPanel'
import DisplayWindow from './windows/display/DisplayWindow'

const CLIENT_ID_MISSING = !import.meta.env.VITE_SPOTIFY_CLIENT_ID

function MissingClientIdError() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', padding: '32px', background: '#0f0f0f', color: '#e0e0e0',
      fontFamily: 'monospace', textAlign: 'center', gap: '16px',
    }}>
      <div style={{ fontSize: '32px' }}>⚠️</div>
      <h2 style={{ margin: 0, color: '#e74c3c', fontSize: '16px', letterSpacing: '0.05em' }}>
        SPOTIFY CLIENT ID NOT CONFIGURED
      </h2>
      <p style={{ margin: 0, color: '#aaa', maxWidth: '360px', lineHeight: 1.6, fontSize: '13px' }}>
        The app was built without a Spotify Client ID and cannot connect to Spotify.
      </p>
      <div style={{
        background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px',
        padding: '16px 20px', textAlign: 'left', maxWidth: '420px', width: '100%', fontSize: '12px', lineHeight: 1.8,
      }}>
        <div style={{ color: '#1db954', marginBottom: '8px', fontWeight: 'bold' }}>How to fix:</div>
        <div style={{ color: '#ccc' }}>
          1. Create a Spotify app at{' '}
          <span style={{ color: '#1db954' }}>developer.spotify.com/dashboard</span>
        </div>
        <div style={{ color: '#ccc' }}>2. Copy your <strong style={{ color: '#fff' }}>Client ID</strong></div>
        <div style={{ color: '#ccc' }}>3. Set it before building:</div>
        <div style={{
          background: '#111', borderRadius: '4px', padding: '8px 12px', margin: '6px 0',
          color: '#f0f0f0', fontFamily: 'monospace', fontSize: '11px',
        }}>
          # .env.local (in the app/ folder)<br />
          VITE_SPOTIFY_CLIENT_ID=your_client_id_here
        </div>
        <div style={{ color: '#ccc' }}>4. Rebuild and run the app</div>
        <div style={{ marginTop: '12px', color: '#888', fontSize: '11px' }}>
          See README.txt (included in the release zip) for full step-by-step instructions.
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    setLabel(getCurrentWebviewWindow().label)
  }, [])

  if (CLIENT_ID_MISSING) return <MissingClientIdError />
  if (label === null) return null
  if (label === 'display') return <DisplayWindow />
  return <ControlPanel />
}
