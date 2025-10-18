use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use dashmap::DashMap;
use governor::{
    clock::{Clock, DefaultClock},
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use serde::Serialize;
use std::num::NonZeroU32;
use std::sync::Arc;

use crate::utils::header_utils::extract_api_key;

#[derive(Debug, Serialize)]
struct ErrorResponse {
    status: String,
    error: String,
}

/// Configuration for rate limiting
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Requests per second allowed
    pub per_second: u32,
    /// Burst size (max requests in a single burst)
    pub burst_size: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            per_second: 10,
            burst_size: 20,
        }
    }
}

/// Rate limiter that tracks limits per API key
#[derive(Clone)]
pub struct PerKeyRateLimiter {
    /// Rate limiters indexed by API key
    limiters: Arc<DashMap<String, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>,
    /// Configuration for new rate limiters
    config: RateLimitConfig,
    /// Clock for rate limiting
    clock: DefaultClock,
}

impl PerKeyRateLimiter {
    /// Create a new per-key rate limiter with the given configuration
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            limiters: Arc::new(DashMap::new()),
            config,
            clock: DefaultClock::default(),
        }
    }

    /// Get or create a rate limiter for the given API key
    fn get_or_create_limiter(
        &self,
        api_key: &str,
    ) -> Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>> {
        self.limiters
            .entry(api_key.to_string())
            .or_insert_with(|| {
                // Create quota: burst_size requests per (burst_size / per_second) seconds
                // This allows burst_size requests immediately, then refills at per_second rate
                let quota = Quota::per_second(NonZeroU32::new(self.config.per_second).unwrap())
                    .allow_burst(NonZeroU32::new(self.config.burst_size).unwrap());

                Arc::new(RateLimiter::direct(quota))
            })
            .clone()
    }

    /// Check if a request should be allowed for the given API key
    pub fn check_rate_limit(&self, api_key: &str) -> Result<(), std::time::Duration> {
        let limiter = self.get_or_create_limiter(api_key);

        match limiter.check() {
            Ok(_) => Ok(()),
            Err(not_until) => {
                // Calculate wait time until rate limit resets
                let wait_duration = not_until.wait_time_from(self.clock.now());
                Err(wait_duration)
            }
        }
    }

    /// Get the number of tracked API keys
    #[cfg(test)]
    pub fn tracked_keys_count(&self) -> usize {
        self.limiters.len()
    }
}

