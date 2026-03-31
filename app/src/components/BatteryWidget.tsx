import type { BatteryStatus } from '../hooks/useBattery'

interface Props {
  status: BatteryStatus
  size:   number  // height in px
}

// 5-step color scale: green → yellow-green → yellow → orange → red
function levelColor(pct: number): string {
  if (pct > 80) return '#4caf50'
  if (pct > 60) return '#8bc34a'
  if (pct > 40) return '#ffeb3b'
  if (pct > 20) return '#ff9800'
  return '#f44336'
}

// Bolt-in-circle icon for desktop / AC power (no battery)
function AcIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" style={{ display: 'block' }}>
      <circle cx="15" cy="15" r="13"
        fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
      <path d="M 17 4 L 10 16 L 14.5 16 L 13 26 L 20 14 L 15.5 14 Z"
        fill="rgba(255,255,255,0.9)" />
    </svg>
  )
}

export function BatteryWidget({ status, size }: Props) {
  // Desktop (no battery) — show AC icon
  if (!status.available) {
    if (!status.charging) return null
    return (
      <div style={containerStyle}>
        <AcIcon size={size} />
      </div>
    )
  }

  // Vertical battery: viewBox 0 0 16 30, height = size, width derived from aspect ratio
  const h  = size
  const w  = Math.round(h * 16 / 30)

  // Fill area: y=5 to y=27 (height=22) in viewBox units, bottom-aligned
  const fillAreaH = 22
  const fillAreaY = 27 - (status.level / 100) * fillAreaH
  const fillH     = (status.level / 100) * fillAreaH
  const fillColor = levelColor(status.level)

  return (
    <div style={containerStyle}>
      <svg
        width={w} height={h}
        viewBox="0 0 16 30"
        fill="none"
        style={{ display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
      >
        {/* Terminal bump (top) */}
        <rect x="5" y="0" width="6" height="4" rx="1.5"
          fill="rgba(255,255,255,0.85)" />

        {/* Body outline */}
        <rect x="1" y="3.5" width="14" height="25.5" rx="3"
          fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />

        {/* Level fill (bottom-aligned) */}
        {fillH > 0 && (
          <rect x="2.75" y={fillAreaY} width="10.5" height={fillH} rx="2"
            fill={fillColor} />
        )}

        {/* Charging bolt */}
        {status.charging && (
          <path
            d="M 9.5 8 L 5.5 17 L 8.5 17 L 6.5 24 L 10.5 16 L 7.5 16 Z"
            fill="white" opacity={0.9}
          />
        )}
      </svg>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
