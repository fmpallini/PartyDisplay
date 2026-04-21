import { useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import type { TransitionEffect } from '../components/DisplaySettingsPanel'

// Events flowing between windows:
//   control → display:  "photo-advance"  payload: { photo: string }

const CONCRETE_EFFECTS: Exclude<TransitionEffect, 'random'>[] = [
  'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down',
  'zoom-in', 'zoom-out', 'blur',
]

function resolveEffect(effect: TransitionEffect): Exclude<TransitionEffect, 'random'> {
  if (effect !== 'random') return effect
  return CONCRETE_EFFECTS[Math.floor(Math.random() * CONCRETE_EFFECTS.length)]
}

interface Options {
  transitionEffect:    TransitionEffect
  transitionDurationMs: number
}

export function useDisplaySync(
  _photos: string[],
  { transitionEffect, transitionDurationMs }: Options = { transitionEffect: 'fade', transitionDurationMs: 500 },
) {
  const [currentPhoto, setCurrentPhoto]   = useState<string | null>(null)
  const [previousPhoto, setPreviousPhoto] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [activeEffect, setActiveEffect]   = useState<Exclude<TransitionEffect, 'random'>>('fade')

  const effectRef         = useRef(transitionEffect)
  const durationRef       = useRef(transitionDurationMs)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  effectRef.current   = transitionEffect
  durationRef.current = transitionDurationMs

  // Listen for advance commands from control window
  useEffect(() => {
    const unlisten = listen<{ photo: string; index: number; total: number }>('photo-advance', ({ payload }) => {
      const doTransition = () => {
        const resolved = resolveEffect(effectRef.current)
        setActiveEffect(resolved)
        setCurrentPhoto(prev => {
          setPreviousPhoto(prev)
          return payload.photo
        })
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
        setTransitioning(true)
        // +50 ms buffer: ensures the CSS out-animation fully completes before
        // React removes the previous photo element from the DOM.
        transitionTimerRef.current = setTimeout(() => setTransitioning(false), durationRef.current + 50)
      }

      // HTTP photos (DLNA via proxy) must be preloaded before the transition
      // starts — otherwise the CSS animation runs while the image is still
      // fetching and the photo only appears at the very end of the transition.
      // Local asset:// URLs decode from disk instantly so no preload is needed.
      if (payload.photo.startsWith('http')) {
        const img = new window.Image()
        img.onload  = doTransition
        img.onerror = doTransition  // transition anyway if the image fails
        img.src = payload.photo
      } else {
        doTransition()
      }
    })
    return () => {
      unlisten.then(fn => fn()).catch(() => {})
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    }
  }, [])

  // Clear photo when the folder is empty or changed to one with no images
  useEffect(() => {
    const unlisten = listen('photos-cleared', () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
      setCurrentPhoto(null)
      setPreviousPhoto(null)
      setTransitioning(false)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  return { currentPhoto, previousPhoto, transitioning, activeEffect }
}

// Call this from the control window to push the next photo to the display
export async function advancePhoto(photo: string, index: number, total: number) {
  await emit('photo-advance', { photo, index, total })
}

// Call this when the folder changes to one with no photos
export async function clearPhotos() {
  await emit('photos-cleared', {})
}
