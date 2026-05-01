import { useMemo } from 'react'
import type { DlnaBrowserState } from '../hooks/useDlnaBrowser'

const errStyle: React.CSSProperties = {
  background: '#e74c3c18', border: '1px solid #e74c3c33', borderRadius: 6,
  padding: '6px 10px', color: '#e74c3c', fontSize: 11,
}

interface Props {
  browser:        DlnaBrowserState
  mimePrefix:     string
  itemCountText:  (n: number) => string
  containerIcon?: string
}

export function DlnaBrowser({ browser, mimePrefix, itemCountText, containerIcon = '' }: Props) {
  if (!browser.server) {
    return (
      <>
        <button
          onClick={browser.discover}
          disabled={browser.discovering}
          style={{
            background: '#1db95418', border: '1px solid #1db95444', color: '#1db954',
            borderRadius: 4, padding: '4px 12px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
          }}
        >
          {browser.discovering ? 'Searching…' : 'Discover DLNA Servers'}
        </button>
        {!browser.discovering && browser.servers.length === 0 && (
          <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
            No DLNA servers found. Press Discover to search.
          </p>
        )}
        {browser.servers.map(s => (
          <button
            key={s.location}
            onClick={() => browser.selectServer(s)}
            style={{
              background: 'none', border: '1px solid #2a2a2a', color: '#ccc',
              borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
            }}
          >
            {s.name}
          </button>
        ))}
      </>
    )
  }

  const itemCount = useMemo(
    () => browser.items.filter(i => i.mime.startsWith(mimePrefix)).length,
    [browser.items, mimePrefix],
  )

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <button
          onClick={browser.reset}
          style={{ background: 'none', border: 'none', color: '#1db954', cursor: 'pointer', fontSize: 12, padding: 0 }}
          title="Back to server list"
        >
          ⌂ {browser.server.name}
        </button>
        {browser.breadcrumb.map(c => (
          <span key={c.id} style={{ color: '#555', fontSize: 11 }}>/ {c.title}</span>
        ))}
        {browser.breadcrumb.length > 0 && (
          <button
            onClick={browser.back}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, marginLeft: 4 }}
          >
            ← Back
          </button>
        )}
      </div>

      {browser.loading && <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Loading…</p>}
      {browser.error && <div style={errStyle}>{browser.error}</div>}

      {browser.containers.map(c => (
        <button
          key={c.id}
          onClick={() => browser.browse(c)}
          style={{
            background: 'none', border: '1px solid #2a2a2a', color: '#aaa',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
          }}
        >
          {containerIcon}{c.title}
        </button>
      ))}

      {itemCount > 0 && (
        <p style={{ margin: 0, color: '#555', fontSize: 11 }}>{itemCountText(itemCount)}</p>
      )}
      {!browser.loading && browser.containers.length === 0 && itemCount === 0 && (
        <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Folder is empty.</p>
      )}
    </>
  )
}
