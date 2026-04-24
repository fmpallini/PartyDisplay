import { describe, it, expect, vi, afterEach } from 'vitest'
import { expiresAt, buildAuthUrl, generatePkce, generateState, validateClientId } from '../../lib/spotify-auth'

describe('expiresAt', () => {
  it('returns approximately Date.now() + (expires_in - 60) seconds in ms', () => {
    const before = Date.now()
    const result = expiresAt(3600)
    const after = Date.now()
    // expiresAt subtracts 60s buffer: Date.now() + (3600 - 60) * 1000
    expect(result).toBeGreaterThanOrEqual(before + (3600 - 60) * 1000)
    expect(result).toBeLessThanOrEqual(after + (3600 - 60) * 1000)
  })
  it('clamps to 0 for expires_in <= 60 (never returns negative offset)', () => {
    const before = Date.now()
    const result = expiresAt(30)
    const after = Date.now()
    // Math.max(0, 30 - 60) = 0, so result ≈ Date.now()
    expect(result).toBeGreaterThanOrEqual(before)
    expect(result).toBeLessThanOrEqual(after)
  })
  it('returns a number', () => {
    expect(typeof expiresAt(3600)).toBe('number')
  })
})

describe('buildAuthUrl', () => {
  it('builds a valid Spotify authorize URL', () => {
    const url = buildAuthUrl('myClientId', 'myChallenge', 'myState')
    expect(url).toContain('https://accounts.spotify.com/authorize')
    expect(url).toContain('client_id=myClientId')
    expect(url).toContain('code_challenge=myChallenge')
    expect(url).toContain('state=myState')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain('response_type=code')
  })
  it('includes redirect_uri and scope', () => {
    const url = buildAuthUrl('myClientId', 'myChallenge', 'myState')
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('scope=')
  })
  it('URL-encodes special characters in parameters', () => {
    const url = buildAuthUrl('id with space', 'ch+al=lenge', 'st@te')
    expect(url).not.toContain(' ')
  })
})

describe('generatePkce', () => {
  it('returns non-empty verifier and challenge strings', async () => {
    const { verifier, challenge } = await generatePkce()
    expect(verifier.length).toBeGreaterThan(0)
    expect(challenge.length).toBeGreaterThan(0)
    expect(verifier).not.toBe(challenge)
  })
  it('generates unique verifier on each call', async () => {
    const a = await generatePkce()
    const b = await generatePkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })
  it('verifier and challenge are base64url strings (no +, /, or = padding)', async () => {
    const { verifier, challenge } = await generatePkce()
    expect(verifier).not.toMatch(/[+/=]/)
    expect(challenge).not.toMatch(/[+/=]/)
  })
})

describe('generateState', () => {
  it('returns a non-empty string', () => {
    expect(generateState().length).toBeGreaterThan(0)
  })
  it('generates unique values on each call', () => {
    expect(generateState()).not.toBe(generateState())
  })
  it('returns a base64url string (no +, /, or = padding)', () => {
    expect(generateState()).not.toMatch(/[+/=]/)
  })
})

describe('validateClientId — format validation (no fetch)', () => {
  it('rejects IDs shorter than 32 hex chars', async () => {
    expect(await validateClientId('short')).toBe(false)
  })
  it('rejects empty string', async () => {
    expect(await validateClientId('')).toBe(false)
  })
  it('rejects IDs longer than 32 hex chars', async () => {
    expect(await validateClientId('a'.repeat(33))).toBe(false)
  })
  it('rejects IDs with non-hex characters', async () => {
    expect(await validateClientId('z'.repeat(32))).toBe(false)
  })
  it('rejects IDs with uppercase non-hex characters', async () => {
    expect(await validateClientId('G'.repeat(32))).toBe(false)
  })
})

describe('validateClientId — Spotify response (fetch mocked)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns false when Spotify responds with invalid_client', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'invalid_client' }),
    }))
    expect(await validateClientId('a'.repeat(32))).toBe(false)
  })
  it('returns true when Spotify responds with a non-invalid_client error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    }))
    expect(await validateClientId('a'.repeat(32))).toBe(true)
  })
  it('returns true when Spotify responds with no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
    }))
    expect(await validateClientId('a'.repeat(32))).toBe(true)
  })
  it('accepts uppercase hex in clientId (case-insensitive regex)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    }))
    expect(await validateClientId('A'.repeat(32))).toBe(true)
  })
})
