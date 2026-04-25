import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerControls } from '../../components/PlayerControls'
import type { TrackInfo } from '../../lib/player-types'

const TRACK: TrackInfo = {
  id: '1', name: 'Song', artists: 'Artist', albumArt: '', duration: 60_000,
}

function makeProps(overrides = {}) {
  return {
    track: TRACK, paused: true, positionMs: 0, shuffle: false,
    togglePlay:    vi.fn(),
    nextTrack:     vi.fn(),
    prevTrack:     vi.fn(),
    seek:          vi.fn(),
    toggleShuffle: vi.fn(),
    ...overrides,
  }
}

describe('PlayerControls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders play button when paused', () => {
    render(<PlayerControls {...makeProps()} />)
    expect(screen.getByTitle('Play')).toBeInTheDocument()
  })

  it('renders pause button when playing', () => {
    render(<PlayerControls {...makeProps({ paused: false })} />)
    expect(screen.getByTitle('Pause')).toBeInTheDocument()
  })

  it('calls togglePlay when play/pause button is clicked', async () => {
    const togglePlay = vi.fn()
    render(<PlayerControls {...makeProps({ togglePlay })} />)
    await userEvent.click(screen.getByTitle('Play'))
    expect(togglePlay).toHaveBeenCalledTimes(1)
  })

  it('calls nextTrack when next button is clicked', async () => {
    const nextTrack = vi.fn()
    render(<PlayerControls {...makeProps({ nextTrack })} />)
    await userEvent.click(screen.getByTitle('Next'))
    expect(nextTrack).toHaveBeenCalledTimes(1)
  })

  it('calls prevTrack when previous button is clicked', async () => {
    const prevTrack = vi.fn()
    render(<PlayerControls {...makeProps({ prevTrack })} />)
    await userEvent.click(screen.getByTitle('Previous'))
    expect(prevTrack).toHaveBeenCalledTimes(1)
  })

  it('calls toggleShuffle when shuffle button is clicked', async () => {
    const toggleShuffle = vi.fn()
    render(<PlayerControls {...makeProps({ toggleShuffle })} />)
    await userEvent.click(screen.getByTitle('Shuffle off'))
    expect(toggleShuffle).toHaveBeenCalledTimes(1)
  })

  it('hides shuffle button when hideShuffle=true', () => {
    render(<PlayerControls {...makeProps({ hideShuffle: true })} />)
    expect(screen.queryByTitle(/shuffle/i)).not.toBeInTheDocument()
  })

  it('renders seek bar when track is provided', () => {
    render(<PlayerControls {...makeProps()} />)
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('does not render seek bar when track is null', () => {
    render(<PlayerControls {...makeProps({ track: null })} />)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
