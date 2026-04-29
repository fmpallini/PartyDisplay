import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LyricsOverlay } from '../../components/LyricsOverlay'
import type { LyricLine, LyricsStatus } from '../../hooks/useLyrics'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'

const SETTINGS: DisplaySettings = {
  toastDurationMs: 5000,
  songZoom: 1.2,
  volumeZoom: 1.7,
  transitionEffect: 'fade',
  transitionDurationMs: 500,
  imageFit: 'cover',
  visualizerMode: 'photos',
  visualizerSplitSide: 'left',
  visualizerPresetIndex: 0,
  visualizerPresetOrder: 'alpha',
  visualizerPresetChange: 'manual',
  visualizerPresetTimerMin: 5,
  batteryVisible: false,
  batterySize: 1,
  batteryPosition: 'top-left',
  trackOverlayVisible: false,
  trackFontSize: 16,
  trackPosition: 'top-left',
  trackColor: '#fff',
  trackBgColor: '#000',
  trackBgOpacity: 0.5,
  photoCounterVisible: false,
  clockWeatherVisible: false,
  clockWeatherPosition: 'top-right',
  clockWeatherTimeFormat: '12h',
  clockWeatherTempUnit: 'celsius',
  clockWeatherCity: '',
  lyricsVisible: true,
  lyricsSize: 24,
  lyricsOpacity: 0.9,
  lyricsPosition: 'center',
  lyricsSplit: false,
  lyricsSplitSide: 'left',
}

const LINES: LyricLine[] = [
  { timeMs: 0, text: 'First line' },
  { timeMs: 1000, text: 'Second line' },
  { timeMs: 2000, text: 'Third line' },
]

function renderOverlay(status: LyricsStatus, currentIndex = -1, lines = LINES) {
  return render(
    <LyricsOverlay lines={lines} currentIndex={currentIndex} status={status} settings={SETTINGS} />
  )
}

describe('LyricsOverlay — synced', () => {
  it('renders all lyric lines', () => {
    renderOverlay('synced', 1)
    expect(screen.getByText('First line')).toBeInTheDocument()
    expect(screen.getByText('Second line')).toBeInTheDocument()
    expect(screen.getByText('Third line')).toBeInTheDocument()
  })

  it('renders without crashing when lines is empty', () => {
    expect(() => renderOverlay('synced', -1, [])).not.toThrow()
  })
})

describe('LyricsOverlay — unsynced', () => {
  it('renders all lines in a static block', () => {
    renderOverlay('unsynced', -1)
    expect(screen.getByText(/First line/)).toBeInTheDocument()
    expect(screen.getByText(/Second line/)).toBeInTheDocument()
    expect(screen.getByText(/Third line/)).toBeInTheDocument()
  })
})

describe('LyricsOverlay — loading / idle / not_found / error', () => {
  it('renders without crashing when loading', () => {
    expect(() => renderOverlay('loading', -1, [])).not.toThrow()
  })

  it('renders without crashing when idle', () => {
    expect(() => renderOverlay('idle', -1, [])).not.toThrow()
  })

  it('renders without crashing when not_found', () => {
    expect(() => renderOverlay('not_found', -1, [])).not.toThrow()
  })

  it('renders without crashing when error', () => {
    expect(() => renderOverlay('error', -1, [])).not.toThrow()
  })
})

describe('LyricsOverlay — lyricsPosition', () => {
  it('renders without crashing with lyricsPosition=lower-third', () => {
    const s: DisplaySettings = { ...SETTINGS, lyricsPosition: 'lower-third' }
    expect(() =>
      render(<LyricsOverlay lines={LINES} currentIndex={0} status="synced" settings={s} />)
    ).not.toThrow()
  })
})
