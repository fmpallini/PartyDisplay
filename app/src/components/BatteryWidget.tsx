import type { BatteryStatus } from '../hooks/useBattery'

interface Props {
  status: BatteryStatus
  size:   number  // height in px; width is derived from aspect ratio
}

// 5-step color scale: green → yellow-green → yellow → orange → red
function levelColor(pct: number): string {
  if (pct > 80) return '#4caf50'
  if (pct > 60) return '#8bc34a'
  if (pct > 40) return '#ffeb3b'
  if (pct > 20) return '#ff9800'
  return '#f44336'
}

// Lightning bolt path (centered in a W×H box)
function boltPath(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2
  return [
    `M ${cx + w * 0.1} ${y}`,
    `L ${cx - w * 0.25} ${y + h * 0.52}`,
    `L ${cx + w * 0.05} ${y + h * 0.52}`,
    `L ${cx - w * 0.1} ${y + h}`,
    `L ${cx + w * 0.25} ${y + h * 0.48}`,
    `L ${cx - w * 0.05} ${y + h * 0.48}`,
    'Z',
  ].join(' ')
}

// Plug icon for when there's no battery (desktop always on AC)
function PlugIcon({ size }: { size: number }) {
  const s = size
  const color = '#4caf50'
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <rect x={10} y={2} width={4} height={5} rx={1} fill={color} />
      <rect x={6}  y={7} width={12} height={8} rx={2} fill={color} />
      <rect x={11} y={15} width={2} height={5} fill={color} />
      <rect x={9} y={19} width={6} height={2} rx={1} fill={color} />
    </svg>
  )
}

export function BatteryWidget({ status, size }: Props) {
  // If no battery (desktop): show a plug icon when on AC
  if (!status.available) {
    if (!status.charging) return null  // no battery, not on AC — shouldn't happen
    return (
      <div style={containerStyle}>
        <PlugIcon size={size} />
      </div>
    )
  }

  // Battery body dimensions
  const h  = size
  const bw = Math.max(1.5, h * 0.07)   // border stroke width
  const tw = h * 0.10                   // terminal width
  const th = h * 0.38                   // terminal height
  const r  = h * 0.12                   // corner radius
  const bodyW = h * 1.9                 // battery body width

  // Inner fill area (inset by border width)
  const pad   = bw * 1.2
  const fillX = pad
  const fillY = pad
  const fillMaxW = bodyW - pad * 2
  const fillH    = h - pad * 2
  const fillW    = fillMaxW * (status.level / 100)
  const fillColor = levelColor(status.level)

  const totalW = bodyW + tw
  const boltW  = bodyW * 0.28
  const boltH  = h * 0.52

  return (
    <div style={containerStyle}>
      <svg
        width={totalW}
        height={h}
        viewBox={`0 0 ${totalW} ${h}`}
        style={{ display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
      >
        {/* Body outline */}
        <rect x={0} y={0} width={bodyW} height={h} rx={r} ry={r}
          fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.9)" strokeWidth={bw} />

        {/* Terminal bump */}
        <rect
          x={bodyW} y={(h - th) / 2} width={tw} height={th}
          rx={tw * 0.35} ry={tw * 0.35}
          fill="rgba(255,255,255,0.9)"
        />

        {/* Level fill */}
        {fillW > 0 && (
          <rect x={fillX} y={fillY} width={fillW} height={fillH}
            rx={r * 0.5} ry={r * 0.5} fill={fillColor} />
        )}

        {/* Charging lightning bolt */}
        {status.charging && (
          <path
            d={boltPath(bodyW / 2 - boltW / 2, h / 2 - boltH / 2, boltW, boltH)}
            fill="white"
            opacity={0.95}
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
