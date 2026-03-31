import type React from 'react'

// WMO 4677 weather code → icon mapping
// 0        = clear sky     → Sun
// 1, 2     = partly cloudy → PartlyCloudy
// 3        = overcast      → Cloud
// 45, 48   = fog           → Fog
// 51–57    = drizzle       → Drizzle
// 61–67, 80–82 = rain      → Rain
// 71–77, 85–86 = snow      → Snow
// 95, 96, 99   = thunder   → Thunderstorm

interface IconProps { size: number }

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  viewBox: '0 0 24 24',
  width: size,
  height: size,
  fill: 'none',
  stroke: 'white',
  strokeWidth: '1.5',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

function SunSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2"  x2="12" y2="5"  />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2"  y1="12" x2="5"  y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="5.22"  y1="5.22"  x2="7.34"  y2="7.34"  />
      <line x1="16.66" y1="16.66" x2="18.78" y2="18.78" />
      <line x1="5.22"  y1="18.78" x2="7.34"  y2="16.66" />
      <line x1="16.66" y1="7.34"  x2="18.78" y2="5.22"  />
    </svg>
  )
}

function PartlyCloudySvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      {/* Small sun rays in upper-left */}
      <circle cx="9" cy="7" r="2.5" />
      <line x1="9" y1="2" x2="9" y2="4" />
      <line x1="4" y1="7" x2="6" y2="7" />
      <line x1="5.93" y1="3.93" x2="7.34" y2="5.34" />
      {/* Cloud in front */}
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 0 9Z" />
    </svg>
  )
}

function CloudSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 0 9Z" />
    </svg>
  )
}

function FogSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <line x1="3" y1="19" x2="21" y2="19" />
      <line x1="5" y1="22" x2="19" y2="22" />
    </svg>
  )
}

function DrizzleSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <line x1="8"  y1="18" x2="8"  y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="16" y1="18" x2="16" y2="21" />
    </svg>
  )
}

function RainSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <line x1="8"  y1="18" x2="6"  y2="22" />
      <line x1="12" y1="18" x2="10" y2="22" />
      <line x1="16" y1="18" x2="14" y2="22" />
    </svg>
  )
}

function SnowSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      {/* Three snowflake crosses */}
      <line x1="8"  y1="18" x2="8"  y2="22" />
      <line x1="6"  y1="20" x2="10" y2="20" />
      <line x1="13" y1="18" x2="13" y2="22" />
      <line x1="11" y1="20" x2="15" y2="20" />
      <line x1="18" y1="18" x2="18" y2="22" />
      <line x1="16" y1="20" x2="20" y2="20" />
    </svg>
  )
}

function ThunderstormSvg({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 16H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 0 1 1 8.9" />
      <polyline points="13,17 11,21 14,21 12,23" />
    </svg>
  )
}

export function WeatherIcon({ code, size = 22 }: { code: number; size?: number }) {
  if (code === 0)                                           return <SunSvg size={size} />
  if (code <= 2)                                           return <PartlyCloudySvg size={size} />
  if (code === 3)                                          return <CloudSvg size={size} />
  if (code === 45 || code === 48)                          return <FogSvg size={size} />
  if (code >= 51 && code <= 57)                            return <DrizzleSvg size={size} />
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return <RainSvg size={size} />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <SnowSvg size={size} />
  if (code === 95 || code === 96 || code === 99)           return <ThunderstormSvg size={size} />
  return <CloudSvg size={size} />  // fallback for unknown codes
}
