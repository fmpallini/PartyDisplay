import { useEffect, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'

// Events flowing between windows:
//   control → display:  "photo-advance"  payload: { photo: string }

export function useDisplaySync(_photos: string[]) {
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null)
  const [previousPhoto, setPreviousPhoto] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState(false)

  // Listen for advance commands from control window
  useEffect(() => {
    const unlisten = listen<{ photo: string }>('photo-advance', ({ payload }) => {
      setCurrentPhoto(prev => {
        setPreviousPhoto(prev)
        return payload.photo
      })
      setTransitioning(true)
      setTimeout(() => setTransitioning(false), 800)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return { currentPhoto, previousPhoto, transitioning }
}

// Call this from the control window to push the next photo to the display
export async function advancePhoto(photo: string) {
  await emit('photo-advance', { photo })
}
