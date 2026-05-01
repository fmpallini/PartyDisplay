import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlideshowConfigPanel } from '../../components/SlideshowConfigPanel'
import type { SlideshowConfig } from '../../components/SlideshowConfigPanel'

const DEFAULT_CONFIG: SlideshowConfig = {
  fixedSec: 5,
  order: 'alpha',
  subfolders: true,
}

function makeProps(overrides: Partial<Parameters<typeof SlideshowConfigPanel>[0]> = {}) {
  return {
    config: DEFAULT_CONFIG,
    onChange: vi.fn(),
    hasPhotos: true,
    ...overrides,
  }
}

describe('SlideshowConfigPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders current fixedSec value in the interval input', () => {
    render(<SlideshowConfigPanel {...makeProps({ config: { ...DEFAULT_CONFIG, fixedSec: 10 } })} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(10)
  })

  it('calls onChange with updated fixedSec when interval changes', () => {
    const onChange = vi.fn()
    render(<SlideshowConfigPanel {...makeProps({ onChange })} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '15' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CONFIG, fixedSec: 15 })
  })

  it('clamps fixedSec to minimum 1', () => {
    const onChange = vi.fn()
    render(<SlideshowConfigPanel {...makeProps({ onChange })} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CONFIG, fixedSec: 1 })
  })

  it('shuffle radio calls onChange with order=shuffle', async () => {
    const onChange = vi.fn()
    render(<SlideshowConfigPanel {...makeProps({ onChange })} />)
    await userEvent.click(screen.getByRole('radio', { name: /shuffle/i }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CONFIG, order: 'shuffle' })
  })

  it('alphabetic radio calls onChange with order=alpha', async () => {
    const onChange = vi.fn()
    const config = { ...DEFAULT_CONFIG, order: 'shuffle' as const }
    render(<SlideshowConfigPanel {...makeProps({ config, onChange })} />)
    await userEvent.click(screen.getByRole('radio', { name: /alphabetic/i }))
    expect(onChange).toHaveBeenCalledWith({ ...config, order: 'alpha' })
  })

  it('shows subfolders checkbox by default', () => {
    render(<SlideshowConfigPanel {...makeProps()} />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('hides subfolders checkbox when showSubfolders=false', () => {
    render(<SlideshowConfigPanel {...makeProps({ showSubfolders: false })} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('subfolders checkbox calls onChange with updated subfolders', async () => {
    const onChange = vi.fn()
    render(<SlideshowConfigPanel {...makeProps({ onChange })} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CONFIG, subfolders: false })
  })

  it('shows folder hint when hasPhotos=false', () => {
    render(<SlideshowConfigPanel {...makeProps({ hasPhotos: false })} />)
    expect(screen.getByText(/select a folder/i)).toBeInTheDocument()
  })

  it('hides folder hint when hasPhotos=true', () => {
    render(<SlideshowConfigPanel {...makeProps({ hasPhotos: true })} />)
    expect(screen.queryByText(/select a folder/i)).not.toBeInTheDocument()
  })
})
