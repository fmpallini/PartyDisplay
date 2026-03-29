import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export interface TrackChangedPayload {
  name:     string
  artists:  string
  albumArt: string
}

interface Props {
  displayMs: number
  zoom:      number
}

export function SongToast({ displayMs, zoom }: Props) {
  const [track, setTrack]     = useState<TrackChangedPayload | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unlisten = listen<TrackChangedPayload>('track-changed', ({ payload }) => {
      setTrack(payload)
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), displayMs)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [displayMs])

  if (!track) return null

  return (
    <div style={{
      position:        'fixed',
      bottom:          32,
      left:            32,
      display:         'flex',
      alignItems:      'center',
      gap:             12,
      background:      'rgba(0,0,0,0.78)',
      backdropFilter:  'blur(10px)',
      borderRadius:    12,
      padding:         '10px 16px 10px 10px',
      zIndex:          200,
      maxWidth:        320,
      opacity:         visible ? 1 : 0,
      transform:       `scale(${zoom})`,
      transformOrigin: 'bottom left',
      transition:      'opacity 0.4s ease',
      pointerEvents:   'none',
    }}>
      {track.albumArt && (
        <img
          src={track.albumArt}
          alt=""
          style={{ width: 52, height: 52, borderRadius: 6, flexShrink: 0, objectFit: 'cover' }}
        />
      )}
      <div style={{ overflow: 'hidden' }}>
        <div style={{
          color: '#fff', fontWeight: 700, fontSize: 14,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {track.name}
        </div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>{track.artists}</div>
      </div>
    </div>
  )
}
