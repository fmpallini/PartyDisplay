import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface BatteryStatus {
  level:     number  // 0–100
  charging:  boolean
  available: boolean // false on desktops with no battery
}

const INITIAL: BatteryStatus = { level: 100, charging: false, available: false }

export function useBattery(pollIntervalMs = 30_000): BatteryStatus {
  const [status, setStatus] = useState<BatteryStatus>(INITIAL)

  useEffect(() => {
    function poll() {
      invoke<BatteryStatus>('get_battery_status').then(setStatus).catch(console.error)
    }
    poll()
    const id = setInterval(poll, pollIntervalMs)
    return () => clearInterval(id)
  }, [pollIntervalMs])

  return status
}
