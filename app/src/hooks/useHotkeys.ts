import { useEffect } from 'react'

interface Handlers {
  onNext:                   () => void
  onPrev:                   () => void
  onTogglePause:            () => void
  onToggleSpectrum?:        () => void
  onToggleTrackOverlay?:    () => void
  onToggleFullscreen?:      () => void
  onToggleBattery?:         () => void
  onTogglePhotoCounter?:    () => void
  onToggleClockWeather?:    () => void
}

export function useHotkeys({ onNext, onPrev, onTogglePause, onToggleSpectrum, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter, onToggleClockWeather }: Handlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't steal keys when the user is typing in a form element
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case 'ArrowRight':  e.preventDefault(); onNext();                    break
        case 'ArrowLeft':   e.preventDefault(); onPrev();                    break
        case ' ':           e.preventDefault(); onTogglePause();             break
        case 's': case 'S': e.preventDefault(); onToggleSpectrum?.();        break
        case 't': case 'T': e.preventDefault(); onToggleTrackOverlay?.();    break
        case 'f': case 'F': e.preventDefault(); onToggleFullscreen?.();      break
        case 'b': case 'B': e.preventDefault(); onToggleBattery?.();         break
        case 'p': case 'P': e.preventDefault(); onTogglePhotoCounter?.();    break
        case 'c': case 'C': e.preventDefault(); onToggleClockWeather?.();    break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onNext, onPrev, onTogglePause, onToggleSpectrum, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter, onToggleClockWeather])
}
