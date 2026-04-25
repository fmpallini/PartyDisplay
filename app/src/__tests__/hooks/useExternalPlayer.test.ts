import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useExternalPlayer } from '../../hooks/useExternalPlayer'
import type { TrackInfo } from '../../lib/player-types'

const TRACK: TrackInfo = {
  id:        'ext-1',
  name:      'External Song',
  artists:   'Some Artist',
  albumArt:  '',
  duration:  200_000,
  isPlaying: true,
  positionMs: 5000,
}

describe('useExternalPlayer', () => {
  let trackChangedCb: ((e: { payload: TrackInfo | null }) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    trackChangedCb = undefined
    vi.mocked(listen).mockImplementation((event: string, cb: any) => {
      if (event === 'smtc-track-changed') trackChangedCb = cb
      return Promise.resolve(() => {})
    })
  })

  it('calls start_smtc_listener when active=true', async () => {
    renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('start_smtc_listener')
  })

  it('does not call start_smtc_listener when active=false', async () => {
    renderHook(() => useExternalPlayer(false))
    await act(async () => {})
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('start_smtc_listener')
  })

  it('sets track when smtc-track-changed fires with a track', async () => {
    const { result } = renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    act(() => trackChangedCb?.({ payload: TRACK }))
    expect(result.current.track?.name).toBe('External Song')
    expect(result.current.track?.artists).toBe('Some Artist')
  })

  it('clears track when smtc-track-changed fires with null', async () => {
    const { result } = renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    act(() => trackChangedCb?.({ payload: TRACK }))
    act(() => trackChangedCb?.({ payload: null }))
    expect(result.current.track).toBeNull()
  })

  it('sets paused=true when smtc-track-changed fires with null', async () => {
    const { result } = renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    act(() => trackChangedCb?.({ payload: TRACK }))
    act(() => trackChangedCb?.({ payload: null }))
    expect(result.current.paused).toBe(true)
  })

  it('calls stop_smtc_listener on unmount', async () => {
    const { unmount } = renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    unmount()
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('stop_smtc_listener')
  })

  it('returns ready=true when active=true', async () => {
    const { result } = renderHook(() => useExternalPlayer(true))
    expect(result.current.ready).toBe(true)
  })

  it('returns ready=false when active=false', async () => {
    const { result } = renderHook(() => useExternalPlayer(false))
    expect(result.current.ready).toBe(false)
  })

  it('listens on smtc-track-changed event', async () => {
    renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    expect(vi.mocked(listen)).toHaveBeenCalledWith('smtc-track-changed', expect.any(Function))
  })

  it('listens on smtc-position-update event', async () => {
    renderHook(() => useExternalPlayer(true))
    await act(async () => {})
    expect(vi.mocked(listen)).toHaveBeenCalledWith('smtc-position-update', expect.any(Function))
  })
})
