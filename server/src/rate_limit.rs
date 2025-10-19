use axum::{
    extract::{Request, State},
    http::StatusCode,
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
use std::net::IpAddr;
use std::num::NonZeroU32;
use std::sync::Arc;

use crate::utils::header_utils::{extract_api_key, extract_client_ip};

/// Type alias for the in-memory rate limiter
type InMemoryRateLimiter = RateLimiter<NotKeyed, InMemoryState, DefaultClock>;

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
    limiters: Arc<DashMap<String, Arc<InMemoryRateLimiter>>>,
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

    /// Get the configuration
    pub fn config(&self) -> &RateLimitConfig {
        &self.config
    }
}

/// Rate limiter that tracks limits per IP address
#[derive(Clone)]
pub struct PerIpRateLimiter {
    /// Rate limiters indexed by IP address
    limiters: Arc<DashMap<IpAddr, Arc<InMemoryRateLimiter>>>,
    /// Configuration for new rate limiters
    config: RateLimitConfig,
    /// Clock for rate limiting
    clock: DefaultClock,
}

impl PerIpRateLimiter {
    /// Create a new per-IP rate limiter with the given configuration
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            limiters: Arc::new(DashMap::new()),
            config,
            clock: DefaultClock::default(),
        }
    }

    /// Get or create a rate limiter for the given IP address
    fn get_or_create_limiter(&self, ip: IpAddr) -> Arc<InMemoryRateLimiter> {
        self.limiters
            .entry(ip)
            .or_insert_with(|| {
                // Create quota: burst_size requests per (burst_size / per_second) seconds
                // This allows burst_size requests immediately, then refills at per_second rate
                let quota = Quota::per_second(NonZeroU32::new(self.config.per_second).unwrap())
                    .allow_burst(NonZeroU32::new(self.config.burst_size).unwrap());

                Arc::new(RateLimiter::direct(quota))
            })
            .clone()
    }

    /// Check if a request should be allowed for the given IP address
    pub fn check_rate_limit(&self, ip: IpAddr) -> Result<(), std::time::Duration> {
        let limiter = self.get_or_create_limiter(ip);

        match limiter.check() {
            Ok(_) => Ok(()),
            Err(not_until) => {
                // Calculate wait time until rate limit resets
                let wait_duration = not_until.wait_time_from(self.clock.now());
                Err(wait_duration)
            }
        }
    }

    /// Get the number of tracked IP addresses
    #[cfg(test)]
    pub fn tracked_ips_count(&self) -> usize {
        self.limiters.len()
    }

    /// Get the configuration
    pub fn config(&self) -> &RateLimitConfig {
        &self.config
    }
}

/// Dual-mode rate limiter supporting both per-key and per-IP strategies
#[derive(Clone)]
pub enum RateLimiterMode {
    /// Rate limiting per API key (each key has independent limits)
    PerKey(PerKeyRateLimiter),
    /// Rate limiting per IP address (each IP has independent limits)
    PerIp(PerIpRateLimiter),
}

impl RateLimiterMode {
    /// Get the configuration for the current mode
    pub fn config(&self) -> &RateLimitConfig {
        match self {
            RateLimiterMode::PerKey(limiter) => limiter.config(),
            RateLimiterMode::PerIp(limiter) => limiter.config(),
        }
    }

    /// Get a description of the current mode
    pub fn mode_description(&self) -> &'static str {
        match self {
            RateLimiterMode::PerKey(_) => "PER-API-KEY",
            RateLimiterMode::PerIp(_) => "PER-IP-ADDRESS",
        }
    }
}