/// Middleware to enforce per-API key rate limiting
pub async fn rate_limit_middleware(
    State(limiter): State<PerKeyRateLimiter>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    // Extract API key from headers
    let api_key = match extract_api_key(&headers) {
        Some(key) => key,
        None => {
            // No API key - use a default key for unauthenticated requests
            // This ensures rate limiting still applies even without auth
            "anonymous".to_string()
        }
    };

    // Check rate limit for this API key
    match limiter.check_rate_limit(&api_key) {
        Ok(_) => {
            // Request allowed - proceed
            next.run(request).await
        }
        Err(wait_duration) => {
            // Rate limit exceeded
            let retry_after = wait_duration.as_secs();

            tracing::warn!(
                "Rate limit exceeded for API key: {} (retry after {} seconds)",
                if api_key == "anonymous" {
                    "unauthenticated"
                } else {
                    &api_key
                },
                retry_after
            );

            let mut response = (
                StatusCode::TOO_MANY_REQUESTS,
                Json(ErrorResponse {
                    status: "error".to_string(),
                    error: format!(
                        "Rate limit exceeded. Please retry after {} seconds.",
                        retry_after
                    ),
                }),
            )
                .into_response();

            // Add Retry-After header
            response
                .headers_mut()
                .insert("Retry-After", retry_after.to_string().parse().unwrap());

            response
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_rate_limiter_creation() {
        let config = RateLimitConfig {
            per_second: 5,
            burst_size: 10,
        };
        let limiter = PerKeyRateLimiter::new(config);

        assert_eq!(limiter.tracked_keys_count(), 0);
    }

    #[test]
    fn test_rate_limiter_allows_requests_within_limit() {
        let config = RateLimitConfig {
            per_second: 10,
            burst_size: 5,
        };
        let limiter = PerKeyRateLimiter::new(config);

        // Should allow burst_size requests immediately
        for i in 0..5 {
            let result = limiter.check_rate_limit("test-key");
            assert!(result.is_ok(), "Request {} should be allowed", i);
        }
    }

    #[test]
    fn test_rate_limiter_rejects_requests_over_limit() {
        let config = RateLimitConfig {
            per_second: 10,
            burst_size: 3,
        };
        let limiter = PerKeyRateLimiter::new(config);

        // Allow burst_size requests
        for _ in 0..3 {
            assert!(limiter.check_rate_limit("test-key").is_ok());
        }

        // Next request should be rate limited
        let result = limiter.check_rate_limit("test-key");
        assert!(result.is_err(), "Request over burst should be rejected");

        if let Err(wait_duration) = result {
            assert!(wait_duration > Duration::from_millis(0));
        }
    }

    #[test]
    fn test_rate_limiter_separate_keys_independent() {
        let config = RateLimitConfig {
            per_second: 10,
            burst_size: 2,
        };
        let limiter = PerKeyRateLimiter::new(config);

        // Exhaust limit for key1
        assert!(limiter.check_rate_limit("key1").is_ok());
        assert!(limiter.check_rate_limit("key1").is_ok());
        assert!(limiter.check_rate_limit("key1").is_err());

        // key2 should still have its full quota
        assert!(limiter.check_rate_limit("key2").is_ok());
        assert!(limiter.check_rate_limit("key2").is_ok());
        assert!(limiter.check_rate_limit("key2").is_err());

        // Should track both keys
        assert_eq!(limiter.tracked_keys_count(), 2);
    }

    #[test]
    fn test_rate_limiter_default_config() {
        let config = RateLimitConfig::default();
        assert_eq!(config.per_second, 10);
        assert_eq!(config.burst_size, 20);
    }

    #[test]
    fn test_rate_limiter_custom_config() {
        let config = RateLimitConfig {
            per_second: 5,
            burst_size: 15,
        };
        assert_eq!(config.per_second, 5);
        assert_eq!(config.burst_size, 15);
    }

    #[test]
    fn test_extract_api_key_x_api_key_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "test-key-123".parse().unwrap());

        let key = extract_api_key(&headers);
        assert_eq!(key, Some("test-key-123".to_string()));
    }

    #[test]
    fn test_extract_api_key_bearer_token() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer test-token-456".parse().unwrap());

        let key = extract_api_key(&headers);
        assert_eq!(key, Some("test-token-456".to_string()));
    }

    #[test]
    fn test_extract_api_key_no_header() {
        let headers = HeaderMap::new();
        let key = extract_api_key(&headers);
        assert_eq!(key, None);
    }

    #[test]
    fn test_extract_api_key_prefers_x_api_key() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "x-api-key-value".parse().unwrap());
        headers.insert("authorization", "Bearer bearer-value".parse().unwrap());

        let key = extract_api_key(&headers);
        assert_eq!(key, Some("x-api-key-value".to_string()));
    }

    #[test]
    fn test_limiter_tracks_multiple_keys() {
        let config = RateLimitConfig::default();
        let limiter = PerKeyRateLimiter::new(config);

        // Access different keys
        let _ = limiter.check_rate_limit("key1");
        let _ = limiter.check_rate_limit("key2");
        let _ = limiter.check_rate_limit("key3");

        assert_eq!(limiter.tracked_keys_count(), 3);
    }

    #[test]
    fn test_same_key_reuses_limiter() {
        let config = RateLimitConfig::default();
        let limiter = PerKeyRateLimiter::new(config);

        // Access same key multiple times
        let _ = limiter.check_rate_limit("same-key");
        let _ = limiter.check_rate_limit("same-key");
        let _ = limiter.check_rate_limit("same-key");

        // Should only track one key
        assert_eq!(limiter.tracked_keys_count(), 1);
    }
}
