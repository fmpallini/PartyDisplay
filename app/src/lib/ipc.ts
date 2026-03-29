// Single source of truth for all IPC command names and payload types.
// Rust command names must match these strings exactly (snake_case in Rust maps to camelCase here).

export interface TokenPayload {
  access_token: string
  refresh_token: string
  expires_at: number // unix timestamp ms
}

export interface AuthState {
  authenticated: boolean
  token: TokenPayload | null
}
