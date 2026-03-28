import { useEffect, useRef } from 'react'
import { fetchAudioAnalysis, type Beat } from '../lib/audio-analysis'

interface BeatSchedulerOptions {
  trackId: string | null
  positionMs: number       // playback position at the time the hook re-runs
  accessToken: string | null
  minIntervalMs?: number   // minimum ms between photo advances (default 3000)
  onBeat: (beat: Beat, index: number) => void
}

export function useBeatScheduler({
  trackId,
  positionMs,
  accessToken,
  minIntervalMs = 3000,
  onBeat,
}: BeatSchedulerOptions) {
  const timerIds  = useRef<ReturnType<typeof setTimeout>[]>([])
  const onBeatRef = useRef(onBeat)
  onBeatRef.current = onBeat

  useEffect(() => {
    timerIds.current.forEach(clearTimeout)
    timerIds.current = []

    if (!trackId || !accessToken) return

    let cancelled  = false
    const startedAt = Date.now()

    fetchAudioAnalysis(trackId, accessToken).then(({ beats }) => {
      if (cancelled) return

      const elapsedMs          = Date.now() - startedAt
      const currentPositionMs  = positionMs + elapsedMs
      let   lastScheduledBeatMs = currentPositionMs  // treat "now" as last advance

      beats.forEach((beat, i) => {
        const beatMs = beat.start * 1000
        const delay  = beatMs - currentPositionMs
        if (delay < -200) return  // already past

        // Skip this beat if it's too close to the previous scheduled one
        if (beatMs - lastScheduledBeatMs < minIntervalMs) return

        lastScheduledBeatMs = beatMs

        const id = setTimeout(() => {
          onBeatRef.current(beat, i)
        }, Math.max(0, delay))
        timerIds.current.push(id)
      })
    }).catch(err => {
      console.warn('useBeatScheduler: audio analysis unavailable', err)
    })

    return () => {
      cancelled = true
      timerIds.current.forEach(clearTimeout)
      timerIds.current = []
    }
  }, [trackId, accessToken, minIntervalMs])
}
