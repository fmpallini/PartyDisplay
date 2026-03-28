const SPOTIFY_API = 'https://api.spotify.com/v1'

export interface Beat {
  start: number   // seconds from track start
  duration: number
  confidence: number
}

export interface AudioAnalysis {
  beats: Beat[]
  tempo: number
}

export async function fetchAudioAnalysis(trackId: string, accessToken: string): Promise<AudioAnalysis> {
  const res = await fetch(`${SPOTIFY_API}/audio-analysis/${trackId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Audio analysis failed: ${res.status}`)
  const data = await res.json()
  return {
    beats: (data.beats ?? []) as Beat[],
    tempo: data.track?.tempo ?? 120,
  }
}
