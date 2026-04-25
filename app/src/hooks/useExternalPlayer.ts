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
  const trackChangedAtRef = useRef<number>(-1)

  // YouTube never calls setPositionState on track change — SMTC just keeps ticking the old
  // video's position. Stale window: ignore backend position for 8s after track change.
  // Only exit stale early if we see a large jump (>=5s), which means the user seeked.
  const STALE_WINDOW_MS = 8_000
  const SEEK_JUMP_MS    = 5_000

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
        if (lastBackendPosRef.current === -1) {
          // First event on app open — SMTC position is trustworthy, use it directly.
          setPositionMs(e.payload.positionMs ?? 0)
          isTimelineStaleRef.current = false
          lastBackendPosRef.current = e.payload.positionMs ?? 0
        } else {
          // Mid-session track change — YouTube never calls setPositionState, so SMTC
          // keeps ticking the old video's position and duration. Reset and enter stale window.
          setPositionMs(0)
          isTimelineStaleRef.current = true
          trackChangedAtRef.current = Date.now()
          lastBackendPosRef.current = e.payload.positionMs ?? lastBackendPosRef.current
        }
        if (e.payload.isPlaying !== undefined) {
          setPaused(!e.payload.isPlaying)
        }
      }
    }).then(fn => { if (cancelled) fn(); else unlistenTrack = fn })

    listen<{ positionMs: number; isPlaying?: boolean; durationMs?: number }>('smtc-position-update', (e) => {
      setPositionMs(prev => {
        const backendDiff = Math.abs(e.payload.positionMs - lastBackendPosRef.current)

        if (e.payload.positionMs === lastBackendPosRef.current && e.payload.isPlaying) {
          return prev
        }
        lastBackendPosRef.current = e.payload.positionMs

        if (isTimelineStaleRef.current) {
          const staleDuration = Date.now() - trackChangedAtRef.current
          const isSeek = backendDiff >= SEEK_JUMP_MS
          const windowExpired = staleDuration >= STALE_WINDOW_MS
          if (isSeek || windowExpired) {
            isTimelineStaleRef.current = false
            // durationMs from SMTC is only trustworthy when YouTube explicitly called
            // setPositionState (i.e. a seek). On window expiry it's still the old song's value.
            if (isSeek && e.payload.durationMs) {
              setTrack(t => t ? { ...t, duration: e.payload.durationMs! } : t)
            }
            return e.payload.positionMs
          }
          return prev
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
