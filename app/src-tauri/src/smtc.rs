use std::sync::Mutex;
use std::time::Duration;
use base64::{Engine as _, engine::general_purpose};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[derive(serde::Serialize, Clone)]
struct SmtcTrackInfo {
    id:        String,
    name:      String,
    artists:   String,
    #[serde(rename = "albumArt")]
    album_art: String,
    duration:  u64,
    #[serde(rename = "positionMs")]
    position_ms: u64,
    #[serde(rename = "isPlaying")]
    is_playing: bool,
}

#[derive(serde::Serialize, Clone)]
struct SmtcPositionUpdate {
    #[serde(rename = "positionMs")]
    position_ms: u64,
    #[serde(rename = "isPlaying")]
    is_playing: bool,
    #[serde(rename = "durationMs")]
    duration_ms: u64,
}

pub struct SmtcState {
    stop_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl Default for SmtcState {
    fn default() -> Self {
        Self { stop_tx: Mutex::new(None) }
    }
}

#[tauri::command]
pub async fn start_smtc_listener(
    app:   AppHandle,
    state: tauri::State<'_, SmtcState>,
) -> Result<(), String> {
    let mut guard = state.stop_tx.lock().unwrap();
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    *guard = Some(stop_tx);
    drop(guard);

    tauri::async_runtime::spawn(async move {
        smtc_poll_loop(app, stop_rx).await;
    });

    Ok(())
}

#[tauri::command]
pub fn stop_smtc_listener(state: tauri::State<'_, SmtcState>) -> Result<(), String> {
    let mut guard = state.stop_tx.lock().unwrap();
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

async fn smtc_poll_loop(app: AppHandle, mut stop_rx: oneshot::Receiver<()>) {
    // Initialize Windows Runtime on this thread (required for WinRT APIs)
    let _ = unsafe { windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED) };
    let mut last_track: Option<(String, String)> = None;
    // Poll immediately so track info appears without a 1s delay
    poll_smtc(&app, &mut last_track).await;
    loop {
        tokio::select! {
            _ = &mut stop_rx => break,
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                poll_smtc(&app, &mut last_track).await;
            }
        }
    }
}

async fn poll_smtc(app: &AppHandle, last_track: &mut Option<(String, String)>) {
    match try_poll_smtc(app, last_track).await {
        Ok(()) => {}
        Err(e) => {
            eprintln!("[SMTC] poll error: {e:?}");
            if last_track.is_some() {
                *last_track = None;
                let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
            }
        }
    }
}

async fn try_poll_smtc(
    app:        &AppHandle,
    last_track: &mut Option<(String, String)>,
) -> windows::core::Result<()> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    let manager_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?;
    let manager = tokio::task::block_in_place(|| manager_op.get())?;

    // GetCurrentSession returns Err with S_OK (0x0) when no media session is active —
    // null COM interface pointer, not a real failure. Treat any error here as "no session".
    let session = match manager.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => {
            if last_track.is_some() {
                *last_track = None;
                let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
            }
            return Ok(());
        }
    };

    let props_op = session.TryGetMediaPropertiesAsync()?;
    let props = tokio::task::block_in_place(|| props_op.get())?;
    let timeline = session.GetTimelineProperties()?;

    let raw_title  = props.Title()?.to_string();
    let raw_artist = props.Artist()?.to_string();

    if raw_title.is_empty() {
        if last_track.is_some() {
            *last_track = None;
            let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
        }
        return Ok(());
    }

    let (title, artist) = normalize_browser_track(&raw_title, &raw_artist);

    let position_ms = (timeline.Position()?.Duration.max(0) / 10_000) as u64;
    let duration_ms = (timeline.EndTime()?.Duration.max(0) / 10_000) as u64;

    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
    let is_playing = session.GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(true);

    let track_key = (title.clone(), artist.clone());
    if last_track.as_ref() != Some(&track_key) {
        *last_track = Some(track_key);
        let album_art = get_thumbnail(&props).await.unwrap_or_default();
        let _ = app.emit("smtc-track-changed", Some(SmtcTrackInfo {
            id:          format!("{}:{}", title, artist),
            name:        title,
            artists:     artist,
            album_art,
            duration:    duration_ms,
            position_ms,
            is_playing,
        }));
    }

    let _ = app.emit("smtc-position-update", SmtcPositionUpdate { position_ms, is_playing, duration_ms });

    Ok(())
}

