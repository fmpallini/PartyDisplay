import { useEffect, useRef } from 'react'

interface Props {
  bins: number[]
  height?: number
}

export default function SpectrumCanvas({ bins, height = 140 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const bw = w / bins.length
    bins.forEach((db, i) => {
      const level = Math.max(0, Math.min(1, (db + 100) / 100))
      const barH  = level * h
      ctx.fillStyle = `hsl(${120 - level * 120}, 100%, 45%)`
      ctx.fillRect(i * bw, h - barH, bw - 1, barH)
    })
  }, [bins])

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={height}
      style={{ display: 'block', width: '100%', height, background: '#000', borderRadius: 4 }}
    />
  )
}
