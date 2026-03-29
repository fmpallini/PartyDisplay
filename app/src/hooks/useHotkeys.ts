import { useEffect } from 'react'

interface Handlers {
  onNext:            () => void
  onPrev:            () => void
  onTogglePause:     () => void
  onToggleSpectrum?: () => void
}

export function useHotkeys({ onNext, onPrev, onTogglePause, onToggleSpectrum }: Handlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't steal keys when the user is typing in a form element
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); onNext();             break
        case 'ArrowLeft':  e.preventDefault(); onPrev();             break
        case ' ':          e.preventDefault(); onTogglePause();      break
        case 's': case 'S': e.preventDefault(); onToggleSpectrum?.(); break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onNext, onPrev, onTogglePause, onToggleSpectrum])
}
