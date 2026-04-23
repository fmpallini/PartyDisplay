use std::sync::Mutex;
use std::time::Duration;
use base64::{Engine as _, engine::general_purpose};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

// Matches TrackInfo shape expected by the frontend (player-types.ts)
#[derive(serde::Serialize, Clone)]
struct SmtcTrackInfo {
    id:        String,
    name:      String,
    artists:   String,
    #[serde(rename = "albumArt")]
    album_art: String,
    duration:  u64,  // ms
    #[serde(rename = "positionMs")]
    position_ms: u64,
}

#[derive(serde::Serialize, Clone)]
struct SmtcPositionUpdate {
    #[serde(rename = "positionMs")]
    position_ms: u64,
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
    // Stop any existing polling thread before starting a new one
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
    let mut last_track: Option<(String, String)> = None; // (title, artist)
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
            // Any error = no usable session → clear display
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

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    let session = manager.GetCurrentSession()?;
    let props    = session.TryGetMediaPropertiesAsync()?.await?;
    let timeline = session.GetTimelineProperties()?;

    let title  = props.Title()?.to_string();
    let artist = props.Artist()?.to_string();

    // Empty title = app registered SMTC but isn't playing anything meaningful
    if title.is_empty() {
        if last_track.is_some() {
            *last_track = None;
            let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
        }
        return Ok(());
    }

    // Convert 100-nanosecond WinRT ticks to milliseconds
    let position_ms = (timeline.Position()?.Duration.max(0) / 10_000) as u64;
    let duration_ms = (timeline.EndTime()?.Duration.max(0) / 10_000) as u64;

    let track_key = (title.clone(), artist.clone());
    if last_track.as_ref() != Some(&track_key) {
        *last_track = Some(track_key);
        let album_art = get_thumbnail(&props).await.unwrap_or_default();
        let _ = app.emit("smtc-track-changed", Some(SmtcTrackInfo {
            id:          String::new(),
            name:        title,
            artists:     artist,
            album_art,
            duration:    duration_ms,
            position_ms,
        }));
    }

    let _ = app.emit("smtc-position-update", SmtcPositionUpdate { position_ms });

    Ok(())
}

async fn get_thumbnail(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use windows::Storage::Streams::DataReader;

    let thumb_ref = props.Thumbnail().ok()?;
    let stream    = thumb_ref.OpenReadAsync().ok()?.await.ok()?;
    let size      = stream.Size().ok()? as u32;
    if size == 0 {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size).ok()?.await.ok()?;

    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;

    // Detect MIME type from magic bytes to build a correct data URL
    let mime = if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else {
        "image/png"
    };

    Some(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(&bytes)
    ))
}
