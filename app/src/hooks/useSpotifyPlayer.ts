import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface TrackInfo {
  id:       string
  name:     string
  artists:  string
  albumArt: string
  duration: number  // ms
}

export interface PlayerState {
  ready:      boolean
  deviceId:   string | null
  track:      TrackInfo | null
  paused:     boolean
  positionMs: number
  volume:     number   // 0–1
  error:      string | null
}

export interface PlayerControls {
  togglePlay: () => void
  nextTrack:  () => void
  prevTrack:  () => void
  seek:       (ms: number) => void
  setVolume:  (v: number) => void
}

export function useSpotifyPlayer(accessToken: string | null): PlayerState & PlayerControls {
  const [state, setState] = useState<PlayerState>({
    ready: false, deviceId: null, track: null, paused: true, positionMs: 0, volume: 0.8, error: null,
  })
  const playerRef  = useRef<SpotifyPlayer | null>(null)
  const pausedRef  = useRef(true)
  pausedRef.current = state.paused

  // Real-time position ticker — increments every 500 ms while playing
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) {
        setState(s => ({
          ...s,
          positionMs: s.track ? Math.min(s.positionMs + 500, s.track.duration) : s.positionMs,
        }))
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

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
        // Read actual volume from the SDK device on connect
        ;(player as any).getVolume().then((vol: number) => {
          setState(s => ({ ...s, volume: vol }))
        }).catch(() => {})
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
          paused:     playbackState.paused,
          positionMs: playbackState.position,
          track: {
            id:       t.id,
            name:     t.name,
            artists:  t.artists.map(a => a.name).join(', '),
            albumArt: t.album.images[0]?.url ?? '',
            duration: (t as any).duration_ms ?? 0,
          },
        }))
      })

      player.addListener('initialization_error', e => setState(s => ({ ...s, error: `Init: ${e.message}` })))
      player.addListener('authentication_error',  e => setState(s => ({ ...s, error: `Auth: ${e.message}` })))
      player.addListener('account_error',         e => setState(s => ({ ...s, error: `Account: ${e.message}` })))
      player.addListener('playback_error',        e => setState(s => ({ ...s, error: `Playback: ${e.message}` })))

      player.connect()
      playerRef.current = player
      ;(window as any).__spotifyPlayer = player
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

  // Poll volume every 2 s to catch changes made from the Spotify app
  useEffect(() => {
    if (!state.ready) return
    const id = setInterval(() => {
      const player = playerRef.current as any
      if (!player) return
      player.getVolume().then((vol: number) => {
        setState(s => Math.abs(s.volume - vol) > 0.005 ? { ...s, volume: vol } : s)
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [state.ready])

  const p = () => playerRef.current as any
  const togglePlay = useCallback(() => { p()?.togglePlay() }, [])
  const nextTrack  = useCallback(() => { p()?.nextTrack()  }, [])
  const prevTrack  = useCallback(() => { p()?.previousTrack() }, [])
  const seek       = useCallback((ms: number) => {
    p()?.seek(ms)
    setState(s => ({ ...s, positionMs: ms }))
  }, [])
  const setVolume  = useCallback((v: number) => {
    p()?.setVolume(v)
    setState(s => ({ ...s, volume: v }))
  }, [])

  return { ...state, togglePlay, nextTrack, prevTrack, seek, setVolume }
}
