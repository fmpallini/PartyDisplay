import { useDisplaySync } from '../hooks/useDisplaySync'

interface Props {
  photos: string[]
}

const TRANSITION_MS = 800

export function SlideshowView({ photos }: Props) {
  const { currentPhoto, previousPhoto, transitioning } = useDisplaySync(photos)

  // Show the first available photo immediately — don't wait for the first beat event
  const displayPhoto = currentPhoto ?? (photos.length > 0 ? photos[0] : null)

  // Convert absolute filesystem path to asset:// URL
  function toAssetUrl(path: string): string {
    const normalized = path.replace(/\\/g, '/')
    return `asset://localhost/${normalized}`
  }

  if (!displayPhoto) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#555', fontFamily: 'monospace' }}>Waiting for photos…</p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* Previous photo fades out */}
      {previousPhoto && (
        <img
          key={previousPhoto}
          src={toAssetUrl(previousPhoto)}
          style={{
            ...photoStyle,
            opacity: transitioning ? 0 : 1,
            transition: `opacity ${TRANSITION_MS}ms ease-in-out`,
          }}
        />
      )}
      {/* Current photo fades in */}
      <img
        key={displayPhoto}
        src={toAssetUrl(displayPhoto)}
        style={{
          ...photoStyle,
          opacity: transitioning ? 1 : 1,
          transition: `opacity ${TRANSITION_MS}ms ease-in-out`,
          zIndex: 1,
        }}
      />
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100vw',
  height: '100vh',
  background: '#000',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const photoStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
}
