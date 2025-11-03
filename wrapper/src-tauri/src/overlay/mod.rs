pub mod screen_capture;
pub mod state;

pub use screen_capture::{CaptureManager, ExtractedText, TextRegion};
pub use state::{OverlayState, OverlayManager};
