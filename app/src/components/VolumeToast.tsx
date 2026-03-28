import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export interface VolumeChangedPayload {
  volume: number  // 0–1
}

const DISPLAY_MS = 2500

export function VolumeToast() {
  const [volume, setVolume]   = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unlisten = listen<VolumeChangedPayload>('volume-changed', ({ payload }) => {
      setVolume(payload.volume)
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), DISPLAY_MS)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const pct = Math.round(volume * 100)

  // Pick icon based on level
  const icon = volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'

  return (
    <div style={{
      position:       'fixed',
      bottom:         32,
      right:          32,
      display:        'flex',
      alignItems:     'center',
      gap:            10,
      background:     'rgba(0,0,0,0.78)',
      backdropFilter: 'blur(10px)',
      borderRadius:   10,
      padding:        '10px 16px',
      zIndex:         200,
      minWidth:       160,
      opacity:        visible ? 1 : 0,
      transform:      visible ? 'translateY(0)' : 'translateY(16px)',
      transition:     'opacity 0.4s ease, transform 0.4s ease',
      pointerEvents:  'none',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          height: 4, background: '#333', borderRadius: 2, overflow: 'hidden', marginBottom: 4,
        }}>
          <div style={{
            width:      `${pct}%`,
            height:     '100%',
            background: '#1db954',
            borderRadius: 2,
            transition: 'width 0.15s ease',
          }} />
        </div>
        <div style={{ color: '#aaa', fontSize: 12 }}>{pct}%</div>
      </div>
    </div>
  )
}
