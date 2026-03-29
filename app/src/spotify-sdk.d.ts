// Minimal type declarations for the Spotify Web Playback SDK (CDN global)

interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: 'ready',                  cb: (data: { device_id: string }) => void): boolean
  addListener(event: 'not_ready',              cb: (data: { device_id: string }) => void): boolean
  addListener(event: 'player_state_changed',   cb: (state: SpotifyPlaybackState | null) => void): boolean
  addListener(event: 'initialization_error',   cb: (e: { message: string }) => void): boolean
  addListener(event: 'authentication_error',   cb: (e: { message: string }) => void): boolean
  addListener(event: 'account_error',          cb: (e: { message: string }) => void): boolean
  addListener(event: 'playback_error',         cb: (e: { message: string }) => void): boolean
}

interface SpotifyPlayerOptions {
  name: string
  getOAuthToken: (cb: (token: string) => void) => void
  volume?: number
}

interface SpotifyPlaybackState {
  paused: boolean
  position: number
  track_window: {
    current_track: {
      id: string
      name: string
      artists: Array<{ name: string }>
      album: { name: string; images: Array<{ url: string }> }
    }
  }
}

interface Window {
  Spotify: { Player: new (opts: SpotifyPlayerOptions) => SpotifyPlayer }
  onSpotifyWebPlaybackSDKReady: () => void
}
