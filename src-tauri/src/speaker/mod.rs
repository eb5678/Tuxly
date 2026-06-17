use anyhow::Result;
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

mod linux;
use linux::{SpeakerInput as PlatformSpeakerInput, SpeakerStream as PlatformSpeakerStream};

mod commands;
pub use commands::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub(crate) fn list_input_devices() -> Result<Vec<AudioDevice>> {
    linux::get_input_devices()
}

pub(crate) fn list_output_devices() -> Result<Vec<AudioDevice>> {
    linux::get_output_devices()
}

pub struct SpeakerInput {
    inner: PlatformSpeakerInput,
}

impl SpeakerInput {

    pub fn new_with_device(device_id: Option<String>) -> Result<Self> {
        let inner = PlatformSpeakerInput::new(device_id)?;
        Ok(Self { inner })
    }

    pub fn stream(self) -> SpeakerStream {
        let inner = self.inner.stream();
        SpeakerStream { inner }
    }
}

pub struct SpeakerStream {
    inner: PlatformSpeakerStream,
}

impl Stream for SpeakerStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        Pin::new(&mut self.inner).poll_next(cx)
    }
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }
}