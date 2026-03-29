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

  const effectRef   = useRef(transitionEffect)
  const durationRef = useRef(transitionDurationMs)
  effectRef.current   = transitionEffect
  durationRef.current = transitionDurationMs

  // Listen for advance commands from control window
  useEffect(() => {
    const unlisten = listen<{ photo: string }>('photo-advance', ({ payload }) => {
      const resolved = resolveEffect(effectRef.current)
      setActiveEffect(resolved)
      setCurrentPhoto(prev => {
        setPreviousPhoto(prev)
        return payload.photo
      })
      setTransitioning(true)
      setTimeout(() => setTransitioning(false), durationRef.current)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return { currentPhoto, previousPhoto, transitioning, activeEffect }
}

// Call this from the control window to push the next photo to the display
export async function advancePhoto(photo: string) {
  await emit('photo-advance', { photo })
}
