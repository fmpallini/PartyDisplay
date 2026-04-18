import { useEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * Manages the Butterchurn visualizer lifecycle for a given canvas element.
 * Creates an AudioContext + AudioWorklet on mount, loads presets from the
 * Tauri `get_presets` command, feeds incoming `pcm-data` events into the
 * worklet, and drives Butterchurn's render loop.
 *
 * Preset cycling is driven externally: the caller passes a new `presetIndex`
 * prop and the hook syncs with a 2.7-second blend transition.
 */
export function useVisualizer(
  canvasRef: RefObject<HTMLCanvasElement>,
  presetIndex: number,
) {
  const vizRef           = useRef<import('butterchurn').Visualizer | null>(null)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const workletRef       = useRef<AudioWorkletNode | null>(null)
  const rafRef           = useRef<number>(0)
  // Track which preset index was last loaded so we can distinguish first
  // load (blend=0) from user-driven changes (blend=2.7 seconds).
  const lastLoadedRef    = useRef<number>(-1)
  const [presets, setPresets] = useState<{ name: string; data: Record<string, unknown> }[]>([])
  const [presetsLoaded, setPresetsLoaded] = useState(false)

  // Load preset list once on mount
  useEffect(() => {
    invoke<{ name: string; content: string }[]>('get_presets')
      .then(raw => {
        const loaded = raw
          .filter(({ content }) => {
            try { JSON.parse(content); return true } catch { return false }
          })
          .map(({ name, content }) => ({ name, data: JSON.parse(content) as Record<string, unknown> }))
        setPresets(loaded)
        setPresetsLoaded(true)
      })
      .catch(e => { console.error('[useVisualizer] get_presets failed:', e); setPresetsLoaded(true) })
  }, [])

  // Initialize Butterchurn when canvas + presets are ready
  useEffect(() => {
    const canvasOrNull = canvasRef.current
    if (!canvasOrNull || presets.length === 0) return
    // Capture as non-null so TypeScript keeps the narrowing inside the async closure
    const canvas: HTMLCanvasElement = canvasOrNull

    let cancelled = false

    async function init() {
      const butterchurn = (await import('butterchurn')).default
      const ctx = new AudioContext()
      audioCtxRef.current = ctx

      await ctx.audioWorklet.addModule('/pcm-injector-processor.js')
      if (cancelled) { ctx.close(); return }

      const worklet = new AudioWorkletNode(ctx, 'pcm-injector-processor')
      workletRef.current = worklet

      const viz = butterchurn.createVisualizer(ctx, canvas, {
        width:  canvas.width  || canvas.offsetWidth,
        height: canvas.height || canvas.offsetHeight,
      })
      viz.connectAudio(worklet)
      vizRef.current = viz

      const idx = Math.max(0, Math.min(presetIndex, presets.length - 1))
      viz.loadPreset(presets[idx].data, 0)
      lastLoadedRef.current = idx

      function render() {
        viz.render()
        rafRef.current = requestAnimationFrame(render)
      }
      rafRef.current = requestAnimationFrame(render)
    }

    init().catch(e => console.error('[useVisualizer] init failed:', e))

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      audioCtxRef.current?.close()
      audioCtxRef.current = null
      workletRef.current  = null
      vizRef.current      = null
      lastLoadedRef.current = -1
    }
    // Re-run only when the canvas element or preset list changes.
    // presetIndex changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, presets])

  // Sync external preset index changes with a blend transition.
  // Skips the initial load (already handled in the init effect above).
  useEffect(() => {
    const viz = vizRef.current
    if (!viz || presets.length === 0) return
    const idx = Math.max(0, Math.min(presetIndex, presets.length - 1))
    if (idx === lastLoadedRef.current) return   // already loaded — skip
    lastLoadedRef.current = idx
    viz.loadPreset(presets[idx].data, 2.7)
  }, [presetIndex, presets])

  // Forward PCM events from Tauri → AudioWorklet
  useEffect(() => {
    const unlisten = listen<number[]>('pcm-data', ({ payload }) => {
      workletRef.current?.port.postMessage(new Float32Array(payload))
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Notify Butterchurn when the canvas is resized
  const notifyResize = useCallback((w: number, h: number) => {
    vizRef.current?.setRendererSize(w, h)
  }, [])

  return { notifyResize, presetsEmpty: presetsLoaded && presets.length === 0 }
}
