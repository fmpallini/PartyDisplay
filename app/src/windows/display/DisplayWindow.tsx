import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useFftData } from '../../hooks/useFftData'
import { useBattery } from '../../hooks/useBattery'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { BatteryWidget } from '../../components/BatteryWidget'
import { readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'

interface TrackInfo { name: string; artists: string }

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary({ order: 'shuffle', recursive: false })
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null)
  const bins    = useFftData()
  const battery = useBattery()

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
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Track current song for overlay
  useEffect(() => {
    const unlisten = listen<TrackInfo>('track-changed', ({ payload }) => {
      setCurrentTrack(payload)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  useHotkeys({
    onNext:               () => emit('display-hotkey', { action: 'next'     }).catch(console.error),
    onPrev:               () => emit('display-hotkey', { action: 'prev'     }).catch(console.error),
    onTogglePause:        () => emit('display-hotkey', { action: 'pause'    }).catch(console.error),
    onToggleSpectrum:     () => emit('display-hotkey', { action: 'spectrum' }).catch(console.error),
    onToggleTrackOverlay: () => emit('display-hotkey', { action: 'track'    }).catch(console.error),
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

      {displaySettings.batteryVisible && (
        <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 20 }}>
          <BatteryWidget status={battery} size={displaySettings.batterySize} />
        </div>
      )}

      {displaySettings.spectrumVisible && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, width: '100%', height: spectrumHeightPx, zIndex: 10,
          background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 100%)',
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

      {displaySettings.trackOverlayVisible && currentTrack && (
        <TrackOverlay track={currentTrack} settings={displaySettings} />
      )}
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

function TrackOverlay({ track, settings }: { track: TrackInfo; settings: DisplaySettings }) {
  const { trackPosition, trackFont, trackFontSize, trackColor, trackBgColor, trackBgOpacity } = settings

  const posStyle: React.CSSProperties = {
    top:    trackPosition.startsWith('top')    ? 20 : undefined,
    bottom: trackPosition.startsWith('bottom') ? 20 : undefined,
    left:   trackPosition.endsWith('left')     ? 20 : undefined,
    right:  trackPosition.endsWith('right')    ? 20 : undefined,
  }

  return (
    <div style={{
      position: 'absolute',
      ...posStyle,
      zIndex: 15,
      maxWidth: '60%',
      padding: '8px 14px',
      borderRadius: 6,
      background: hexToRgba(trackBgColor, trackBgOpacity),
      color: trackColor,
      fontFamily: trackFont,
      fontSize: trackFontSize,
      fontWeight: 600,
      lineHeight: 1.3,
      pointerEvents: 'none',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{ fontSize: trackFontSize * 0.65, opacity: 0.8, marginBottom: 2 }}>{track.artists}</div>
      <div>{track.name}</div>
    </div>
  )
}
