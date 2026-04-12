import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

// Mirror Rust structs from dlna.rs (serde serialises Option<T> as T | null)
export interface DlnaServer {
  name:     string
  location: string
}

export interface DlnaContainer {
  id:    string
  title: string
}

export interface DlnaItem {
  id:          string
  title:       string
  artist:      string | null
  album_art:   string | null
  url:         string
  mime:        string
  duration_ms: number | null
}

interface DlnaBrowseResult {
  containers: DlnaContainer[]
  items:      DlnaItem[]
}

interface PersistedState {
  location:   string
  name:       string
  breadcrumb: DlnaContainer[]
}

/**
 * Generic DLNA browser hook. Mount one instance per use-case (music / photos).
 * storageKey — localStorage key for session persistence, e.g. "pd_dlna_music"
 */
export function useDlnaBrowser(storageKey: string) {
  const [servers,     setServers]     = useState<DlnaServer[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [server,      setServer]      = useState<DlnaServer | null>(null)
  const [breadcrumb,  setBreadcrumb]  = useState<DlnaContainer[]>([])
  const [containers,  setContainers]  = useState<DlnaContainer[]>([])
  const [items,       setItems]       = useState<DlnaItem[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // ── Internal: call Browse and update containers/items ──────────────────────
  const browseContainer = useCallback(async (loc: string, containerId: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<DlnaBrowseResult>('dlna_browse', {
        location:    loc,
        containerId: containerId,
      })
      setContainers(result.containers)
      setItems(result.items)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Restore persisted state on mount ───────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    try {
      const saved: PersistedState = JSON.parse(raw)
      const lastCrumb   = saved.breadcrumb[saved.breadcrumb.length - 1]
      const containerId = lastCrumb?.id ?? '0'
      setServer({ name: saved.name, location: saved.location })
      setBreadcrumb(saved.breadcrumb)
      // Silently fall back to server picker if the server is unreachable
      invoke<DlnaBrowseResult>('dlna_browse', {
        location:    saved.location,
        containerId: containerId,
      }).then(result => {
        setContainers(result.containers)
        setItems(result.items)
      }).catch(() => {
        setServer(null)
        setBreadcrumb([])
        localStorage.removeItem(storageKey)
      })
    } catch {
      localStorage.removeItem(storageKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Public API ─────────────────────────────────────────────────────────────

  const discover = useCallback(async () => {
    setDiscovering(true)
    try {
      const found = await invoke<DlnaServer[]>('dlna_discover')
      setServers(found)
    } finally {
      setDiscovering(false)
    }
  }, [])

  const selectServer = useCallback(async (s: DlnaServer) => {
    setServer(s)
    setBreadcrumb([])
    setContainers([])
    setItems([])
    localStorage.setItem(storageKey, JSON.stringify({
      location: s.location, name: s.name, breadcrumb: [],
    }))
    await browseContainer(s.location, '0')
  }, [storageKey, browseContainer])

  const browse = useCallback(async (container: DlnaContainer) => {
    if (!server) return
    const newCrumb = [...breadcrumb, container]
    setBreadcrumb(newCrumb)
    localStorage.setItem(storageKey, JSON.stringify({
      location: server.location, name: server.name, breadcrumb: newCrumb,
    }))
    await browseContainer(server.location, container.id)
  }, [storageKey, server, breadcrumb, browseContainer])

  const back = useCallback(async () => {
    if (!server) return
    const newCrumb = breadcrumb.slice(0, -1)
    setBreadcrumb(newCrumb)
    const parentId = newCrumb[newCrumb.length - 1]?.id ?? '0'
    localStorage.setItem(storageKey, JSON.stringify({
      location: server.location, name: server.name, breadcrumb: newCrumb,
    }))
    await browseContainer(server.location, parentId)
  }, [storageKey, server, breadcrumb, browseContainer])

  const reset = useCallback(() => {
    setServer(null)
    setBreadcrumb([])
    setContainers([])
    setItems([])
    setError(null)
    localStorage.removeItem(storageKey)
  }, [storageKey])

  return {
    servers, discovering, discover,
    server, breadcrumb, containers, items,
    loading, error,
    selectServer, browse, back, reset,
  }
}
