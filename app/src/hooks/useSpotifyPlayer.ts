import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface TrackInfo {
  id:      string
  name:    string
  artists: string
  albumArt: string
}

export interface PlayerState {
  ready:     boolean
  deviceId:  string | null
  track:     TrackInfo | null
  paused:    boolean
  error:     string | null
}

export function useSpotifyPlayer(accessToken: string | null) {
  const [state, setState] = useState<PlayerState>({
    ready: false, deviceId: null, track: null, paused: true, error: null,
  })
  const playerRef = useRef<SpotifyPlayer | null>(null)

  useEffect(() => {
    if (!accessToken) return

    function initPlayer() {
      const player = new window.Spotify.Player({
        name: 'Party Display',
        getOAuthToken: (cb) => cb(accessToken!),
        volume: 0.8,
      })

      player.addListener('ready', ({ device_id }) => {
        setState(s => ({ ...s, ready: true, deviceId: device_id, error: null }))
        invoke('set_device_id', { deviceId: device_id }).catch(console.error)
      })

      player.addListener('not_ready', ({ device_id }) => {
        console.warn('Player not ready, device_id:', device_id)
        setState(s => ({ ...s, ready: false }))
      })

      player.addListener('player_state_changed', (playbackState) => {
        if (!playbackState) return
        const t = playbackState.track_window.current_track
        setState(s => ({
          ...s,
          paused: playbackState.paused,
          track: {
            id:       t.id,
            name:     t.name,
            artists:  t.artists.map(a => a.name).join(', '),
            albumArt: t.album.images[0]?.url ?? '',
          },
        }))
      })

      player.addListener('initialization_error', e => setState(s => ({ ...s, error: `Init: ${e.message}` })))
      player.addListener('authentication_error',  e => setState(s => ({ ...s, error: `Auth: ${e.message}` })))
      player.addListener('account_error',         e => setState(s => ({ ...s, error: `Account: ${e.message}` })))
      player.addListener('playback_error',        e => setState(s => ({ ...s, error: `Playback: ${e.message}` })))

      player.connect()
      playerRef.current = player
    }

    if (window.Spotify) {
      initPlayer()
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer
    }

    return () => {
      playerRef.current?.disconnect()
      playerRef.current = null
    }
  }, [accessToken])

  return state
}
