import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useDlnaBrowser } from '../../hooks/useDlnaBrowser'
import type { DlnaServer, DlnaContainer, DlnaItem } from '../../hooks/useDlnaBrowser'

const SERVER: DlnaServer = { name: 'My NAS', location: 'http://192.168.1.10:1234/desc.xml' }
const CONTAINER_A: DlnaContainer = { id: '10', title: 'Music' }
const CONTAINER_B: DlnaContainer = { id: '20', title: 'Albums' }
const ITEM: DlnaItem = { id: '100', title: 'Track 1.mp3', artist: null, album_art: null, url: 'http://192.168.1.10/track1.mp3', mime: 'audio/mpeg', duration_ms: null }

const EMPTY_RESULT     = { containers: [], items: [] }
const RESULT_A         = { containers: [CONTAINER_A], items: [] }
const RESULT_B         = { containers: [CONTAINER_B], items: [] }
const RESULT_WITH_ITEM = { containers: [], items: [ITEM] }

describe('useDlnaBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('starts with empty servers, no server, discovering=false', () => {
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    expect(result.current.servers).toHaveLength(0)
    expect(result.current.server).toBeNull()
    expect(result.current.discovering).toBe(false)
  })

  it('discover sets servers list', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([SERVER]) // dlna_discover
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await act(async () => { await result.current.discover() })
    expect(result.current.servers).toHaveLength(1)
    expect(result.current.servers[0].name).toBe('My NAS')
  })

  it('discover sets discovering=true while in-flight and false on completion', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(invoke).mockReturnValueOnce(new Promise(r => { resolve = r }))
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    act(() => { result.current.discover() })
    expect(result.current.discovering).toBe(true)
    await act(async () => { resolve([]) })
    expect(result.current.discovering).toBe(false)
  })

  it('selectServer calls dlna_browse with containerId=0 and sets server', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(RESULT_A) // dlna_browse
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await act(async () => { await result.current.selectServer(SERVER) })
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('dlna_browse', {
      location: SERVER.location, containerId: '0',
    })
    expect(result.current.server).toEqual(SERVER)
    expect(result.current.containers).toHaveLength(1)
    expect(result.current.breadcrumb).toHaveLength(0)
  })

  it('selectServer persists server to localStorage', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(EMPTY_RESULT)
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await act(async () => { await result.current.selectServer(SERVER) })
    const saved = JSON.parse(localStorage.getItem('test_key') ?? 'null')
    expect(saved).not.toBeNull()
    expect(saved.name).toBe('My NAS')
    expect(saved.location).toBe(SERVER.location)
  })

  it('browse pushes container to breadcrumb and loads its children', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(RESULT_A)         // selectServer
      .mockResolvedValueOnce(RESULT_WITH_ITEM) // browse(CONTAINER_A)
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await act(async () => { await result.current.selectServer(SERVER) })
    await act(async () => { await result.current.browse(CONTAINER_A) })
    expect(result.current.breadcrumb).toHaveLength(1)
    expect(result.current.breadcrumb[0].id).toBe('10')
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].title).toBe('Track 1.mp3')
  })

  it('back pops breadcrumb and browses parent container', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(RESULT_A) // selectServer
      .mockResolvedValueOnce(RESULT_B) // browse(CONTAINER_A)
      .mockResolvedValueOnce(RESULT_A) // back → browse root
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await act(async () => { await result.current.selectServer(SERVER) })
    await act(async () => { await result.current.browse(CONTAINER_A) })
    await act(async () => { await result.current.back() })
    expect(result.current.breadcrumb).toHaveLength(0)
    expect(vi.mocked(invoke)).toHaveBeenLastCalledWith('dlna_browse', {
      location: SERVER.location, containerId: '0',
    })
  })

  it('reset clears all state and removes localStorage key', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(EMPTY_RESULT)
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await act(async () => { await result.current.selectServer(SERVER) })
    act(() => result.current.reset())
    expect(result.current.server).toBeNull()
    expect(result.current.containers).toHaveLength(0)
    expect(result.current.breadcrumb).toHaveLength(0)
    expect(localStorage.getItem('test_key')).toBeNull()
  })

  it('sets error when dlna_browse rejects', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await act(async () => { await result.current.selectServer(SERVER) })
    await waitFor(() => expect(result.current.error).toMatch(/Network error/))
  })

  it('sets loading=true while browse is in-flight', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(invoke).mockReturnValueOnce(new Promise(r => { resolve = r }))
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    act(() => { result.current.selectServer(SERVER) })
    expect(result.current.loading).toBe(true)
    await act(async () => { resolve(EMPTY_RESULT) })
    expect(result.current.loading).toBe(false)
  })

  it('restores server from localStorage on mount and browses saved container', async () => {
    const savedState = { location: SERVER.location, name: SERVER.name, breadcrumb: [CONTAINER_A] }
    localStorage.setItem('test_key', JSON.stringify(savedState))
    vi.mocked(invoke).mockResolvedValueOnce(RESULT_WITH_ITEM) // restore browse
    const { result } = renderHook(() => useDlnaBrowser('test_key'))
    await waitFor(() => expect(result.current.server).not.toBeNull())
    expect(result.current.server?.name).toBe('My NAS')
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('dlna_browse', {
      location: SERVER.location, containerId: '10',
    })
  })
})
