import { useEffect, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import ControlPanel from './windows/control/ControlPanel'
import DisplayWindow from './windows/display/DisplayWindow'

export default function App() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    setLabel(getCurrentWebviewWindow().label)
  }, [])

  if (label === null) return null
  if (label === 'display') return <DisplayWindow />
  return <ControlPanel />
}
