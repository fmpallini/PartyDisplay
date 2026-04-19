import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { PlayerState, PlayerControls } from '../lib/player-types'

function mediaKey(key: string) {
  invoke('send_media_key', { key }).catch(e => console.error('[ExternalPlayer]', e))
}

export function useExternalPlayer(active: boolean): PlayerState & PlayerControls {
  // Local paused toggle — mirrors what we send, since we can't read system state.
  const [paused, setPaused] = useState(false)

  const togglePlay = useCallback(() => {
    mediaKey('play_pause')
    setPaused(p => !p)
  }, [])

  const nextTrack = useCallback(() => { mediaKey('next') }, [])
  const prevTrack = useCallback(() => { mediaKey('prev') }, [])

  return {
    ready:      active,
    deviceId:   null,
    track:      null,
    paused,
    positionMs: 0,
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
