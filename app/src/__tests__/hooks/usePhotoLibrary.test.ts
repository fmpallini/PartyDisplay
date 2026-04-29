import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { usePhotoLibrary } from '../../hooks/usePhotoLibrary'
import { KEYS } from '../../lib/storage-keys'

describe('usePhotoLibrary', () => {
  let photoListCb: ((e: { payload: { paths: string[] } }) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    photoListCb = undefined
    vi.mocked(listen).mockImplementation((event: string, cb: any) => {
      if (event === 'photo-list') photoListCb = cb
      return Promise.resolve(() => {})
    })
    vi.mocked(invoke).mockResolvedValue([])
  })

  it('calls get_photos on mount', async () => {
    renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: false }))
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_photos'))
  })

  it('sorts photos alphabetically in alpha order', async () => {
    vi.mocked(invoke).mockResolvedValue(['c.jpg', 'a.jpg', 'b.jpg'])
    const { result } = renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: false }))
    await waitFor(() => expect(result.current.photos).toHaveLength(3))
    expect(result.current.photos).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('keeps all photos present in shuffle order', async () => {
    const photos = ['c.jpg', 'a.jpg', 'b.jpg']
    vi.mocked(invoke).mockResolvedValue(photos)
    const { result } = renderHook(() => usePhotoLibrary({ order: 'shuffle', recursive: false }))
    await waitFor(() => expect(result.current.photos).toHaveLength(3))
    expect(result.current.photos).toEqual(expect.arrayContaining(photos))
  })

  it('re-sorts existing list when order changes to alpha', async () => {
    vi.mocked(invoke).mockResolvedValue(['c.jpg', 'a.jpg', 'b.jpg'])
    const { result, rerender } = renderHook(
      ({ order }) => usePhotoLibrary({ order, recursive: false }),
      { initialProps: { order: 'shuffle' as const } },
    )
    await waitFor(() => expect(result.current.photos).toHaveLength(3))
    rerender({ order: 'alpha' })
    await waitFor(() => expect(result.current.photos[0]).toBe('a.jpg'))
    expect(result.current.photos).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('setFolder calls watch_folder with correct args', async () => {
    const { result } = renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: true }))
    await act(async () => { await result.current.setFolder('/my/photos') })
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('watch_folder', { path: '/my/photos', recursive: true })
  })

  it('setFolder updates folder state and persists to localStorage', async () => {
    const { result } = renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: false }))
    await act(async () => { await result.current.setFolder('/my/photos') })
    expect(result.current.folder).toBe('/my/photos')
    expect(localStorage.getItem(KEYS.lastPhotoFolder)).toBe('/my/photos')
  })

  it('photo-list event updates photos with correct ordering', async () => {
    const { result } = renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: false }))
    await waitFor(() => expect(photoListCb).toBeDefined())
    act(() => photoListCb!({ payload: { paths: ['z.jpg', 'a.jpg', 'm.jpg'] } }))
    await waitFor(() => expect(result.current.photos).toHaveLength(3))
    expect(result.current.photos).toEqual(['a.jpg', 'm.jpg', 'z.jpg'])
  })

  it('restores initialPhoto from localStorage in alpha order', async () => {
    const folder = '/my/photos'
    localStorage.setItem(KEYS.lastPhotoFolder, folder)
    localStorage.setItem(KEYS.lastPhotoPosition, JSON.stringify({ [folder]: 'b.jpg' }))
    vi.mocked(invoke).mockResolvedValue(['a.jpg', 'b.jpg', 'c.jpg'])
    const { result } = renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: false }))
    await waitFor(() => expect(result.current.initialPhoto).toBe('b.jpg'))
  })

  it('initialPhoto is null when saved photo not in current list', async () => {
    const folder = '/my/photos'
    localStorage.setItem(KEYS.lastPhotoFolder, folder)
    localStorage.setItem(KEYS.lastPhotoPosition, JSON.stringify({ [folder]: 'missing.jpg' }))
    vi.mocked(invoke).mockResolvedValue(['a.jpg', 'b.jpg'])
    const { result } = renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: false }))
    await waitFor(() => expect(result.current.photos).toHaveLength(2))
    expect(result.current.initialPhoto).toBeNull()
  })

  it('initialPhoto is null in shuffle order', async () => {
    vi.mocked(invoke).mockResolvedValue(['a.jpg', 'b.jpg', 'c.jpg'])
    const { result } = renderHook(() => usePhotoLibrary({ order: 'shuffle', recursive: false }))
    await waitFor(() => expect(result.current.photos).toHaveLength(3))
    expect(result.current.initialPhoto).toBeNull()
  })

  it('photos is empty when get_photos returns empty array', async () => {
    vi.mocked(invoke).mockResolvedValue([])
    const { result } = renderHook(() => usePhotoLibrary({ order: 'alpha', recursive: false }))
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_photos'))
    expect(result.current.photos).toHaveLength(0)
    expect(result.current.folder).toBeNull()
  })
})
