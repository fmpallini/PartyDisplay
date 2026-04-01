import { useEffect, useState } from 'react'

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
  // IP geolocation fallback
  const res = await fetch('https://ipapi.co/json/', { signal })
  if (!res.ok) throw new Error(`ip geolocation HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`ip geolocation error: ${json.reason}`)
  const lat = json.latitude
  const lon = json.longitude
  const city2 = json.city
  const country = json.country_name
  if (typeof lat !== 'number' || typeof lon !== 'number' || !city2 || !country) {
    throw new Error('ip geolocation response missing required fields')
  }
  return { lat, lon, name: `${city2}, ${country}` }
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
  return {
    locationName: name,
    temperature: json.current.temperature_2m,
    weatherCode: json.current.weather_code,
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
