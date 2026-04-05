import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface WeatherData {
  locationName: string
  temperature: number   // value in the unit requested (celsius or fahrenheit)
  weatherCode: number   // WMO 4677 code
}

async function resolveLocation(city: string, signal: AbortSignal): Promise<{ lat: number; lon: number; name: string }> {
  if (city.trim()) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1`
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`)
      const json = await res.json()
      if (json.results?.length) {
        const r = json.results[0]
        return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country}` }
      }
      console.warn('[useWeather] geocoding returned no results, falling back to IP')
    } catch (err) {
      if ((err as any)?.name === 'AbortError') throw err
      console.warn('[useWeather] geocoding failed, falling back to IP:', err)
    }
  }
  // IP geolocation fallback — done via Rust backend to avoid CORS restrictions
  const loc = await invoke<{ lat: number; lon: number; city: string; country: string }>('get_ip_location')
  return { lat: loc.lat, lon: loc.lon, name: `${loc.city}, ${loc.country}` }
}

async function fetchWeatherData(
  city: string,
  tempUnit: 'celsius' | 'fahrenheit',
  signal: AbortSignal,
): Promise<WeatherData> {
  const { lat, lon, name } = await resolveLocation(city, signal)
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=${tempUnit}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`weather fetch HTTP ${res.status}`)
  const json = await res.json()
  const temperature = json.current?.temperature_2m
  const weatherCode = json.current?.weather_code
  if (temperature === undefined || temperature === null) throw new Error('Missing temperature in weather response')
  return {
    locationName: name,
    temperature,
    weatherCode: weatherCode ?? 0,
  }
}

export function useWeather(
  tempUnit: 'celsius' | 'fahrenheit',
  city: string,
): [WeatherData | null, string | null] {
  const [data,  setData]  = useState<WeatherData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    async function doFetch() {
      try {
        const result = await fetchWeatherData(city, tempUnit, signal)
        setData(result)
        setError(null)
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[useWeather] fetch failed:', msg)
        setError(msg)
      }
    }

    // Clear data immediately on city/unit change so widget shows clock-only
    // while the new fetch is in flight
    setData(null)
    doFetch()
    const id = setInterval(doFetch, 30 * 60 * 1000)

    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [city, tempUnit])

  return [data, error]
}
