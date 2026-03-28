import LoginButton from '../../components/LoginButton'
import { useAuth } from '../../hooks/useAuth'

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error, login, logout } = useAuth()

  return (
    <div style={{ fontFamily: 'monospace', padding: 24, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h2 style={{ color: '#1db954', margin: '0 0 20px' }}>Party Display</h2>

      <LoginButton
        authenticated={authenticated}
        loading={loading}
        onLogin={login}
        onLogout={logout}
      />

      {authenticated && (
        <p style={{ color: '#1db954', marginTop: 12 }}>
          ✅ Authenticated — token: {accessToken?.slice(0, 20)}…
        </p>
      )}

      {error && <p style={{ color: '#e74c3c', marginTop: 12 }}>❌ {error}</p>}
    </div>
  )
}
