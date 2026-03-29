import { useEffect, useRef } from 'react'

export type SpectrumTheme = 'energy' | 'cyan' | 'fire' | 'white' | 'rainbow' | 'purple'
export type SpectrumStyle = 'bars' | 'lines'

interface Props {
  bins:         number[]
  height?:      number
  renderStyle?: SpectrumStyle
  theme?:       SpectrumTheme
  overlay?:     boolean   // transparent background; used when displayed over the photo
}

// Returns a CSS color string for a bar given its 0–1 level and bin index (for rainbow)
function barColor(theme: SpectrumTheme, level: number, i: number, total: number): string {
  switch (theme) {
    case 'energy':  return `hsl(${120 - level * 120}, 100%, 45%)`
    case 'cyan':    return `hsl(185, 100%, ${35 + level * 30}%)`
    case 'fire':    return `hsl(${level * 50}, 100%, ${30 + level * 35}%)`
    case 'white':   return `rgba(255,255,255,${0.3 + level * 0.7})`
    case 'rainbow': return `hsl(${(i / total) * 300}, 100%, 50%)`
    case 'purple':  return `hsl(${280 - level * 30}, 100%, ${30 + level * 30}%)`
  }
}

// Top color of the fill gradient for each theme
function gradientTopColor(theme: SpectrumTheme): string {
  switch (theme) {
    case 'energy':  return 'rgba(255,80,0,0.85)'
    case 'cyan':    return 'rgba(0,220,255,0.85)'
    case 'fire':    return 'rgba(255,200,0,0.85)'
    case 'white':   return 'rgba(255,255,255,0.85)'
    case 'rainbow': return 'rgba(120,0,255,0.85)'
    case 'purple':  return 'rgba(180,0,255,0.85)'
  }
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  bins: number[],
  w: number,
  h: number,
  theme: SpectrumTheme,
) {
  const bw = w / bins.length
  bins.forEach((db, i) => {
    const level = Math.max(0, Math.min(1, (db + 100) / 100))
    const barH  = level * h
    ctx.fillStyle = barColor(theme, level, i, bins.length)
    ctx.fillRect(i * bw, h - barH, bw - 1, barH)
  })
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  bins: number[],
  w: number,
  h: number,
  theme: SpectrumTheme,
) {
  const bw = w / bins.length

  // Build the upper path
  const points = bins.map((db, i) => {
    const level = Math.max(0, Math.min(1, (db + 100) / 100))
    return { x: (i + 0.5) * bw, y: h - level * h }
  })

  // Filled area with vertical gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0,   gradientTopColor(theme))
  grad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.beginPath()
  ctx.moveTo(0, h)
  points.forEach(p => ctx.lineTo(p.x, p.y))
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Stroke line on top
  ctx.beginPath()
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
  ctx.strokeStyle = gradientTopColor(theme).replace(/[\d.]+\)$/, '1)')
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()
}

export default function SpectrumCanvas({
  bins,
  height      = 140,
  renderStyle = 'bars',
  theme       = 'energy',
  overlay     = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    if (renderStyle === 'bars') drawBars(ctx, bins, w, h, theme)
    else                        drawLines(ctx, bins, w, h, theme)
  }, [bins, renderStyle, theme])

  return (
    <canvas
      ref={canvasRef}
      width={1920}
      height={height}
      style={{ display: 'block', width: '100%', height, background: overlay ? 'transparent' : '#000', borderRadius: overlay ? 0 : 4 }}
    />
  )
}
