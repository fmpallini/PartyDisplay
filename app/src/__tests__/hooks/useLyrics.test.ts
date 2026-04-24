import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLyrics } from '../../hooks/useLyrics'
import type { TrackInfo } from '../../lib/player-types'

function makeTrack(id: string): TrackInfo {
  return { id, name: 'Test Song', artists: 'Test Artist', albumArt: '', duration: 180_000 }
}

describe('useLyrics', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('returns idle status when track is null', () => {
    const { result } = renderHook(() => useLyrics(null, 0))
    expect(result.current.status).toBe('idle')
    expect(result.current.lines).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
  })

  it('fetches and parses synced LRC lyrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        syncedLyrics: '[00:01.00] Hello world\n[00:05.50] Second line',
        plainLyrics: null,
      }),
    }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-1'), 0))
    await waitFor(() => expect(result.current.status).toBe('synced'))
    expect(result.current.lines).toHaveLength(2)
    expect(result.current.lines[0]).toEqual({ timeMs: 1000, text: 'Hello world' })
    expect(result.current.lines[1]).toEqual({ timeMs: 5500, text: 'Second line' })
  })

  it('returns not_found when server returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-2'), 0))
    await waitFor(() => expect(result.current.status).toBe('not_found'))
    expect(result.current.lines).toHaveLength(0)
  })

  it('returns error status on server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-3'), 0))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('returns unsynced status when only plainLyrics available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        syncedLyrics: null,
        plainLyrics: 'Line one\nLine two',
      }),
    }))
    const { result } = renderHook(() => useLyrics(makeTrack('lrc-4'), 0))
    await waitFor(() => expect(result.current.status).toBe('unsynced'))
    expect(result.current.lines).toHaveLength(2)
  })

  it('derives currentIndex correctly from positionMs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        syncedLyrics: '[00:01.00] Line 1\n[00:05.00] Line 2\n[00:10.00] Line 3',
        plainLyrics: null,
      }),
    }))
    const { result, rerender } = renderHook(
      ({ pos }) => useLyrics(makeTrack('lrc-5'), pos),
      { initialProps: { pos: 0 } },
    )
    await waitFor(() => expect(result.current.status).toBe('synced'))
    expect(result.current.currentIndex).toBe(-1) // before 1000ms
    rerender({ pos: 1500 })
    expect(result.current.currentIndex).toBe(0)  // after 1000ms line
    rerender({ pos: 11_000 })
    expect(result.current.currentIndex).toBe(2)  // after 10000ms line
  })
})
