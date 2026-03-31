import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useFftData } from '../../hooks/useFftData'
import { useBattery } from '../../hooks/useBattery'
import type { BatteryStatus } from '../../hooks/useBattery'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { BatteryWidget } from '../../components/BatteryWidget'
import { readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'
import { useWeather } from '../../hooks/useWeather'
import { ClockWeatherWidget } from '../../components/ClockWeatherWidget'

interface TrackInfo { name: string; artists: string }

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary({ order: 'shuffle', recursive: false })
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null)
  const [photoCounter, setPhotoCounter] = useState<{ index: number; total: number } | null>(null)
  const bins    = useFftData()
  const battery = useBattery()
  const [weather, weatherError] = useWeather(displaySettings.clockWeatherTempUnit, displaySettings.clockWeatherCity)

  // Track viewport height so the spectrum % is always accurate (e.g. on fullscreen toggle)
  const [winHeight, setWinHeight] = useState(window.innerHeight)
  useEffect(() => {
    const handler = () => setWinHeight(window.innerHeight)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  function handleDoubleClick() {
    invoke('toggle_display_fullscreen').catch(console.error)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') invoke('exit_display_fullscreen').catch(console.error)
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

  // Track current song for overlay
  useEffect(() => {
    const unlisten = listen<TrackInfo>('track-changed', ({ payload }) => {
      setCurrentTrack(payload)
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

  useHotkeys({
    onNext:               () => emit('display-hotkey', { action: 'next'       }).catch(console.error),
    onPrev:               () => emit('display-hotkey', { action: 'prev'       }).catch(console.error),
    onTogglePause:        () => emit('display-hotkey', { action: 'pause'      }).catch(console.error),
    onToggleSpectrum:     () => emit('display-hotkey', { action: 'spectrum'   }).catch(console.error),
    onToggleTrackOverlay: () => emit('display-hotkey', { action: 'track'      }).catch(console.error),
    onToggleFullscreen:   () => invoke('toggle_display_fullscreen').catch(console.error),
    onToggleBattery:      () => emit('display-hotkey', { action: 'battery'    }).catch(console.error),
    onTogglePhotoCounter: () => emit('display-hotkey', { action: 'counter'    }).catch(console.error),
    onToggleClockWeather: () => emit('display-hotkey', { action: 'clock'      }).catch(console.error),
  })

  const spectrumHeightPx = Math.round(winHeight * (displaySettings.spectrumHeightPct / 100))

  return (
    // position: relative so absolutely-positioned overlays anchor to this div
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }} onDoubleClick={handleDoubleClick}>

      {/* Photo fills the entire screen — spectrum overlays on top, never displaces this */}
      <SlideshowView
        photos={photos}
        transitionEffect={displaySettings.transitionEffect}
        transitionDurationMs={displaySettings.transitionDurationMs}
        imageFit={displaySettings.imageFit}
      />

      <SongToast   displayMs={displaySettings.toastDurationMs} zoom={displaySettings.songZoom}   />
      <VolumeToast displayMs={displaySettings.toastDurationMs} zoom={displaySettings.volumeZoom} />

      {displaySettings.spectrumVisible && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, width: '100%', height: spectrumHeightPx, zIndex: 10,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)',
        }}>
          <SpectrumCanvas
            bins={bins}
            height={spectrumHeightPx}
            renderStyle={displaySettings.spectrumStyle}
            theme={displaySettings.spectrumTheme}
            overlay
          />
        </div>
      )}

      {displaySettings.photoCounterVisible && photoCounter !== null && (
        <PhotoCounterOverlay index={photoCounter.index} total={photoCounter.total} />
      )}

      <CornerOverlays
        displaySettings={displaySettings}
        currentTrack={currentTrack}
        weather={weather}
        weatherError={weatherError}
        battery={battery}
      />
    </div>
  )
}

// ── Corner overlays (battery + track + clock, with collision stacking) ────────

function CornerOverlays({ displaySettings, currentTrack, weather, weatherError, battery }: {
  displaySettings: DisplaySettings
  currentTrack: TrackInfo | null
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
                <TrackOverlay key="track" track={currentTrack!} settings={displaySettings} embedded />
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

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function TrackOverlay({ track, settings, embedded }: { track: TrackInfo; settings: DisplaySettings; embedded?: boolean }) {
  const { trackPosition, trackFont, trackFontSize, trackColor, trackBgColor, trackBgOpacity } = settings

  const posStyle: React.CSSProperties = embedded ? {} : {
    position: 'absolute',
    top:    trackPosition.startsWith('top')    ? 20 : undefined,
    bottom: trackPosition.startsWith('bottom') ? 20 : undefined,
    left:   trackPosition.endsWith('left')     ? 20 : undefined,
    right:  trackPosition.endsWith('right')    ? 20 : undefined,
  }

  return (
    <div style={{
      ...posStyle,
      zIndex: 15,
      maxWidth: '45vw',
      padding: '8px 14px',
      borderRadius: 6,
      background: hexToRgba(trackBgColor, trackBgOpacity),
      color: trackColor,
      fontFamily: trackFont,
      fontSize: trackFontSize,
      fontWeight: 600,
      lineHeight: 1.3,
      pointerEvents: 'none',
      backdropFilter: trackBgOpacity > 0 ? 'blur(2px)' : 'none',
      overflow: 'hidden',
    }}>
      <div style={{ fontSize: trackFontSize * 0.65, opacity: 0.8, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists}</div>
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
    </div>
  )
}
