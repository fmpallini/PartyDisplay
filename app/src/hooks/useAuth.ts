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
  clientId: string | null
  loading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    accessToken: null,
    clientId: null,
    loading: true,
    error: null,
  })

  function isInvalidClient(e: unknown) {
    return /invalid_client/i.test(String(e))
  }

  async function clearInvalidClient() {
    await invoke('clear_tokens').catch(() => {})
    await invoke('clear_client_id').catch(() => {})
    clientIdRef.current = null
    setState({ authenticated: false, accessToken: null, clientId: null, loading: false,
      error: 'Invalid Spotify Client ID — please re-enter it.' })
  }

  const verifierRef  = useRef<string | null>(null)
  const stateRef     = useRef<string | null>(null)
  const loggedOutRef = useRef(false)
  const clientIdRef  = useRef<string | null>(null)

  // ── Persist + update state ────────────────────────────────────────────────

  async function persistTokens(raw: { access_token: string; refresh_token: string; expires_in: number }) {
    const payload: TokenPayload = {
      access_token:  raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at:    expiresAt(raw.expires_in),
    }
    await invoke('store_tokens', { tokens: payload })
    setState(s => ({ ...s, authenticated: true, accessToken: raw.access_token, loading: false, error: null }))
  }

  // ── On mount: load clientId then bootstrap tokens ────────────────────────

  useEffect(() => {
    async function bootstrap() {
      try {
        const clientId = await invoke<string | null>('load_client_id')
        clientIdRef.current = clientId
        if (!clientId) {
          setState(s => ({ ...s, clientId: null, loading: false }))
          return
        }
        setState(s => ({ ...s, clientId }))

        const stored = await invoke<TokenPayload | null>('load_tokens')
        if (!stored) {
          setState(s => ({ ...s, loading: false }))
          return
        }
        if (Date.now() < stored.expires_at) {
          setState(s => ({ ...s, authenticated: true, accessToken: stored.access_token, loading: false, error: null }))
          return
        }
        const refreshed = await refreshAccessToken(clientId, stored.refresh_token)
        await persistTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? stored.refresh_token })
      } catch (e) {
        if (isInvalidClient(e)) { await clearInvalidClient(); return }
        setState({ authenticated: false, accessToken: null, clientId: clientIdRef.current, loading: false, error: String(e) })
      }
    }
    bootstrap()
  }, [])

  // ── OAuth callback listener (loopback server emits 'oauth-code') ─────────

  useEffect(() => {
    const unlisten = listen<{ code: string; state: string }>('oauth-code', ({ payload }) => {
      if (!verifierRef.current || !stateRef.current || !clientIdRef.current) return
      if (payload.state !== stateRef.current) {
        setState(s => ({ ...s, loading: false, error: 'OAuth state mismatch — rejecting callback' }))
        verifierRef.current = null
        stateRef.current = null
        return
      }
      const verifier = verifierRef.current
      const clientId = clientIdRef.current
      verifierRef.current = null
      stateRef.current = null
      exchangeCode(clientId, payload.code, verifier)
        .then(persistTokens)
        .catch(e => {
          if (isInvalidClient(e)) { clearInvalidClient(); return }
          setState(s => ({ ...s, loading: false, error: String(e) }))
        })
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

  // ── Auto-refresh timer ────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.authenticated) return

    async function doRefresh() {
      const clientId = clientIdRef.current
      if (!clientId) return
      try {
        const stored = await invoke<TokenPayload | null>('load_tokens')
        if (!stored || loggedOutRef.current) return
        const refreshed = await refreshAccessToken(clientId, stored.refresh_token)
        if (loggedOutRef.current) return
        await persistTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? stored.refresh_token })
      } catch (e) {
        if (isInvalidClient(e)) { await clearInvalidClient(); return }
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

  // ── login / logout / saveClientId ─────────────────────────────────────────

  const login = useCallback(async () => {
    const clientId = clientIdRef.current
    if (!clientId) return
    loggedOutRef.current = false
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { verifier, challenge } = await generatePkce()
      const oauthState = generateState()
      verifierRef.current = verifier
      stateRef.current    = oauthState
      await invoke('start_oauth_callback_server')
      await open(buildAuthUrl(clientId, challenge, oauthState))
      setState(s => ({ ...s, loading: false }))
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: String(e) }))
    }
  }, [])

  const logout = useCallback(async () => {
    loggedOutRef.current = true
    await invoke('clear_tokens')
    setState(s => ({ ...s, authenticated: false, accessToken: null, loading: false, error: null }))
  }, [])

  const saveClientId = useCallback(async (id: string) => {
    await invoke('store_client_id', { clientId: id })
    clientIdRef.current = id
    setState(s => ({ ...s, clientId: id }))
  }, [])

  const invalidateClientId = useCallback(async () => { await clearInvalidClient() }, [])

  return { ...state, login, logout, saveClientId, invalidateClientId }
}
