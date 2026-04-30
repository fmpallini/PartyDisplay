import { useEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

const BLEND_SECONDS = 2.7

export function useVisualizer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  presetIndex: number,
) {
  const vizRef           = useRef<import('butterchurn').Visualizer | null>(null)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const workletRef       = useRef<AudioWorkletNode | null>(null)
  const rafRef           = useRef<number>(0)
  const renderFnRef      = useRef<(() => void) | null>(null)
  // Distinguish first load (blend=0) from user-driven changes (blend=BLEND_SECONDS).
  const lastLoadedRef    = useRef<number>(-1)
  const [presets, setPresets] = useState<{ name: string; data: Record<string, unknown> }[]>([])
  const [presetsLoaded, setPresetsLoaded] = useState(false)

  const clampIdx = useCallback((i: number) => Math.max(0, Math.min(i, presets.length - 1)), [presets.length])

  useEffect(() => {
    invoke<{ name: string; content: string }[]>('get_presets')
      .then(raw => {
        const loaded = raw.flatMap(({ name, content }) => {
          try { return [{ name, data: JSON.parse(content) as Record<string, unknown> }] } catch { return [] }
        })
        setPresets(loaded)
        setPresetsLoaded(true)
      })
      .catch(e => { console.error('[useVisualizer] get_presets failed:', e); setPresetsLoaded(true) })
  }, [])

  useEffect(() => {
    const canvasOrNull = canvasRef.current
    if (!canvasOrNull || presets.length === 0) return
    // Capture as non-null so TypeScript keeps the narrowing inside the async closure
    const canvas: HTMLCanvasElement = canvasOrNull

    let cancelled = false

    async function init() {
      const mod = await import('butterchurn')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const butterchurn = [mod, mod.default, (mod.default as any)?.default]
        .find((x): x is typeof mod.default => typeof x?.createVisualizer === 'function')!
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

      const idx = clampIdx(presetIndex)
      viz.loadPreset(presets[idx].data, 0)
      lastLoadedRef.current = idx

      function render() {
        viz.render()
        rafRef.current = requestAnimationFrame(render)
      }
      renderFnRef.current = render
      rafRef.current = requestAnimationFrame(render)
    }

    init().catch(e => console.error('[useVisualizer] init failed:', e))

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      renderFnRef.current = null
      audioCtxRef.current?.close()
      audioCtxRef.current = null
      workletRef.current  = null
      vizRef.current      = null
      lastLoadedRef.current = -1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, presets])

  useEffect(() => {
    const viz = vizRef.current
    if (!viz || presets.length === 0) return
    const idx = clampIdx(presetIndex)
    if (idx === lastLoadedRef.current) return
    lastLoadedRef.current = idx
    viz.loadPreset(presets[idx].data, BLEND_SECONDS)
  }, [presetIndex, presets, clampIdx])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
        audioCtxRef.current?.suspend()
      } else {
        audioCtxRef.current?.resume()
        const fn = renderFnRef.current
        if (fn) rafRef.current = requestAnimationFrame(fn)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    const unlisten = listen<string>('pcm-data', ({ payload }) => {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      workletRef.current?.port.postMessage(new Float32Array(bytes.buffer))
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  const notifyResize = useCallback((w: number, h: number) => {
    vizRef.current?.setRendererSize(w, h)
  }, [])

  return { notifyResize, presetsEmpty: presetsLoaded && presets.length === 0 }
}
