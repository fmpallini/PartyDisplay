import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { safeNum } from '../../lib/utils'
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
import { HelpPanel } from '../../components/HelpPanel'
import type { SlideshowConfig } from '../../components/SlideshowConfigPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'
import { useAuth } from '../../hooks/useAuth'
import { useFftData } from '../../hooks/useFftData'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'
import { useLocalPlayer } from '../../hooks/useLocalPlayer'
import type { PlaylistItem } from '../../hooks/useLocalPlayer'
import { useDlnaBrowser } from '../../hooks/useDlnaBrowser'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { advancePhoto, clearPhotos } from '../../hooks/useDisplaySync'

// ── Layout helpers ────────────────────────────────────────────────────────────

function Card({ label, right, noPad, children }: {
  label:     string
  right?:    React.ReactNode
  noPad?:    boolean
  children:  React.ReactNode
}) {
  return (
    <section style={cardShell}>
      <div style={cardHeader}>
        <span style={cardLabel}>{label}</span>
        {right}
      </div>
      <div style={{ padding: noPad ? 0 : '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  )
}

function ErrBanner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#e74c3c18', border: '1px solid #e74c3c33', borderRadius: 6, padding: '6px 10px', color: '#e74c3c', fontSize: 11 }}>
      {children}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardShell: React.CSSProperties = {
  background: '#181818', borderRadius: 8, border: '1px solid #242424', overflow: 'hidden',
}
const cardHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '7px 14px', borderBottom: '1px solid #1e1e1e',
}
const cardLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#555',
}
const chevronBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#555', cursor: 'pointer',
  fontSize: 11, padding: '0 2px', lineHeight: 1,
}
const pauseBtn = (paused: boolean): React.CSSProperties => ({
  background: paused ? '#e74c3c18' : '#1db95418',
  border: `1px solid ${paused ? '#e74c3c44' : '#1db95444'}`,
  color: paused ? '#e74c3c' : '#1db954',
  borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
})
const sourcePill = (active: boolean): React.CSSProperties => ({
  background:   active ? '#1db95418' : 'none',
  border:       `1px solid ${active ? '#1db95444' : '#2a2a2a'}`,
  color:        active ? '#1db954' : '#555',
  borderRadius: 4, padding: '2px 10px', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function readSlideshowConfig(): SlideshowConfig {
  return {
    fixedSec:   safeNum(localStorage.getItem('pd_slideshow_fixed_sec'), DEFAULT_SLIDESHOW_CONFIG.fixedSec),
    order:      (localStorage.getItem('pd_order') as SlideshowConfig['order']) ?? DEFAULT_SLIDESHOW_CONFIG.order,
    subfolders: localStorage.getItem('pd_subfolder') !== null ? localStorage.getItem('pd_subfolder') === 'true' : DEFAULT_SLIDESHOW_CONFIG.subfolders,
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error: authError, login, logout } = useAuth()
  const [captureError, setCaptureError]       = useState<string | null>(null)
  const [config, setConfigState]              = useState<SlideshowConfig>(readSlideshowConfig)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)
  const [slideshowPaused, setSlideshowPaused] = useState(false)
  const [settingsOpen, setSettingsOpen]       = useState(false)
  const [helpOpen, setHelpOpen]               = useState(false)

  const [source, setSource] = useState<'spotify' | 'local' | 'dlna'>(
    () => (localStorage.getItem('pd_audio_source') as 'spotify' | 'local' | 'dlna') ?? 'spotify'
  )
  const [localFolder,    setLocalFolderState] = useState<string | null>(
    () => localStorage.getItem('pd_local_audio_folder')
  )
  const [localRecursive, setLocalRecursive] = useState<boolean>(
    () => localStorage.getItem('pd_local_audio_recursive') !== 'false'
  )
  const [localPlaylist,  setLocalPlaylist]  = useState<PlaylistItem[]>([])

  const spotifyPlayer = useSpotifyPlayer(authenticated ? accessToken : null)
  const localPlayer   = useLocalPlayer(localPlaylist, source === 'local', 'pd_local_player')

  const dlnaBrowserMusic = useDlnaBrowser('pd_dlna_music')

  const [photoSource, setPhotoSourceState] = useState<'local' | 'dlna'>(
    () => (localStorage.getItem('pd_photo_source') as 'local' | 'dlna') ?? 'local'
  )
  const dlnaBrowserPhotos = useDlnaBrowser('pd_dlna_photos')

  function setPhotoSource(s: 'local' | 'dlna') {
    setPhotoSourceState(s)
    localStorage.setItem('pd_photo_source', s)
  }
  // DLNA HTTP URLs are routed through a local proxy server (127.0.0.1:29341)
  // so the webview can load them without CSP / WebView2 mixed-content issues.
  // The proxy strips its own host:port from the request path and re-fetches
  // the original URL via reqwest, forwarding Range headers for seeking.
  const DLNA_PROXY = 'http://127.0.0.1:29341'
  const toDlnaProxy = (url: string) => `${DLNA_PROXY}/${url.replace(/^https?:\/\//, '')}`

  // Memoized so useLocalPlayer's playlist-change effect doesn't fire every render
  const dlnaPlaylist = useMemo<PlaylistItem[]>(() =>
    dlnaBrowserMusic.items
      .filter(item => item.mime.startsWith('audio/'))
      .map(item => ({
        path:               toDlnaProxy(item.url),
        title:              item.title,
        artist:             item.artist    ?? undefined,
        albumArt:           item.album_art ? toDlnaProxy(item.album_art) : undefined,
        durationMs:         item.duration_ms ?? undefined,
        metadataPrefetched: true,
      })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [dlnaBrowserMusic.items])
  const dlnaPlayer = useLocalPlayer(dlnaPlaylist, source === 'dlna', 'pd_dlna_player')

  const player        = source === 'spotify' ? spotifyPlayer
                      : source === 'dlna'    ? dlnaPlayer
                      : localPlayer
  const bins    = useFftData()
  const library = usePhotoLibrary({ order: config.order, recursive: config.subfolders })

  // Notify display window whenever slideshow pause state changes (skip initial mount)
  const slideshowMountedRef = useRef(false)
  useEffect(() => {
    if (!slideshowMountedRef.current) { slideshowMountedRef.current = true; return }
    emit('slideshow-state', { paused: slideshowPaused }).catch(() => {})
  }, [slideshowPaused])

  // Persist display settings to localStorage and propagate to display window
  // whenever they change — including via hotkeys, regardless of panel visibility.
  useEffect(() => {
    localStorage.setItem('pd_toast_duration_ms',      String(displaySettings.toastDurationMs))
    localStorage.setItem('pd_song_toast_zoom',         String(displaySettings.songZoom))
    localStorage.setItem('pd_volume_toast_zoom',       String(displaySettings.volumeZoom))
    localStorage.setItem('pd_transition_effect',       displaySettings.transitionEffect)
    localStorage.setItem('pd_transition_duration_ms',  String(displaySettings.transitionDurationMs))
    localStorage.setItem('pd_image_fit',               displaySettings.imageFit)
    localStorage.setItem('pd_spectrum_visible',        String(displaySettings.spectrumVisible))
    localStorage.setItem('pd_spectrum_style',          displaySettings.spectrumStyle)
    localStorage.setItem('pd_spectrum_theme',          displaySettings.spectrumTheme)
    localStorage.setItem('pd_spectrum_height_pct',     String(displaySettings.spectrumHeightPct))
    localStorage.setItem('pd_battery_visible',         String(displaySettings.batteryVisible))
    localStorage.setItem('pd_battery_size',            String(displaySettings.batterySize))
    localStorage.setItem('pd_battery_position',        displaySettings.batteryPosition)
    localStorage.setItem('pd_track_overlay_visible',   String(displaySettings.trackOverlayVisible))
    localStorage.setItem('pd_track_font_size',         String(displaySettings.trackFontSize))
    localStorage.setItem('pd_track_position',          displaySettings.trackPosition)
    localStorage.setItem('pd_track_color',             displaySettings.trackColor)
    localStorage.setItem('pd_track_bg_color',          displaySettings.trackBgColor)
    localStorage.setItem('pd_track_bg_opacity',        String(displaySettings.trackBgOpacity))
    localStorage.setItem('pd_photo_counter_visible',   String(displaySettings.photoCounterVisible))
    localStorage.setItem('pd_cw_visible',              String(displaySettings.clockWeatherVisible))
    localStorage.setItem('pd_cw_position',             displaySettings.clockWeatherPosition)
    localStorage.setItem('pd_cw_time_format',          displaySettings.clockWeatherTimeFormat)
    localStorage.setItem('pd_cw_temp_unit',            displaySettings.clockWeatherTempUnit)
    localStorage.setItem('pd_cw_city',                 displaySettings.clockWeatherCity)
    localStorage.setItem('pd_lyrics_visible',          String(displaySettings.lyricsVisible))
    localStorage.setItem('pd_lyrics_size',             String(displaySettings.lyricsSize))
    localStorage.setItem('pd_lyrics_opacity',          String(displaySettings.lyricsOpacity))
    localStorage.setItem('pd_lyrics_position',         displaySettings.lyricsPosition)
    localStorage.setItem('pd_lyrics_split',            String(displaySettings.lyricsSplit))
    localStorage.setItem('pd_lyrics_split_side',       displaySettings.lyricsSplitSide)
    emit('display-settings-changed', displaySettings).catch(console.error)
  }, [displaySettings])

  // Emit DLNA photo URLs into the photo-list pipeline when the browsed
  // container changes or the user switches to DLNA photo source.
  useEffect(() => {
    if (photoSource !== 'dlna') return
    const photoUrls = dlnaBrowserPhotos.items
      .filter(item => item.mime.startsWith('image/'))
      .map(item => item.url)
    if (photoUrls.length > 0) {
      emit('photo-list', { paths: photoUrls }).catch(console.error)
    } else if (dlnaBrowserPhotos.server) {
      clearPhotos().catch(console.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlnaBrowserPhotos.items, photoSource])

  // When the user switches from DLNA back to local photos, re-watch the
  // current folder so the watcher re-emits the photo-list.
  useEffect(() => {
    if (photoSource === 'local' && library.folder) {
      library.setFolder(library.folder)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoSource])

  function setConfig(c: SlideshowConfig) {
    setConfigState(c)
    localStorage.setItem('pd_slideshow_fixed_sec', String(c.fixedSec))
    localStorage.setItem('pd_order',               c.order)
    localStorage.setItem('pd_subfolder',           String(c.subfolders))
  }

  // ── Photo navigation ──────────────────────────────────────────────────────
  const indexRef = useRef(-1)

  const showAt = useCallback((idx: number) => {
    if (library.photos.length === 0) return
    const i = ((idx % library.photos.length) + library.photos.length) % library.photos.length
    indexRef.current = i
    const photo = library.photos[i]
    advancePhoto(photo, i, library.photos.length).catch(console.error)
    if (config.order === 'alpha' && library.folder) {
      let map: Record<string, string> = {}
      try {
        const raw = localStorage.getItem('pd_last_photo')
        if (raw) map = JSON.parse(raw)
      } catch {
        // Corrupted localStorage — start fresh rather than crashing.
      }
      // Prune to at most 50 folders to prevent unbounded growth.
      const keys = Object.keys(map)
      if (keys.length >= 50) {
        map = Object.fromEntries(keys.slice(-49).map(k => [k, map[k]]))
      }
      map[library.folder] = photo
      localStorage.setItem('pd_last_photo', JSON.stringify(map))
    }
  }, [library.photos, library.folder, config.order])

  const doNext      = useCallback(() => showAt(indexRef.current + 1), [showAt])
  const doPrev      = useCallback(() => showAt(indexRef.current - 1), [showAt])
  const togglePause = useCallback(() => setSlideshowPaused(p => !p), [])

  useEffect(() => {
    if (library.photos.length === 0) {
      clearPhotos().catch(console.error)
      return
    }
    const startIdx = library.initialPhoto ? Math.max(0, library.photos.indexOf(library.initialPhoto)) : 0
    showAt(startIdx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.photos])

  useEffect(() => {
    const lastFolder = localStorage.getItem('pd_last_folder')
    if (lastFolder) library.setFolder(lastFolder)
  }, [])

  useEffect(() => {
    if (library.folder) library.setFolder(library.folder)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.subfolders])

  // ── Track / volume → display window ──────────────────────────────────────
  const prevTrackIdRef = useRef<string | null>(null)
  useEffect(() => {
    const track = player.track
    if (!track && prevTrackIdRef.current !== null) {
      prevTrackIdRef.current = null
      emit('track-cleared', {}).catch(console.error)
      return
    }
    if (track && track.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = track.id
      emit('track-changed', {
        name:      track.name,
        artists:   track.artists,
        albumArt:  track.albumArt,
        id:        track.id,
        duration:  track.duration,
        positionMs: player.positionMs,
        paused:    player.paused,
      }).catch(console.error)
    }
  }, [player.track?.id])

  const prevVolumeRef = useRef(player.volume)
  useEffect(() => {
    if (Math.abs(player.volume - prevVolumeRef.current) > 0.005) {
      prevVolumeRef.current = player.volume
      emit('volume-changed', { volume: player.volume }).catch(console.error)
    }
  }, [player.volume])

  const prevTickRef = useRef({ positionMs: -1, paused: true })
  useEffect(() => {
    const prev = prevTickRef.current
    if (prev.positionMs === player.positionMs && prev.paused === player.paused) return
    prevTickRef.current = { positionMs: player.positionMs, paused: player.paused }
    emit('playback-tick', { positionMs: player.positionMs, paused: player.paused }).catch(() => {})
  }, [player.positionMs, player.paused])

  // ── Slideshow interval ────────────────────────────────────────────────────
  useEffect(() => {
    if (library.photos.length === 0 || slideshowPaused) return
    const id = setInterval(doNext, config.fixedSec * 1000 + displaySettings.transitionDurationMs)
    return () => clearInterval(id)
  }, [config.fixedSec, displaySettings.transitionDurationMs, library.photos, slideshowPaused, doNext])

  // ── Audio capture ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!player.ready) return
    invoke('start_audio_capture').catch(e => setCaptureError(String(e)))
  }, [player.ready])

  const toggleSpectrum = useCallback(() => {
    setDisplaySettings(s => ({ ...s, spectrumVisible: !s.spectrumVisible }))
  }, [])

  const toggleTrackOverlay = useCallback(() => {
    setDisplaySettings(s => ({ ...s, trackOverlayVisible: !s.trackOverlayVisible }))
  }, [])

  const toggleBattery = useCallback(() => {
    setDisplaySettings(s => ({ ...s, batteryVisible: !s.batteryVisible }))
  }, [])

  const togglePhotoCounter = useCallback(() => {
    setDisplaySettings(s => ({ ...s, photoCounterVisible: !s.photoCounterVisible }))
  }, [])

  const toggleClockWeather = useCallback(() => {
    setDisplaySettings(s => ({ ...s, clockWeatherVisible: !s.clockWeatherVisible }))
  }, [])

  const toggleLyrics = useCallback(() => {
    setDisplaySettings(s => ({ ...s, lyricsVisible: !s.lyricsVisible }))
  }, [])

  const musicNext   = useCallback(() => { player.nextTrack()  }, [player.nextTrack])
  const musicPrev   = useCallback(() => { player.prevTrack()  }, [player.prevTrack])
  const musicToggle = useCallback(() => { player.togglePlay() }, [player.togglePlay])
  const volumeUp    = useCallback(() => { player.setVolume(Math.min(1, player.volume + 0.05)) }, [player.setVolume, player.volume])
  const volumeDown  = useCallback(() => { player.setVolume(Math.max(0, player.volume - 0.05)) }, [player.setVolume, player.volume])

  useHotkeys({ onNext: doNext, onPrev: doPrev, onTogglePause: togglePause, onToggleSpectrum: toggleSpectrum, onToggleTrackOverlay: toggleTrackOverlay, onToggleBattery: toggleBattery, onTogglePhotoCounter: togglePhotoCounter, onToggleClockWeather: toggleClockWeather, onToggleLyrics: toggleLyrics, onMusicPrev: musicPrev, onMusicToggle: musicToggle, onMusicNext: musicNext, onVolumeUp: volumeUp, onVolumeDown: volumeDown })

  useEffect(() => {
    const unlisten = listen<{ action: string }>('display-hotkey', ({ payload }) => {
      if (payload.action === 'next')     doNext()
      if (payload.action === 'prev')     doPrev()
      if (payload.action === 'pause')    togglePause()
      if (payload.action === 'spectrum') toggleSpectrum()
      if (payload.action === 'track')    toggleTrackOverlay()
      if (payload.action === 'battery')  toggleBattery()
      if (payload.action === 'counter')  togglePhotoCounter()
      if (payload.action === 'clock')    toggleClockWeather()
      if (payload.action === 'lyrics')        toggleLyrics()
      if (payload.action === 'music-next')    musicNext()
      if (payload.action === 'music-prev')    musicPrev()
      if (payload.action === 'music-toggle')  musicToggle()
      if (payload.action === 'vol-up')        volumeUp()
      if (payload.action === 'vol-down')      volumeDown()
    })
    return () => { unlisten.then(fn => fn()) }
  }, [doNext, doPrev, togglePause, toggleSpectrum, toggleTrackOverlay, toggleBattery, togglePhotoCounter, toggleClockWeather, toggleLyrics, musicNext, musicPrev, musicToggle, volumeUp, volumeDown])

  // Pause the outgoing player on source switch; user controls resume from there.
  useEffect(() => {
    if ((source === 'local' || source === 'dlna') && !spotifyPlayer.paused) spotifyPlayer.togglePlay()
    localStorage.setItem('pd_audio_source', source)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  const setLocalFolder = useCallback((folder: string) => {
    setLocalFolderState(folder)
    localStorage.setItem('pd_local_audio_folder', folder)
  }, [])

  useEffect(() => {
    if (!localFolder) return
    localStorage.setItem('pd_local_audio_recursive', String(localRecursive))
    invoke<string[]>('scan_audio_folder', { path: localFolder, recursive: localRecursive })
      .then(paths => setLocalPlaylist(paths.map(path => ({ path }))))
      .catch(err => console.error('[ControlPanel] scan_audio_folder failed:', err))
  }, [localFolder, localRecursive])

  // ── Render ────────────────────────────────────────────────────────────────

  const hasErrors = !!(authError || spotifyPlayer.error || localPlayer.error || dlnaPlayer.error || captureError)

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 13, background: '#0f0f0f', color: '#e8e8e8',
      height: '100vh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', minWidth: 380,
    }}>

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 46, flexShrink: 0,
        borderBottom: '1px solid #1a1a1a', background: '#0f0f0f',
      }}>
        <span style={{ color: '#1db954', fontWeight: 700, fontSize: 14, letterSpacing: -0.2 }}>
          Party Display
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setHelpOpen(true)}
            style={{ background: 'none', border: '1px solid #2a2a2a', color: '#555', cursor: 'pointer',
                     borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center',
                     justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
            title="Help"
          >?</button>
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      {/* Outer div ONLY scrolls — no flex here, otherwise flex-shrink
          compresses sibling cards instead of letting the container overflow */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Inner div handles the vertical flex layout */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: '10px 12px 28px', minHeight: 'min-content',
        }}>

        {/* Error banners */}
        {hasErrors && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {authError          && <ErrBanner>Auth: {authError}</ErrBanner>}
            {spotifyPlayer.error && <ErrBanner>Spotify: {spotifyPlayer.error}</ErrBanner>}
            {localPlayer.error   && <ErrBanner>Local: {localPlayer.error}</ErrBanner>}
            {dlnaPlayer.error    && <ErrBanner>DLNA: {dlnaPlayer.error}</ErrBanner>}
            {captureError        && <ErrBanner>Capture: {captureError}</ErrBanner>}
          </div>
        )}

        {/* ── Music card ──────────────────────────────────────────────── */}
        <Card label="Music">
          {/* Source picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: '#666', fontSize: 12 }}>Source</span>
            <button style={sourcePill(source === 'spotify')} onClick={() => setSource('spotify')}>Spotify</button>
            <button style={sourcePill(source === 'local')}   onClick={() => setSource('local')}>Local Files</button>
            <button style={sourcePill(source === 'dlna')}    onClick={() => setSource('dlna')}>DLNA</button>
          </div>

          {source === 'spotify' ? (
            /* ── Spotify ── */
            !authenticated ? (
              <LoginButton authenticated={authenticated} loading={loading} onLogin={login} onLogout={logout} />
            ) : !spotifyPlayer.ready ? (
              <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                Waiting for Spotify device…
              </p>
            ) : null
          ) : source === 'local' ? (
            /* ── Local Files ── */
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <FolderPicker
                  folder={localFolder}
                  photoCount={localPlaylist.length}
                  onPick={setLocalFolder}
                  itemLabel="track"
                  dialogTitle="Select audio folder"
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: '#aaa', paddingBottom: 2 }}>
                  <input
                    type="checkbox"
                    checked={localRecursive}
                    onChange={e => setLocalRecursive(e.target.checked)}
                    style={{ accentColor: '#1db954' }}
                  /> Subfolders
                </label>
              </div>
              {!localFolder && (
                <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                  Pick a folder to start playing.
                </p>
              )}
              {localFolder && localPlaylist.length === 0 && (
                <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                  No audio files found in this folder.
                </p>
              )}
            </>
          ) : (
            /* ── DLNA ── */
            <>
              {!dlnaBrowserMusic.server ? (
                /* Server picker */
                <>
                  <button
                    onClick={dlnaBrowserMusic.discover}
                    disabled={dlnaBrowserMusic.discovering}
                    style={{
                      background: '#1db95418', border: '1px solid #1db95444', color: '#1db954',
                      borderRadius: 4, padding: '4px 12px', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {dlnaBrowserMusic.discovering ? 'Searching…' : 'Discover DLNA Servers'}
                  </button>
                  {!dlnaBrowserMusic.discovering && dlnaBrowserMusic.servers.length === 0 && (
                    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                      No DLNA servers found. Press Discover to search.
                    </p>
                  )}
                  {dlnaBrowserMusic.servers.map(s => (
                    <button
                      key={s.location}
                      onClick={() => dlnaBrowserMusic.selectServer(s)}
                      style={{
                        background: 'none', border: '1px solid #2a2a2a', color: '#ccc',
                        borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </>
              ) : (
                /* Browser */
                <>
                  {/* Breadcrumb / back navigation */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      onClick={dlnaBrowserMusic.reset}
                      style={{ background: 'none', border: 'none', color: '#1db954', cursor: 'pointer', fontSize: 12, padding: 0 }}
                      title="Back to server list"
                    >
                      ⌂ {dlnaBrowserMusic.server.name}
                    </button>
                    {dlnaBrowserMusic.breadcrumb.map(c => (
                      <span key={c.id} style={{ color: '#555', fontSize: 11 }}>/ {c.title}</span>
                    ))}
                    {dlnaBrowserMusic.breadcrumb.length > 0 && (
                      <button
                        onClick={dlnaBrowserMusic.back}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, marginLeft: 4 }}
                      >
                        ← Back
                      </button>
                    )}
                  </div>

                  {dlnaBrowserMusic.loading && (
                    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Loading…</p>
                  )}
                  {dlnaBrowserMusic.error && <ErrBanner>{dlnaBrowserMusic.error}</ErrBanner>}

                  {/* Subfolders */}
                  {dlnaBrowserMusic.containers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => dlnaBrowserMusic.browse(c)}
                      style={{
                        background: 'none', border: '1px solid #2a2a2a', color: '#aaa',
                        borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                      }}
                    >
                      📁 {c.title}
                    </button>
                  ))}

                  {/* Audio item count */}
                  {dlnaBrowserMusic.items.filter(i => i.mime.startsWith('audio/')).length > 0 && (
                    <p style={{ margin: 0, color: '#555', fontSize: 11 }}>
                      {dlnaBrowserMusic.items.filter(i => i.mime.startsWith('audio/')).length} audio track(s) ready
                    </p>
                  )}

                  {/* Empty folder message */}
                  {!dlnaBrowserMusic.loading &&
                    dlnaBrowserMusic.containers.length === 0 &&
                    dlnaBrowserMusic.items.filter(i => i.mime.startsWith('audio/')).length === 0 && (
                    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Folder is empty.</p>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Zone 2: Playback — always visible ─────────────────────── */}
          <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NowPlaying track={player.track} paused={player.paused} />
            <PlayerControls
              track={player.track}
              paused={player.paused}
              positionMs={player.positionMs}
              shuffle={player.shuffle}
              repeat={player.repeat}
              togglePlay={player.togglePlay}
              nextTrack={player.nextTrack}
              prevTrack={player.prevTrack}
              seek={player.seek}
              toggleShuffle={player.toggleShuffle}
              toggleRepeat={player.toggleRepeat}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range" min={0} max={1} step={0.02}
                value={player.volume}
                onChange={e => player.setVolume(Number(e.target.value))}
                style={{ width: 100, accentColor: '#1db954', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ color: '#555', fontSize: 11, minWidth: 28 }}>
                {Math.round(player.volume * 100)}%
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SpectrumCanvas bins={bins} height={22}
                  renderStyle={displaySettings.spectrumStyle}
                  theme={displaySettings.spectrumTheme}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* ── Slideshow card ──────────────────────────────────────────── */}
        <Card
          label="Slideshow"
          right={
            <button style={pauseBtn(slideshowPaused)} onClick={togglePause} title="Space">
              {slideshowPaused ? 'PAUSED' : 'RUNNING'}
            </button>
          }
        >
          {/* Source toggle — always first */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#666', fontSize: 12 }}>Source</span>
            <button
              style={{
                background: photoSource === 'local' ? '#1db95418' : 'none',
                border: `1px solid ${photoSource === 'local' ? '#1db95444' : '#2a2a2a'}`,
                color: photoSource === 'local' ? '#1db954' : '#555',
                borderRadius: 4, padding: '2px 10px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              }}
              onClick={() => setPhotoSource('local')}
            >
              Local Folder
            </button>
            <button
              style={{
                background: photoSource === 'dlna' ? '#1db95418' : 'none',
                border: `1px solid ${photoSource === 'dlna' ? '#1db95444' : '#2a2a2a'}`,
                color: photoSource === 'dlna' ? '#1db954' : '#555',
                borderRadius: 4, padding: '2px 10px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              }}
              onClick={() => setPhotoSource('dlna')}
            >
              DLNA Server
            </button>
          </div>

          {photoSource === 'local' ? (
            <FolderPicker
              folder={library.folder}
              photoCount={library.photos.length}
              onPick={library.setFolder}
            />
          ) : (
            /* ── DLNA photo browser ── */
            <>
              {!dlnaBrowserPhotos.server ? (
                <>
                  <button
                    onClick={dlnaBrowserPhotos.discover}
                    disabled={dlnaBrowserPhotos.discovering}
                    style={{
                      background: '#1db95418', border: '1px solid #1db95444', color: '#1db954',
                      borderRadius: 4, padding: '4px 12px', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {dlnaBrowserPhotos.discovering ? 'Searching\u2026' : 'Discover DLNA Servers'}
                  </button>
                  {!dlnaBrowserPhotos.discovering && dlnaBrowserPhotos.servers.length === 0 && (
                    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                      No DLNA servers found. Press Discover to search.
                    </p>
                  )}
                  {dlnaBrowserPhotos.servers.map(s => (
                    <button
                      key={s.location}
                      onClick={() => dlnaBrowserPhotos.selectServer(s)}
                      style={{
                        background: 'none', border: '1px solid #2a2a2a', color: '#ccc',
                        borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      onClick={dlnaBrowserPhotos.reset}
                      style={{ background: 'none', border: 'none', color: '#1db954', cursor: 'pointer', fontSize: 12, padding: 0 }}
                    >
                      ⌂ {dlnaBrowserPhotos.server.name}
                    </button>
                    {dlnaBrowserPhotos.breadcrumb.map(c => (
                      <span key={c.id} style={{ color: '#555', fontSize: 11 }}>/ {c.title}</span>
                    ))}
                    {dlnaBrowserPhotos.breadcrumb.length > 0 && (
                      <button
                        onClick={dlnaBrowserPhotos.back}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, marginLeft: 4 }}
                      >
                        ← Back
                      </button>
                    )}
                  </div>
                  {dlnaBrowserPhotos.loading && <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Loading…</p>}
                  {dlnaBrowserPhotos.error && <ErrBanner>{dlnaBrowserPhotos.error}</ErrBanner>}
                  {dlnaBrowserPhotos.containers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => dlnaBrowserPhotos.browse(c)}
                      style={{
                        background: 'none', border: '1px solid #2a2a2a', color: '#aaa',
                        borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                      }}
                    >
                      {c.title}
                    </button>
                  ))}
                  {(() => {
                    const photoCount = dlnaBrowserPhotos.items.filter(i => i.mime.startsWith('image/')).length
                    return photoCount > 0
                      ? <p style={{ margin: 0, color: '#555', fontSize: 11 }}>{photoCount} photo(s) loaded</p>
                      : (!dlnaBrowserPhotos.loading && dlnaBrowserPhotos.containers.length === 0
                          ? <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Folder is empty.</p>
                          : null)
                  })()}
                </>
              )}
            </>
          )}

          <SlideshowConfigPanel
            config={config}
            onChange={setConfig}
            hasPhotos={library.photos.length > 0}
          />
        </Card>

        {/* ── Display window card ─────────────────────────────────────── */}
        <Card label="Display Window">
          <DisplayWindowControls />
        </Card>

        {/* ── Display settings card (collapsible) ─────────────────────── */}
        <Card
          label="Display Settings"
          right={
            <button style={chevronBtn} onClick={() => setSettingsOpen(o => !o)}>
              {settingsOpen ? '▲' : '▼'}
            </button>
          }
        >
          {settingsOpen && (
            <DisplaySettingsPanel settings={displaySettings} onChange={setDisplaySettings} />
          )}
          {!settingsOpen && (
            <p style={{ margin: 0, fontSize: 11, color: '#444' }}>
              Toasts · Transitions · Spectrum · Battery · Track · Clock · Lyrics
            </p>
          )}
        </Card>

        </div>{/* end inner flex column */}
      </div>{/* end scroll container */}

      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
