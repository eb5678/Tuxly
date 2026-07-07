use super::AudioDevice;
use anyhow::{anyhow, Result};
use futures_util::Stream;
use std::cell::RefCell;
use std::collections::VecDeque;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::task::{Poll, Waker};
use std::thread;
use tracing::error;
use libpulse_binding as pulse;
use libpulse_simple_binding as psimple;

use psimple::Simple;
use pulse::context::Context;
use pulse::mainloop::standard::Mainloop;
use pulse::sample::{Format, Spec};
use pulse::stream::Direction;

const DEFAULT_SAMPLE_RATE: u32 = 44_100;
const AUDIO_CHUNK_SIZE: usize = 1024;

pub fn get_input_devices() -> Result<Vec<AudioDevice>> {
    let devices = Rc::new(RefCell::new(Vec::new()));
    let done = Rc::new(RefCell::new(false));

    let mut mainloop = Mainloop::new().ok_or_else(|| anyhow!("Failed to create PulseAudio mainloop"))?;
    let mut context = Context::new(&mainloop, "pluely-device-enum")
        .ok_or_else(|| anyhow!("Failed to create PulseAudio context"))?;

    context
        .connect(None, pulse::context::FlagSet::NOFLAGS, None)
        .map_err(|_| anyhow!("Failed to connect to PulseAudio"))?;

    loop {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => return Err(anyhow!("Failed to iterate mainloop")),
        }

        match context.get_state() {
            pulse::context::State::Ready => break,
            pulse::context::State::Failed | pulse::context::State::Terminated => {
                return Err(anyhow!("PulseAudio context failed"));
            }
            _ => {}
        }
    }

    let default_source: Rc<RefCell<Option<String>>> = Rc::new(RefCell::new(None));
    let default_source_clone = default_source.clone();
    let done_clone = done.clone();

    let introspector = context.introspect();

    let op = introspector.get_server_info(move |info| {
        if let Some(name) = &info.default_source_name {
            *default_source_clone.borrow_mut() = Some(name.to_string());
        }
        *done_clone.borrow_mut() = true;
    });

    while !*done.borrow() {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => break,
        }
    }
    drop(op);

    *done.borrow_mut() = false;
    let devices_clone = devices.clone();
    let done_clone = done.clone();
    let default_source_name = default_source.borrow().clone();

    let op = introspector.get_source_info_list(move |result| match result {
        pulse::callbacks::ListResult::Item(info) => {
            if let Some(name) = &info.name {
                if !name.contains(".monitor") {
                    let device_name = info
                        .description
                        .as_ref()
                        .map(|d| d.to_string())
                        .unwrap_or_else(|| name.to_string());
                    let device_id = name.to_string();
                    let is_default = default_source_name
                        .as_ref()
                        .map(|def| def == &device_id)
                        .unwrap_or(false);

                    devices_clone.borrow_mut().push(AudioDevice {
                        id: device_id,
                        name: device_name,
                        is_default,
                    });
                }
            }
        }
        pulse::callbacks::ListResult::End => {
            *done_clone.borrow_mut() = true;
        }
        pulse::callbacks::ListResult::Error => {
            *done_clone.borrow_mut() = true;
        }
    });

    while !*done.borrow() {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => break,
        }
    }
    drop(op);

    context.disconnect();
    mainloop.quit(pulse::def::Retval(0));

    Ok(Rc::try_unwrap(devices).unwrap().into_inner())
}

pub fn get_output_devices() -> Result<Vec<AudioDevice>> {
    let devices = Rc::new(RefCell::new(Vec::new()));
    let done = Rc::new(RefCell::new(false));

    let mut mainloop = Mainloop::new().ok_or_else(|| anyhow!("Failed to create PulseAudio mainloop"))?;
    let mut context = Context::new(&mainloop, "pluely-device-enum")
        .ok_or_else(|| anyhow!("Failed to create PulseAudio context"))?;

    context
        .connect(None, pulse::context::FlagSet::NOFLAGS, None)
        .map_err(|_| anyhow!("Failed to connect to PulseAudio"))?;

    loop {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => return Err(anyhow!("Failed to iterate mainloop")),
        }

        match context.get_state() {
            pulse::context::State::Ready => break,
            pulse::context::State::Failed | pulse::context::State::Terminated => {
                return Err(anyhow!("PulseAudio context failed"));
            }
            _ => {}
        }
    }

    let default_sink: Rc<RefCell<Option<String>>> = Rc::new(RefCell::new(None));
    let default_sink_clone = default_sink.clone();
    let done_clone = done.clone();

    let introspector = context.introspect();

    let op = introspector.get_server_info(move |info| {
        if let Some(name) = &info.default_sink_name {
            *default_sink_clone.borrow_mut() = Some(name.to_string());
        }
        *done_clone.borrow_mut() = true;
    });

    while !*done.borrow() {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => break,
        }
    }
    drop(op);

    *done.borrow_mut() = false;
    let devices_clone = devices.clone();
    let done_clone = done.clone();
    let default_sink_name = default_sink.borrow().clone();

    let op = introspector.get_sink_info_list(move |result| match result {
        pulse::callbacks::ListResult::Item(info) => {
            if let Some(name) = &info.name {
                let device_name = info
                    .description
                    .as_ref()
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| name.to_string());
                let device_id = name.to_string();
                let is_default = default_sink_name
                    .as_ref()
                    .map(|def| def == &device_id)
                    .unwrap_or(false);

                devices_clone.borrow_mut().push(AudioDevice {
                    id: device_id,
                    name: device_name,
                    is_default,
                });
            }
        }
        pulse::callbacks::ListResult::End => {
            *done_clone.borrow_mut() = true;
        }
        pulse::callbacks::ListResult::Error => {
            *done_clone.borrow_mut() = true;
        }
    });

    while !*done.borrow() {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => break,
        }
    }
    drop(op);

    context.disconnect();
    mainloop.quit(pulse::def::Retval(0));

    Ok(Rc::try_unwrap(devices).unwrap().into_inner())
}

