import { useCallback, useEffect, useRef, useState } from 'react'

export type { TrackInfo, PlayerState, PlayerControls } from '../lib/player-types'
import type { PlayerState, PlayerControls } from '../lib/player-types'

function fetchDeviceVolume(token: string, onVol: (vol: number) => void) {
  fetch('https://api.spotify.com/v1/me/player', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.status === 200 ? r.json() : null)
    .then((data: { device?: { volume_percent?: number } } | null) => { const pct = data?.device?.volume_percent; if (pct != null) onVol(pct / 100) })
    .catch(() => {})
}

export function useSpotifyPlayer(accessToken: string | null, onAuthError?: () => void): PlayerState & PlayerControls {
  const [state, setState] = useState<PlayerState>({
    ready: false, deviceId: null, track: null, paused: true, positionMs: 0, volume: 0.8,
    shuffle: false, error: null,
  })
  const playerRef        = useRef<SpotifyPlayer | null>(null)
  const pausedRef        = useRef(true)
  const accessTokenRef   = useRef(accessToken)
  const lastVolumeSetRef = useRef(0)
  pausedRef.current      = state.paused
  accessTokenRef.current = accessToken

  // Real-time position ticker — increments every 500 ms while playing
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) {
        setState(s => {
          if (!s.track) return s
          const next = Math.min(s.positionMs + 500, s.track.duration)
          return next === s.positionMs ? s : { ...s, positionMs: next }
        })
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
        // SDK getVolume() returns its own initial value, not the real device volume.
        fetchDeviceVolume(accessToken!, vol => {
          ;(player as unknown as { setVolume: (v: number) => void }).setVolume(vol)
          setState(s => ({ ...s, volume: vol }))
        })
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
          shuffle:    (playbackState as unknown as { shuffle?: boolean }).shuffle ?? false,
          track: {
            id:       t.id,
            name:     t.name,
            artists:  t.artists.map(a => a.name).join(', '),
            albumArt: t.album?.images?.[0]?.url ?? '',
            duration: (t as unknown as { duration_ms?: number }).duration_ms ?? 0,
          },
        }))
      })

      player.addListener('initialization_error', e => setState(s => ({ ...s, error: `Init: ${e.message}` })))
      player.addListener('authentication_error',  e => {
        setState(s => ({ ...s, error: `Auth: ${e.message}` }))
        onAuthError?.()
      })
      player.addListener('account_error',         e => setState(s => ({ ...s, error: `Account: ${e.message}` })))
      player.addListener('playback_error',        e => {
        if (e.message === 'Cannot perform operation; no list was loaded.') return
        setState(s => ({ ...s, error: `Playback: ${e.message}` }))
      })

      player.connect()
      playerRef.current = player
      ;(window as unknown as { __spotifyPlayer: SpotifyPlayer }).__spotifyPlayer = player
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
  }, [accessToken, onAuthError])

  // Poll volume every 2 s to catch changes made from the Spotify app
  useEffect(() => {
    if (!state.ready) return
    const id = setInterval(() => {
      const token = accessTokenRef.current
      if (!token) return
      fetchDeviceVolume(token, vol => {
        if (Date.now() - lastVolumeSetRef.current < 3000) return
        setState(s => Math.abs(s.volume - vol) > 0.005 ? { ...s, volume: vol } : s)
      })
    }, 2000)
    return () => clearInterval(id)
  }, [state.ready])

  const p = () => playerRef.current as unknown as { togglePlay: () => void; nextTrack: () => void; previousTrack: () => void; seek: (ms: number) => void; setVolume: (v: number) => void } | null
  const togglePlay = useCallback(() => { p()?.togglePlay() }, [])
  const nextTrack  = useCallback(() => { p()?.nextTrack()  }, [])
  const prevTrack  = useCallback(() => { p()?.previousTrack() }, [])
  const seek       = useCallback((ms: number) => {
    p()?.seek(ms)
    setState(s => ({ ...s, positionMs: ms }))
  }, [])
  const setVolume  = useCallback((v: number) => {
    lastVolumeSetRef.current = Date.now()
    p()?.setVolume(v)
    setState(s => ({ ...s, volume: v }))
  }, [])

  const toggleShuffle = useCallback(() => {
    setState(s => {
      const next = !s.shuffle
      if (accessTokenRef.current) {
        fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${next}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessTokenRef.current}` },
        }).catch(() => {})
      }
      return { ...s, shuffle: next }
    })
  }, [])

  return { ...state, togglePlay, nextTrack, prevTrack, seek, setVolume, toggleShuffle }
}
