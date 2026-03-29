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

  return (
    <div style={{ width: '100vw', height: '100vh' }} onDoubleClick={handleDoubleClick}>
      <SlideshowView
        photos={photos}
        transitionEffect={displaySettings.transitionEffect}
        transitionDurationMs={displaySettings.transitionDurationMs}
        imageFit={displaySettings.imageFit}
      />
      <SongToast
        displayMs={displaySettings.toastDurationMs}
        zoom={displaySettings.songZoom}
      />
      <VolumeToast
        displayMs={displaySettings.toastDurationMs}
        zoom={displaySettings.volumeZoom}
      />
      {displaySettings.spectrumVisible && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          zIndex: 10,
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.7))',
          paddingTop: 24,
        }}>
          <SpectrumCanvas
            bins={bins}
            height={120}
            renderStyle={displaySettings.spectrumStyle}
            theme={displaySettings.spectrumTheme}
          />
        </div>
      )}
    </div>
  )
}
