import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { listen } from '@tauri-apps/api/event'
import { SongToast } from '../../components/SongToast'

type ListenCallback = (e: { payload: { name: string; artists: string; albumArt: string } }) => void

describe('SongToast', () => {
  let trackChangedCb: ListenCallback | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    trackChangedCb = undefined
    vi.mocked(listen).mockImplementation((_event: string, cb: any) => {
      trackChangedCb = cb
      return Promise.resolve(() => {})
    })
  })

  it('renders nothing before any track-changed event', () => {
    const { container } = render(<SongToast displayMs={3000} zoom={1} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows track name and artist after track-changed fires', async () => {
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'My Song', artists: 'My Artist', albumArt: '' } })
    })
    expect(screen.getByText('My Song')).toBeInTheDocument()
    expect(screen.getByText('My Artist')).toBeInTheDocument()
  })

  /** Walk up from element until we find the div that has opacity set */
  function getToastWrapper(el: HTMLElement): HTMLElement {
    let node: HTMLElement | null = el
    while (node) {
      if (node.tagName === 'DIV' && node.style.opacity !== '') return node
      node = node.parentElement
    }
    throw new Error('Could not find toast wrapper with opacity style')
  }

  it('toast is visible (opacity 1) immediately after track-changed', async () => {
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'My Song', artists: 'My Artist', albumArt: '' } })
    })
    const toast = getToastWrapper(screen.getByText('My Song'))
    expect(toast.style.opacity).toBe('1')
  })

  it('toast becomes invisible (opacity 0) after displayMs', async () => {
    vi.useFakeTimers()
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'My Song', artists: 'My Artist', albumArt: '' } })
    })
    act(() => vi.advanceTimersByTime(3001))
    const toast = getToastWrapper(screen.getByText('My Song'))
    expect(toast.style.opacity).toBe('0')
    vi.useRealTimers()
  })

  it('resets timer when a second track-changed fires before timeout', async () => {
    vi.useFakeTimers()
    render(<SongToast displayMs={3000} zoom={1} />)
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'First', artists: 'A', albumArt: '' } })
    })
    act(() => vi.advanceTimersByTime(1500))
    await act(async () => {
      trackChangedCb?.({ payload: { name: 'Second', artists: 'B', albumArt: '' } })
    })
    act(() => vi.advanceTimersByTime(1600))
    const toast = getToastWrapper(screen.getByText('Second'))
    expect(toast.style.opacity).toBe('1') // still visible, 1600ms < 3000ms
    vi.useRealTimers()
  })
})
