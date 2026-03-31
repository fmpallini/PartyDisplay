import { useEffect, useState } from 'react'
import type { TrackPosition } from './DisplaySettingsPanel'
import type { WeatherData } from '../hooks/useWeather'
import { WeatherIcon } from './WeatherIcon'

function formatTime(date: Date, format: '12h' | '24h'): string {
  if (format === '24h') {
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  let h = date.getHours()
  const m = String(date.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

interface Props {
  timeFormat: '12h' | '24h'
  position: TrackPosition
  tempUnit: 'celsius' | 'fahrenheit'
  weather: WeatherData | null
  debugError?: string | null
  embedded?: boolean
}

export function ClockWeatherWidget({ timeFormat, position, tempUnit, weather, debugError, embedded }: Props) {
  const [time, setTime] = useState(() => formatTime(new Date(), timeFormat))

  useEffect(() => {
    function tick() { setTime(formatTime(new Date(), timeFormat)) }
    tick()
    const id = setInterval(tick, 60 * 1000)
    return () => clearInterval(id)
  }, [timeFormat, weather])

  const posStyle: React.CSSProperties = embedded ? {} : {
    position: 'absolute',
    top:    position.startsWith('top')    ? 16 : undefined,
    bottom: position.startsWith('bottom') ? 16 : undefined,
    left:   position.endsWith('left')     ? 16 : undefined,
    right:  position.endsWith('right')    ? 16 : undefined,
  }

  const unitLabel = tempUnit === 'celsius' ? '°C' : '°F'

  return (
    <div style={{
      ...posStyle,
      zIndex: 15,
      pointerEvents: 'none',
      padding: '8px 14px',
      borderRadius: 12,
      background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(2px)',
      color: '#fff',
      minWidth: 110,
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '1px' }}>
        {time}
      </div>
      {!weather && debugError && (
        <div style={{ fontSize: 10, color: '#f88', marginTop: 5, maxWidth: 180, wordBreak: 'break-word' }}>
          {debugError}
        </div>
      )}
      {weather && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
            <WeatherIcon code={weather.weatherCode} size={24} />
            <span style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 18, fontWeight: 600 }}>
              {Math.round(weather.temperature)}{unitLabel}
            </span>
          </div>
          <div style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12,
            opacity: 0.7,
            marginTop: 5,
            whiteSpace: 'nowrap',
          }}>
            {weather.locationName}
          </div>
        </>
      )}
    </div>
  )
}
