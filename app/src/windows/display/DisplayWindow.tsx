import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useBattery } from '../../hooks/useBattery'
import type { BatteryStatus } from '../../hooks/useBattery'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'
import VisualizerCanvas from '../../components/VisualizerCanvas'
import { BatteryWidget } from '../../components/BatteryWidget'
import { readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'
import { useWeather } from '../../hooks/useWeather'
import { ClockWeatherWidget } from '../../components/ClockWeatherWidget'
import { useLyrics } from '../../hooks/useLyrics'
import { LyricsOverlay } from '../../components/LyricsOverlay'
import { LyricsSplitPanel } from '../../components/LyricsSplitPanel'
import type { TrackInfo } from '../../lib/player-types'

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary({ order: 'shuffle', recursive: false })
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)
  const [currentTrack,    setCurrentTrack]    = useState<TrackInfo | null>(null)
  const [positionMs,      setPositionMs]      = useState(0)
  const [isPaused,        setIsPaused]        = useState(false)
  const [slideshowPaused, setSlideshowPaused] = useState(false)
  const [photoCounter, setPhotoCounter] = useState<{ index: number; total: number } | null>(null)
  const battery = useBattery()
  const [weather, weatherError] = useWeather(displaySettings.clockWeatherTempUnit, displaySettings.clockWeatherCity)

  // Start WASAPI loopback capture unconditionally — needed for DLNA, local audio, and Spotify.
  useEffect(() => {
    invoke('start_audio_capture').catch(console.error)
  }, [])

  const [isFullscreen, setIsFullscreen] = useState(false)

  function handleDoubleClick() {
    const next = !isFullscreen
    setIsFullscreen(next)
    invoke('set_display_fullscreen', { fullscreen: next }).catch(console.error)
    emit('fullscreen-changed', { fullscreen: next }).catch(console.error)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsFullscreen(false)
        invoke('exit_display_fullscreen').catch(console.error)
        emit('fullscreen-changed', { fullscreen: false }).catch(console.error)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Live-update display settings from control panel
  useEffect(() => {
    const unlisten = listen<DisplaySettings>('display-settings-changed', ({ payload }) => {
      setDisplaySettings(payload)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  // Track current song + initial position for overlay and lyrics
  useEffect(() => {
    const unlisten = listen<TrackInfo & { positionMs: number }>('track-changed', ({ payload }) => {
      setCurrentTrack({ name: payload.name, artists: payload.artists, id: payload.id, duration: payload.duration, albumArt: payload.albumArt ?? '' })
      setPositionMs(payload.positionMs ?? 0)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  // Clear track overlay and lyrics when user logs out
  useEffect(() => {
    const unlisten = listen('track-cleared', () => {
      setCurrentTrack(null)
      setPositionMs(0)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  // Playback position tick from control panel (every ~500 ms)
  useEffect(() => {
    const unlisten = listen<{ positionMs: number; paused: boolean }>('playback-tick', ({ payload }) => {
      setPositionMs(payload.positionMs)
      setIsPaused(payload.paused)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  // Slideshow pause state from control panel
  useEffect(() => {
    const unlisten = listen<{ paused: boolean }>('slideshow-state', ({ payload }) => {
      setSlideshowPaused(payload.paused)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  // Track photo index for counter overlay
  useEffect(() => {
    const unlisten = listen<{ photo: string; index: number; total: number }>('photo-advance', ({ payload }) => {
      setPhotoCounter({ index: payload.index, total: payload.total })
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  // Reset counter when folder changes to one with no photos
  useEffect(() => {
    const unlisten = listen('photos-cleared', () => setPhotoCounter(null))
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  useHotkeys({
    onNext:                () => emit('display-hotkey', { action: 'next'           }).catch(console.error),
    onPrev:                () => emit('display-hotkey', { action: 'prev'           }).catch(console.error),
    onTogglePause:         () => emit('display-hotkey', { action: 'pause'          }).catch(console.error),
    onCycleVisualizerMode: () => emit('display-hotkey', { action: 'cycle-viz-mode' }).catch(console.error),
    onNextPreset:          () => emit('display-hotkey', { action: 'next-preset'    }).catch(console.error),
    onToggleTrackOverlay:  () => emit('display-hotkey', { action: 'track'          }).catch(console.error),
    onToggleFullscreen:    () => {
      const next = !isFullscreen
      setIsFullscreen(next)
      invoke('set_display_fullscreen', { fullscreen: next }).catch(console.error)
      emit('fullscreen-changed', { fullscreen: next }).catch(console.error)
    },
    onToggleBattery:       () => emit('display-hotkey', { action: 'battery'        }).catch(console.error),
    onTogglePhotoCounter:  () => emit('display-hotkey', { action: 'counter'        }).catch(console.error),
    onToggleClockWeather:  () => emit('display-hotkey', { action: 'clock'          }).catch(console.error),
    onToggleLyrics:        () => emit('display-hotkey', { action: 'lyrics'         }).catch(console.error),
    onMusicPrev:           () => emit('display-hotkey', { action: 'music-prev'     }).catch(console.error),
    onMusicToggle:         () => emit('display-hotkey', { action: 'music-toggle'   }).catch(console.error),
    onMusicNext:           () => emit('display-hotkey', { action: 'music-next'     }).catch(console.error),
    onVolumeUp:            () => emit('display-hotkey', { action: 'vol-up'         }).catch(console.error),
    onVolumeDown:          () => emit('display-hotkey', { action: 'vol-down'       }).catch(console.error),
  })

  const lyrics = useLyrics(currentTrack, positionMs)

  const vizMode     = displaySettings.visualizerMode
  const vizSide     = displaySettings.visualizerSplitSide
  const presetIndex = displaySettings.visualizerPresetIndex

  // Lyrics split panel is suppressed when the visualizer is in split mode (spec §1)
  const effectiveLyricsSplit = displaySettings.lyricsSplit && vizMode !== 'split'
  const isLyricsSplitMode    = displaySettings.lyricsVisible && effectiveLyricsSplit

  // The photo+overlays pane — isSplitLyrics true means a separate lyrics panel is shown; skip overlay
  const photoPaneContent = (isSplitLyrics: boolean) => (
    <>
      <SlideshowView
        photos={photos}
        transitionEffect={displaySettings.transitionEffect}
        transitionDurationMs={displaySettings.transitionDurationMs}
        imageFit={displaySettings.imageFit}
        fillParent={isSplitLyrics}
      />

      {displaySettings.photoCounterVisible && photoCounter !== null && (
        <PhotoCounterOverlay index={photoCounter.index} total={photoCounter.total} />
      )}

      {!isSplitLyrics && displaySettings.lyricsVisible && lyrics.status !== 'not_found' && lyrics.status !== 'error' && lyrics.status !== 'idle' && (
        <LyricsOverlay
          lines={lyrics.lines}
          currentIndex={lyrics.currentIndex}
          status={lyrics.status}
          settings={displaySettings}
        />
      )}

      <CornerOverlays
        displaySettings={displaySettings}
        currentTrack={currentTrack}
        positionMs={positionMs}
        isPaused={isPaused}
        weather={weather}
        weatherError={weatherError}
        battery={battery}
      />

      {slideshowPaused && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 50,
        }}>
          <span style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 28, fontWeight: 700, letterSpacing: 4,
            color: 'rgba(255,255,255,0.85)',
            textTransform: 'uppercase',
            textShadow: '0 2px 16px rgba(0,0,0,0.8)',
            background: 'rgba(0,0,0,0.45)',
            padding: '10px 28px', borderRadius: 10,
          }}>
            Paused
          </span>
        </div>
      )}
    </>
  )

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }} onDoubleClick={handleDoubleClick}>
      <SongToast   displayMs={displaySettings.toastDurationMs} zoom={displaySettings.songZoom}   />
      <VolumeToast displayMs={displaySettings.toastDurationMs} zoom={displaySettings.volumeZoom} />

      {vizMode === 'visualizer' ? (
        // ── Full-screen visualizer ─────────────────────────────────────────
        <>
          {/* Slideshow renders hidden so its internal timer keeps advancing */}
          <div style={{ display: 'none' }}>
            <SlideshowView
              photos={photos}
              transitionEffect={displaySettings.transitionEffect}
              transitionDurationMs={displaySettings.transitionDurationMs}
              imageFit={displaySettings.imageFit}
              fillParent={false}
            />
          </div>
          <VisualizerCanvas
            presetIndex={presetIndex}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
          {/* All overlays on top of the canvas */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {displaySettings.photoCounterVisible && photoCounter !== null && (
              <PhotoCounterOverlay index={photoCounter.index} total={photoCounter.total} />
            )}
            {displaySettings.lyricsVisible && lyrics.status !== 'not_found' && lyrics.status !== 'error' && lyrics.status !== 'idle' && (
              <LyricsOverlay
                lines={lyrics.lines}
                currentIndex={lyrics.currentIndex}
                status={lyrics.status}
                settings={displaySettings}
              />
            )}
            <CornerOverlays
              displaySettings={displaySettings}
              currentTrack={currentTrack}
              positionMs={positionMs}
              isPaused={isPaused}
              weather={weather}
              weatherError={weatherError}
              battery={battery}
            />
          </div>
        </>
      ) : vizMode === 'split' ? (
        // ── Visualizer split: photos 60% + Butterchurn 40% ────────────────
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          {vizSide === 'right' ? (
            <>
              <div style={{ position: 'relative', flex: '0 0 60%', height: '100%', overflow: 'hidden' }}>
                {photoPaneContent(false)}
              </div>
              <div style={{ flex: '0 0 40%', height: '100%', overflow: 'hidden' }}>
                <VisualizerCanvas presetIndex={presetIndex} style={{ width: '100%', height: '100%' }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: '0 0 40%', height: '100%', overflow: 'hidden' }}>
                <VisualizerCanvas presetIndex={presetIndex} style={{ width: '100%', height: '100%' }} />
              </div>
              <div style={{ position: 'relative', flex: '0 0 60%', height: '100%', overflow: 'hidden' }}>
                {photoPaneContent(false)}
              </div>
            </>
          )}
        </div>
      ) : isLyricsSplitMode ? (
        // ── Lyrics split (photos mode only) ──────────────────────────────
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          {displaySettings.lyricsSplitSide === 'right' ? (
            <>
              <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>
                {photoPaneContent(true)}
              </div>
              <div style={{ width: '40%', height: '100%', flexShrink: 0 }}>
                <LyricsSplitPanel lines={lyrics.lines} currentIndex={lyrics.currentIndex} status={lyrics.status} settings={displaySettings} />
              </div>
            </>
          ) : (
            <>
              <div style={{ width: '40%', height: '100%', flexShrink: 0 }}>
                <LyricsSplitPanel lines={lyrics.lines} currentIndex={lyrics.currentIndex} status={lyrics.status} settings={displaySettings} />
              </div>
              <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>
                {photoPaneContent(true)}
              </div>
            </>
          )}
        </div>
      ) : (
        // ── Photos mode (full-screen) ─────────────────────────────────────
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {photoPaneContent(false)}
        </div>
      )}
    </div>
  )
}

// ── Corner overlays (battery + track + clock, with collision stacking) ────────

function CornerOverlays({ displaySettings, currentTrack, positionMs, isPaused, weather, weatherError, battery }: {
  displaySettings: DisplaySettings
  currentTrack: TrackInfo | null
  positionMs: number
  isPaused: boolean
  weather: import('../../hooks/useWeather').WeatherData | null
  weatherError: string | null
  battery: BatteryStatus
}) {
  type WidgetId = 'battery' | 'clock' | 'track'
  type Corner   = import('../../components/DisplaySettingsPanel').TrackPosition

  const corners = new Map<Corner, WidgetId[]>()
  function add(pos: Corner, id: WidgetId) {
    if (!corners.has(pos)) corners.set(pos, [])
    corners.get(pos)!.push(id)
  }

  if (displaySettings.batteryVisible) add(displaySettings.batteryPosition, 'battery')
  if (displaySettings.clockWeatherVisible) add(displaySettings.clockWeatherPosition, 'clock')
  if (displaySettings.trackOverlayVisible && currentTrack) add(displaySettings.trackPosition, 'track')

  return (
    <>
      {[...corners.entries()].map(([pos, widgets]) => {
        const isBottom = pos.startsWith('bottom')
        const wrapStyle: React.CSSProperties = {
          position: 'absolute',
          top:    isBottom             ? undefined : 16,
          bottom: isBottom             ? 16        : undefined,
          left:   pos.endsWith('left') ? 16        : undefined,
          right:  pos.endsWith('right')? 16        : undefined,
          display: 'flex',
          flexDirection: isBottom ? 'column-reverse' : 'column',
          alignItems: pos.endsWith('left') ? 'flex-start' : 'flex-end',
          gap: 8,
          zIndex: 15,
          pointerEvents: 'none',
        }
        return (
          <div key={pos} style={wrapStyle}>
            {widgets.map(w => {
              if (w === 'battery') return (
                <BatteryWidget key="battery" status={battery} size={displaySettings.batterySize} />
              )
              if (w === 'clock') return (
                <ClockWeatherWidget key="clock"
                  timeFormat={displaySettings.clockWeatherTimeFormat}
                  position={pos}
                  tempUnit={displaySettings.clockWeatherTempUnit}
                  weather={weather}
                  debugError={weatherError}
                  embedded
                />
              )
              if (w === 'track') return (
                <TrackOverlay key="track" track={currentTrack!} positionMs={positionMs} paused={isPaused} settings={displaySettings} embedded />
              )
              return null
            })}
          </div>
        )
      })}
    </>
  )
}

// ── Photo counter overlay ─────────────────────────────────────────────────────

function PhotoCounterOverlay({ index, total }: { index: number; total: number }) {
  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 15,
      pointerEvents: 'none',
      padding: '4px 10px',
      borderRadius: 999,
      background: 'rgba(0,0,0,0.45)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: 13,
      letterSpacing: '0.5px',
      backdropFilter: 'blur(2px)',
      whiteSpace: 'nowrap',
    }}>
      {index + 1}/{total}
    </div>
  )
}

// ── Track overlay ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  // Guard against corrupted localStorage values — fall back to opaque black.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(0,0,0,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function TrackOverlay({ track, positionMs, paused, settings, embedded }: { track: TrackInfo; positionMs: number; paused?: boolean; settings: DisplaySettings; embedded?: boolean }) {
  const { trackPosition, trackFontSize, trackColor, trackBgColor, trackBgOpacity } = settings

  const posStyle: React.CSSProperties = embedded ? {} : {
    position: 'absolute',
    top:    trackPosition.startsWith('top')    ? 20 : undefined,
    bottom: trackPosition.startsWith('bottom') ? 20 : undefined,
    left:   trackPosition.endsWith('left')     ? 20 : undefined,
    right:  trackPosition.endsWith('right')    ? 20 : undefined,
  }

  const progressPct = track.duration > 0
    ? Math.min(100, (positionMs / track.duration) * 100)
    : 0

  return (
    <div style={{
      ...posStyle,
      zIndex: 15,
      maxWidth: '45vw',
      padding: '8px 14px',
      borderRadius: 6,
      background: hexToRgba(trackBgColor, trackBgOpacity),
      color: trackColor,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: trackFontSize,
      fontWeight: 600,
      lineHeight: 1.3,
      pointerEvents: 'none',
      backdropFilter: trackBgOpacity > 0 ? 'blur(2px)' : 'none',
      overflow: 'hidden',
    }}>
      <div style={{ fontSize: trackFontSize * 0.65, opacity: 0.8, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {paused && <span style={{ flexShrink: 0 }}>⏸</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</span>
      </div>
      {/* Progress bar — bleeds to pill edges via negative margin, clipped by overflow:hidden */}
      <div style={{ margin: '6px -14px -8px', height: 3, background: hexToRgba(trackColor, 0.2) }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: trackColor, transition: 'width 0.5s linear' }} />
      </div>
    </div>
  )
}
