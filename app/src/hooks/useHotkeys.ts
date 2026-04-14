import { useEffect } from 'react'

interface Handlers {
  onNext:                      () => void
  onPrev:                      () => void
  onTogglePause:               () => void
  onCycleVisualizerMode?:      () => void
  onNextPreset?:               () => void
  onToggleTrackOverlay?:       () => void
  onToggleFullscreen?:         () => void
  onToggleBattery?:            () => void
  onTogglePhotoCounter?:       () => void
  onToggleClockWeather?:       () => void
  onToggleLyrics?:             () => void
  onMusicPrev?:                () => void
  onMusicToggle?:              () => void
  onMusicNext?:                () => void
  onVolumeUp?:                 () => void
  onVolumeDown?:               () => void
}

export function useHotkeys({ onNext, onPrev, onTogglePause, onCycleVisualizerMode, onNextPreset, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter, onToggleClockWeather, onToggleLyrics, onMusicPrev, onMusicToggle, onMusicNext, onVolumeUp, onVolumeDown }: Handlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't steal keys when the user is typing in a form element
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Numpad music controls (use e.code to distinguish from number row)
      switch (e.code) {
        case 'Numpad4':        e.preventDefault(); onMusicPrev?.();   return
        case 'Numpad5':        e.preventDefault(); onMusicToggle?.(); return
        case 'Numpad6':        e.preventDefault(); onMusicNext?.();   return
        case 'NumpadAdd':      e.preventDefault(); onVolumeUp?.();    return
        case 'NumpadSubtract': e.preventDefault(); onVolumeDown?.();  return
      }

      switch (e.key) {
        case 'ArrowRight':  e.preventDefault(); onNext();                       break
        case 'ArrowLeft':   e.preventDefault(); onPrev();                       break
        case ' ':           e.preventDefault(); onTogglePause();                break
        case 'm': case 'M': e.preventDefault(); onCycleVisualizerMode?.();      break
        case 'n': case 'N': e.preventDefault(); onNextPreset?.();               break
        case 't': case 'T': e.preventDefault(); onToggleTrackOverlay?.();       break
        case 'f': case 'F': e.preventDefault(); onToggleFullscreen?.();         break
        case 'b': case 'B': e.preventDefault(); onToggleBattery?.();            break
        case 'p': case 'P': e.preventDefault(); onTogglePhotoCounter?.();       break
        case 'c': case 'C': e.preventDefault(); onToggleClockWeather?.();       break
        case 'l': case 'L': e.preventDefault(); onToggleLyrics?.();             break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onNext, onPrev, onTogglePause, onCycleVisualizerMode, onNextPreset, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter, onToggleClockWeather, onToggleLyrics, onMusicPrev, onMusicToggle, onMusicNext, onVolumeUp, onVolumeDown])
}
