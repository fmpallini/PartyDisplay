import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useBattery } from '../../hooks/useBattery'

describe('useBattery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts with available: false before first poll resolves', () => {
    vi.mocked(invoke).mockResolvedValue({ level: 80, charging: true, available: true })
    const { result } = renderHook(() => useBattery(100))
    expect(result.current.available).toBe(false)
  })

  it('updates state after first poll resolves', async () => {
    vi.mocked(invoke).mockResolvedValue({ level: 80, charging: true, available: true })
    const { result } = renderHook(() => useBattery(100))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(result.current.level).toBe(80)
    expect(result.current.charging).toBe(true)
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_battery_status')
  })

  it('clears poll interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    vi.mocked(invoke).mockResolvedValue({ level: 100, charging: false, available: false })
    const { unmount } = renderHook(() => useBattery(100))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
