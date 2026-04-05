use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

/// True while a loopback capture thread is running.
/// compare_exchange prevents a second thread from being spawned if the player
/// reconnects (player.ready flips false→true more than once in a session).
/// Reset to false if the stream exits so a future reconnect can restart capture.
static CAPTURE_RUNNING: AtomicBool = AtomicBool::new(false);

/// Called from the frontend to start WASAPI loopback capture.
/// Spawns a thread and returns immediately; capture runs for the app lifetime.
/// Safe to call multiple times — only the first call per capture session spawns.
#[tauri::command]
pub fn start_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    if CAPTURE_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(()); // Already running — ignore duplicate invocation.
    }
    std::thread::spawn(move || {
        if let Err(e) = run_loopback(app.clone()) {
            eprintln!("Loopback error: {e}");
            let _ = app.emit("audio-capture-error", e.to_string());
        }
        // Reset so a future reconnect can restart capture if the stream dies.
        CAPTURE_RUNNING.store(false, Ordering::SeqCst);
    });
    Ok(())
}

fn run_loopback(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let host   = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("No default output device")?;

    let config        = device.default_output_config()?;
    let channels      = config.channels() as usize;
    let stream_config = cpal::StreamConfig {
        channels:    config.channels(),
        sample_rate: config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    const FFT_SIZE:  usize = 1024;
    const EMIT_BINS: usize = 64;

    let sample_rate = config.sample_rate().0 as f32;
    let fft        = Arc::new(FftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE));
    let sample_buf = Arc::new(Mutex::new(Vec::<f32>::new()));
    let fft_ref    = fft.clone();
    let buf_ref    = sample_buf.clone();
    let app_clone  = app.clone();

    // Precompute logarithmic bin edges (40 Hz – 16 kHz) so the closure doesn't repeat the math.
    let nyquist  = sample_rate / 2.0;
    let raw_bins = FFT_SIZE / 2;
    const F_MIN: f32 = 40.0;
    const F_MAX: f32 = 16_000.0;
    let log_edges: Vec<(usize, usize)> = (0..EMIT_BINS)
        .map(|i| {
            let f_lo = F_MIN * (F_MAX / F_MIN).powf(i as f32 / EMIT_BINS as f32);
            let f_hi = F_MIN * (F_MAX / F_MIN).powf((i + 1) as f32 / EMIT_BINS as f32);
            let lo = ((f_lo / nyquist) * raw_bins as f32).round() as usize;
            let hi = ((f_hi / nyquist) * raw_bins as f32).round() as usize;
            (lo.min(raw_bins - 1), hi.min(raw_bins).max(lo + 1))
        })
        .collect();

    let stream = device.build_input_stream::<f32, _, _>(
        &stream_config,
        move |data: &[f32], _| {
            let mut buf = buf_ref.lock().unwrap_or_else(|e| e.into_inner());
            for chunk in data.chunks(channels.max(1)) {
                buf.push(chunk.iter().sum::<f32>() / chunk.len() as f32);
            }
            while buf.len() >= FFT_SIZE {
                let block: Vec<f32> = buf.drain(..FFT_SIZE).collect();
                let mut input: Vec<Complex<f32>> = block
                    .iter()
                    .enumerate()
                    .map(|(i, &s)| {
                        let w = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32
                            / (FFT_SIZE as f32 - 1.0)).cos());
                        Complex { re: s * w, im: 0.0 }
                    })
                    .collect();
                fft_ref.process(&mut input);
                let mags: Vec<f32> = input[..FFT_SIZE / 2]
                    .iter()
                    .map(|c| {
                        let m = c.norm() / FFT_SIZE as f32;
                        if m > 1e-10 { 20.0 * m.log10() } else { -100.0 }
                    })
                    .collect();
                let bins: Vec<f32> = log_edges.iter()
                    .map(|&(lo, hi)| {
                        mags[lo..hi].iter().cloned().fold(f32::NEG_INFINITY, f32::max)
                    })
                    .collect();
                let _ = app_clone.emit("fft-data", &bins);
            }
        },
        |err| eprintln!("WASAPI stream error: {err}"),
        None,
    )
    .map_err(|e| format!("Failed to open loopback stream: {e}"))?;

    stream.play()?;
    println!("✅ WASAPI loopback capture started");
    loop { std::thread::sleep(std::time::Duration::from_secs(3600)); }
}
