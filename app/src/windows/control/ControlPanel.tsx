import { useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import LoginButton from '../../components/LoginButton'
import NowPlaying from '../../components/NowPlaying'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { FolderPicker } from '../../components/FolderPicker'
import { DisplayWindowControls } from '../../components/DisplayWindowControls'
import { useAuth } from '../../hooks/useAuth'
import { useFftData } from '../../hooks/useFftData'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useBeatScheduler } from '../../hooks/useBeatScheduler'
import { advancePhoto } from '../../hooks/useDisplaySync'

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error: authError, login, logout } = useAuth()
  const player  = useSpotifyPlayer(authenticated ? accessToken : null)
  const bins    = useFftData()
  const library = usePhotoLibrary()

  const [capturing, setCapturing]       = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const photoIndexRef = useRef(0)

  async function startCapture() {
    try {
      await invoke('start_audio_capture')
      setCapturing(true)
    } catch (e) {
      setCaptureError(String(e))
    }
  }

  useBeatScheduler({
    trackId:     player.track?.id ?? null,
    positionMs:  player.positionMs,
    accessToken: accessToken,
    beatsPerAdvance: 4,
    onBeat: () => {
      if (library.photos.length === 0) return
      const idx  = photoIndexRef.current % library.photos.length
      const photo = library.photos[idx]
      photoIndexRef.current = idx + 1
      advancePhoto(photo).catch(console.error)
    },
  })

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
      {capturing    && <p style={{ color: '#1db954', marginTop: 8 }}>✅ Capturing — play a track</p>}
      {captureError && <p style={{ color: '#e74c3c' }}>❌ {captureError}</p>}

      <SpectrumCanvas bins={bins} />
      <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
        FFT: {bins.reduce((a, b) => a + Math.max(0, b + 100), 0).toFixed(0)} energy units
      </p>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FolderPicker
          folder={library.folder}
          photoCount={library.photos.length}
          onPick={library.setFolder}
        />
        <DisplayWindowControls />
      </div>
    </div>
  )
}
