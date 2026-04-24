import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useWeather } from '../../hooks/useWeather'

const GEO_RESPONSE = {
  results: [{ latitude: 48.85, longitude: 2.35, name: 'Paris', country: 'France' }],
}
const WEATHER_RESPONSE = {
  current: { temperature_2m: 18.5, weather_code: 1 },
}

function stubFetch(...responses: Array<{ ok: boolean; status?: number; body?: object }>) {
  let i = 0
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    const r = responses[i++ % responses.length]
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? 200,
      json: () => Promise.resolve(r.body ?? {}),
    })
  }))
}

describe('useWeather', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('fetches weather for a named city via geocoding', async () => {
    stubFetch(
      { ok: true, body: GEO_RESPONSE },
      { ok: true, body: WEATHER_RESPONSE },
    )
    const { result } = renderHook(() => useWeather('celsius', 'Paris'))
    await waitFor(() => expect(result.current[0]).not.toBeNull())
    expect(result.current[0]?.locationName).toBe('Paris, France')
    expect(result.current[0]?.temperature).toBe(18.5)
    expect(result.current[0]?.weatherCode).toBe(1)
    expect(result.current[1]).toBeNull()
  })

  it('falls back to IP geolocation when city is empty', async () => {
    vi.mocked(invoke).mockResolvedValue({ lat: 40.71, lon: -74.0, city: 'New York', country: 'US' })
    stubFetch({ ok: true, body: WEATHER_RESPONSE })
    const { result } = renderHook(() => useWeather('celsius', ''))
    await waitFor(() => expect(result.current[0]).not.toBeNull())
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_ip_location')
    expect(result.current[0]?.locationName).toBe('New York, US')
  })

  it('returns error state when weather fetch fails', async () => {
    stubFetch(
      { ok: true, body: GEO_RESPONSE },
      { ok: false, status: 503 },
    )
    const { result } = renderHook(() => useWeather('celsius', 'Paris'))
    await waitFor(() => expect(result.current[1]).not.toBeNull())
    expect(result.current[0]).toBeNull()
    expect(result.current[1]).toContain('503')
  })
})
