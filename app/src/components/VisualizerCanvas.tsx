import { useEffect, useRef } from 'react'
import { useVisualizer } from '../hooks/useVisualizer'

interface Props {
  presetIndex: number
  style?:      React.CSSProperties
}

export default function VisualizerCanvas({ presetIndex, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { notifyResize } = useVisualizer(canvasRef, presetIndex)

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
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width:   '100%',
        height:  '100%',
        background: '#000',
        ...style,
      }}
    />
  )
}
