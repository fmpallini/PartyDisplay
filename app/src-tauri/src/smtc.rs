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
    let session = manager.GetCurrentSession()?;

    let props_op = session.TryGetMediaPropertiesAsync()?;
    let props = tokio::task::block_in_place(|| props_op.get())?;
    let timeline = session.GetTimelineProperties()?;

    let title  = props.Title()?.to_string();
    let artist = props.Artist()?.to_string();

    if title.is_empty() {
        if last_track.is_some() {
            *last_track = None;
            let _ = app.emit("smtc-track-changed", Option::<SmtcTrackInfo>::None);
        }
        return Ok(());
    }

    let position_ms = (timeline.Position()?.Duration.max(0) / 10_000) as u64;
    let duration_ms = (timeline.EndTime()?.Duration.max(0) / 10_000) as u64;

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

    let mime = if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else {
        return None;
    };

    Some(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(&bytes)
    ))
}
