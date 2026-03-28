import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { useHotkeys } from '../../hooks/useHotkeys'
import { SlideshowView } from '../../components/SlideshowView'
import { SongToast } from '../../components/SongToast'
import { VolumeToast } from '../../components/VolumeToast'

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary()

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

  // Relay hotkeys from the display window to the control panel via events
  useHotkeys({
    onNext:        () => emit('display-hotkey', { action: 'next'  }).catch(console.error),
    onPrev:        () => emit('display-hotkey', { action: 'prev'  }).catch(console.error),
    onTogglePause: () => emit('display-hotkey', { action: 'pause' }).catch(console.error),
  })

  return (
    <div style={{ width: '100vw', height: '100vh' }} onDoubleClick={handleDoubleClick}>
      <SlideshowView photos={photos} />
      <SongToast />
      <VolumeToast />
    </div>
  )
}
