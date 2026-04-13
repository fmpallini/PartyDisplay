export interface TrackInfo {
  id:       string   // Spotify: track ID; Local Files: file path
  name:     string
  artists:  string
  albumArt: string   // URL or data URL; empty string if absent
  duration: number   // ms
}

export interface PlayerState {
  ready:      boolean
  deviceId:   string | null
  track:      TrackInfo | null
  paused:     boolean
  positionMs: number
  volume:     number   // 0–1
  shuffle:    boolean
  repeat:     boolean
  error:      string | null
}

export interface PlayerControls {
  togglePlay:    () => void
  nextTrack:     () => void
  prevTrack:     () => void
  seek:          (ms: number) => void
  setVolume:     (v: number) => void
  toggleShuffle: () => void
  toggleRepeat:  () => void
}
