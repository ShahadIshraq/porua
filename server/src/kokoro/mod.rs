pub mod model_paths;
pub mod voice_config;

use kokoros::tts::koko::{TTSKoko, TTSOpts};
use std::error::Error;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};

#[allow(clippy::upper_case_acronyms)]
pub struct TTS {
    engine: TTSKoko,
}

// Implement Send and Sync for TTS
// This is safe because we're controlling access through Arc and will use Mutex if needed
unsafe impl Send for TTS {}
unsafe impl Sync for TTS {}

impl TTS {
    pub async fn new(model_path: &str, data_path: &str) -> Result<Self, Box<dyn Error>> {
        let engine = TTSKoko::new(model_path, data_path).await;
        Ok(TTS { engine })
    }

    pub fn speak(
        &self,
        text: &str,
        output_path: &str,
        style: &str,
        speed: f32,
    ) -> Result<(), Box<dyn Error>> {
        // Get the appropriate language code based on the voice ID
        let language_code = voice_config::Voice::get_language_code(style);

        self.engine.tts(TTSOpts {
            txt: text,
            lan: language_code,
            style_name: style,
            save_path: output_path,
            mono: false,
            speed,
            initial_silence: None,
        })?;
        Ok(())
    }
}

/// A pool of TTS engines for concurrent request handling
pub struct TTSPool {
    engines: Vec<Arc<Mutex<TTS>>>,
    semaphore: Arc<Semaphore>,
    active_count: Arc<AtomicUsize>,
    total_requests: Arc<AtomicUsize>,
}

impl TTSPool {
    /// Create a new TTS pool with the specified number of engines
    pub async fn new(
        pool_size: usize,
        model_path: &str,
        data_path: &str,
    ) -> Result<Self, Box<dyn Error>> {
        if pool_size == 0 {
            return Err("Pool size must be at least 1".into());
        }

        tracing::info!("Initializing TTS pool with {} engines...", pool_size);

        let mut engines = Vec::with_capacity(pool_size);

        for i in 0..pool_size {
            tracing::debug!("Loading TTS engine {}/{}...", i + 1, pool_size);
            let tts = TTS::new(model_path, data_path).await?;
            engines.push(Arc::new(Mutex::new(tts)));
        }

        tracing::info!("TTS pool initialized successfully");

        Ok(Self {
            engines,
            semaphore: Arc::new(Semaphore::new(pool_size)),
            active_count: Arc::new(AtomicUsize::new(0)),
            total_requests: Arc::new(AtomicUsize::new(0)),
        })
    }

    /// Get a TTS engine from the pool
    /// This will wait if all engines are busy
    pub async fn acquire(&self) -> Result<PooledTTS, String> {
        // Acquire a permit from the semaphore
        let permit = self
            .semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| format!("Failed to acquire semaphore: {}", e))?;

        // Find an available engine (round-robin)
        let total_requests = self.total_requests.fetch_add(1, Ordering::SeqCst);
        let index = total_requests % self.engines.len();
        let engine = self.engines[index].clone();

        self.active_count.fetch_add(1, Ordering::SeqCst);

        Ok(PooledTTS {
            engine,
            _permit: permit,
            active_count: self.active_count.clone(),
        })
    }

    /// Get pool statistics
    pub fn stats(&self) -> PoolStats {
        PoolStats {
            pool_size: self.engines.len(),
            active_requests: self.active_count.load(Ordering::SeqCst),
            total_requests: self.total_requests.load(Ordering::SeqCst),
            available_engines: self.semaphore.available_permits(),
        }
    }
}

/// A TTS engine checked out from the pool
/// Automatically returned to pool when dropped
pub struct PooledTTS {
    engine: Arc<Mutex<TTS>>,
    _permit: tokio::sync::OwnedSemaphorePermit,
    active_count: Arc<AtomicUsize>,
}

impl PooledTTS {
    /// Generate speech using the pooled engine
    pub async fn speak(
        &self,
        text: &str,
        output_path: &str,
        style: &str,
        speed: f32,
    ) -> Result<(), Box<dyn Error>> {
        let engine = self.engine.lock().await;
        engine.speak(text, output_path, style, speed)
    }
}

impl Drop for PooledTTS {
    fn drop(&mut self) {
        self.active_count.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Statistics about the TTS pool
#[derive(Debug, Clone)]
pub struct PoolStats {
    pub pool_size: usize,
    pub active_requests: usize,
    pub total_requests: usize,
    pub available_engines: usize,
}
