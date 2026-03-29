const CLIENT_ID   = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string
const REDIRECT_URI = 'http://127.0.0.1:7357/callback'
const SCOPES       = 'streaming user-read-playback-state user-modify-playback-state user-read-currently-playing'

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = randomBytes(64)
  const verifier      = base64url(verifierBytes.buffer as ArrayBuffer)
  // Challenge must be SHA-256 of the verifier STRING (as UTF-8), not of the raw bytes.
  // Spotify verifies: base64url(sha256(verifier)) === stored_challenge
  const digest        = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge     = base64url(digest)
  return { verifier, challenge }
}

export function generateState(): string {
  return base64url(randomBytes(32).buffer as ArrayBuffer)
}

export function buildAuthUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    response_type:         'code',
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPES,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
    state,
  })
  return `https://accounts.spotify.com/authorize?${params}`
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface RawTokenResponse {
  access_token:  string
  refresh_token: string
  expires_in:    number
}

export async function exchangeCode(code: string, verifier: string): Promise<RawTokenResponse> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<RawTokenResponse>
}

export async function refreshAccessToken(refresh_token: string): Promise<RawTokenResponse> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'refresh_token',
      refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<RawTokenResponse>
}

export function expiresAt(expires_in: number): number {
  // Subtract 60s buffer so we refresh before actual expiry
  return Date.now() + (expires_in - 60) * 1000
}
