import { useEffect, useRef, useState } from 'react'
import type { TrackInfo } from './useSpotifyPlayer'

export interface LyricLine {
  timeMs: number
  text:   string
}

export type LyricsStatus = 'idle' | 'loading' | 'synced' | 'unsynced' | 'not_found' | 'error'

export interface LyricsResult {
  lines:        LyricLine[]
  currentIndex: number   // index of the line that should be highlighted; -1 = before first line
  status:       LyricsStatus
}

// Parse LRC format: [mm:ss.xx] text  OR  [mm:ss.xxx] text
const LRC_RE = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/

function parseLrc(lrc: string): LyricLine[] {
  return lrc
    .split('\n')
    .map(line => {
      const m = LRC_RE.exec(line.trim())
      if (!m) return null
      const min  = parseInt(m[1], 10)
      const sec  = parseInt(m[2], 10)
      const frac = m[3].length === 2 ? parseInt(m[3], 10) * 10 : parseInt(m[3], 10)
      return { timeMs: (min * 60 + sec) * 1000 + frac, text: m[4] }
    })
    .filter((l): l is LyricLine => l !== null && l.text.trim() !== '')
    .sort((a, b) => a.timeMs - b.timeMs)
}

// Simple map so we don't re-fetch on every render cycle
const cache = new Map<string, { lines: LyricLine[]; status: LyricsStatus }>()

export function useLyrics(track: TrackInfo | null, positionMs: number): LyricsResult {
  const [entry, setEntry] = useState<{ lines: LyricLine[]; status: LyricsStatus }>({
    lines: [], status: 'idle',
  })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!track?.id) {
      setEntry({ lines: [], status: 'idle' })
      return
    }

    const cached = cache.get(track.id)
    if (cached) {
      setEntry(cached)
      return
    }

    // Abort any in-flight request for a previous track
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setEntry({ lines: [], status: 'loading' })

    const durationSec = Math.round(track.duration / 1000)
    const params = new URLSearchParams({
      artist_name: track.artists,
      track_name:  track.name,
      duration:    String(durationSec),
    })

    fetch(`https://lrclib.net/api/get?${params}`, { signal: controller.signal })
      .then(r => {
        if (r.status === 404) return null
        if (!r.ok) throw new Error(`LRCLIB ${r.status}`)
        return r.json()
      })
      .then((data: any) => {
        let result: { lines: LyricLine[]; status: LyricsStatus }
        if (!data) {
          result = { lines: [], status: 'not_found' }
        } else if (data.syncedLyrics) {
          result = { lines: parseLrc(data.syncedLyrics), status: 'synced' }
        } else if (data.plainLyrics) {
          // No timestamps — split into static lines, all at timeMs 0
          const lines = (data.plainLyrics as string)
            .split('\n')
            .filter((l: string) => l.trim() !== '')
            .map((text: string) => ({ timeMs: 0, text }))
          result = { lines, status: 'unsynced' }
        } else {
          result = { lines: [], status: 'not_found' }
        }
        cache.set(track.id, result)
        setEntry(result)
      })
      .catch(err => {
        if ((err as Error).name === 'AbortError') return
        console.error('LRCLIB fetch error:', err)
        const result = { lines: [], status: 'error' as LyricsStatus }
        cache.set(track.id, result)
        setEntry(result)
      })

    return () => { controller.abort() }
  }, [track?.id])

  // Derive current line index from positionMs (no extra state needed)
  let currentIndex = -1
  if (entry.status === 'synced' && entry.lines.length > 0) {
    for (let i = entry.lines.length - 1; i >= 0; i--) {
      if (entry.lines[i].timeMs <= positionMs) {
        currentIndex = i
        break
      }
    }
  }

  return { ...entry, currentIndex }
}