/// Returns true when the SMTC artist field is a YouTube channel name rather than a
/// real artist name (e.g. "ArtistVEVO", "Artist - Topic", "ArtistOfficial").
fn is_channel_artist(artist: &str) -> bool {
    let a = artist.to_lowercase();
    a.ends_with("vevo") || a.ends_with(" - topic") || a.ends_with("official")
}

/// Strips well-known YouTube noise suffixes from a song title so that LRCLIB
/// lookups match. Only strips parenthesised/bracketed tokens — bare words are
/// left alone to avoid false positives.
///
/// Examples:
///   "You Shook Me All Night Long (Official Video)"  → "You Shook Me All Night Long"
///   "bad guy (Audio)"                               → "bad guy"
///   "Bohemian Rhapsody (Remastered 2011)"           → "Bohemian Rhapsody"
fn strip_title_noise(title: &str) -> String {
    // Lowercase keywords that, when the sole content of (...) or [...], should be removed.
    const NOISE: &[&str] = &[
        "official video", "official music video", "official audio",
        "official lyric video", "official visualizer", "official",
        "lyric video", "lyrics", "lyric", "audio",
        "music video", "video", "visualizer",
        "hd", "hq", "4k", "720p", "1080p",
        "explicit", "explicit version", "clean", "radio edit",
        "album version", "single version",
    ];

    let mut s = title.trim().to_string();
    loop {
        let before = s.clone();

        // Strip trailing (...) or [...] whose lowercased content matches a noise token
        // OR is a remaster/remastered pattern: "Remaster", "Remastered", "2011 Remaster", etc.
        for (open, close) in [('(', ')'), ('[', ']')] {
            if s.ends_with(close) {
                if let Some(pos) = s.rfind(open) {
                    let inner = s[pos + 1..s.len() - 1].trim().to_lowercase();
                    let is_noise = NOISE.contains(&inner.as_str())
                        || inner.contains("remaster")
                        || inner.contains("re-master");
                    if is_noise {
                        s = s[..pos].trim_end().to_string();
                        break;
                    }
                }
            }
        }

        if s == before {
            break;
        }
    }
    s
}

/// Normalises track info from browser SMTC sessions.
///
/// Handles:
/// - YouTube Music: artist = "Artist - Topic", title = "Artist - Song"
/// - VEVO channels:  artist = "ArtistVEVO",    title = "Artist - Song"
/// - Title noise:    "(Official Video)", "(Lyrics)", "(Remastered 2011)", etc.
fn normalize_browser_track(title: &str, artist: &str) -> (String, String) {
    // Clean known channel suffixes from the SMTC artist field
    let clean_artist = artist
        .strip_suffix(" - Topic")
        .or_else(|| artist.strip_suffix("VEVO"))
        .or_else(|| artist.strip_suffix("Official"))
        .unwrap_or(artist)
        .trim()
        .to_string();

    let channel = is_channel_artist(artist);

    // Split "Artist - Song Title" from the title field:
    // - always split when artist is a channel name (VEVO / Topic / Official)
    // - also split when the left side matches the cleaned artist name exactly
    let (raw_name, final_artist) = if let Some(dash) = title.find(" - ") {
        let left  = title[..dash].trim();
        let right = title[dash + 3..].trim();
        if !left.is_empty() && !right.is_empty() && (channel || left.eq_ignore_ascii_case(&clean_artist)) {
            (right.to_string(), left.to_string())
        } else {
            (title.to_string(), clean_artist)
        }
    } else {
        (title.to_string(), clean_artist)
    };

    (strip_title_noise(&raw_name), final_artist)
}

fn detect_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG") {
        Some("image/png")
    } else {
        None
    }
}

