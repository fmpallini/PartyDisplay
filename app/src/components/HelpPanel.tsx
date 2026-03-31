import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'

interface Props {
  onClose: () => void
}

const HOTKEYS = [
  { key: '→ / ←',    action: 'Next / previous photo'     },
  { key: 'Space',     action: 'Pause / resume slideshow'  },
  { key: 'S',         action: 'Toggle spectrum analyser'  },
  { key: 'T',         action: 'Toggle track overlay'      },
  { key: 'B',         action: 'Toggle battery'            },
  { key: 'P',         action: 'Toggle photo counter'      },
  { key: 'C',         action: 'Toggle clock & weather'    },
  { key: 'F',         action: 'Toggle fullscreen'         },
  { key: 'Esc',       action: 'Exit fullscreen'           },
  { key: 'Dbl-click', action: 'Toggle fullscreen'         },
]

export function HelpPanel({ onClose }: Props) {
  function handleReset() {
    const ok = window.confirm(
      'Reset all settings and credentials?\n\nThis will clear all saved settings and Spotify tokens, then restart the app.'
    )
    if (!ok) return

    localStorage.clear()
    invoke('clear_tokens').catch(console.error)
    invoke('relaunch').catch(console.error)
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
          <span style={{ color: '#1db954', fontWeight: 700, fontSize: 15 }}>Party Display</span>
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
            Reset all settings &amp; restart
          </button>
          <p style={{ margin: '5px 0 0', fontSize: 10, color: '#444', lineHeight: 1.4 }}>
            Clears all saved settings and Spotify credentials, then relaunches the app.
          </p>
        </div>
      </div>
    </div>
  )
}
