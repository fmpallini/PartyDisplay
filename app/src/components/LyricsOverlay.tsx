import type { LyricLine, LyricsStatus } from '../hooks/useLyrics'
import type { DisplaySettings } from './DisplaySettingsPanel'

interface Props {
  lines:        LyricLine[]
  currentIndex: number
  status:       LyricsStatus
  settings:     DisplaySettings
}

export function LyricsOverlay({ lines, currentIndex, status, settings }: Props) {
  const { lyricsSize, lyricsOpacity, lyricsPosition } = settings

  const isBottom = lyricsPosition === 'lower-third'

  const containerStyle: React.CSSProperties = {
    position:      'absolute',
    left:          0,
    right:         0,
    bottom:        isBottom ? '12%' : undefined,
    top:           isBottom ? undefined : '50%',
    transform:     isBottom ? undefined : 'translateY(-50%)',
    zIndex:        20,
    pointerEvents: 'none',
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           8,
    padding:       '0 10%',
  }

  // Unsynced: show all lines statically (scroll position not tracked — just display)
  if (status === 'unsynced') {
    return (
      <div style={containerStyle}>
        <div style={{
          background:    `rgba(0,0,0,${Math.max(0, lyricsOpacity - 0.2)})`,
          borderRadius:  12,
          padding:       '12px 24px',
          maxHeight:     '40vh',
          overflowY:     'hidden',
          textAlign:     'center',
          color:         '#fff',
          fontSize:      lyricsSize * 0.75,
          fontFamily:    'system-ui, -apple-system, sans-serif',
          opacity:       lyricsOpacity,
          lineHeight:    1.7,
          whiteSpace:    'pre-wrap',
        }}>
          {lines.map(l => l.text).join('\n')}
        </div>
      </div>
    )
  }

  if (status !== 'synced' || lines.length === 0) return null

  const prev    = currentIndex > 0            ? lines[currentIndex - 1] : null
  const current = currentIndex >= 0           ? lines[currentIndex]     : null
  const next    = currentIndex < lines.length - 1 ? lines[currentIndex + 1] : null

  const baseFont: React.CSSProperties = {
    fontFamily:    'system-ui, -apple-system, sans-serif',
    textAlign:     'center',
    lineHeight:    1.3,
    transition:    'opacity 0.4s ease, font-size 0.3s ease',
    textShadow:    '0 2px 8px rgba(0,0,0,0.8)',
    whiteSpace:    'nowrap',
    overflow:      'hidden',
    textOverflow:  'ellipsis',
    maxWidth:      '100%',
  }

  return (
    <div style={containerStyle}>
      {/* Previous line */}
      <div style={{
        ...baseFont,
        fontSize: lyricsSize * 0.7,
        opacity:  lyricsOpacity * 0.4,
        color:    '#fff',
        minHeight: lyricsSize * 0.7 * 1.3,
      }}>
        {prev?.text ?? ''}
      </div>

      {/* Current line */}
      <div style={{
        ...baseFont,
        fontSize:   lyricsSize,
        fontWeight: 700,
        opacity:    current ? lyricsOpacity : 0,
        color:      '#fff',
        letterSpacing: '0.01em',
      }}>
        {current?.text ?? ''}
      </div>

      {/* Next line */}
      <div style={{
        ...baseFont,
        fontSize: lyricsSize * 0.7,
        opacity:  lyricsOpacity * 0.4,
        color:    '#fff',
        minHeight: lyricsSize * 0.7 * 1.3,
      }}>
        {next?.text ?? ''}
      </div>
    </div>
  )
}
