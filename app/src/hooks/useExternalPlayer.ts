import { useCallback, useEffect, useState, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PlayerState, PlayerControls, TrackInfo } from '../lib/player-types'

function mediaKey(key: string) {
  invoke('send_media_key', { key }).catch(e => console.error('[ExternalPlayer]', e))
}

export function useExternalPlayer(active: boolean): PlayerState & PlayerControls {
  const [paused, setPaused] = useState(false)
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [positionMs, setPositionMs] = useState(0)
  const lastBackendPosRef = useRef<number>(-1)
  const isTimelineStaleRef = useRef<boolean>(false)

  useEffect(() => {
    if (!active) return

    invoke('start_smtc_listener').catch(e =>
      console.error('[ExternalPlayer] SMTC start failed:', e)
    )

    let unlistenTrack: (() => void) | undefined
    let unlistenPos:   (() => void) | undefined
    let cancelled = false

    listen<TrackInfo | null>('smtc-track-changed', (e) => {
      setTrack(e.payload)
      if (e.payload === null) {
        setPositionMs(0)
        setPaused(true)
      } else {
        if ((e.payload as any).positionMs !== undefined) {
          const pos = (e.payload as any).positionMs
          
          // Chrome/YouTube often fails to reset the timeline position when a video changes.
          // Instead, it just keeps ticking up from the previous video's position.
          // If the new position is within 3 seconds of the last known position, it's a stale ticking timeline.
          if (lastBackendPosRef.current !== -1 && Math.abs(pos - lastBackendPosRef.current) < 3000) {
            setPositionMs(0)
            isTimelineStaleRef.current = true
          } else {
            setPositionMs(pos)
            isTimelineStaleRef.current = false
          }
          lastBackendPosRef.current = pos
        }
        if (e.payload.isPlaying !== undefined) {
          setPaused(!e.payload.isPlaying)
        }
      }
    }).then(fn => { if (cancelled) fn(); else unlistenTrack = fn })

    listen<{ positionMs: number; isPlaying?: boolean }>('smtc-position-update', (e) => {
      setPositionMs(prev => {
        const backendDiff = Math.abs(e.payload.positionMs - lastBackendPosRef.current)

        if (e.payload.positionMs === lastBackendPosRef.current && e.payload.isPlaying) {
          return prev
        }
        lastBackendPosRef.current = e.payload.positionMs

        // If the timeline was stale (Chrome bug), ignore updates until we see a large jump,
        // which means the browser FINALLY pushed a real position update (or the user seeked).
        if (isTimelineStaleRef.current) {
          if (backendDiff > 3000) {
            isTimelineStaleRef.current = false // Recovered!
            return e.payload.positionMs
          } else {
            // Still stale. Rely completely on our local interpolation.
            return prev
          }
        }

        // Only snap if paused, or if drift is significant (e.g. seeking)
        const diffFromUI = Math.abs(prev - e.payload.positionMs)
        if (e.payload.isPlaying === false || diffFromUI > 1500) {
          return e.payload.positionMs
        }
        return prev
      })
      
      if (e.payload.isPlaying !== undefined) {
        setPaused(!e.payload.isPlaying)
      }
    }).then(fn => { if (cancelled) fn(); else unlistenPos = fn })

    return () => {
      cancelled = true
      invoke('stop_smtc_listener').catch(() => {})
      unlistenTrack?.()
      unlistenPos?.()
      setTrack(null)
      setPositionMs(0)
    }
  }, [active])

  // Interpolate position smoothly on the frontend
  useEffect(() => {
    if (paused || !active || !track) return

    let lastTick = performance.now()
    const interval = setInterval(() => {
      const now = performance.now()
      const delta = now - lastTick
      lastTick = now
      setPositionMs(p => p + delta)
    }, 50)

    return () => clearInterval(interval)
  }, [paused, active, track])

  const togglePlay = useCallback(() => {
    mediaKey('play_pause')
    setPaused(p => !p)
  }, [])

  const nextTrack = useCallback(() => { mediaKey('next') }, [])
  const prevTrack = useCallback(() => { mediaKey('prev') }, [])

  return {
    ready:      active,
    deviceId:   null,
    track,
    paused,
    positionMs,
    volume:     1,
    shuffle:    false,
    error:      null,
    togglePlay,
    nextTrack,
    prevTrack,
    seek:          () => {},
    setVolume:     () => {},
    toggleShuffle: () => {},
  }
}