async fn get_thumbnail(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use windows::Storage::Streams::DataReader;

    let thumb_ref = props.Thumbnail().ok()?;
    let stream_op = thumb_ref.OpenReadAsync().ok()?;
    let stream = tokio::task::block_in_place(|| stream_op.get()).ok()?;
    let size      = stream.Size().ok()? as u32;
    if size == 0 {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    let load_op = reader.LoadAsync(size).ok()?;
    tokio::task::block_in_place(|| load_op.get()).ok()?;

    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    reader.DetachStream().ok();

    let mime = detect_mime(&bytes)?;

    Some(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(&bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── normalize_browser_track ────────────────────────────────────────────

    #[test]
    fn normalize_youtube_music_topic_suffix_stripped() {
        let (title, artist) = normalize_browser_track("Some Song", "Artist - Topic");
        assert_eq!(title, "Some Song");
        assert_eq!(artist, "Artist");
    }

    #[test]
    fn normalize_splits_title_when_topic_channel() {
        let (title, artist) = normalize_browser_track("Real Artist - Song Name", "Real Artist - Topic");
        assert_eq!(title, "Song Name");
        assert_eq!(artist, "Real Artist");
    }

    #[test]
    fn normalize_vevo_suffix_stripped() {
        let (title, artist) = normalize_browser_track("Artist - Song", "ArtistVEVO");
        assert_eq!(title, "Song");
        assert_eq!(artist, "Artist");
    }

    #[test]
    fn normalize_clean_title_and_artist_unchanged() {
        let (title, artist) = normalize_browser_track("Clean Title", "Regular Artist");
        assert_eq!(title, "Clean Title");
        assert_eq!(artist, "Regular Artist");
    }

    #[test]
    fn normalize_empty_artist_returns_title_as_is() {
        let (title, artist) = normalize_browser_track("Just A Title", "");
        assert_eq!(title, "Just A Title");
        assert_eq!(artist, "");
    }

    #[test]
    fn normalize_no_dash_in_title_returns_full_title() {
        let (title, artist) = normalize_browser_track("NoDashTitle", "Artist - Topic");
        assert_eq!(title, "NoDashTitle");
        assert_eq!(artist, "Artist");
    }

    // ── strip_title_noise ─────────────────────────────────────────────────

    #[test]
    fn strip_noise_official_video() {
        assert_eq!(strip_title_noise("My Song (Official Video)"), "My Song");
    }

    #[test]
    fn strip_noise_lyrics_parenthetical() {
        assert_eq!(strip_title_noise("My Song (Lyrics)"), "My Song");
    }

    #[test]
    fn strip_noise_remastered_with_year() {
        assert_eq!(strip_title_noise("Classic Track (Remastered 2011)"), "Classic Track");
    }

    #[test]
    fn strip_noise_official_audio() {
        assert_eq!(strip_title_noise("Song Title (Official Audio)"), "Song Title");
    }

    #[test]
    fn strip_noise_clean_title_unchanged() {
        assert_eq!(strip_title_noise("Normal Title"), "Normal Title");
    }

    #[test]
    fn strip_noise_bracket_noise_removed() {
        assert_eq!(strip_title_noise("Song [Official Video]"), "Song");
    }

    // ── detect_mime ───────────────────────────────────────────────────────

    #[test]
    fn detect_mime_jpeg_magic_bytes() {
        let jpeg = b"\xff\xd8\xff\xe0some jpeg data";
        assert_eq!(detect_mime(jpeg), Some("image/jpeg"));
    }

    #[test]
    fn detect_mime_png_magic_bytes() {
        let png = b"\x89PNG\r\nsome png data";
        assert_eq!(detect_mime(png), Some("image/png"));
    }

    #[test]
    fn detect_mime_unknown_bytes_returns_none() {
        let unknown = b"\x00\x01\x02\x03";
        assert_eq!(detect_mime(unknown), None);
    }

    #[test]
    fn detect_mime_empty_slice_returns_none() {
        assert_eq!(detect_mime(&[]), None);
    }
}
