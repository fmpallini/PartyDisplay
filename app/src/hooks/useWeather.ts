import { useEffect, useState } from 'react'

export interface WeatherData {
  locationName: string
  temperature: number   // value in the unit requested (celsius or fahrenheit)
  weatherCode: number   // WMO 4677 code
}

async function resolveLocation(city: string): Promise<{ lat: number; lon: number; name: string }> {
  if (city.trim()) {
    console.log('[useWeather] resolving city via geocoding:', city.trim())
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1`
      const res = await fetch(url)
      console.log('[useWeather] geocoding response status:', res.status)
      if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`)
      const json = await res.json()
      console.log('[useWeather] geocoding result:', json)
      if (json.results?.length) {
        const r = json.results[0]
        return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country}` }
      }
      console.warn('[useWeather] geocoding returned no results, falling back to IP')
    } catch (err) {
      console.warn('[useWeather] geocoding failed, falling back to IP:', err)
    }
  }
  // IP geolocation fallback
  console.log('[useWeather] resolving location via IP geolocation')
  const res = await fetch('https://ipapi.co/json/')
  console.log('[useWeather] ipapi.co response status:', res.status)
  if (!res.ok) throw new Error(`ip geolocation HTTP ${res.status}`)
  const json = await res.json()
  console.log('[useWeather] ipapi.co result:', json)
  if (json.error) throw new Error(`ip geolocation error: ${json.reason}`)
  return { lat: json.latitude, lon: json.longitude, name: `${json.city}, ${json.country_name}` }
}

async function fetchWeatherData(
  city: string,
  tempUnit: 'celsius' | 'fahrenheit',
): Promise<WeatherData> {
  const { lat, lon, name } = await resolveLocation(city)
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=${tempUnit}`
  console.log('[useWeather] fetching weather:', url)
  const res = await fetch(url)
  console.log('[useWeather] weather response status:', res.status)
  if (!res.ok) throw new Error(`weather fetch HTTP ${res.status}`)
  const json = await res.json()
  console.log('[useWeather] weather result:', json)
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
    let cancelled = false

    async function doFetch() {
      console.log(`[useWeather] doFetch — city="${city}" tempUnit="${tempUnit}"`)
      try {
        const result = await fetchWeatherData(city, tempUnit)
        console.log('[useWeather] fetch succeeded:', result)
        if (!cancelled) { setData(result); setError(null) }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[useWeather] fetch failed:', msg)
        if (!cancelled) setError(msg)
      }
    }

    // Clear data immediately on city/unit change so widget shows clock-only
    // while the new fetch is in flight
    setData(null)
    doFetch()
    const id = setInterval(doFetch, 30 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [city, tempUnit])

  return [data, error]
}
