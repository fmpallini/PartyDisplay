import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export function useFftData(): number[] {
  const [bins, setBins] = useState<number[]>(new Array(64).fill(-100))
  const smoothed = useRef<number[]>(new Array(64).fill(-100))

  useEffect(() => {
    const unlisten = listen<number[]>('fft-data', ({ payload }) => {
      smoothed.current = payload.map((v, i) => {
        const prev = smoothed.current[i]
        // Fast attack, slow decay — standard spectrum analyser feel
        return v > prev ? v * 0.6 + prev * 0.4 : v * 0.15 + prev * 0.85
      })
      setBins([...smoothed.current])
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return bins
}
