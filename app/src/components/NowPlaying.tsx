import type { TrackInfo } from '../hooks/useSpotifyPlayer'

interface Props { track: TrackInfo | null; paused: boolean }

export default function NowPlaying({ track, paused }: Props) {
  if (!track) return <p style={{ color: '#666', fontSize: 13 }}>No track playing — open Spotify and select this device.</p>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
      {track.albumArt && (
        <img src={track.albumArt} alt="album art" width={48} height={48} style={{ borderRadius: 4 }} />
      )}
      <div>
        <p style={{ margin: 0, fontWeight: 'bold', color: '#eee', fontSize: 14 }}>
          {paused ? '⏸' : '▶'} {track.name}
        </p>
        <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>{track.artists}</p>
      </div>
    </div>
  )
}
