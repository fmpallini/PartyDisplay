import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { parseBlob } from 'music-metadata'
import type { PlayerState, PlayerControls } from '../lib/player-types'

export interface PlaylistItem {
  path:                string   // absolute file path or http:// URL
  title?:              string   // pre-fetched title
  artist?:             string
  albumArt?:           string   // URL or object URL
  durationMs?:         number
  metadataPrefetched?: boolean  // when true, skip music-metadata blob parse
}

/** Extract the filename without extension from a path. Used as a title fallback. */
function stemFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

/** Fisher-Yates in-place shuffle on a copy of `arr`. */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const IDLE_STATE: PlayerState = {
  ready: false, deviceId: null, track: null,
  paused: true, positionMs: 0, volume: 0.8,
  shuffle: false, error: null,
}

/**
 * Plays a pre-ordered playlist of local audio files via an HTML5 Audio element
 * served through Tauri's asset:// protocol.
 *
 * @param playlist   Ordered array of absolute file paths.
 * @param active     When false the hook pauses audio and idles (Spotify is active).
 * @param persistKey Optional localStorage key prefix. When provided, shuffle/repeat/
 *                   playlist position are saved and restored across app restarts.
 *                   Position is reset whenever the first track in the playlist changes
 *                   (i.e. the folder was changed).
 */
