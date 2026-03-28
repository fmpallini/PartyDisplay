use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

/// Called from the frontend to start WASAPI loopback capture.
/// Spawns a thread and returns immediately; capture runs for the app lifetime.
#[tauri::command]
pub fn start_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        if let Err(e) = run_loopback(app) {
            eprintln!("Loopback error: {e}");
        }
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

    let fft        = Arc::new(FftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE));
    let sample_buf = Arc::new(Mutex::new(Vec::<f32>::new()));
    let fft_ref    = fft.clone();
    let buf_ref    = sample_buf.clone();
    let app_clone  = app.clone();

    let stream = device.build_input_stream::<f32, _, _>(
        &stream_config,
        move |data: &[f32], _| {
            let mut buf = buf_ref.lock().unwrap();
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
                let step = (FFT_SIZE / 2) / EMIT_BINS;
                let bins: Vec<f32> = (0..EMIT_BINS)
                    .map(|i| {
                        mags[i * step..(i + 1) * step]
                            .iter()
                            .cloned()
                            .fold(f32::NEG_INFINITY, f32::max)
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
