use super::screen_capture::{CaptureRegion, ExtractedText};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OverlayState {
    Idle,
    Selecting {
        drag_start_x: i32,
        drag_start_y: i32,
    },
    Capturing {
        region: CaptureRegion,
    },
    Processing,
    Ready {
        text: ExtractedText,
        region: CaptureRegion,
    },
    Playing {
        text: ExtractedText,
        region: CaptureRegion,
        current_phrase: usize,
        playback_time_ms: f32,
    },
    Paused {
        text: ExtractedText,
        region: CaptureRegion,
        pause_point_ms: f32,
    },
    Error {
        message: String,
    },
}

impl Default for OverlayState {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Clone)]
pub struct OverlayManager {
    state: Arc<RwLock<OverlayState>>,
}

impl OverlayManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(OverlayState::Idle)),
        }
    }

    pub async fn get_state(&self) -> OverlayState {
        self.state.read().await.clone()
    }

    pub async fn set_state(&self, new_state: OverlayState) {
        *self.state.write().await = new_state;
    }

    pub async fn start_selection(&self, x: i32, y: i32) {
        *self.state.write().await = OverlayState::Selecting {
            drag_start_x: x,
            drag_start_y: y,
        };
    }

    pub async fn set_capture_region(&self, region: CaptureRegion) {
        *self.state.write().await = OverlayState::Capturing { region };
    }

    pub async fn set_processing(&self) {
        *self.state.write().await = OverlayState::Processing;
    }

    pub async fn set_ready(&self, text: ExtractedText, region: CaptureRegion) {
        *self.state.write().await = OverlayState::Ready { text, region };
    }

    pub async fn set_playing(&self, text: ExtractedText, region: CaptureRegion, current_phrase: usize, playback_time_ms: f32) {
        *self.state.write().await = OverlayState::Playing {
            text,
            region,
            current_phrase,
            playback_time_ms,
        };
    }

    pub async fn set_paused(&self, text: ExtractedText, region: CaptureRegion, pause_point_ms: f32) {
        *self.state.write().await = OverlayState::Paused {
            text,
            region,
            pause_point_ms,
        };
    }

    pub async fn set_error(&self, message: String) {
        *self.state.write().await = OverlayState::Error { message };
    }

    pub async fn reset(&self) {
        *self.state.write().await = OverlayState::Idle;
    }
}

impl Default for OverlayManager {
    fn default() -> Self {
        Self::new()
    }
}
