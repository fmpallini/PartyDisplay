import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { shuffle } from '../lib/utils'
import { KEYS } from '../lib/storage-keys'

export interface PhotoLibraryState {
  folder:       string | null
  photos:       string[]
  initialPhoto: string | null
}

interface Options {
  order:     'shuffle' | 'alpha'
  recursive: boolean
}

export function usePhotoLibrary({ order, recursive }: Options) {
  const [state, setState] = useState<PhotoLibraryState>({
    folder: null, photos: [], initialPhoto: null,
  })

  // Keep refs so event-handler closures always see latest values without re-subscribing
  const orderRef  = useRef(order)
  // Mirrors state.folder for use in non-reactive closures (event handlers)
  const folderRef = useRef<string | null>(null)
  orderRef.current = order

  function applyOrder(
    rawPaths: string[],
    folderPath: string | null,
  ): { photos: string[]; initialPhoto: string | null } {
    if (orderRef.current === 'alpha') {
      const sorted       = [...rawPaths].sort()
      const saved        = folderPath ? getSavedLastPhoto(folderPath) : null
      const initialPhoto = saved && sorted.includes(saved) ? saved : null
      return { photos: sorted, initialPhoto }
    }
    return { photos: shuffle([...rawPaths]), initialPhoto: null }
  }

  // On mount: fetch whatever the watcher already has (handles late-opening display window)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const lastFolder = localStorage.getItem(KEYS.lastPhotoFolder)
    invoke<string[]>('get_photos').then(paths => {
      if (paths.length > 0) {
        if (lastFolder && !folderRef.current) folderRef.current = lastFolder
        const { photos, initialPhoto } = applyOrder(paths, folderRef.current)
        setState(s => ({
          ...s,
          folder: s.folder ?? lastFolder,
          photos,
          initialPhoto,
        }))
      }
    }).catch(err => console.error('[usePhotoLibrary] get_photos failed:', err))
  }, [])

  // Re-apply order when `order` prop changes (re-sort or re-shuffle current list)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setState(s => {
      if (s.photos.length === 0) return s
      const { photos, initialPhoto } = applyOrder(s.photos, s.folder)
      return { ...s, photos, initialPhoto }
    })
  }, [order])

  // Listen for file-system watcher updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>('photo-list', ({ payload }) => {
      const { photos, initialPhoto } = applyOrder(payload.paths, folderRef.current)
      setState(s => ({
        ...s,
        folder: s.folder ?? folderRef.current,
        photos,
        initialPhoto,
      }))
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const setFolder = useCallback(async (folder: string) => {
    folderRef.current = folder
    setState(s => ({ ...s, folder }))
    localStorage.setItem(KEYS.lastPhotoFolder, folder)
    await invoke('watch_folder', { path: folder, recursive })
    // initial list arrives via photo-list event
  }, [recursive])

  return { ...state, setFolder }
}

function getSavedLastPhoto(folder: string): string | null {
  const raw = localStorage.getItem(KEYS.lastPhotoPosition)
  if (!raw) return null
  try {
    const map: Record<string, string> = JSON.parse(raw)
    return map[folder] ?? null
  } catch {
    return null
  }
}

