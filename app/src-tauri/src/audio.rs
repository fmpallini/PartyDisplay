use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

/// True while a loopback capture thread is running.
static CAPTURE_RUNNING: AtomicBool = AtomicBool::new(false);

/// Called from the frontend to start WASAPI loopback capture.
/// Spawns a thread and returns immediately. Safe to call multiple times.
/// Automatically restarts capture when the default audio output device changes
/// (e.g. when the user casts to a TV via Miracast).
#[tauri::command]
pub fn start_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    if CAPTURE_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(()); // Already running.
    }
    std::thread::spawn(move || {
        loop {
            match run_loopback(app.clone()) {
                Ok(true) => continue, // device changed — restart on new default
                Ok(false) => break,
                Err(e) => {
                    eprintln!("Loopback error: {e}");
                    let _ = app.emit("audio-capture-error", e.to_string());
                    break;
                }
            }
        }
        CAPTURE_RUNNING.store(false, Ordering::SeqCst);
    });
    Ok(())
}

/// Captures loopback audio from the current default output device.
/// Returns Ok(true) if the default device changed and capture should restart,
/// Ok(false) on clean exit, or Err on a fatal error.
fn run_loopback(app: tauri::AppHandle) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let host   = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("No default output device")?;
    let device_name = device.name().unwrap_or_default();

    let config        = device.default_output_config()?;
    let channels      = config.channels() as usize;
    let stream_config = cpal::StreamConfig {
        channels:    config.channels(),
        sample_rate: config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    const CHUNK_SIZE: usize = 512;

    let sample_buf = Arc::new(Mutex::new(Vec::<f32>::new()));
    let buf_ref    = sample_buf.clone();
    let app_clone  = app.clone();

    let stream = device.build_input_stream::<f32, _, _>(
        &stream_config,
        move |data: &[f32], _| {
            let mut buf = buf_ref.lock().unwrap_or_else(|e| e.into_inner());
            for chunk in data.chunks(channels.max(1)) {
                buf.push(chunk.iter().sum::<f32>() / chunk.len() as f32);
            }
            while buf.len() >= CHUNK_SIZE {
                let chunk: Vec<f32> = buf.drain(..CHUNK_SIZE).collect();
                let _ = app_clone.emit("pcm-data", &chunk);
            }
        },
        |err| eprintln!("WASAPI stream error: {err}"),
        None,
    )
    .map_err(|e| format!("Failed to open loopback stream: {e}"))?;

    stream.play()?;
    println!("✅ WASAPI loopback capture started on: {device_name}");

    loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let current = cpal::default_host()
            .default_output_device()
            .and_then(|d| d.name().ok())
            .unwrap_or_default();
        if current != device_name {
            println!("🔄 Audio device changed: {device_name} → {current}. Restarting capture.");
            return Ok(true);
        }
    }
}
