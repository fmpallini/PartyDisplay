import { convertFileSrc } from '@tauri-apps/api/core'
import { useDisplaySync } from '../hooks/useDisplaySync'
import type { TransitionEffect } from './DisplaySettingsPanel'

interface Props {
  photos:               string[]
  transitionEffect:     TransitionEffect
  transitionDurationMs: number
}

export function SlideshowView({ photos, transitionEffect, transitionDurationMs }: Props) {
  const { currentPhoto, previousPhoto, transitioning, activeEffect } =
    useDisplaySync(photos, { transitionEffect, transitionDurationMs })

  const displayPhoto = currentPhoto ?? (photos.length > 0 ? photos[0] : null)

  function toAssetUrl(path: string): string {
    return convertFileSrc(path)
  }

  const durationSec = `${transitionDurationMs / 1000}s`

  if (!displayPhoto) {
    return (
      <div style={containerStyle}>
        <style>{KEYFRAMES}</style>
        <p style={{ color: '#555', fontFamily: 'monospace' }}>Waiting for photos…</p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <style>{KEYFRAMES}</style>

      {/* Previous photo — animates out */}
      {previousPhoto && transitioning && (
        <img
          key={`prev-${previousPhoto}-${Date.now()}`}
          src={toAssetUrl(previousPhoto)}
          style={{
            ...photoStyle,
            animation: `${activeEffect}-out ${durationSec} ease-in-out forwards`,
            zIndex: 1,
          }}
        />
      )}

      {/* Current photo — animates in (or sits static if no transition yet) */}
      <img
        key={`curr-${displayPhoto}`}
        src={toAssetUrl(displayPhoto)}
        style={{
          ...photoStyle,
          animation: transitioning
            ? `${activeEffect}-in ${durationSec} ease-in-out forwards`
            : undefined,
          zIndex: 2,
        }}
      />
    </div>
  )
}

// ── CSS keyframes for all effects ─────────────────────────────────────────────

const KEYFRAMES = `
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes slide-left-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes slide-left-out {
  from { transform: translateX(0); }
  to   { transform: translateX(-100%); }
}

@keyframes slide-right-in {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
}
@keyframes slide-right-out {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}

@keyframes slide-up-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes slide-up-out {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); }
}

@keyframes slide-down-in {
  from { transform: translateY(-100%); }
  to   { transform: translateY(0); }
}
@keyframes slide-down-out {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}

@keyframes zoom-in-in {
  from { transform: scale(0.85); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@keyframes zoom-in-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes zoom-out-in {
  from { transform: scale(1.15); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@keyframes zoom-out-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes blur-in {
  from { filter: blur(20px); opacity: 0; }
  to   { filter: blur(0px);  opacity: 1; }
}
@keyframes blur-out {
  from { filter: blur(0px);  opacity: 1; }
  to   { filter: blur(20px); opacity: 0; }
}
`

// ── Styles ────────────────────────────────────────────────────────────────────

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
