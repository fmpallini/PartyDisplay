import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DisplaySettingsPanel,
  readDisplaySettings,
} from '../../components/DisplaySettingsPanel'
import type { DisplaySettings } from '../../components/DisplaySettingsPanel'
import { KEYS } from '../../lib/storage-keys'

// ── readDisplaySettings ───────────────────────────────────────────────────────

describe('readDisplaySettings', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults when localStorage is empty', () => {
    const s = readDisplaySettings()
    expect(s.toastDurationMs).toBe(5000)
    expect(s.imageFit).toBe('contain')
    expect(s.transitionEffect).toBe('random')
    expect(s.batteryVisible).toBe(false)
    expect(s.trackOverlayVisible).toBe(true)
    expect(s.lyricsVisible).toBe(false)
    expect(s.clockWeatherVisible).toBe(true)
  })

  it('reads saved toastDurationMs from localStorage', () => {
    localStorage.setItem(KEYS.toastDurationMs, '8000')
    expect(readDisplaySettings().toastDurationMs).toBe(8000)
  })

  it('reads saved imageFit from localStorage', () => {
    localStorage.setItem(KEYS.imageFit, 'cover')
    expect(readDisplaySettings().imageFit).toBe('cover')
  })

  it('falls back to default for invalid imageFit value', () => {
    localStorage.setItem(KEYS.imageFit, 'stretch')
    expect(readDisplaySettings().imageFit).toBe('contain')
  })

  it('reads saved batteryVisible boolean from localStorage', () => {
    localStorage.setItem(KEYS.batteryVisible, 'true')
    expect(readDisplaySettings().batteryVisible).toBe(true)
  })

  it('reads saved clockWeatherCity from localStorage', () => {
    localStorage.setItem(KEYS.cwCity, 'Lisbon')
    expect(readDisplaySettings().clockWeatherCity).toBe('Lisbon')
  })

  it('falls back to default for invalid transitionEffect value', () => {
    localStorage.setItem(KEYS.transitionEffect, 'wipe')
    expect(readDisplaySettings().transitionEffect).toBe('random')
  })
})

// ── DisplaySettingsPanel component ───────────────────────────────────────────

function makeSettings(overrides: Partial<DisplaySettings> = {}): DisplaySettings {
  return { ...readDisplaySettings(), ...overrides }
}

describe('DisplaySettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('calls onChange with toggled batteryVisible when checkbox clicked', async () => {
    const onChange = vi.fn()
    const settings = makeSettings({ batteryVisible: false })
    render(<DisplaySettingsPanel settings={settings} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // Battery "Show on display" is first checkbox
    await userEvent.click(checkboxes[0])
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ batteryVisible: true }))
  })

  it('calls onChange with updated imageFit when select changes', async () => {
    const onChange = vi.fn()
    const settings = makeSettings({ imageFit: 'contain' })
    render(<DisplaySettingsPanel settings={settings} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByDisplayValue('Fit (letterbox)'), 'cover')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageFit: 'cover' }))
  })

  it('calls onChange with updated transitionEffect when select changes', async () => {
    const onChange = vi.fn()
    const settings = makeSettings({ transitionEffect: 'random' })
    render(<DisplaySettingsPanel settings={settings} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByDisplayValue('Random'), 'fade')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ transitionEffect: 'fade' }))
  })

  it('calls onChange with toggled photoCounterVisible when checkbox clicked', async () => {
    const onChange = vi.fn()
    const settings = makeSettings({ photoCounterVisible: true })
    render(<DisplaySettingsPanel settings={settings} onChange={onChange} />)
    // Photo counter has only one checkbox in its section — index 2 (battery, track, photo-counter)
    const allCheckboxes = screen.getAllByRole('checkbox')
    await userEvent.click(allCheckboxes[2])
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ photoCounterVisible: false }))
  })

  it('shows lyricsSplitSide select only when lyricsSplit is true', () => {
    const { rerender } = render(
      <DisplaySettingsPanel settings={makeSettings({ lyricsSplit: false })} onChange={vi.fn()} />,
    )
    expect(screen.queryByText('Lyrics side')).not.toBeInTheDocument()

    rerender(
      <DisplaySettingsPanel settings={makeSettings({ lyricsSplit: true })} onChange={vi.fn()} />,
    )
    expect(screen.getByText('Lyrics side')).toBeInTheDocument()
  })

  it('calls onChange with updated clockWeatherCity when text input changes', async () => {
    const onChange = vi.fn()
    const settings = makeSettings({ clockWeatherCity: '' })
    render(<DisplaySettingsPanel settings={settings} onChange={onChange} />)
    const cityInput = screen.getByPlaceholderText(/auto-detect/i)
    await userEvent.type(cityInput, 'P')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ clockWeatherCity: 'P' }))
  })
})
