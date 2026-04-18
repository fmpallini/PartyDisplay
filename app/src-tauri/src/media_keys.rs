use enigo::{Direction, Enigo, Key, Keyboard, Settings};

#[tauri::command]
pub fn send_media_key(key: &str) -> Result<(), String> {
    // Windows virtual-key codes for media / volume keys (KEYEVENTF_EXTENDEDKEY).
    // Enigo's Key::Other(vk) maps directly to the Win32 VK on Windows.
    let vk: u32 = match key {
        "next"       => 0xB0, // VK_MEDIA_NEXT_TRACK
        "prev"       => 0xB1, // VK_MEDIA_PREV_TRACK
        "play_pause" => 0xB3, // VK_MEDIA_PLAY_PAUSE
        "vol_mute"   => 0xAD, // VK_VOLUME_MUTE
        "vol_down"   => 0xAE, // VK_VOLUME_DOWN
        "vol_up"     => 0xAF, // VK_VOLUME_UP
        _            => return Err(format!("Unknown media key: {key}")),
    };
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.key(Key::Other(vk), Direction::Click).map_err(|e| e.to_string())
}
