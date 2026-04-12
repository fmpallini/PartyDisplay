import { useCallback, useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { parseBlob } from 'music-metadata'
import type { PlayerState, PlayerControls } from '../lib/player-types'

export interface PlaylistItem {
  path:       string       // absolute file path or http:// URL
  title?:     string       // pre-fetched title (skips music-metadata fetch when present)
  artist?:    string
  albumArt?:  string       // URL or object URL
  durationMs?: number
}

/** Extract the filename without extension from a path. Used as a title fallback. */
function stemFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

const IDLE_STATE: PlayerState = {
  ready: false, deviceId: null, track: null,
  paused: true, positionMs: 0, volume: 0.8, error: null,
}

/**
 * Plays a pre-ordered playlist of local audio files via an HTML5 Audio element
 * served through Tauri's asset:// protocol.
 *
 * @param playlist  Ordered array of absolute file paths.
 * @param active    When false the hook pauses audio and idles (Spotify is active).
 */
export function useLocalPlayer(
  playlist: PlaylistItem[],
  active: boolean,
): PlayerState & PlayerControls {
  const [state, setState] = useState<PlayerState>(IDLE_STATE)

  const audioRef     = useRef<HTMLAudioElement>(new Audio())
  const indexRef     = useRef(0)
  const activeRef    = useRef(active)
  const albumArtRef  = useRef<string>('')  // tracks the current object URL so we can revoke it
  const skipCountRef = useRef(0)           // consecutive load errors; reset on successful metadata

  activeRef.current = active

  // ── Load track by playlist index ──────────────────────────────────────────
  const loadIndex = useCallback((idx: number, autoPlay = false) => {
    if (playlist.length === 0) return
    const i = ((idx % playlist.length) + playlist.length) % playlist.length
    indexRef.current = i
    const item = playlist[i]
    audioRef.current.src = item.path.startsWith('http')
      ? item.path
      : convertFileSrc(item.path)
    audioRef.current.load()
    if (autoPlay) audioRef.current.play().catch(() => {})
  }, [playlist])

  // ── Audio event listeners (set up once, stable for app lifetime) ──────────
  useEffect(() => {
    const audio = audioRef.current

    const onLoadedMetadata = async () => {
      const item = playlist[indexRef.current]
      if (!item) return
      const duration = audio.duration * 1000

      // DLNA items carry pre-fetched metadata — skip the music-metadata fetch
      if (item.title !== undefined) {
        skipCountRef.current = 0
        setState(s => ({
          ...s,
          ready: true,
          track: {
            id:       item.path,
            name:     item.title!,
            artists:  item.artist ?? '',
            albumArt: item.albumArt ?? '',
            duration,
          },
          positionMs: 0,
          error: null,
        }))
        return
      }

      // Local file — parse embedded metadata from the audio blob
      const url = convertFileSrc(item.path)
      let name     = stemFromPath(item.path)
      let artists  = ''
      let albumArt = ''

      try {
        const response = await fetch(url)
        const blob     = await response.blob()
        const meta     = await parseBlob(blob)
        if (meta.common.title)  name    = meta.common.title
        if (meta.common.artist) artists = meta.common.artist
        const pic = meta.common.picture?.[0]
        if (pic) {
          if (albumArtRef.current) URL.revokeObjectURL(albumArtRef.current)
          const picBlob = new Blob([pic.data.slice()], { type: pic.format })
          albumArt = URL.createObjectURL(picBlob)
          albumArtRef.current = albumArt
        }
      } catch (err) {
        console.warn('[useLocalPlayer] metadata parse failed for', item.path, err)
      }

      skipCountRef.current = 0
      setState(s => ({
        ...s,
        ready: true,
        track: { id: item.path, name, artists, albumArt, duration },
        positionMs: 0,
        error: null,
      }))
    }

    const onTimeUpdate = () => {
      setState(s => ({ ...s, positionMs: audio.currentTime * 1000 }))
    }

    const onPlay  = () => setState(s => ({ ...s, paused: false }))
    const onPause = () => setState(s => ({ ...s, paused: true  }))

    const onEnded = () => {
      const nextIdx = indexRef.current + 1
      loadIndex(nextIdx, activeRef.current)
    }

    const onError = () => {
      const item = playlist[indexRef.current]
      if (!item) return
      const err = audio.error
      console.error(
        `[useLocalPlayer] error on "${item.path}" — code=${err?.code ?? '?'} ` +
        `message="${err?.message ?? 'unknown'}" — skipping to next track`
      )
      skipCountRef.current += 1
      if (skipCountRef.current >= playlist.length) {
        console.error('[useLocalPlayer] all tracks failed, giving up')
        skipCountRef.current = 0
        setState(s => ({ ...s, ready: false, error: 'All tracks failed to load' }))
        return
      }
      setState(s => ({ ...s, error: `Skipped: ${stemFromPath(item.path)}` }))
      loadIndex(indexRef.current + 1, activeRef.current)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate',     onTimeUpdate)
    audio.addEventListener('play',           onPlay)
    audio.addEventListener('pause',          onPause)
    audio.addEventListener('ended',          onEnded)
    audio.addEventListener('error',          onError)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate',     onTimeUpdate)
      audio.removeEventListener('play',           onPlay)
      audio.removeEventListener('pause',          onPause)
      audio.removeEventListener('ended',          onEnded)
      audio.removeEventListener('error',          onError)
      audio.pause()
      audio.src = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist, loadIndex])

  // ── Load first track when playlist changes ────────────────────────────────
  useEffect(() => {
    skipCountRef.current = 0  // new playlist — reset error streak
    if (playlist.length === 0) {
      audioRef.current.pause()
      audioRef.current.src = ''   // prevent stale error events firing into an empty playlist
      setState(IDLE_STATE)
      return
    }
    // The listener-effect cleanup pauses the audio element before re-registering
    // listeners, so the onPause handler never fires and state.paused stays stale.
    // Sync it here: a new playlist always starts paused until the user presses play.
    setState(s => ({ ...s, paused: true }))
    loadIndex(0, false)   // load but don't auto-play; user must press play or switch source
  }, [playlist, loadIndex])

  // ── Pause when going inactive (user controls resume) ─────────────────────
  useEffect(() => {
    if (!active) audioRef.current.pause()
  }, [active])

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (audio.paused) audio.play().catch(() => {})
    else              audio.pause()
  }, [])

  const nextTrack = useCallback(() => {
    loadIndex(indexRef.current + 1, activeRef.current)
  }, [loadIndex])

  const prevTrack = useCallback(() => {
    loadIndex(indexRef.current - 1, activeRef.current)
  }, [loadIndex])

  const seek = useCallback((ms: number) => {
    audioRef.current.currentTime = ms / 1000
    setState(s => ({ ...s, positionMs: ms }))
  }, [])

  const setVolume = useCallback((v: number) => {
    audioRef.current.volume = v
    setState(s => ({ ...s, volume: v }))
  }, [])

  return { ...state, togglePlay, nextTrack, prevTrack, seek, setVolume }
}
