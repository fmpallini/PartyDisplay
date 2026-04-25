import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NowPlaying from '../../components/NowPlaying'
import type { TrackInfo } from '../../lib/player-types'

const TRACK: TrackInfo = {
  id: '1', name: 'Test Song', artists: 'Test Artist', albumArt: '', duration: 180_000,
}

describe('NowPlaying', () => {
  it('renders track name and artist', () => {
    render(<NowPlaying track={TRACK} paused={false} />)
    expect(screen.getByText('Test Song')).toBeInTheDocument()
    expect(screen.getByText('Test Artist')).toBeInTheDocument()
  })

  it('renders "No track" fallback when track is null', () => {
    render(<NowPlaying track={null} paused={false} />)
    expect(screen.getByText('No track')).toBeInTheDocument()
  })

  it('renders album art image when albumArt is non-empty', () => {
    const track = { ...TRACK, albumArt: 'https://example.com/art.jpg' }
    render(<NowPlaying track={track} paused={false} />)
    const img = screen.getByRole('img', { name: 'album art' })
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg')
  })

  it('does not render an img element when albumArt is empty string', () => {
    render(<NowPlaying track={TRACK} paused={false} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
