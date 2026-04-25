import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalPlayer } from '../../hooks/useLocalPlayer'
import type { PlaylistItem } from '../../hooks/useLocalPlayer'

class MockAudio {
  src = ''
  volume = 1
  paused = true
  currentTime = 0
  duration = NaN
  readyState = 0
  networkState = 0
  error = null
  play  = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  load  = vi.fn()
  private _listeners: Record<string, EventListener[]> = {}
  addEventListener    = vi.fn((evt: string, cb: EventListener) => {
    this._listeners[evt] = [...(this._listeners[evt] ?? []), cb]
  })
  removeEventListener = vi.fn()
  dispatchEvent       = vi.fn()
  trigger(event: string) {
    this._listeners[event]?.forEach(cb => cb(new Event(event)))
  }
}

let mockAudioInstance: MockAudio

beforeEach(() => {
  mockAudioInstance = new MockAudio()
  vi.stubGlobal('Audio', vi.fn(() => mockAudioInstance))
})

const ITEMS: PlaylistItem[] = [
  { path: '/music/track1.mp3', title: 'Track 1', artist: 'Artist A', metadataPrefetched: true, durationMs: 60_000 },
  { path: '/music/track2.mp3', title: 'Track 2', artist: 'Artist B', metadataPrefetched: true, durationMs: 90_000 },
]

describe('useLocalPlayer', () => {
  it('starts in paused/not-ready state', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true))
    expect(result.current.paused).toBe(true)
    expect(result.current.ready).toBe(false)
    expect(result.current.track).toBeNull()
  })

  it('idles when active=false regardless of playlist', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, false))
    expect(result.current.paused).toBe(true)
    expect(result.current.track).toBeNull()
  })

  it('toggleShuffle flips the shuffle state', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true))
    const before = result.current.shuffle
    act(() => result.current.toggleShuffle())
    expect(result.current.shuffle).toBe(!before)
  })

  it('persists shuffle state to localStorage when persistKey is provided', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true, 'test_key'))
    act(() => result.current.toggleShuffle())
    const stored = localStorage.getItem('test_key_shuffle')
    expect(stored).toBe(String(result.current.shuffle))
    localStorage.removeItem('test_key_shuffle')
  })

  it('setVolume updates volume state', () => {
    const { result } = renderHook(() => useLocalPlayer(ITEMS, true))
    act(() => result.current.setVolume(0.4))
    expect(result.current.volume).toBe(0.4)
  })
})
