import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useAuth } from '../../hooks/useAuth'

const VALID_TOKENS = {
  access_token:  'acc-token',
  refresh_token: 'ref-token',
  expires_at:    Date.now() + 3_600_000,
}
const EXPIRED_TOKENS = {
  access_token:  'old-acc',
  refresh_token: 'old-ref',
  expires_at:    Date.now() - 1000,
}

describe('useAuth — bootstrap on mount', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('sets authenticated when stored token is still valid', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')  // load_client_id
      .mockResolvedValueOnce(VALID_TOKENS)      // load_tokens
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(true)
    expect(result.current.accessToken).toBe('acc-token')
  })

  it('remains unauthenticated when no clientId is stored', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(null)  // load_client_id
      .mockResolvedValueOnce(null)  // load_tokens
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(false)
    expect(result.current.clientId).toBeNull()
  })

  it('remains unauthenticated when no tokens are stored', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')  // load_client_id
      .mockResolvedValueOnce(null)              // load_tokens
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(false)
    expect(result.current.accessToken).toBeNull()
  })

  it('refreshes token when stored token is expired', async () => {
    const REFRESHED = {
      access_token:  'new-acc',
      refresh_token: 'new-ref',
      expires_in:    3600,
    }
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')  // load_client_id
      .mockResolvedValueOnce(EXPIRED_TOKENS)   // load_tokens
      .mockResolvedValueOnce(undefined)         // store_tokens (called by persistTokens)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve(REFRESHED),
    }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(true)
    expect(result.current.accessToken).toBe('new-acc')
  })

  it('exposes login and logout functions', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')
      .mockResolvedValueOnce(VALID_TOKENS)
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(typeof result.current.login).toBe('function')
    expect(typeof result.current.logout).toBe('function')
    expect(typeof result.current.saveClientId).toBe('function')
  })

  it('clears auth state on logout', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce('client-id-abc')
      .mockResolvedValueOnce(VALID_TOKENS)
      .mockResolvedValueOnce(undefined) // clear_tokens
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.authenticated).toBe(true))
    await act(async () => { await result.current.logout() })
    expect(result.current.authenticated).toBe(false)
    expect(result.current.accessToken).toBeNull()
  })
})