fn get_default_sink_name() -> Result<String> {
    let done = Rc::new(RefCell::new(false));
    let default_sink = Rc::new(RefCell::new(None));

    let mut mainloop = Mainloop::new().ok_or_else(|| anyhow!("Failed to create PulseAudio mainloop"))?;
    let mut context = Context::new(&mainloop, "pluely-get-default-sink")
        .ok_or_else(|| anyhow!("Failed to create PulseAudio context"))?;

    context.connect(None, pulse::context::FlagSet::NOFLAGS, None)
        .map_err(|_| anyhow!("Failed to connect to PulseAudio"))?;

    loop {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => return Err(anyhow!("Failed to iterate mainloop")),
        }

        match context.get_state() {
            pulse::context::State::Ready => break,
            pulse::context::State::Failed | pulse::context::State::Terminated => {
                return Err(anyhow!("PulseAudio context failed"));
            }
            _ => {}
        }
    }

    let default_sink_clone = default_sink.clone();
    let done_clone = done.clone();

    let introspector = context.introspect();
    let op = introspector.get_server_info(move |info| {
        if let Some(name) = &info.default_sink_name {
            *default_sink_clone.borrow_mut() = Some(name.to_string());
        }
        *done_clone.borrow_mut() = true;
    });

    while !*done.borrow() {
        match mainloop.iterate(true) {
            pulse::mainloop::standard::IterateResult::Success(_) => {}
            _ => break,
        }
    }
    drop(op);

    context.disconnect();
    mainloop.quit(pulse::def::Retval(0));

    Rc::try_unwrap(default_sink)
        .map_err(|_| anyhow!("Rc unwrap failed"))?
        .into_inner()
        .ok_or_else(|| anyhow!("No default sink found"))
}

fn get_default_monitor_source() -> Option<String> {
    match get_default_sink_name() {
        Ok(sink) => {
            let suffix = if sink.ends_with(".monitor") { "" } else { ".monitor" };
            Some(format!("{}{}", sink, suffix))
        }
        Err(e) => {
            error!("PulseAudio: Failed to resolve default output sink: {}", e);
            None
        }
    }
}

pub struct SpeakerInput {
    source_name: Option<String>,
}

impl SpeakerInput {
    pub fn new(device_id: Option<String>) -> Result<Self> {
        let source_name = match device_id {
            Some(ref id) if id == "@DEFAULT_SOURCE@" => None,
            Some(ref id) if !id.is_empty() && id != "default" => {
                if id.contains(".monitor") || id.starts_with("alsa_input") || id.contains("source") {
                    Some(id.clone())
                } else {
                    Some(format!("{}.monitor", id))
                }
            }
            _ => get_default_monitor_source(),
        };
        Ok(Self { source_name })
    }

