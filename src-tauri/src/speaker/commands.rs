use crate::speaker::{AudioDevice, SpeakerInput};
use anyhow::Result;
use futures_util::StreamExt;
use hound::{WavSpec, WavWriter};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager};
use tracing::{error, warn};

#[tauri::command]
pub async fn start_system_audio_capture(
    app: AppHandle,
    max_duration_secs: Option<u64>,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = app.state::<crate::AudioState>();

    {
        let guard = state
            .stream_task
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;

        if guard.is_some() {
            warn!("Capture already running");
            return Err("Capture already running".to_string());
        }
    }

    let input = SpeakerInput::new_with_device(device_id).map_err(|e| {
        error!("Failed to create speaker input: {}", e);
        format!("Failed to access system audio: {}", e)
    })?;

    let stream = input.stream();
    let sr = stream.sample_rate();

    if !(8000..=96000).contains(&sr) {
        error!("Invalid sample rate: {}", sr);
        return Err(format!("Invalid sample rate: {}. Expected 8000-96000 Hz", sr));
    }

    let app_clone = app.clone();
    let limit_secs = max_duration_secs.unwrap_or(180);

    *state
        .is_capturing
        .lock()
        .map_err(|e| format!("Failed to set capturing state: {}", e))? = true;

    let _ = app_clone.emit("capture-started", sr);

    let state_clone = app.state::<crate::AudioState>();
    let task = tokio::spawn(async move {
        run_manual_capture(app_clone.clone(), stream, sr, limit_secs).await;

        let state = app_clone.state::<crate::AudioState>();
        {
            if let Ok(mut guard) = state.stream_task.lock() {
                *guard = None;
            };
        }
    });

    *state_clone
        .stream_task
        .lock()
        .map_err(|e| format!("Failed to store task: {}", e))? = Some(task);

    Ok(())
}

async fn run_manual_capture(
    app: AppHandle,
    stream: impl StreamExt<Item = f32> + Unpin,
    sr: u32,
    max_duration_secs: u64,
) {
    let mut stream = stream;
    let max_samples = (sr as u64 * max_duration_secs) as usize;
    let mut audio_buffer = Vec::with_capacity(max_samples);

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_for_listener = stop_flag.clone();

    let stop_listener = app.listen("manual-stop-continuous", move |_| {
        stop_flag_for_listener.store(true, Ordering::Release);
    });

    let _ = app.emit("continuous-recording-start", max_duration_secs);

    let emit_interval = sr as usize;
    let mut sample_count: usize = 0;

    loop {
        if stop_flag.load(Ordering::Acquire) {
            break;
        }

        tokio::select! {
            sample_opt = stream.next() => {
                match sample_opt {
                    Some(sample) => {
                        if stop_flag.load(Ordering::Acquire) {
                            break;
                        }

                        audio_buffer.push(sample);
                        sample_count += 1;

                        if sample_count % emit_interval == 0 {
                            let elapsed = sample_count / emit_interval;
                            let _ = app.emit("recording-progress", elapsed as u64);
                            
                            if elapsed as u64 >= max_duration_secs {
                                break;
                            }
                        }
                    },
                    None => {
                        warn!("Audio stream ended unexpectedly");
                        break;
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(10)) => {}
        }
    }

    app.unlisten(stop_listener);

    if !audio_buffer.is_empty() {
        // Send pristine, untouched audio to backend algorithms guaranteeing maximum STT accuracy 
        match samples_to_wav_bytes(sr, &audio_buffer) {
            Ok(bytes) => {
                let _ = app.emit("speech-detected", bytes);
            }
            Err(e) => {
                error!("Failed to encode captured audio: {}", e);
                let _ = app.emit("audio-encoding-error", e);
            }
        }
    } else {
        warn!("No audio captured during manual capture");
        let _ = app.emit("audio-encoding-error", "No audio recorded");
    }

    let _ = app.emit("continuous-recording-stopped", ());
}

fn samples_to_wav_bytes(sample_rate: u32, mono_f32: &[f32]) -> Result<Vec<u8>, String> {
    if !(8000..=96000).contains(&sample_rate) {
        return Err(format!("Invalid sample rate: {}. Expected 8000-96000 Hz", sample_rate));
    }

    let mut cursor = Cursor::new(Vec::new());
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::new(&mut cursor, spec).map_err(|e| e.to_string())?;
    for &s in mono_f32 {
        let clamped = s.clamp(-1.0, 1.0);
        let sample_i16 = (clamped * i16::MAX as f32) as i16;
        writer.write_sample(sample_i16).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(cursor.into_inner())
}

#[tauri::command]
pub async fn stop_system_audio_capture(app: AppHandle) -> Result<(), String> {
    let state = app.state::<crate::AudioState>();
    {
        let mut guard = state
            .stream_task
            .lock()
            .map_err(|e| format!("Failed to acquire task lock: {}", e))?;
        if let Some(task) = guard.take() {
            task.abort();
        }
    }
    *state
        .is_capturing
        .lock()
        .map_err(|e| format!("Failed to update capturing state: {}", e))? = false;
    let _ = app.emit("capture-stopped", ());
    Ok(())
}
#[tauri::command]
pub async fn manual_stop_continuous(app: AppHandle) -> Result<(), String> {
    let _ = app.emit("manual-stop-continuous", ());
    Ok(())
}

#[tauri::command]
pub fn get_input_devices() -> Result<Vec<AudioDevice>, String> {
    crate::speaker::list_input_devices().map_err(|e| {
        error!("Failed to get input devices: {}", e);
        format!("Failed to get input devices: {}", e)
    })
}

#[tauri::command]
pub fn get_output_devices() -> Result<Vec<AudioDevice>, String> {
    crate::speaker::list_output_devices().map_err(|e| {
        error!("Failed to get output devices: {}", e);
        format!("Failed to get output devices: {}", e)
    })
}