import { invoke } from '@tauri-apps/api/core'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { SlideshowView } from '../../components/SlideshowView'

export default function DisplayWindow() {
  const { photos } = usePhotoLibrary()

  function handleDoubleClick() {
    invoke('toggle_display_fullscreen').catch(console.error)
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }} onDoubleClick={handleDoubleClick}>
      <SlideshowView photos={photos} />
    </div>
  )
}
