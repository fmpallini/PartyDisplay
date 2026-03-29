import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'
import { readDisplaySettings } from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary({ order: 'shuffle', recursive: false })
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings)

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
    onNext:        () => emit('display-hotkey', { action: 'next'  }).catch(console.error),
    onPrev:        () => emit('display-hotkey', { action: 'prev'  }).catch(console.error),
    onTogglePause: () => emit('display-hotkey', { action: 'pause' }).catch(console.error),
  })

  return (
    <div style={{ width: '100vw', height: '100vh' }} onDoubleClick={handleDoubleClick}>
      <SlideshowView
        photos={photos}
        transitionEffect={displaySettings.transitionEffect}
        transitionDurationMs={displaySettings.transitionDurationMs}
      />
      <SongToast
        displayMs={displaySettings.toastDurationMs}
        zoom={displaySettings.songZoom}
      />
      <VolumeToast
        displayMs={displaySettings.toastDurationMs}
        zoom={displaySettings.volumeZoom}
      />
    </div>
  )
}
