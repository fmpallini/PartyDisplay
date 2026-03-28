import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export function useFftData(): number[] {
  const [bins, setBins] = useState<number[]>(new Array(64).fill(-100))

  useEffect(() => {
    const unlisten = listen<number[]>('fft-data', ({ payload }) => setBins(payload))
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return bins
}