export function useLocalPlayer(
  playlist: PlaylistItem[],
  active: boolean,
  persistKey?: string,
): PlayerState & PlayerControls {
  // ── Restore persisted shuffle on first mount ──────────────────────────────
  const initShuffle = persistKey ? (localStorage.getItem(`${persistKey}_shuffle`) ?? 'true') === 'true' : false

  const [state, setState] = useState<PlayerState>({
    ...IDLE_STATE,
    shuffle: initShuffle,
  })

  const audioRef     = useRef<HTMLAudioElement>(new Audio())
  const indexRef     = useRef(0)
  const activeRef    = useRef(active)
  const albumArtRef  = useRef<string>('')  // tracks the current object URL so we can revoke it
  const skipCountRef = useRef(0)           // consecutive load errors; reset on successful metadata

  activeRef.current = active

  // ── Shuffle ───────────────────────────────────────────────────────────────
  const [shuffleOn, setShuffleOn] = useState(initShuffle)

  // Persist shuffle whenever it changes
  useEffect(() => {
    if (persistKey) localStorage.setItem(`${persistKey}_shuffle`, String(shuffleOn))
  }, [shuffleOn, persistKey])

  // workingOrder maps position (0…n-1) → actual playlist index.
  // Recomputed whenever playlist reference or shuffleOn changes.
  const workingOrder = useMemo<number[]>(() => {
    const indices = Array.from({ length: playlist.length }, (_, i) => i)
    return shuffleOn ? shuffled(indices) : indices
  }, [playlist, shuffleOn])

  const workingOrderRef = useRef(workingOrder)
  workingOrderRef.current = workingOrder

  // ── Load track by working-order position ─────────────────────────────────
  const loadIndex = useCallback((idx: number, autoPlay = false) => {
    console.debug(`[useLocalPlayer:${persistKey}] loadIndex called — idx=${idx} playlist.length=${playlist.length} autoPlay=${autoPlay}`)
    if (playlist.length === 0) {
      console.debug(`[useLocalPlayer:${persistKey}] loadIndex early-return: playlist is empty`)
      return
    }
    const i = ((idx % playlist.length) + playlist.length) % playlist.length
    indexRef.current = i
    if (persistKey) localStorage.setItem(`${persistKey}_index`, String(i))
    const actualIdx = workingOrderRef.current[i] ?? i
    const item = playlist[actualIdx]
    // Any path that already contains a URL scheme is used directly;
    // bare file paths go through Tauri's asset protocol.
    const src = item.path.includes('://')
      ? item.path
      : convertFileSrc(item.path)
    console.debug(`[useLocalPlayer:${persistKey}] loadIndex — setting audio.src to "${src.slice(0, 120)}" (autoPlay=${autoPlay})`)
    audioRef.current.src = src
    audioRef.current.load()
    if (autoPlay) audioRef.current.play().catch(() => {})
  }, [playlist, persistKey])

  // ── Audio event listeners (set up once, stable for app lifetime) ──────────
  useEffect(() => {
    const audio = audioRef.current
    console.debug(`[useLocalPlayer:${persistKey}] listener-effect SETUP — playlist.length=${playlist.length} audio.src="${audio.src.slice(0, 80)}"`)

    const onLoadedMetadata = async () => {
      const actualIdx = workingOrderRef.current[indexRef.current] ?? indexRef.current
      const item = playlist[actualIdx]
      console.debug(`[useLocalPlayer:${persistKey}] onLoadedMetadata — index=${indexRef.current} actualIdx=${actualIdx} item="${item?.title ?? item?.path?.slice(0,60) ?? 'NONE'}" audio.src="${audio.src.slice(0,80)}"`)
      if (!item) return
      const duration = audio.duration * 1000

      // Items with pre-fetched metadata (e.g. DLNA) — skip parseBlob
      if (item.metadataPrefetched) {
        skipCountRef.current = 0
        setState(s => ({
          ...s,
          ready: true,
          track: {
            id:       item.path,
            name:     item.title ?? stemFromPath(item.path),
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
      loadIndex(indexRef.current + 1, activeRef.current)
    }

    const onError = () => {
      const actualIdx = workingOrderRef.current[indexRef.current] ?? indexRef.current
      const item = playlist[actualIdx]
      console.debug(`[useLocalPlayer:${persistKey}] onError — index=${indexRef.current} actualIdx=${actualIdx} item="${item?.title ?? 'NONE'}" audio.src="${audio.src.slice(0,80)}"`)
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
      console.debug(`[useLocalPlayer:${persistKey}] listener-effect CLEANUP — audio.src="${audio.src.slice(0, 80)}"`)
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
    console.debug(`[useLocalPlayer:${persistKey}] playlist-change effect — playlist.length=${playlist.length} active=${activeRef.current} audio.src="${audioRef.current.src.slice(0,80)}" audio.readyState=${audioRef.current.readyState}`)
    skipCountRef.current = 0  // new playlist — reset error streak
    if (playlist.length === 0) {
      audioRef.current.pause()
      audioRef.current.src = ''   // prevent stale error events firing into an empty playlist
      setState(s => ({ ...IDLE_STATE, shuffle: s.shuffle }))
      return
    }
    // The listener-effect cleanup pauses the audio element before re-registering
    // listeners, so the onPause handler never fires and state.paused stays stale.
    // Sync it here: a new playlist always starts paused until the user presses play.
    setState(s => ({ ...s, paused: true }))

    // Restore saved position when the playlist fingerprint matches.
    // The fingerprint is the first track's path — it changes when the user picks a
    // different folder / DLNA container, which signals that the saved index is stale.
    let startIndex = 0
    if (persistKey) {
      const savedFp  = localStorage.getItem(`${persistKey}_fp`)
      const savedIdx = localStorage.getItem(`${persistKey}_index`)
      const currentFp = playlist[0]?.path ?? ''
      console.debug(`[useLocalPlayer:${persistKey}] fingerprint check — savedFp="${savedFp?.slice(0,80)}" currentFp="${currentFp.slice(0,80)}" match=${savedFp === currentFp} savedIdx=${savedIdx}`)
      if (savedFp === currentFp && savedIdx !== null) {
        const parsed = parseInt(savedIdx, 10)
        if (!isNaN(parsed) && parsed > 0 && parsed < playlist.length) startIndex = parsed
      }
      // Always update fingerprint so next folder change is detected correctly
      localStorage.setItem(`${persistKey}_fp`, currentFp)
    }

    console.debug(`[useLocalPlayer:${persistKey}] calling loadIndex(${startIndex}, false) — audio.src before="${audioRef.current.src.slice(0,80)}"`)
    loadIndex(startIndex, false)   // load but don't auto-play; user must press play or switch source
    console.debug(`[useLocalPlayer:${persistKey}] after loadIndex — audio.src="${audioRef.current.src.slice(0,80)}"`)
  }, [playlist, loadIndex, persistKey])

  // ── Pause when going inactive (user controls resume) ─────────────────────
  useEffect(() => {
    console.debug(`[useLocalPlayer:${persistKey}] active-change effect — active=${active} audio.src="${audioRef.current.src.slice(0,80)}" audio.paused=${audioRef.current.paused}`)
    if (!active) audioRef.current.pause()
  }, [active, persistKey])

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    console.debug(`[useLocalPlayer:${persistKey}] togglePlay — audio.paused=${audio.paused} audio.src="${audio.src.slice(0,80)}" audio.readyState=${audio.readyState} audio.networkState=${audio.networkState}`)
    if (audio.paused) audio.play().catch((err) => { console.error(`[useLocalPlayer:${persistKey}] play() rejected:`, err) })
    else              audio.pause()
  }, [persistKey])

  const nextTrack = useCallback(() => {
    console.debug(`[useLocalPlayer:${persistKey}] nextTrack — index=${indexRef.current} playlist.length=${playlist.length} active=${activeRef.current}`)
    loadIndex(indexRef.current + 1, activeRef.current)
  }, [loadIndex, playlist.length, persistKey])

  const prevTrack = useCallback(() => {
    console.debug(`[useLocalPlayer:${persistKey}] prevTrack — index=${indexRef.current} playlist.length=${playlist.length} active=${activeRef.current}`)
    loadIndex(indexRef.current - 1, activeRef.current)
  }, [loadIndex, playlist.length, persistKey])

  const seek = useCallback((ms: number) => {
    audioRef.current.currentTime = ms / 1000
    setState(s => ({ ...s, positionMs: ms }))
  }, [])

  const setVolume = useCallback((v: number) => {
    audioRef.current.volume = v
    setState(s => ({ ...s, volume: v }))
  }, [])

  const toggleShuffle = useCallback(() => {
    setShuffleOn(s => !s)
  }, [])

  // Override state.shuffle with shuffleOn — the single source of truth for shuffle state.
  return { ...state, shuffle: shuffleOn, togglePlay, nextTrack, prevTrack, seek, setVolume, toggleShuffle }
}
