#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{FftPlanner, num_complex::Complex};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_audio_capture])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Called from the frontend to start WASAPI loopback capture.
/// Spawns a thread — returns immediately, capture runs indefinitely.
#[tauri::command]
fn start_audio_capture(app: tauri::AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        if let Err(e) = run_loopback(app) {
            eprintln!("Loopback error: {e}");
        }
    });
    Ok(())
}

fn run_loopback(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let host = cpal::default_host();
    // On Windows, default_host() is WASAPI.
    // Calling build_input_stream on a RENDER device = loopback capture.
    let device = host
        .default_output_device()
        .ok_or("No default output device found")?;

    println!("Loopback device: {}", device.name().unwrap_or_default());

    let config   = device.default_output_config()?;
    let channels = config.channels() as usize;
    // Explicitly request F32 — avoids silent failure on devices that default to I16/I32.
    let stream_config = cpal::StreamConfig {
        channels:    config.channels(),
        sample_rate: config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    println!(
        "Stream config: {}Hz, {} channels (format forced to F32)",
        stream_config.sample_rate.0, channels
    );

    const FFT_SIZE: usize = 1024;
    const EMIT_BINS: usize = 64;

    let fft = Arc::new(FftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE));
    let sample_buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));

    let fft_ref   = fft.clone();
    let buf_ref   = sample_buf.clone();
    let app_clone = app.clone();

    let stream = device
        .build_input_stream::<f32, _, _>(
            &stream_config,
            move |data: &[f32], _| {
                let mut buf = buf_ref.lock().unwrap();

                // Mix interleaved channels down to mono
                for chunk in data.chunks(channels.max(1)) {
                    buf.push(chunk.iter().sum::<f32>() / chunk.len() as f32);
                }

                // Process every full FFT_SIZE window
                while buf.len() >= FFT_SIZE {
                    let block: Vec<f32> = buf.drain(..FFT_SIZE).collect();

                    // Apply Hann window and convert to complex
                    let mut input: Vec<Complex<f32>> = block
                        .iter()
                        .enumerate()
                        .map(|(i, &s)| {
                            let w = 0.5
                                * (1.0
                                    - (2.0 * std::f32::consts::PI * i as f32
                                        / (FFT_SIZE as f32 - 1.0))
                                        .cos());
                            Complex { re: s * w, im: 0.0 }
                        })
                        .collect();

                    fft_ref.process(&mut input);

                    // Magnitude in dB for the positive-frequency half
                    let mags: Vec<f32> = input[..FFT_SIZE / 2]
                        .iter()
                        .map(|c| {
                            let m = c.norm() / FFT_SIZE as f32;
                            if m > 1e-10 {
                                20.0 * m.log10()
                            } else {
                                -100.0
                            }
                        })
                        .collect();

                    // Downsample to EMIT_BINS by taking the max in each band
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

    // Park this thread — stream is kept alive by staying in scope
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}
