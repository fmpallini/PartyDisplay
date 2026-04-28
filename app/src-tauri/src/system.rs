pub use party_display_core::system::{IpLocation, BatteryStatus, parse_ip_location};

// ── Windows platform ──────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod platform {
    use super::BatteryStatus;

    extern "system" {
        fn SetThreadExecutionState(esFlags: u32) -> u32;
        fn GetSystemPowerStatus(lpSystemPowerStatus: *mut SystemPowerStatus) -> i32;
    }

    const ES_CONTINUOUS:       u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED:  u32 = 0x0000_0001;
    const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status:         u8,
        battery_flag:           u8,
        battery_life_percent:   u8,
        system_status_flag:     u8,
        battery_life_time:      u32,
        battery_full_life_time: u32,
    }

    pub fn set_prevent_sleep(active: bool) {
        unsafe {
            if active {
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
            } else {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }

    pub fn get_battery() -> BatteryStatus {
        let mut s = SystemPowerStatus {
            ac_line_status: 255, battery_flag: 128, battery_life_percent: 255,
            system_status_flag: 0, battery_life_time: 0, battery_full_life_time: 0,
        };
        let ok = unsafe { GetSystemPowerStatus(&mut s) };
        if ok == 0 {
            return BatteryStatus { level: 100, charging: false, available: false };
        }
        let no_battery = (s.battery_flag & 128) != 0 || s.battery_life_percent == 255;
        let charging   = (s.battery_flag &   8) != 0 || s.ac_line_status == 1;
        BatteryStatus {
            level:     if no_battery { 100 } else { s.battery_life_percent.min(100) },
            charging,
            available: !no_battery,
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::BatteryStatus;
    pub fn set_prevent_sleep(_active: bool) {}
    pub fn get_battery() -> BatteryStatus {
        BatteryStatus { level: 100, charging: false, available: false }
    }
}

pub fn prevent_sleep(active: bool) {
    platform::set_prevent_sleep(active);
}

#[tauri::command]
pub fn get_battery_status() -> BatteryStatus {
    platform::get_battery()
}

#[tauri::command]
pub async fn get_ip_location() -> Result<IpLocation, String> {
    let resp = reqwest::get("http://ip-api.com/json/")
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    parse_ip_location(&json)
}

#[tauri::command]
pub fn trigger_cast_flyout() -> Result<(), String> {
    use enigo::{Enigo, Key, Keyboard, Settings, Direction};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
    enigo.key(Key::Unicode('k'), Direction::Click).map_err(|e| e.to_string())?;
    enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
    Ok(())
}
