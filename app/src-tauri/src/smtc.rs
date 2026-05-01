use base64::{engine::general_purpose, Engine as _};
use party_display_core::smtc::{detect_mime, is_self_session, normalize_browser_track};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[derive(serde::Serialize, Clone)]
struct SmtcTrackInfo {
    id: String,
    name: String,
    artists: String,
    #[serde(rename = "albumArt")]
    album_art: String,
    duration: u64,
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
        Self {
            stop_tx: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn start_smtc_listener(
    app: AppHandle,
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
    let _ = unsafe {
        windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        )
    };
    let mut last_track: Option<(String, String)> = None;
    let mut last_position: Option<(u64, bool)> = None;
    poll_smtc(&app, &mut last_track, &mut last_position).await;
    loop {
        tokio::select! {
            _ = &mut stop_rx => break,
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                poll_smtc(&app, &mut last_track, &mut last_position).await;
            }
        }
    }
}

async fn poll_smtc(
    app: &AppHandle,
    last_track: &mut Option<(String, String)>,
    last_position: &mut Option<(u64, bool)>,
) {
    match try_poll_smtc(app, last_track, last_position).await {
        Ok(()) => {}
        Err(e) => {
            eprintln!("[SMTC] poll error: {e:?}");
            if last_track.is_some() {
                *last_track = None;
                *last_position = None;
                let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
            }
        }
    }
}

async fn try_poll_smtc(
    app: &AppHandle,
    last_track: &mut Option<(String, String)>,
    last_position: &mut Option<(u64, bool)>,
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

    let raw_title = props.Title()?.to_string();
    let raw_artist = props.Artist()?.to_string();

    if is_self_session(&raw_title) {
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
    let is_playing = session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(true);

    let track_key = (title.clone(), artist.clone());
    if last_track.as_ref() != Some(&track_key) {
        *last_track = Some(track_key);
        let album_art = get_thumbnail(&props).await.unwrap_or_default();
        let _ = app.emit(
            "smtc-track-changed",
            Some(SmtcTrackInfo {
                id: format!("{}:{}", title, artist),
                name: title,
                artists: artist,
                album_art,
                duration: duration_ms,
                position_ms,
                is_playing,
            }),
        );
    }

    let pos_key = (position_ms, is_playing);
    if last_position.as_ref() != Some(&pos_key) {
        *last_position = Some(pos_key);
        let _ = app.emit(
            "smtc-position-update",
            SmtcPositionUpdate {
                position_ms,
                is_playing,
                duration_ms,
            },
        );
    }

    Ok(())
}

async fn get_thumbnail(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use windows::Storage::Streams::DataReader;

    let thumb_ref = props.Thumbnail().ok()?;
    let stream_op = thumb_ref.OpenReadAsync().ok()?;
    let stream = tokio::task::block_in_place(|| stream_op.get()).ok()?;
    let size = stream.Size().ok()? as u32;
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
