import { useCallback, useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!active) return

    invoke('start_smtc_listener').catch(e =>
      console.error('[ExternalPlayer] SMTC start failed:', e)
    )

    let unlistenTrack: (() => void) | undefined
    let unlistenPos:   (() => void) | undefined

    listen<TrackInfo | null>('smtc-track-changed', (e) => {
      setTrack(e.payload)
      if (e.payload === null) setPositionMs(0)
    }).then(fn => { unlistenTrack = fn })

    listen<{ positionMs: number }>('smtc-position-update', (e) => {
      setPositionMs(e.payload.positionMs)
    }).then(fn => { unlistenPos = fn })

    return () => {
      invoke('stop_smtc_listener').catch(() => {})
      unlistenTrack?.()
      unlistenPos?.()
      setTrack(null)
      setPositionMs(0)
    }
  }, [active])

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
