import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer'

class MockSpotifyPlayer {
  private _listeners: Record<string, Array<(data?: any) => void>> = {}

  addListener(event: string, cb: (data?: any) => void) {
    this._listeners[event] = [...(this._listeners[event] ?? []), cb]
    return true
  }
  removeListener = vi.fn()
  connect        = vi.fn().mockResolvedValue(true)
  disconnect     = vi.fn()
  togglePlay     = vi.fn()
  nextTrack      = vi.fn()
  previousTrack  = vi.fn()
  seek           = vi.fn()
  setVolume      = vi.fn()

  trigger(event: string, data?: any) {
    this._listeners[event]?.forEach(cb => cb(data))
  }
}

const SPOTIFY_STATE = {
  paused: false,
  position: 10_000,
  shuffle: false,
  track_window: {
    current_track: {
      id:          'spotify-id-1',
      name:        'Spotify Song',
      artists:     [{ name: 'Spotify Artist' }],
      duration_ms: 200_000,
      album:       { images: [{ url: 'https://example.com/art.jpg' }] },
    },
  },
}

describe('useSpotifyPlayer', () => {
  let mockPlayer: MockSpotifyPlayer
  let SpotifyPlayerCtor: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    // Delete any existing window.Spotify so the hook sets the SDK-ready callback
    delete (window as any).Spotify
    delete (window as any).onSpotifyWebPlaybackSDKReady
    mockPlayer = new MockSpotifyPlayer()
    SpotifyPlayerCtor = vi.fn(() => mockPlayer)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ device: { volume_percent: 80 } }),
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('starts in not-ready state', () => {
    const { result } = renderHook(() => useSpotifyPlayer('token'))
    expect(result.current.ready).toBe(false)
    expect(result.current.track).toBeNull()
    expect(result.current.paused).toBe(true)
  })

  it('does not initialise player when accessToken is null', () => {
    renderHook(() => useSpotifyPlayer(null))
    act(() => {
      ;(window as any).Spotify = { Player: SpotifyPlayerCtor }
      ;(window as any).onSpotifyWebPlaybackSDKReady?.()
    })
    expect(SpotifyPlayerCtor).not.toHaveBeenCalled()
  })

  it('instantiates Spotify.Player when SDK fires ready callback', () => {
    renderHook(() => useSpotifyPlayer('token'))
    act(() => {
      ;(window as any).Spotify = { Player: SpotifyPlayerCtor }
      ;(window as any).onSpotifyWebPlaybackSDKReady?.()
    })
    expect(SpotifyPlayerCtor).toHaveBeenCalled()
  })

  it('uses Spotify.Player immediately when window.Spotify is already defined', () => {
    // Pre-set window.Spotify so the hook calls initPlayer() synchronously
    ;(window as any).Spotify = { Player: SpotifyPlayerCtor }
    renderHook(() => useSpotifyPlayer('token'))
    expect(SpotifyPlayerCtor).toHaveBeenCalled()
    expect(mockPlayer.connect).toHaveBeenCalled()
  })

  it('updates track and paused state on player_state_changed', () => {
    const { result } = renderHook(() => useSpotifyPlayer('token'))
    act(() => {
      ;(window as any).Spotify = { Player: SpotifyPlayerCtor }
      ;(window as any).onSpotifyWebPlaybackSDKReady?.()
    })
    act(() => mockPlayer.trigger('ready', { device_id: 'device-abc' }))
    act(() => mockPlayer.trigger('player_state_changed', SPOTIFY_STATE))

    expect(result.current.track?.name).toBe('Spotify Song')
    // artists is joined as a string
    expect(result.current.track?.artists).toContain('Spotify Artist')
    expect(result.current.paused).toBe(false)
    expect(result.current.positionMs).toBe(10_000)
  })

  it('sets ready=true and deviceId on player ready event', () => {
    const { result } = renderHook(() => useSpotifyPlayer('token'))
    act(() => {
      ;(window as any).Spotify = { Player: SpotifyPlayerCtor }
      ;(window as any).onSpotifyWebPlaybackSDKReady?.()
    })
    act(() => mockPlayer.trigger('ready', { device_id: 'device-abc' }))

    expect(result.current.ready).toBe(true)
    expect(result.current.deviceId).toBe('device-abc')
  })

  it('calls player.connect on SDK ready', () => {
    renderHook(() => useSpotifyPlayer('token'))
    act(() => {
      ;(window as any).Spotify = { Player: SpotifyPlayerCtor }
      ;(window as any).onSpotifyWebPlaybackSDKReady?.()
    })
    expect(mockPlayer.connect).toHaveBeenCalled()
  })

  it('disconnects player on unmount', () => {
    const { unmount } = renderHook(() => useSpotifyPlayer('token'))
    act(() => {
      ;(window as any).Spotify = { Player: SpotifyPlayerCtor }
      ;(window as any).onSpotifyWebPlaybackSDKReady?.()
    })
    unmount()
    expect(mockPlayer.disconnect).toHaveBeenCalled()
  })
})