    pub fn stream(self) -> SpeakerStream {
        let sample_queue = Arc::new(Mutex::new(VecDeque::with_capacity(262144)));
        let waker_state = Arc::new(Mutex::new(WakerState {
            waker: None,
            has_data: false,
            shutdown: false,
        }));
        let (init_tx, init_rx) = std::sync::mpsc::channel();

        let queue_clone = sample_queue.clone();
        let waker_clone = waker_state.clone();
        let source_name = self.source_name;

        let mut capture_thread = Some(thread::spawn(move || {
            if let Err(e) = SpeakerStream::capture_audio_loop(
                queue_clone,
                waker_clone,
                source_name.as_deref(),
                init_tx,
            ) {
                eprintln!("Audio capture loop failed: {}", e);
            }
        }));

        let (sample_rate, init_success) = match init_rx.recv() {
            Ok(Ok(sr)) => (sr, true),
            Ok(Err(e)) => {
                eprintln!("Audio initialization failed: {}", e);
                (DEFAULT_SAMPLE_RATE, false)
            }
            Err(e) => {
                eprintln!("Failed to receive audio init signal: {}", e);
                (DEFAULT_SAMPLE_RATE, false)
            }
        };

        if !init_success {
            {
                let mut state = waker_state.lock().unwrap();
                state.shutdown = true;
                if let Some(waker) = state.waker.take() {
                    drop(state);
                    waker.wake();
                }
            }

            if let Some(handle) = capture_thread.take() {
                let _ = handle.join();
            }
        }

        SpeakerStream {
            sample_queue,
            waker_state,
            capture_thread,
            sample_rate,
            chunk_buffer: Vec::with_capacity(AUDIO_CHUNK_SIZE),
        }
    }
}

struct WakerState {
    waker: Option<Waker>,
    has_data: bool,
    shutdown: bool,
}

pub struct SpeakerStream {
    sample_queue: Arc<Mutex<VecDeque<f32>>>,
    waker_state: Arc<Mutex<WakerState>>,
    capture_thread: Option<thread::JoinHandle<()>>,
    sample_rate: u32,
    chunk_buffer: Vec<f32>,
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn capture_audio_loop(
        sample_queue: Arc<Mutex<VecDeque<f32>>>,
        waker_state: Arc<Mutex<WakerState>>,
        source_name: Option<&str>,
        init_tx: std::sync::mpsc::Sender<Result<u32>>,
    ) -> Result<()> {
        let spec = Spec {
            format: Format::F32le,
            channels: 1,
            rate: 44100,
        };

        if !spec.is_valid() {
            return Err(anyhow!("Invalid audio specification"));
        }

        let init_result: Result<(Simple, u32)> = (|| {
            let simple = Simple::new(
                None,
                "pluely",
                Direction::Record,
                source_name,
                "System Audio Capture",
                &spec,
                None,
                None,
            )
            .map_err(|e| {
                error!("[capture_audio_loop] Failed connect stream: {}", e);
                anyhow!("PulseAudio connection failure: {}", e)
            })?;

            Ok((simple, spec.rate))
        })();

        match init_result {
            Ok((simple, sample_rate)) => {
                let _ = init_tx.send(Ok(sample_rate));
                let mut buffer = vec![0u8; AUDIO_CHUNK_SIZE * 4];

                loop {
                    if waker_state.lock().unwrap().shutdown {
                        break;
                    }

                    match simple.read(&mut buffer) {
                        Ok(_) => {
                            let mut queue = sample_queue.lock().unwrap();
                            const MAX_BUFFER_SIZE: usize = 262144;
                            for chunk in buffer.chunks_exact(4) {
                                let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                                queue.push_back(sample);
                            }
                            if queue.len() > MAX_BUFFER_SIZE {
                                let to_drop = queue.len() - MAX_BUFFER_SIZE;
                                queue.drain(0..to_drop);
                            }
                            {
                                let mut state = waker_state.lock().unwrap();
                                if !state.has_data {
                                    state.has_data = true;
                                    if let Some(waker) = state.waker.take() {
                                        drop(state);
                                        waker.wake();
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            error!("[capture_audio_loop] PulseAudio read error: {}", e);
                            thread::sleep(std::time::Duration::from_millis(50));
                        }
                    }
                }
            }
            Err(e) => {
                let _ = init_tx.send(Err(e));
            }
        }
        Ok(())
    }
}

impl Drop for SpeakerStream {
    fn drop(&mut self) {
        {
            let mut state = self.waker_state.lock().unwrap();
            state.shutdown = true;
            if let Some(waker) = state.waker.take() {
                waker.wake();
            }
        }
        if let Some(thread) = self.capture_thread.take() {
            let _ = thread.join();
        }
    }
}

impl Stream for SpeakerStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        if !self.chunk_buffer.is_empty() {
            return Poll::Ready(Some(self.chunk_buffer.remove(0)));
        }

        // Bypasses aliasing constraints by cloning the Arc handle out of self
        let queue_lock = Arc::clone(&self.sample_queue);
        let mut queue = queue_lock.lock().unwrap();
        
        if queue.is_empty() {
            let mut state = self.waker_state.lock().unwrap();
            if state.shutdown {
                return Poll::Ready(None);
            }
            state.has_data = false;
            state.waker = Some(cx.waker().clone());
            return Poll::Pending;
        }

        let fetch_size = std::cmp::min(queue.len(), AUDIO_CHUNK_SIZE);
        self.chunk_buffer.extend(queue.drain(0..fetch_size));
        drop(queue);

        Poll::Ready(Some(self.chunk_buffer.remove(0)))
    }
}