/// Middleware to enforce rate limiting (supports both per-key and per-IP modes)
pub async fn rate_limit_middleware(
    State(limiter): State<RateLimiterMode>,
    request: Request,
    next: Next,
) -> Response {
    // Check rate limit based on the mode
    let rate_limit_result = match &limiter {
        RateLimiterMode::PerKey(key_limiter) => {
            // Extract API key from headers
            let headers = request.headers();
            let api_key = match extract_api_key(headers) {
                Some(key) => key,
                None => {
                    // No API key - use a default key for unauthenticated requests
                    "anonymous".to_string()
                }
            };

            // Check rate limit for this API key
            match key_limiter.check_rate_limit(&api_key) {
                Ok(_) => Ok(()),
                Err(wait_duration) => {
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
                    Err(retry_after)
                }
            }
        }
        RateLimiterMode::PerIp(ip_limiter) => {
            // Extract IP address from request
            match extract_client_ip(&request) {
                Ok(ip) => {
                    // Check rate limit for this IP
                    match ip_limiter.check_rate_limit(ip) {
                        Ok(_) => Ok(()),
                        Err(wait_duration) => {
                            let retry_after = wait_duration.as_secs();
                            tracing::warn!(
                                "Rate limit exceeded for IP: {} (retry after {} seconds)",
                                ip,
                                retry_after
                            );
                            Err(retry_after)
                        }
                    }
                }
                Err(err) => {
                    tracing::error!("Failed to extract client IP: {}", err);
                    // Allow request if we can't extract IP (fail open)
                    Ok(())
                }
            }
        }
    };

    // Handle the result
    match rate_limit_result {
        Ok(_) => {
            // Request allowed - proceed
            next.run(request).await
        }
        Err(retry_after) => {
            // Rate limit exceeded
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

    // ===== PerIpRateLimiter Tests =====

    #[test]
    fn test_per_ip_limiter_creation() {
        let config = RateLimitConfig {
            per_second: 5,
            burst_size: 10,
        };
        let limiter = PerIpRateLimiter::new(config);

        assert_eq!(limiter.tracked_ips_count(), 0);
    }

    #[test]
    fn test_per_ip_limiter_allows_requests_within_limit() {
        let config = RateLimitConfig {
            per_second: 10,
            burst_size: 5,
        };
        let limiter = PerIpRateLimiter::new(config);
        let test_ip: IpAddr = "192.168.1.100".parse().unwrap();

        // Should allow burst_size requests immediately
        for i in 0..5 {
            let result = limiter.check_rate_limit(test_ip);
            assert!(result.is_ok(), "Request {} should be allowed", i);
        }
    }

    #[test]
    fn test_per_ip_limiter_rejects_requests_over_limit() {
        let config = RateLimitConfig {
            per_second: 10,
            burst_size: 3,
        };
        let limiter = PerIpRateLimiter::new(config);
        let test_ip: IpAddr = "192.168.1.100".parse().unwrap();

        // Allow burst_size requests
        for _ in 0..3 {
            assert!(limiter.check_rate_limit(test_ip).is_ok());
        }

        // Next request should be rate limited
        let result = limiter.check_rate_limit(test_ip);
        assert!(result.is_err(), "Request over burst should be rejected");

        if let Err(wait_duration) = result {
            assert!(wait_duration > Duration::from_millis(0));
        }
    }

    #[test]
    fn test_per_ip_limiter_separate_ips_independent() {
        let config = RateLimitConfig {
            per_second: 10,
            burst_size: 2,
        };
        let limiter = PerIpRateLimiter::new(config);
        let ip1: IpAddr = "192.168.1.100".parse().unwrap();
        let ip2: IpAddr = "192.168.1.101".parse().unwrap();

        // Exhaust limit for ip1
        assert!(limiter.check_rate_limit(ip1).is_ok());
        assert!(limiter.check_rate_limit(ip1).is_ok());
        assert!(limiter.check_rate_limit(ip1).is_err());

        // ip2 should still have its full quota
        assert!(limiter.check_rate_limit(ip2).is_ok());
        assert!(limiter.check_rate_limit(ip2).is_ok());
        assert!(limiter.check_rate_limit(ip2).is_err());

        // Should track both IPs
        assert_eq!(limiter.tracked_ips_count(), 2);
    }

    #[test]
    fn test_per_ip_limiter_tracks_multiple_ips() {
        let config = RateLimitConfig::default();
        let limiter = PerIpRateLimiter::new(config);

        // Access different IPs
        let _ = limiter.check_rate_limit("192.168.1.1".parse().unwrap());
        let _ = limiter.check_rate_limit("192.168.1.2".parse().unwrap());
        let _ = limiter.check_rate_limit("192.168.1.3".parse().unwrap());

        assert_eq!(limiter.tracked_ips_count(), 3);
    }

    #[test]
    fn test_per_ip_limiter_same_ip_reuses_limiter() {
        let config = RateLimitConfig::default();
        let limiter = PerIpRateLimiter::new(config);
        let test_ip: IpAddr = "192.168.1.100".parse().unwrap();

        // Access same IP multiple times
        let _ = limiter.check_rate_limit(test_ip);
        let _ = limiter.check_rate_limit(test_ip);
        let _ = limiter.check_rate_limit(test_ip);

        // Should only track one IP
        assert_eq!(limiter.tracked_ips_count(), 1);
    }

    #[test]
    fn test_per_ip_limiter_works_with_ipv6() {
        let config = RateLimitConfig {
            per_second: 10,
            burst_size: 2,
        };
        let limiter = PerIpRateLimiter::new(config);
        let ipv6: IpAddr = "2001:0db8:85a3:0000:0000:8a2e:0370:7334".parse().unwrap();

        // Should work with IPv6 addresses
        assert!(limiter.check_rate_limit(ipv6).is_ok());
        assert!(limiter.check_rate_limit(ipv6).is_ok());
        assert!(limiter.check_rate_limit(ipv6).is_err());

        assert_eq!(limiter.tracked_ips_count(), 1);
    }

    // ===== RateLimiterMode Tests =====

    #[test]
    fn test_rate_limiter_mode_per_key_description() {
        let config = RateLimitConfig::default();
        let mode = RateLimiterMode::PerKey(PerKeyRateLimiter::new(config));

        assert_eq!(mode.mode_description(), "PER-API-KEY");
    }

    #[test]
    fn test_rate_limiter_mode_per_ip_description() {
        let config = RateLimitConfig::default();
        let mode = RateLimiterMode::PerIp(PerIpRateLimiter::new(config));

        assert_eq!(mode.mode_description(), "PER-IP-ADDRESS");
    }

    #[test]
    fn test_rate_limiter_mode_returns_correct_config() {
        let config = RateLimitConfig {
            per_second: 15,
            burst_size: 30,
        };

        let mode_per_key = RateLimiterMode::PerKey(PerKeyRateLimiter::new(config.clone()));
        assert_eq!(mode_per_key.config().per_second, 15);
        assert_eq!(mode_per_key.config().burst_size, 30);

        let mode_per_ip = RateLimiterMode::PerIp(PerIpRateLimiter::new(config.clone()));
        assert_eq!(mode_per_ip.config().per_second, 15);
        assert_eq!(mode_per_ip.config().burst_size, 30);
    }
}
