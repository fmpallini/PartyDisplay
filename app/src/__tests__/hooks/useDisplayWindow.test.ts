import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useDisplayWindow } from '../../hooks/useDisplayWindow'
import type { MonitorInfo, DisplayState } from '../../hooks/useDisplayWindow'

const PRIMARY: MonitorInfo = {
  name: 'Monitor 1', x: 0, y: 0, width: 1920, height: 1080, is_primary: true,
}
const SECONDARY: MonitorInfo = {
  name: 'Monitor 2', x: 1920, y: 0, width: 1920, height: 1080, is_primary: false,
}
const EMPTY_STATE: DisplayState = {
  monitor_name: null, x: 0, y: 0, width: 0, height: 0, fullscreen: false, is_open: false, initialized: false,
}

/** Build a per-command invoke mock so the polling effect never corrupts ordering. */
function mockInvoke(opts: {
  monitors?: MonitorInfo[]
  state?: DisplayState
  openResult?: unknown
  closeResult?: unknown
}) {
  const monitors = opts.monitors ?? [PRIMARY]
  const state    = opts.state    ?? EMPTY_STATE
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'get_monitors')          return Promise.resolve(monitors)
    if (cmd === 'load_display_state')    return Promise.resolve(state)
    if (cmd === 'open_display_window')   return Promise.resolve(opts.openResult ?? undefined)
    if (cmd === 'close_display_window')  return Promise.resolve(opts.closeResult ?? undefined)
    if (cmd === 'set_display_fullscreen') return Promise.resolve(undefined)
    return Promise.resolve(undefined)
  })
}

describe('useDisplayWindow', () => {
  let fullscreenChangedCb: ((e: { payload: { fullscreen: boolean } }) => void) | undefined

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    fullscreenChangedCb = undefined
    vi.mocked(listen).mockImplementation((event: string, cb: any) => {
      if (event === 'fullscreen-changed') fullscreenChangedCb = cb
      return Promise.resolve(() => {})
    })
  })

  afterEach(() => vi.useRealTimers())

  it('loads monitors on mount', async () => {
    mockInvoke({ monitors: [PRIMARY] })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.monitors).toHaveLength(1))
    expect(result.current.monitors[0].name).toBe('Monitor 1')
  })

  it('auto-selects secondary monitor when one is available', async () => {
    mockInvoke({ monitors: [PRIMARY, SECONDARY] })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.selectedMonitor).toBe('Monitor 2'))
  })

  it('falls back to first monitor when all are primary', async () => {
    mockInvoke({ monitors: [PRIMARY] })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.selectedMonitor).toBe('Monitor 1'))
  })

  it('restores saved monitor_name from DisplayState', async () => {
    const saved: DisplayState = { ...EMPTY_STATE, monitor_name: 'Monitor 2' }
    mockInvoke({ monitors: [PRIMARY, SECONDARY], state: saved })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.selectedMonitor).toBe('Monitor 2'))
  })

  it('auto-opens window when saved DisplayState.is_open is true', async () => {
    const openState: DisplayState = { ...EMPTY_STATE, is_open: true }
    mockInvoke({ monitors: [PRIMARY], state: openState })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.isOpen).toBe(true))
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'open_display_window',
      expect.objectContaining({ fullscreen: false }),
    )
  })

  it('selectMonitor updates selectedMonitor', async () => {
    mockInvoke({ monitors: [PRIMARY, SECONDARY] })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.monitors).toHaveLength(2))
    act(() => result.current.selectMonitor('Monitor 1'))
    expect(result.current.selectedMonitor).toBe('Monitor 1')
  })

  it('openWindow calls invoke open_display_window and sets isOpen=true', async () => {
    mockInvoke({ monitors: [PRIMARY] })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.monitors).toHaveLength(1))
    await act(async () => { await result.current.openWindow() })
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'open_display_window',
      expect.objectContaining({ fullscreen: false }),
    )
    expect(result.current.isOpen).toBe(true)
  })

  it('closeWindow calls invoke close_display_window and sets isOpen=false', async () => {
    mockInvoke({ monitors: [PRIMARY] })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.monitors).toHaveLength(1))
    await act(async () => { await result.current.openWindow() })
    await act(async () => { await result.current.closeWindow() })
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('close_display_window')
    expect(result.current.isOpen).toBe(false)
  })

  it('fullscreen-changed event updates fullscreen state', async () => {
    mockInvoke({ monitors: [PRIMARY] })
    const { result } = renderHook(() => useDisplayWindow())
    await waitFor(() => expect(result.current.monitors).toHaveLength(1))
    act(() => fullscreenChangedCb?.({ payload: { fullscreen: true } }))
    expect(result.current.fullscreen).toBe(true)
  })
})
