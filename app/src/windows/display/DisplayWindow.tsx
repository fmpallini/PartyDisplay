import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useFftData } from '../../hooks/useFftData'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'
import SpectrumCanvas from '../../components/SpectrumCanvas'
import { readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary({ order: 'shuffle', recursive: false })
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)
  const bins = useFftData()

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

  useHotkeys({
    onNext:            () => emit('display-hotkey', { action: 'next'     }).catch(console.error),
    onPrev:            () => emit('display-hotkey', { action: 'prev'     }).catch(console.error),
    onTogglePause:     () => emit('display-hotkey', { action: 'pause'    }).catch(console.error),
    onToggleSpectrum:  () => emit('display-hotkey', { action: 'spectrum' }).catch(console.error),
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
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: spectrumHeightPx,
          zIndex: 10,
          // Subtle fade so the spectrum blends into the photo naturally
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
    </div>
  )
}
