import type { TrackInfo } from '../hooks/useSpotifyPlayer'

interface Props {
  track:      TrackInfo | null
  paused:     boolean
  positionMs: number
  togglePlay: () => void
  nextTrack:  () => void
  prevTrack:  () => void
  seek:       (ms: number) => void
}

function fmt(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#eee',
  fontSize: 20, cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
}

const playBtn: React.CSSProperties = {
  ...iconBtn, fontSize: 24, color: '#1db954',
}

export function PlayerControls({ track, paused, positionMs, togglePlay, nextTrack, prevTrack, seek }: Props) {
  const duration  = track?.duration ?? 0
  const remaining = Math.max(0, duration - positionMs)

  if (!track) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>

      {/* Transport buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button style={iconBtn} onClick={prevTrack} title="Previous">⏮</button>
        <button style={playBtn} onClick={togglePlay} title={paused ? 'Play' : 'Pause'}>
          {paused ? '▶' : '⏸'}
        </button>
        <button style={iconBtn} onClick={nextTrack} title="Next">⏭</button>

        {/* Time */}
        <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 13, marginLeft: 8 }}>
          {fmt(positionMs)}
        </span>
        <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 13 }}>
          &nbsp;/&nbsp;{fmt(duration)}
        </span>
        <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 13, marginLeft: 8 }}>
          -{fmt(remaining)}
        </span>
      </div>

      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={duration}
        value={positionMs}
        onChange={e => seek(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#1db954', cursor: 'pointer' }}
      />

    </div>
  )
}
