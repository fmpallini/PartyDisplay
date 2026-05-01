import { useState } from 'react'
import { open } from '@tauri-apps/plugin-shell'
import { validateClientId } from '../lib/spotify-auth'

interface Props {
  onSave: (clientId: string) => Promise<void>
  onBack: () => void
}

export function ClientIdSetup({ onSave, onBack }: Props) {
  const [value, setValue]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [copied, setCopied]   = useState(false)

  function copyRedirectUri() {
    navigator.clipboard.writeText('http://127.0.0.1:7357/callback').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const trimmed = value.trim()

  async function handleSave() {
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const valid = await validateClientId(trimmed)
      if (!valid) {
        setError('Invalid Client ID — not recognized by Spotify. Double-check and try again.')
        return
      }
      await onSave(trimmed)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', padding: '32px', background: '#0f0f0f', color: '#e0e0e0',
      fontFamily: 'monospace', gap: '20px', position: 'relative',
    }}>
      <button
        onClick={onBack}
        style={{
          position: 'absolute', top: '16px', left: '16px',
          background: 'none', border: '1px solid #444', borderRadius: '6px',
          color: '#aaa', fontSize: '12px', padding: '4px 10px', cursor: 'pointer',
        }}
      >
        ← Back
      </button>
      <div style={{ fontSize: '28px' }}>🎵</div>
      <h2 style={{ margin: 0, color: '#1db954', fontSize: '15px', letterSpacing: '0.05em' }}>
        SPOTIFY SETUP
      </h2>
      <p style={{ margin: 0, color: '#aaa', maxWidth: '400px', lineHeight: 1.6, fontSize: '13px', textAlign: 'center' }}>
        This app needs your own Spotify Client ID to connect. Each user registers a free app on Spotify's developer portal.
      </p>
      <p style={{ margin: 0, color: '#777', maxWidth: '400px', lineHeight: 1.6, fontSize: '12px', textAlign: 'center' }}>
        No Premium account or is the process too complex? You can skip this by using the external audio source integration — go back to the previous screen and select the <strong style={{ color: '#aaa' }}>External</strong> source instead. Open Spotify (app or browser), and Party Display will detect and interact with it automatically.
      </p>
      <div style={{
        background: '#2a1a00', border: '1px solid #7a4a00', borderRadius: '6px',
        padding: '8px 14px', maxWidth: '400px', width: '100%',
        fontSize: '12px', color: '#ffaa44', textAlign: 'center',
      }}>
        ⚠️ <strong>Spotify Premium required.</strong> Free accounts cannot stream via the API.
      </div>

      <div style={{
        background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px',
        padding: '18px 22px', maxWidth: '440px', width: '100%', fontSize: '12px', lineHeight: 2,
      }}>
        <div style={{ color: '#1db954', marginBottom: '8px', fontWeight: 'bold' }}>Steps:</div>
        <div style={{ color: '#ccc' }}>
          1. Go to{' '}
          <span
            onClick={() => open('https://developer.spotify.com/dashboard')}
            style={{ color: '#1db954', cursor: 'pointer', textDecoration: 'underline' }}
          >developer.spotify.com/dashboard</span>
          {' '}and click <strong style={{ color: '#fff' }}>Create app</strong>
        </div>
        <div style={{ color: '#ccc' }}>2. Fill in any <strong style={{ color: '#fff' }}>App name</strong> and <strong style={{ color: '#fff' }}>description</strong></div>
        <div style={{ color: '#ccc' }}>3. Set the <strong style={{ color: '#fff' }}>Redirect URI</strong> to:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0 8px' }}>
          <div style={{
            background: '#111', borderRadius: '4px', padding: '6px 10px', flex: 1,
            color: '#f0f0f0', fontSize: '11px', userSelect: 'all',
          }}>
            http://127.0.0.1:7357/callback
          </div>
          <button
            onClick={copyRedirectUri}
            style={{
              background: copied ? '#1db95422' : '#222', border: `1px solid ${copied ? '#1db954' : '#444'}`,
              borderRadius: '4px', color: copied ? '#1db954' : '#aaa', cursor: 'pointer',
              fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit', flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <div style={{ color: '#ccc' }}>4. Under <em>"Which API/SDKs are you planning to use?"</em> check <strong style={{ color: '#fff' }}>Web Playback SDK</strong></div>
        <div style={{ color: '#ccc' }}>5. Check Spotify terms checkbox, click Save, then copy the <strong style={{ color: '#fff' }}>Client ID</strong> from the app settings</div>
        <div style={{ color: '#ccc' }}>6. Paste it below</div>
      </div>

      <div style={{ maxWidth: '440px', width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input
          type="text"
          placeholder="Paste Client ID here…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          disabled={saving}
          style={{
            background: '#1a1a1a', border: '1px solid #444', borderRadius: '6px',
            padding: '10px 12px', color: '#fff', fontSize: '13px', fontFamily: 'monospace',
            outline: 'none', width: '100%', boxSizing: 'border-box',
          }}
        />
        {error && (
          <div style={{ color: '#e74c3c', fontSize: '11px' }}>{error}</div>
        )}
        <button
          onClick={handleSave}
          disabled={!trimmed || saving}
          style={{
            background: trimmed && !saving ? '#1db954' : '#333',
            color: trimmed && !saving ? '#000' : '#666',
            border: 'none', borderRadius: '6px', padding: '10px',
            fontSize: '13px', fontWeight: 'bold', cursor: trimmed && !saving ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}
        >
          {saving ? 'Validating…' : 'Connect to Spotify'}
        </button>
      </div>
    </div>
  )
}
