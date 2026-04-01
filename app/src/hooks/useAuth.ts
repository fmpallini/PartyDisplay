import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-shell'
import type { TokenPayload } from '../lib/ipc'
import {
  buildAuthUrl,
  exchangeCode,
  expiresAt,
  generatePkce,
  generateState,
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

  const verifierRef  = useRef<string | null>(null)
  const stateRef     = useRef<string | null>(null)
  const loggedOutRef = useRef(false)

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
        const refreshed = await refreshAccessToken(stored.refresh_token)
        await persistTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? stored.refresh_token })
      } catch (e) {
        setState({ authenticated: false, accessToken: null, loading: false, error: String(e) })
      }
    }
    bootstrap()
  }, [])

  // ── OAuth callback listener (loopback server emits 'oauth-code') ─────────

  useEffect(() => {
    const unlisten = listen<{ code: string; state: string }>('oauth-code', ({ payload }) => {
      if (!verifierRef.current || !stateRef.current) return
      if (payload.state !== stateRef.current) {
        setState(s => ({ ...s, loading: false, error: 'OAuth state mismatch — rejecting callback' }))
        verifierRef.current = null
        stateRef.current = null
        return
      }
      const verifier = verifierRef.current
      verifierRef.current = null
      stateRef.current = null
      exchangeCode(payload.code, verifier)
        .then(persistTokens)
        .catch(e => setState(s => ({ ...s, loading: false, error: String(e) })))
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // ── Auto-refresh timer ────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.authenticated) return

    async function doRefresh() {
      try {
        const stored = await invoke<TokenPayload | null>('load_tokens')
        if (!stored || loggedOutRef.current) return
        const refreshed = await refreshAccessToken(stored.refresh_token)
        if (loggedOutRef.current) return
        await persistTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? stored.refresh_token })
      } catch (e) {
        console.error('Auto-refresh failed:', e)
      }
    }

    async function scheduleRefresh() {
      const stored = await invoke<TokenPayload | null>('load_tokens')
      if (!stored) return
      const msUntilExpiry = stored.expires_at - Date.now()
      const delay = Math.max(0, msUntilExpiry)
      const id = setTimeout(doRefresh, delay)
      return id
    }

    let cancelled = false
    let timerId: ReturnType<typeof setTimeout> | undefined
    scheduleRefresh().then(id => {
      if (cancelled) { if (id !== undefined) clearTimeout(id); return }
      timerId = id
    })

    return () => {
      cancelled = true
      if (timerId !== undefined) clearTimeout(timerId)
    }
  // Depend on accessToken (not just authenticated): accessToken changes on every
  // successful refresh, so the effect re-runs and reschedules the next refresh.
  // When authenticated is false, accessToken is null and the early-return guard fires.
  }, [state.accessToken])

  // ── login / logout ────────────────────────────────────────────────────────

  const login = useCallback(async () => {
    loggedOutRef.current = false
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { verifier, challenge } = await generatePkce()
      const state = generateState()
      verifierRef.current = verifier
      stateRef.current    = state
      await invoke('start_oauth_callback_server')
      await open(buildAuthUrl(challenge, state))
      // Re-enable the button once the browser tab is open so the user can
      // retry if they close the tab without completing auth.
      setState(s => ({ ...s, loading: false }))
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: String(e) }))
    }
  }, [])

  const logout = useCallback(async () => {
    loggedOutRef.current = true
    await invoke('clear_tokens')
    setState({ authenticated: false, accessToken: null, loading: false, error: null })
  }, [])

  return { ...state, login, logout }
}
