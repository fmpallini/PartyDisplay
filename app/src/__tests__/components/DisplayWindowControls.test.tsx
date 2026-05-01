import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DisplayWindowControls } from '../../components/DisplayWindowControls'
import type { MonitorInfo } from '../../hooks/useDisplayWindow'

vi.mock('../../hooks/useDisplayWindow')
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open:    vi.fn().mockResolvedValue(null),
  save:    vi.fn().mockResolvedValue(null),
  message: vi.fn().mockResolvedValue(undefined),
}))

import { useDisplayWindow } from '../../hooks/useDisplayWindow'

const PRIMARY: MonitorInfo   = { name: 'Monitor 1', x: 0, y: 0, width: 1920, height: 1080, is_primary: true }
const SECONDARY: MonitorInfo = { name: 'Monitor 2', x: 1920, y: 0, width: 1920, height: 1080, is_primary: false }

function mockHook(overrides: Partial<ReturnType<typeof useDisplayWindow>> = {}) {
  vi.mocked(useDisplayWindow).mockReturnValue({
    monitors: [PRIMARY],
    isOpen: false,
    selectedMonitor: 'Monitor 1',
    fullscreen: false,
    error: null,
    selectMonitor: vi.fn(),
    setFullscreen: vi.fn(),
    openWindow: vi.fn().mockResolvedValue(undefined),
    closeWindow: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })
}

describe('DisplayWindowControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHook()
  })

  it('renders Open Display button when display is closed', () => {
    render(<DisplayWindowControls />)
    expect(screen.getByText('Open Display')).toBeInTheDocument()
    expect(screen.queryByText('Close Display')).not.toBeInTheDocument()
  })

  it('renders Close Display button when display is open', () => {
    mockHook({ isOpen: true })
    render(<DisplayWindowControls />)
    expect(screen.getByText('Close Display')).toBeInTheDocument()
    expect(screen.queryByText('Open Display')).not.toBeInTheDocument()
  })

  it('calls openWindow when Open Display is clicked', async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined)
    mockHook({ openWindow })
    render(<DisplayWindowControls />)
    await userEvent.click(screen.getByText('Open Display'))
    expect(openWindow).toHaveBeenCalledTimes(1)
  })

  it('calls closeWindow when Close Display is clicked', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined)
    mockHook({ isOpen: true, closeWindow })
    render(<DisplayWindowControls />)
    await userEvent.click(screen.getByText('Close Display'))
    expect(closeWindow).toHaveBeenCalledTimes(1)
  })

  it('hides monitor select when only one monitor', () => {
    mockHook({ monitors: [PRIMARY] })
    render(<DisplayWindowControls />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows monitor select when multiple monitors available', () => {
    mockHook({ monitors: [PRIMARY, SECONDARY], selectedMonitor: 'Monitor 2' })
    render(<DisplayWindowControls />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText(/Monitor 1/)).toBeInTheDocument()
    expect(screen.getByText(/Monitor 2/)).toBeInTheDocument()
  })

  it('calls selectMonitor when monitor select changes', async () => {
    const selectMonitor = vi.fn()
    mockHook({ monitors: [PRIMARY, SECONDARY], selectedMonitor: 'Monitor 1', selectMonitor })
    render(<DisplayWindowControls />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Monitor 2')
    expect(selectMonitor).toHaveBeenCalledWith('Monitor 2')
  })

  it('shows error message when error is present', () => {
    mockHook({ error: 'Failed to open window' })
    render(<DisplayWindowControls />)
    expect(screen.getByText('Failed to open window')).toBeInTheDocument()
  })

  it('shows detecting monitors hint when monitors list is empty', () => {
    mockHook({ monitors: [] })
    render(<DisplayWindowControls />)
    expect(screen.getByText(/detecting monitors/i)).toBeInTheDocument()
  })

  it('renders fullscreen checkbox reflecting current state', () => {
    mockHook({ fullscreen: true })
    render(<DisplayWindowControls />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
  })

  it('calls setFullscreen when fullscreen checkbox toggled', async () => {
    const setFullscreen = vi.fn()
    mockHook({ fullscreen: false, setFullscreen })
    render(<DisplayWindowControls />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(setFullscreen).toHaveBeenCalledWith(true)
  })
})
