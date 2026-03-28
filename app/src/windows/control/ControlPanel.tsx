import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import LoginButton from '../../components/LoginButton'
import NowPlaying from '../../components/NowPlaying'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { useAuth } from '../../hooks/useAuth'
import { useFftData } from '../../hooks/useFftData'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error: authError, login, logout } = useAuth()
  const player = useSpotifyPlayer(authenticated ? accessToken : null)
  const bins   = useFftData()
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

  async function startCapture() {
    try {
      await invoke('start_audio_capture')
      setCapturing(true)
    } catch (e) {
      setCaptureError(String(e))
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 24, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h2 style={{ color: '#1db954', margin: '0 0 20px' }}>Party Display</h2>

      <LoginButton
        authenticated={authenticated}
        loading={loading}
        onLogin={login}
        onLogout={logout}
      />

      {authError    && <p style={{ color: '#e74c3c' }}>❌ Auth: {authError}</p>}
      {player.error && <p style={{ color: '#e74c3c' }}>❌ Player: {player.error}</p>}

      {authenticated && player.ready && (
        <p style={{ color: '#1db954', marginTop: 8 }}>
          ✅ Connected — device_id: {player.deviceId}
        </p>
      )}

      <NowPlaying track={player.track} paused={player.paused} />

      {player.ready && !capturing && (
        <button
          onClick={startCapture}
          style={{ background: '#1db954', border: 'none', padding: '8px 20px', borderRadius: 4,
                   cursor: 'pointer', fontWeight: 'bold', marginTop: 8 }}
        >
          Start WASAPI Capture
        </button>
      )}
      {capturing && <p style={{ color: '#1db954', marginTop: 8 }}>✅ Capturing — play a track</p>}
      {captureError && <p style={{ color: '#e74c3c' }}>❌ {captureError}</p>}

      <SpectrumCanvas bins={bins} />
      <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
        FFT: {bins.reduce((a, b) => a + Math.max(0, b + 100), 0).toFixed(0)} energy units
      </p>
    </div>
  )
}
