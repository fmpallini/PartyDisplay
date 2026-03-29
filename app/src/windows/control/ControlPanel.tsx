import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import LoginButton from '../../components/LoginButton'
import NowPlaying from '../../components/NowPlaying'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { FolderPicker } from '../../components/FolderPicker'
import { DisplayWindowControls } from '../../components/DisplayWindowControls'
import { PlayerControls } from '../../components/PlayerControls'
import { SlideshowConfigPanel, DEFAULT_SLIDESHOW_CONFIG } from '../../components/SlideshowConfigPanel'
import { DisplaySettingsPanel, readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { SlideshowConfig } from '../../components/SlideshowConfigPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'
import { useAuth } from '../../hooks/useAuth'
import { useFftData } from '../../hooks/useFftData'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { advancePhoto } from '../../hooks/useDisplaySync'

function readSlideshowConfig(): SlideshowConfig {
  return {
    fixedSec:   Number(localStorage.getItem('pd_slideshow_fixed_sec') ?? DEFAULT_SLIDESHOW_CONFIG.fixedSec),
    order:      (localStorage.getItem('pd_order') as SlideshowConfig['order'])
                  ?? DEFAULT_SLIDESHOW_CONFIG.order,
    subfolders: localStorage.getItem('pd_subfolder') === 'true',
  }
}

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error: authError, login, logout } = useAuth()
  const player  = useSpotifyPlayer(authenticated ? accessToken : null)
  const bins    = useFftData()
  const [captureError, setCaptureError]     = useState<string | null>(null)
  const [config, setConfigState]            = useState<SlideshowConfig>(readSlideshowConfig)
  const library = usePhotoLibrary({ order: config.order, recursive: config.subfolders })

  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)
  const [slideshowPaused, setSlideshowPaused] = useState(false)

  function setConfig(c: SlideshowConfig) {
    setConfigState(c)
    localStorage.setItem('pd_slideshow_fixed_sec', String(c.fixedSec))
    localStorage.setItem('pd_order',               c.order)
    localStorage.setItem('pd_subfolder',           String(c.subfolders))
  }

  // ── Photo navigation ──────────────────────────────────────────────────────
  // indexRef = index of the CURRENTLY displayed photo
  const indexRef = useRef(-1)

  const showAt = useCallback((idx: number) => {
    if (library.photos.length === 0) return
    const i = ((idx % library.photos.length) + library.photos.length) % library.photos.length
    indexRef.current = i
    const photo = library.photos[i]
    advancePhoto(photo).catch(console.error)
    if (config.order === 'alpha' && library.folder) {
      const raw = localStorage.getItem('pd_last_photo')
      const map: Record<string, string> = raw ? JSON.parse(raw) : {}
      map[library.folder] = photo
      localStorage.setItem('pd_last_photo', JSON.stringify(map))
    }
  }, [library.photos, library.folder, config.order])

  const doNext = useCallback(() => showAt(indexRef.current + 1), [showAt])
  const doPrev = useCallback(() => showAt(indexRef.current - 1), [showAt])
  const togglePause = useCallback(() => setSlideshowPaused(p => !p), [])

  // Seed indexRef from resume position (or 0) whenever the photo list changes
  useEffect(() => {
    if (library.photos.length === 0) return
    const startIdx = library.initialPhoto
      ? Math.max(0, library.photos.indexOf(library.initialPhoto))
      : 0
    showAt(startIdx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.photos]) // showAt and library.initialPhoto change with library.photos

  // Auto-load the last folder on startup
  useEffect(() => {
    const lastFolder = localStorage.getItem('pd_last_folder')
    if (lastFolder) library.setFolder(lastFolder)
  }, [])

  // Re-scan when subfolders toggle changes
  useEffect(() => {
    if (library.folder) library.setFolder(library.folder)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.subfolders])

  // ── Track-change → emit to display window ────────────────────────────────
  const prevTrackIdRef = useRef<string | null>(null)
  useEffect(() => {
    const id = player.track?.id ?? null
    if (id && id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = id
      emit('track-changed', {
        name:     player.track!.name,
        artists:  player.track!.artists,
        albumArt: player.track!.albumArt,
      }).catch(console.error)
    }
  }, [player.track?.id])

  // ── Volume change → emit to display window ────────────────────────────────
  const prevVolumeRef = useRef(player.volume)
  useEffect(() => {
    if (Math.abs(player.volume - prevVolumeRef.current) > 0.005) {
      prevVolumeRef.current = player.volume
      emit('volume-changed', { volume: player.volume }).catch(console.error)
    }
  }, [player.volume])

  // ── Fixed interval mode ───────────────────────────────────────────────────
  // Total cycle = display time + transition time (transition does NOT eat into display time)
  useEffect(() => {
    if (library.photos.length === 0 || slideshowPaused) return
    const id = setInterval(doNext, config.fixedSec * 1000 + displaySettings.transitionDurationMs)
    return () => clearInterval(id)
  }, [config.fixedSec, displaySettings.transitionDurationMs, library.photos, slideshowPaused, doNext])

  // ── Auto-start WASAPI capture when player is ready ───────────────────────
  useEffect(() => {
    if (!player.ready) return
    invoke('start_audio_capture').catch(e => setCaptureError(String(e)))
  }, [player.ready])

  const toggleSpectrum = useCallback(() => {
    setDisplaySettings(s => ({ ...s, spectrumVisible: !s.spectrumVisible }))
  }, [])

  // ── Hotkeys (this window) ─────────────────────────────────────────────────
  useHotkeys({ onNext: doNext, onPrev: doPrev, onTogglePause: togglePause, onToggleSpectrum: toggleSpectrum })

  // ── Hotkey relay from display window ──────────────────────────────────────
  useEffect(() => {
    const unlisten = listen<{ action: string }>('display-hotkey', ({ payload }) => {
      if (payload.action === 'next')     doNext()
      if (payload.action === 'prev')     doPrev()
      if (payload.action === 'pause')    togglePause()
      if (payload.action === 'spectrum') toggleSpectrum()
    })
    return () => { unlisten.then(fn => fn()) }
  }, [doNext, doPrev, togglePause, toggleSpectrum])

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

      {player.track && (
        <PlayerControls
          track={player.track}
          paused={player.paused}
          positionMs={player.positionMs}
          togglePlay={player.togglePlay}
          nextTrack={player.nextTrack}
          prevTrack={player.prevTrack}
          seek={player.seek}
        />
      )}

      {/* Volume slider */}
      {player.ready && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ fontSize: 16 }}>
            {player.volume === 0 ? '🔇' : player.volume < 0.4 ? '🔉' : '🔊'}
          </span>
          <input
            type="range" min={0} max={1} step={0.02}
            value={player.volume}
            onChange={e => player.setVolume(Number(e.target.value))}
            style={{ width: 120, accentColor: '#1db954', cursor: 'pointer' }}
          />
          <span style={{ color: '#666', fontSize: 12, minWidth: 32 }}>
            {Math.round(player.volume * 100)}%
          </span>
        </div>
      )}

      {captureError && <p style={{ color: '#e74c3c' }}>❌ Capture: {captureError}</p>}

      <SpectrumCanvas bins={bins} renderStyle={displaySettings.spectrumStyle} theme={displaySettings.spectrumTheme} />
      <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
        FFT: {bins.reduce((a, b) => a + Math.max(0, b + 100), 0).toFixed(0)} energy units
      </p>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <FolderPicker
          folder={library.folder}
          photoCount={library.photos.length}
          onPick={library.setFolder}
        />
        <SlideshowConfigPanel
          config={config}
          onChange={setConfig}
          hasPhotos={library.photos.length > 0}
          paused={slideshowPaused}
          onTogglePause={togglePause}
        />
        <DisplaySettingsPanel settings={displaySettings} onChange={setDisplaySettings} />
        <DisplayWindowControls />
      </div>
    </div>
  )
}
