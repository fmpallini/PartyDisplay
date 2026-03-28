import { useEffect, useRef } from 'react'
import { fetchAudioAnalysis, type Beat } from '../lib/audio-analysis'

interface BeatSchedulerOptions {
  trackId: string | null
  positionMs: number        // current playback position when track info arrives
  accessToken: string | null
  onBeat: (beat: Beat, index: number) => void
  beatsPerAdvance?: number  // how many beats between photo advances (default 4)
}

export function useBeatScheduler({
  trackId,
  positionMs,
  accessToken,
  onBeat,
  beatsPerAdvance = 4,
}: BeatSchedulerOptions) {
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([])
  const onBeatRef = useRef(onBeat)
  onBeatRef.current = onBeat

  useEffect(() => {
    // Clear any pending timers when track changes
    timerIds.current.forEach(clearTimeout)
    timerIds.current = []

    if (!trackId || !accessToken) return

    let cancelled = false
    const startedAt = Date.now()

    fetchAudioAnalysis(trackId, accessToken).then(({ beats }) => {
      if (cancelled) return

      const elapsedMs = Date.now() - startedAt
      const currentPositionMs = positionMs + elapsedMs

      beats.forEach((beat, i) => {
        if (i % beatsPerAdvance !== 0) return
        const beatMs = beat.start * 1000
        const delay = beatMs - currentPositionMs
        if (delay < -200) return  // skip beats in the past (with 200ms grace)

        const id = setTimeout(() => {
          onBeatRef.current(beat, i)
        }, Math.max(0, delay))
        timerIds.current.push(id)
      })
    }).catch(err => {
      console.warn('useBeatScheduler: audio analysis unavailable, falling back to tempo timer', err)
    })

    return () => {
      cancelled = true
      timerIds.current.forEach(clearTimeout)
      timerIds.current = []
    }
  }, [trackId, accessToken, beatsPerAdvance])
  // positionMs is intentionally excluded — we only re-schedule on track change
}
