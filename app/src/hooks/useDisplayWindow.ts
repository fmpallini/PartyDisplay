import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface MonitorInfo {
  name: string
  x: number
  y: number
  width: number
  height: number
  is_primary: boolean
}

export interface DisplayState {
  monitor_name: string | null
  x: number
  y: number
  width: number
  height: number
  fullscreen: boolean
  is_open: boolean
}

export function useDisplayWindow() {
  const [monitors, setMonitors]           = useState<MonitorInfo[]>([])
  const [isOpen, setIsOpen]               = useState(false)
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>(null)
  const [fullscreen, setFullscreen]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  // Load monitors + saved state on mount; auto-reopen if it was open last session
  useEffect(() => {
    Promise.all([
      invoke<MonitorInfo[]>('get_monitors'),
      invoke<DisplayState>('load_display_state'),
    ]).then(([mons, saved]) => {
      setMonitors(mons)
      if (saved.monitor_name) setSelectedMonitor(saved.monitor_name)
      else if (mons.length > 0) {
        const secondary = mons.find(m => !m.is_primary)
        setSelectedMonitor((secondary ?? mons[0]).name)
      }
      setFullscreen(saved.fullscreen)
      if (saved.is_open) {
        invoke('open_display_window', {
          monitorName: saved.monitor_name ?? undefined,
          fullscreen: saved.fullscreen,
        }).then(() => setIsOpen(true)).catch(e => setError(String(e)))
      }
    }).catch(e => setError(String(e)))
  }, [])

  // Keep isOpen in sync when user closes display via native X button
  useEffect(() => {
    const unlisten = listen('display-window-closed', () => setIsOpen(false))
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Keep fullscreen checkbox in sync when toggled from the display window
  useEffect(() => {
    const unlisten = listen<{ fullscreen: boolean }>('fullscreen-changed', ({ payload }) => {
      setFullscreen(payload.fullscreen)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Apply fullscreen state in real time when the window is already open
  useEffect(() => {
    if (!isOpen) return
    invoke('set_display_fullscreen', { fullscreen }).catch(() => {})
  }, [fullscreen, isOpen])

  const openWindow = useCallback(async (monName?: string, fs?: boolean) => {
    const mon = monName ?? selectedMonitor
    const goFs = fs ?? fullscreen
    try {
      await invoke('open_display_window', { monitorName: mon, fullscreen: goFs })
      setIsOpen(true)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [selectedMonitor, fullscreen])

  const closeWindow = useCallback(async () => {
    try {
      await invoke('close_display_window')
      setIsOpen(false)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  return {
    monitors,
    isOpen,
    selectedMonitor,
    setSelectedMonitor,
    fullscreen,
    setFullscreen,
    openWindow,
    closeWindow,
    error,
  }
}
