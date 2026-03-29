interface Props {
  authenticated: boolean
  loading: boolean
  onLogin: () => void
  onLogout: () => void
}

export default function LoginButton({ authenticated, loading, onLogin, onLogout }: Props) {
  if (loading) return <button disabled style={btnStyle('#444', '#888')}>Connecting…</button>
  if (authenticated) return <button onClick={onLogout} style={btnStyle('#c0392b', '#fff')}>Disconnect Spotify</button>
  return <button onClick={onLogin} style={btnStyle('#1db954', '#000')}>Connect Spotify</button>
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, border: 'none', padding: '10px 24px', borderRadius: 20,
           fontWeight: 'bold', cursor: 'pointer', fontSize: 14 }
}
