import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { open } from '@tauri-apps/plugin-shell'
import type { TokenPayload } from '../lib/ipc'
import {
  buildAuthUrl,
  exchangeCode,
  expiresAt,
  generatePkce,
  refreshAccessToken,
} from '../lib/spotify-auth'

export interface AuthState {
  authenticated: boolean
  accessToken: string | null
  loading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    accessToken: null,
    loading: true,
    error: null,
  })

  // Store verifier in a ref so the deep-link callback can access it
  const verifierRef = useRef<string | null>(null)

  // ── Persist + update state ────────────────────────────────────────────────

  async function persistTokens(raw: { access_token: string; refresh_token: string; expires_in: number }) {
    const payload: TokenPayload = {
      access_token:  raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at:    expiresAt(raw.expires_in),
    }
    await invoke('store_tokens', { tokens: payload })
    setState({ authenticated: true, accessToken: raw.access_token, loading: false, error: null })
  }

  // ── On mount: load persisted tokens, refresh if expired ─────────────────

  useEffect(() => {
    async function bootstrap() {
      try {
        const stored = await invoke<TokenPayload | null>('load_tokens')
        if (!stored) {
          setState(s => ({ ...s, loading: false }))
          return
        }
        if (Date.now() < stored.expires_at) {
          setState({ authenticated: true, accessToken: stored.access_token, loading: false, error: null })
          return
        }
        // Token expired — refresh
        const refreshed = await refreshAccessToken(stored.refresh_token)
        await persistTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? stored.refresh_token })
      } catch (e) {
        setState({ authenticated: false, accessToken: null, loading: false, error: String(e) })
      }
    }
    bootstrap()
  }, [])

  // ── Deep-link listener: fires when Spotify redirects to party-display:// ─

  useEffect(() => {
    const unlisten = onOpenUrl((urls) => {
      const url = urls[0]
      if (!url) return
      const parsed = new URL(url)
      const code   = parsed.searchParams.get('code')
      const error  = parsed.searchParams.get('error')

      if (error) {
        setState(s => ({ ...s, loading: false, error: `Spotify auth error: ${error}` }))
        return
      }
      if (!code || !verifierRef.current) return

      const verifier = verifierRef.current
      verifierRef.current = null

      exchangeCode(code, verifier)
        .then(persistTokens)
        .catch(e => setState(s => ({ ...s, loading: false, error: String(e) })))
    })

    return () => { unlisten.then(fn => fn()) }
  }, [])

  // ── login / logout ────────────────────────────────────────────────────────

  const login = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { verifier, challenge } = await generatePkce()
      verifierRef.current = verifier
      await open(buildAuthUrl(challenge))
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: String(e) }))
    }
  }, [])

  const logout = useCallback(async () => {
    await invoke('clear_tokens')
    setState({ authenticated: false, accessToken: null, loading: false, error: null })
  }, [])

  return { ...state, login, logout }
}
