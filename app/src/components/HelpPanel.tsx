import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { open } from '@tauri-apps/plugin-shell'

interface Props {
  onClose: () => void
}

const HOTKEYS = [
  { key: '→ / ←',    action: 'Next / previous photo'     },
  { key: 'Space',     action: 'Pause / resume slideshow'  },
  { key: 'M',         action: 'Cycle visualizer mode'     },
  { key: 'N',         action: 'Next visualizer preset'    },
  { key: 'T',         action: 'Toggle track overlay'      },
  { key: 'B',         action: 'Toggle battery'            },
  { key: 'P',         action: 'Toggle photo counter'      },
  { key: 'C',         action: 'Toggle clock & weather'    },
  { key: 'L',         action: 'Toggle lyrics'             },
  { key: 'F',         action: 'Toggle fullscreen'         },
  { key: 'Esc',       action: 'Exit fullscreen'           },
  { key: 'Dbl-click', action: 'Toggle fullscreen'         },
  { key: 'Num 4 / 6', action: 'Previous / next track'    },
  { key: 'Num 5',     action: 'Play / pause music'        },
  { key: 'Num + / −', action: 'Volume up / down'          },
]

const CREDITS = [
  { name: 'Tauri v2',                  url: 'https://tauri.app',                        role: 'Desktop app framework (Rust + WebView2)' },
  { name: 'Spotify Web Playback SDK',  url: 'https://developer.spotify.com/documentation/web-playback-sdk', role: 'Spotify Connect device + playback' },
  { name: 'Spotify Web API',           url: 'https://developer.spotify.com/documentation/web-api', role: 'Playback state, volume, device info' },
  { name: 'LRCLIB',                    url: 'https://lrclib.net',                       role: 'Free synchronized lyrics API' },
  { name: 'Open-Meteo',                url: 'https://open-meteo.com',                   role: 'Free weather forecast API' },
  { name: 'ip-api.com',                 url: 'https://ip-api.com',                       role: 'IP-based location for weather auto-detect' },
  { name: 'cpal',                      url: 'https://github.com/RustAudio/cpal',        role: 'Cross-platform audio I/O (WASAPI loopback)' },
  { name: 'Butterchurn',               url: 'https://github.com/jberg/butterchurn',     role: 'MilkDrop-style WebGL visualizer' },
  { name: 'rupnp',                     url: 'https://github.com/jakobhellermann/rupnp', role: 'UPnP/DLNA device discovery and browsing' },
  { name: 'notify',                    url: 'https://github.com/notify-rs/notify',      role: 'File system watcher for photo folder' },
  { name: 'keyring',                   url: 'https://github.com/hwchen/keyring-rs',     role: 'Secure token storage (Windows Credential Store)' },
  { name: 'music-metadata',            url: 'https://github.com/borewit/music-metadata', role: 'Embedded audio tag parsing (ID3, FLAC, M4A…)' },
  { name: 'React',                     url: 'https://react.dev',                        role: 'UI framework' },
  { name: 'Vite',                      url: 'https://vitejs.dev',                       role: 'Frontend build tool' },
]

export function HelpPanel({ onClose }: Props) {
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => { getVersion().then(setVersion).catch(() => {}) }, [])

  async function handleReset() {
    const ok = window.confirm(
      'Reset all settings and credentials?\n\nThis will clear all saved settings and Spotify tokens, then restart the app.'
    )
    if (!ok) return

    localStorage.clear()
    await invoke('clear_tokens').catch(console.error)
    await invoke('clear_webview_data').catch(console.error)
    await invoke('relaunch').catch(console.error)
  }

  return (
    // Full-screen backdrop
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      {/* Modal card — stop click propagation so it doesn't close itself */}
      <div
        style={{
          background: '#181818', border: '1px solid #2a2a2a', borderRadius: 10,
          padding: '20px 22px', width: 320, maxHeight: '80vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ color: '#1db954', fontWeight: 700, fontSize: 15 }}>Party Display</span>
            {version && <span style={{ color: '#444', fontSize: 11 }}>v{version}</span>}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* About */}
        <p style={{ margin: 0, fontSize: 12, color: '#888', lineHeight: 1.5 }}>
          A Tauri + React app that turns a spare monitor into a music-aware photo slideshow, synced with Spotify.
        </p>

        {/* GitHub */}
        <button
          onClick={() => open('https://github.com/fmpallini/PartyDisplay').catch(console.error)}
          style={{
            background: '#242424', border: '1px solid #333', color: '#ccc',
            borderRadius: 5, padding: '7px 12px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: 15 }}>&#x1F517;</span>
          github.com/fmpallini/PartyDisplay
        </button>

        {/* Hotkeys */}
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#555' }}>
            Hotkeys
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {HOTKEYS.map(({ key, action }) => (
                <tr key={key}>
                  <td style={{ padding: '4px 8px 4px 0', color: '#e8e8e8', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    <kbd style={{
                      background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 3,
                      padding: '1px 5px', fontSize: 11, fontFamily: 'inherit',
                    }}>{key}</kbd>
                  </td>
                  <td style={{ padding: '4px 0', color: '#888' }}>{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #242424' }} />

        {/* Reset */}
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#555' }}>
            Troubleshooting
          </p>
          <button
            onClick={handleReset}
            style={{
              width: '100%', background: '#e74c3c18', border: '1px solid #e74c3c44',
              color: '#e74c3c', borderRadius: 5, padding: '7px 12px',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            }}
          >
            Reset
          </button>
          <p style={{ margin: '5px 0 0', fontSize: 10, color: '#444', lineHeight: 1.4 }}>
            Clears all saved settings and Spotify credentials, then restarts the app.
          </p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #242424' }} />

        {/* Credits — collapsible */}
        <div>
          <button
            onClick={() => setCreditsOpen(o => !o)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, width: '100%',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#555' }}>
              Built with
            </span>
            <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto', transition: 'transform 0.2s', display: 'inline-block', transform: creditsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
          </button>
          {creditsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {CREDITS.map(({ name, url, role }) => (
                <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <button
                    onClick={() => open(url).catch(console.error)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: '#1db954', fontSize: 12, textAlign: 'left', fontFamily: 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    {name}
                  </button>
                  <span style={{ fontSize: 11, color: '#555' }}>{role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
