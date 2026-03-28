import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface PhotoLibraryState {
  folder: string | null
  photos: string[]
}

export function usePhotoLibrary() {
  const [state, setState] = useState<PhotoLibraryState>({ folder: null, photos: [] })

  // On mount: fetch whatever the watcher already has (handles late-opening display window)
  useEffect(() => {
    invoke<string[]>('get_photos').then(paths => {
      if (paths.length > 0) setState(s => ({ ...s, photos: shuffle([...paths]) }))
    }).catch(() => {})
  }, [])

  // Listen for file-system watcher updates
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>('photo-list', ({ payload }) => {
      setState(s => ({ ...s, photos: shuffle([...payload.paths]) }))
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const setFolder = useCallback(async (folder: string) => {
    setState(s => ({ ...s, folder }))
    await invoke('watch_folder', { path: folder })
    // initial list comes back via photo-list event emitted by watch_folder
  }, [])

  return { ...state, setFolder }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
