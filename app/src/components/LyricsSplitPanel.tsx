import { useEffect, useRef } from 'react'
import type { LyricLine, LyricsStatus } from '../hooks/useLyrics'
import type { DisplaySettings } from './DisplaySettingsPanel'

interface Props {
  lines:        LyricLine[]
  currentIndex: number
  status:       LyricsStatus
  settings:     DisplaySettings
}

export function LyricsSplitPanel({ lines, currentIndex, status, settings }: Props) {
  const { lyricsSize, lyricsOpacity } = settings
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs     = useRef<(HTMLDivElement | null)[]>([])

  // Auto-scroll so the current line is vertically centered
  useEffect(() => {
    if (currentIndex < 0 || !containerRef.current) return
    const el = lineRefs.current[currentIndex]
    if (!el) return
    const container = containerRef.current
    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [currentIndex])

  const panelStyle: React.CSSProperties = {
    width:          '100%',
    height:         '100%',
    background:     '#0a0a0a',
    display:        'flex',
    flexDirection:  'column',
    justifyContent: 'center',
    overflow:       'hidden',
    position:       'relative',
  }

  // Loading state
  if (status === 'loading') {
    return (
      <div style={panelStyle}>
        <p style={{ color: '#444', fontFamily: 'monospace', fontSize: 13, textAlign: 'center' }}>
          Loading lyrics…
        </p>
      </div>
    )
  }

  // Not found / error / idle — show a subtle placeholder
  if (status === 'not_found' || status === 'error' || status === 'idle' || lines.length === 0) {
    return (
      <div style={panelStyle}>
        <p style={{ color: '#2a2a2a', fontFamily: 'monospace', fontSize: 13, textAlign: 'center' }}>
          {status === 'not_found' ? 'No lyrics found' : status === 'loading' ? 'Loading…' : '♪'}
        </p>
      </div>
    )
  }

  // Unsynced — plain text, no highlighting
  if (status === 'unsynced') {
    return (
      <div style={{ ...panelStyle, overflowY: 'auto', justifyContent: 'flex-start', padding: '10% 8%' }}>
        {lines.map((line, i) => (
          <div key={i} style={{
            fontFamily:  'system-ui, -apple-system, sans-serif',
            fontSize:    lyricsSize * 0.85,
            color:       '#fff',
            opacity:     lyricsOpacity * 0.7,
            lineHeight:  1.8,
            textAlign:   'center',
          }}>
            {line.text}
          </div>
        ))}
      </div>
    )
  }

  // Synced — scrollable list with current line highlighted
  return (
    <div style={panelStyle}>
      {/* Top fade */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '18%',
        background: 'linear-gradient(to bottom, #0a0a0a 0%, transparent 100%)',
        zIndex: 1, pointerEvents: 'none',
      }} />
      {/* Bottom fade */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '18%',
        background: 'linear-gradient(to top, #0a0a0a 0%, transparent 100%)',
        zIndex: 1, pointerEvents: 'none',
      }} />

      <div
        ref={containerRef}
        style={{
          overflowY:  'hidden',   // no manual scrolling — we control it programmatically
          height:     '100%',
          padding:    '50% 8%',   // large top/bottom padding so first/last lines can center
          boxSizing:  'border-box',
        }}
      >
        {lines.map((line, i) => {
          const isCurrent = i === currentIndex
          const distance  = Math.abs(i - currentIndex)
          // Lines far from current fade out more
          const opacity   = isCurrent
            ? lyricsOpacity
            : Math.max(0.08, lyricsOpacity * Math.max(0.15, 1 - distance * 0.18))
          const fontSize  = isCurrent ? lyricsSize : lyricsSize * 0.8

          return (
            <div
              key={i}
              ref={el => { lineRefs.current[i] = el }}
              style={{
                fontFamily:    'system-ui, -apple-system, sans-serif',
                fontSize,
                fontWeight:    isCurrent ? 700 : 400,
                color:         '#fff',
                opacity,
                textAlign:     'center',
                lineHeight:    1.5,
                padding:       `${lyricsSize * 0.3}px 0`,
                transition:    'font-size 0.3s ease, opacity 0.4s ease',
                textShadow:    isCurrent ? '0 2px 12px rgba(0,0,0,0.6)' : 'none',
                letterSpacing: isCurrent ? '0.01em' : '0',
              }}
            >
              {line.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}
