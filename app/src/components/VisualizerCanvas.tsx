import { useEffect, useRef } from 'react'
import { useVisualizer } from '../hooks/useVisualizer'

interface Props {
  presetIndex: number
  style?:      React.CSSProperties
}

export default function VisualizerCanvas({ presetIndex, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { notifyResize, presetsEmpty } = useVisualizer(canvasRef, presetIndex)

  // Keep Butterchurn's internal resolution in sync with the element's rendered size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const w = Math.round(width)
      const h = Math.round(height)
      canvas.width  = w
      canvas.height = h
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
