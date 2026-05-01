import type { TrackInfo } from '../lib/player-types'

interface Props { track: TrackInfo | null }

export default function NowPlaying({ track }: Props) {
  if (!track) return <p style={{ margin: 0, color: '#555', fontSize: 12 }}>No track</p>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
      {track.albumArt && (
        <img src={track.albumArt} alt="album art" width={48} height={48} style={{ borderRadius: 4 }} />
      )}
      <div>
        <p style={{ margin: 0, fontWeight: 'bold', color: '#eee', fontSize: 14 }}>
          {track.name}
        </p>
        <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>{track.artists}</p>
      </div>
    </div>
  )
}
