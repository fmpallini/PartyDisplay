import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LyricsSplitPanel } from '../../components/LyricsSplitPanel'
import type { LyricLine, LyricsStatus } from '../../hooks/useLyrics'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'

// Mock scrollTo for jsdom
beforeAll(() => {
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = function () {
      // no-op in jsdom
    }
  }
})

const SETTINGS: DisplaySettings = {
  toastDurationMs: 5000,
  songZoom: 1.2,
  volumeZoom: 1.7,
  transitionEffect: 'fade',
  transitionDurationMs: 500,
  imageFit: 'cover',
  visualizerMode: 'split',
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
  lyricsSize: 20,
  lyricsOpacity: 0.8,
  lyricsPosition: 'center',
  lyricsSplit: true,
  lyricsSplitSide: 'left',
}

const LINES: LyricLine[] = [
  { timeMs: 0, text: 'Verse one' },
  { timeMs: 1000, text: 'Verse two' },
  { timeMs: 2000, text: 'Verse three' },
]

function renderPanel(status: LyricsStatus, currentIndex = -1, lines = LINES) {
  return render(
    <LyricsSplitPanel lines={lines} currentIndex={currentIndex} status={status} settings={SETTINGS} />
  )
}

describe('LyricsSplitPanel — loading', () => {
  it('renders loading text', () => {
    renderPanel('loading', -1, [])
    expect(screen.getByText(/Loading lyrics/i)).toBeInTheDocument()
  })
})

describe('LyricsSplitPanel — placeholder states', () => {
  it('renders without crashing when idle', () => {
    expect(() => renderPanel('idle', -1, [])).not.toThrow()
  })

  it('renders without crashing when not_found', () => {
    expect(() => renderPanel('not_found', -1, [])).not.toThrow()
  })

  it('renders without crashing when error', () => {
    expect(() => renderPanel('error', -1, [])).not.toThrow()
  })
})

describe('LyricsSplitPanel — synced', () => {
  it('renders all lines', () => {
    renderPanel('synced', 1)
    expect(screen.getByText('Verse one')).toBeInTheDocument()
    expect(screen.getByText('Verse two')).toBeInTheDocument()
    expect(screen.getByText('Verse three')).toBeInTheDocument()
  })

  it('renders the correct number of lines', () => {
    renderPanel('synced', 0)
    expect(screen.getAllByText(/Verse/)).toHaveLength(3)
  })

  it('renders without crashing when currentIndex is -1 (before first line)', () => {
    expect(() => renderPanel('synced', -1)).not.toThrow()
  })

  it('renders without crashing when currentIndex is the last line', () => {
    expect(() => renderPanel('synced', LINES.length - 1)).not.toThrow()
  })

  it('renders without crashing when currentIndex changes (scroll side-effect)', () => {
    const { rerender } = renderPanel('synced', 0)
    expect(() =>
      rerender(
        <LyricsSplitPanel lines={LINES} currentIndex={1} status="synced" settings={SETTINGS} />
      )
    ).not.toThrow()
  })
})

describe('LyricsSplitPanel — unsynced', () => {
  it('renders all lines when unsynced', () => {
    renderPanel('unsynced', -1)
    expect(screen.getByText('Verse one')).toBeInTheDocument()
    expect(screen.getByText('Verse two')).toBeInTheDocument()
  })
})
