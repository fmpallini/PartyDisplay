import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { listen, emit } from '@tauri-apps/api/event'
import { useDisplaySync, advancePhoto, clearPhotos } from '../../hooks/useDisplaySync'

const CONCRETE_EFFECTS = [
  'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down',
  'zoom-in', 'zoom-out', 'blur',
]

describe('useDisplaySync', () => {
  let advanceCb: ((e: { payload: { photo: string; index: number; total: number } }) => void) | undefined
  let clearCb:   ((e: object) => void) | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    advanceCb = undefined
    clearCb   = undefined
    vi.mocked(listen).mockImplementation((event: string, cb: any) => {
      if (event === 'photo-advance')  advanceCb = cb
      if (event === 'photos-cleared') clearCb   = cb
      return Promise.resolve(() => {})
    })
  })
  afterEach(() => vi.useRealTimers())

  it('starts with null currentPhoto, previousPhoto, and transitioning=false', async () => {
    const { result } = renderHook(() => useDisplaySync([]))
    await act(async () => {})
    expect(result.current.currentPhoto).toBeNull()
    expect(result.current.previousPhoto).toBeNull()
    expect(result.current.transitioning).toBe(false)
  })

  it('sets currentPhoto when photo-advance fires with a local asset URL', async () => {
    const { result } = renderHook(() => useDisplaySync([]))
    await act(async () => {})
    act(() => advanceCb?.({ payload: { photo: 'asset://photo1.jpg', index: 0, total: 3 } }))
    expect(result.current.currentPhoto).toBe('asset://photo1.jpg')
  })

  it('sets previousPhoto to prior currentPhoto on second advance', async () => {
    const { result } = renderHook(() => useDisplaySync([]))
    await act(async () => {})
    act(() => advanceCb?.({ payload: { photo: 'asset://photo1.jpg', index: 0, total: 2 } }))
    act(() => advanceCb?.({ payload: { photo: 'asset://photo2.jpg', index: 1, total: 2 } }))
    expect(result.current.previousPhoto).toBe('asset://photo1.jpg')
    expect(result.current.currentPhoto).toBe('asset://photo2.jpg')
  })

  it('sets transitioning=true on advance and false after duration elapses', async () => {
    const { result } = renderHook(() =>
      useDisplaySync([], { transitionEffect: 'fade', transitionDurationMs: 500 })
    )
    await act(async () => {})
    act(() => advanceCb?.({ payload: { photo: 'asset://photo1.jpg', index: 0, total: 1 } }))
    expect(result.current.transitioning).toBe(true)
    // Hook adds 50 ms buffer: setTimeout fires at transitionDurationMs + 50
    act(() => vi.advanceTimersByTime(550))
    expect(result.current.transitioning).toBe(false)
  })

  it('sets activeEffect to the specified concrete effect', async () => {
    const { result } = renderHook(() =>
      useDisplaySync([], { transitionEffect: 'slide-left', transitionDurationMs: 0 })
    )
    await act(async () => {})
    act(() => advanceCb?.({ payload: { photo: 'asset://photo1.jpg', index: 0, total: 1 } }))
    expect(result.current.activeEffect).toBe('slide-left')
  })

  it('resolves random transitionEffect to a concrete effect', async () => {
    const { result } = renderHook(() =>
      useDisplaySync([], { transitionEffect: 'random', transitionDurationMs: 0 })
    )
    await act(async () => {})
    act(() => advanceCb?.({ payload: { photo: 'asset://photo1.jpg', index: 0, total: 1 } }))
    expect(CONCRETE_EFFECTS).toContain(result.current.activeEffect)
  })

  it('clears all state when photos-cleared fires', async () => {
    const { result } = renderHook(() => useDisplaySync([]))
    await act(async () => {})
    act(() => advanceCb?.({ payload: { photo: 'asset://photo1.jpg', index: 0, total: 1 } }))
    act(() => clearCb?.({}))
    expect(result.current.currentPhoto).toBeNull()
    expect(result.current.previousPhoto).toBeNull()
    expect(result.current.transitioning).toBe(false)
  })

  it('registers photo-advance listener on mount', async () => {
    renderHook(() => useDisplaySync([]))
    await act(async () => {})
    expect(vi.mocked(listen)).toHaveBeenCalledWith('photo-advance', expect.any(Function))
  })

  it('registers photos-cleared listener on mount', async () => {
    renderHook(() => useDisplaySync([]))
    await act(async () => {})
    expect(vi.mocked(listen)).toHaveBeenCalledWith('photos-cleared', expect.any(Function))
  })

  it('advancePhoto emits photo-advance with correct payload', async () => {
    await advancePhoto('asset://img.jpg', 2, 10)
    expect(vi.mocked(emit)).toHaveBeenCalledWith('photo-advance', {
      photo: 'asset://img.jpg', index: 2, total: 10,
    })
  })

  it('clearPhotos emits photos-cleared', async () => {
    await clearPhotos()
    expect(vi.mocked(emit)).toHaveBeenCalledWith('photos-cleared', {})
  })
})
