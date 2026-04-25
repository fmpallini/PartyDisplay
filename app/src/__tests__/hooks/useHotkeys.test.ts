import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHotkeys } from '../../hooks/useHotkeys'

function fireKeyOnDocument(code: string, key: string = code) {
  document.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }))
}

function fireKeyOnElement(el: HTMLElement, code: string, key: string = code) {
  el.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }))
}

describe('useHotkeys', () => {
  let handlers: {
    onNext: Mock<() => void>
    onPrev: Mock<() => void>
    onTogglePause: Mock<() => void>
    onMusicToggle: Mock<() => void>
    onMusicNext: Mock<() => void>
    onMusicPrev: Mock<() => void>
    onNextPreset: Mock<() => void>
    onPrevPreset: Mock<() => void>
    onToggleFullscreen: Mock<() => void>
    onToggleLyrics: Mock<() => void>
  }

  beforeEach(() => {
    handlers = {
      onNext:             vi.fn(),
      onPrev:             vi.fn(),
      onTogglePause:      vi.fn(),
      onMusicToggle:      vi.fn(),
      onMusicNext:        vi.fn(),
      onMusicPrev:        vi.fn(),
      onNextPreset:       vi.fn(),
      onPrevPreset:       vi.fn(),
      onToggleFullscreen: vi.fn(),
      onToggleLyrics:     vi.fn(),
    }
  })

  it('fires onMusicToggle on Numpad5', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('Numpad5', '5')
    expect(handlers.onMusicToggle).toHaveBeenCalledTimes(1)
  })

  it('fires onMusicNext on Numpad6', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('Numpad6', '6')
    expect(handlers.onMusicNext).toHaveBeenCalledTimes(1)
  })

  it('fires onMusicPrev on Numpad4', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('Numpad4', '4')
    expect(handlers.onMusicPrev).toHaveBeenCalledTimes(1)
  })

  it('fires onNextPreset on PageUp', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('PageUp', 'PageUp')
    expect(handlers.onNextPreset).toHaveBeenCalledTimes(1)
  })

  it('fires onPrevPreset on PageDown', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('PageDown', 'PageDown')
    expect(handlers.onPrevPreset).toHaveBeenCalledTimes(1)
  })

  it('fires onToggleFullscreen on f key', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('KeyF', 'f')
    expect(handlers.onToggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('fires onToggleLyrics on l key', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('KeyL', 'l')
    expect(handlers.onToggleLyrics).toHaveBeenCalledTimes(1)
  })

  it('fires onNext on ArrowRight', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('ArrowRight', 'ArrowRight')
    expect(handlers.onNext).toHaveBeenCalledTimes(1)
  })

  it('fires onPrev on ArrowLeft', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('ArrowLeft', 'ArrowLeft')
    expect(handlers.onPrev).toHaveBeenCalledTimes(1)
  })

  it('fires onTogglePause on Space', () => {
    renderHook(() => useHotkeys(handlers))
    fireKeyOnDocument('Space', ' ')
    expect(handlers.onTogglePause).toHaveBeenCalledTimes(1)
  })

  it('does not fire when keydown originates from an input element', () => {
    renderHook(() => useHotkeys(handlers))
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireKeyOnElement(input, 'Numpad5', '5')
    expect(handlers.onMusicToggle).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('removes keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useHotkeys(handlers))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
