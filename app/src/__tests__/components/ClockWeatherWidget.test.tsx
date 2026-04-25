import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClockWeatherWidget } from '../../components/ClockWeatherWidget'
import type { WeatherData } from '../../hooks/useWeather'

// WeatherIcon renders an SVG/icon — mock it to keep tests simple
vi.mock('../../components/WeatherIcon', () => ({
  WeatherIcon: () => <span data-testid="weather-icon" />,
}))

const WEATHER: WeatherData = { locationName: 'Paris, France', temperature: 18.3, weatherCode: 1 }
const POSITION = 'bottom-left' as const

describe('ClockWeatherWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T14:05:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('renders a time string in 24h format', () => {
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="celsius" weather={null} />)
    // formatTime 24h: padStart(2,'0') → "HH:MM"
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('renders AM/PM in 12h format', () => {
    render(<ClockWeatherWidget timeFormat="12h" position={POSITION} tempUnit="celsius" weather={null} />)
    expect(screen.getByText(/AM|PM/)).toBeInTheDocument()
  })

  it('renders temperature and city name when weather is provided', () => {
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="celsius" weather={WEATHER} />)
    // Math.round(18.3) = 18, unit label appended directly: "18°C"
    expect(screen.getByText(/18.*°C/)).toBeInTheDocument()
    expect(screen.getByText('Paris, France')).toBeInTheDocument()
  })

  it('renders °F unit label when tempUnit is fahrenheit', () => {
    const w: WeatherData = { ...WEATHER, temperature: 64.9 }
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="fahrenheit" weather={w} />)
    expect(screen.getByText(/°F/)).toBeInTheDocument()
  })

  it('does not render weather section when weather is null', () => {
    render(<ClockWeatherWidget timeFormat="24h" position={POSITION} tempUnit="celsius" weather={null} />)
    expect(screen.queryByText(/°C|°F/)).not.toBeInTheDocument()
    expect(screen.queryByText('Paris, France')).not.toBeInTheDocument()
  })

  it('renders debugError when provided and weather is null', () => {
    render(
      <ClockWeatherWidget
        timeFormat="24h"
        position={POSITION}
        tempUnit="celsius"
        weather={null}
        debugError="fetch failed: 503"
      />
    )
    expect(screen.getByText('fetch failed: 503')).toBeInTheDocument()
  })

  it('does not render debugError when weather data is present', () => {
    render(
      <ClockWeatherWidget
        timeFormat="24h"
        position={POSITION}
        tempUnit="celsius"
        weather={WEATHER}
        debugError="fetch failed: 503"
      />
    )
    expect(screen.queryByText('fetch failed: 503')).not.toBeInTheDocument()
  })
})
