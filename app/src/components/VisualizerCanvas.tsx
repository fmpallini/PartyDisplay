import { useEffect, useRef, useState } from 'react'
import { useVisualizer } from '../hooks/useVisualizer'

const MAX_CANVAS_W = 1920
const MAX_CANVAS_H = 1080

interface Props {
  presetIndex: number
  style?:      React.CSSProperties
}

export default function VisualizerCanvas({ presetIndex, style }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const prevSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const [initSize, setInitSize] = useState<{ w: number; h: number } | null>(null)
  const { notifyResize, presetsEmpty } = useVisualizer(canvasRef, presetIndex, initSize)

  // Keep Butterchurn's internal resolution in sync with the element's rendered size,
  // capped at 1920×1080 to avoid full 4K rendering overhead.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const w = Math.min(Math.round(width),  MAX_CANVAS_W)
      const h = Math.min(Math.round(height), MAX_CANVAS_H)
      if (w === prevSizeRef.current.w && h === prevSizeRef.current.h) return
      prevSizeRef.current = { w, h }
      canvas.width  = w
      canvas.height = h
      if (w > 0 && h > 0) setInitSize(prev => prev ?? { w, h })
      notifyResize(w, h)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [notifyResize])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width:   '100%',
          height:  '100%',
          background: '#000',
        }}
      />
      {presetsEmpty && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 15, color: 'rgba(255,255,255,0.45)',
            textAlign: 'center', padding: '0 32px',
          }}>
            Drop MilkDrop preset files (.json) into the{' '}
            <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>presets\</span>
            {' '}folder next to party-display.exe
          </span>
        </div>
      )}
    </div>
  )
}
