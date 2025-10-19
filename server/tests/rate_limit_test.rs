use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use porua_server::auth::ApiKeys;
use porua_server::kokoro::TTSPool;
use porua_server::rate_limit::{PerKeyRateLimiter, RateLimitConfig, RateLimiterMode};
use porua_server::server::{create_router, AppState};
use std::sync::Arc;
use std::time::Duration;
use tower::ServiceExt;

async fn create_test_app(rate_config: RateLimitConfig, with_auth: bool) -> axum::Router {
    // Create API keys only if auth is enabled
    let api_keys = if with_auth {
        use std::collections::HashSet;
        let mut keys = HashSet::new();
        keys.insert("test-key".to_string());
        keys.insert("test-key-1".to_string());
        keys.insert("test-key-2".to_string());
        keys.insert("key1".to_string());
        keys.insert("key2".to_string());
        keys.insert("same-key".to_string());
        keys.insert("bearer-token-123".to_string());
        ApiKeys::from_keys(keys)
    } else {
        ApiKeys::empty()
    };

    // Rate limiter is only enabled when API keys are enabled
    let rate_limiter = if with_auth {
        Some(RateLimiterMode::PerKey(PerKeyRateLimiter::new(rate_config)))
    } else {
        None
    };

    // Create a minimal TTS pool for testing
    // Note: This will fail if model files are not present, so tests should focus on endpoints
    // that don't require TTS processing (health, voices, etc.)
    let model_path = "models/kokoro-v1.0.onnx";
    let voices_path = "models/voices-v1.0.bin";

    let tts_pool = match TTSPool::new(1, model_path, voices_path).await {
        Ok(pool) => Arc::new(pool),
        Err(_) => {
            // If we can't create a real pool, we'll still test rate limiting on available endpoints
            // This is expected in CI/test environments without model files
            panic!("TTS pool creation failed - model files required for integration tests");
        }
    };

    let state = AppState {
        tts_pool,
        api_keys,
        rate_limiter,
        request_timeout: Duration::from_secs(60), // Default timeout for tests
    };

    create_router(state)
}

#[tokio::test]
async fn test_rate_limit_allows_requests_within_limit() {
    // Configure rate limit: 10 per second, burst of 3
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 3,
    };

    let app = create_test_app(config, true).await;

    // Make 3 requests (within burst limit) - all should succeed
    for i in 0..3 {
        let request = Request::builder()
            .uri("/health")
            .header("x-api-key", "test-key-1")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();

        assert_eq!(
            response.status(),
            StatusCode::OK,
            "Request {} should succeed within burst limit",
            i + 1
        );
    }
}

#[tokio::test]
async fn test_rate_limit_rejects_requests_over_limit() {
    // Configure rate limit: 10 per second, burst of 2
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 2,
    };

    let app = create_test_app(config, true).await;

    // Make burst_size requests - should succeed
    for _ in 0..2 {
        let request = Request::builder()
            .uri("/health")
            .header("x-api-key", "test-key-2")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    // Next request should be rate limited
    let request = Request::builder()
        .uri("/health")
        .header("x-api-key", "test-key-2")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(
        response.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "Request over burst should be rate limited"
    );

    // Check for Retry-After header
    let retry_after = response.headers().get("retry-after");
    assert!(retry_after.is_some(), "Should have Retry-After header");
}

#[tokio::test]
async fn test_rate_limit_separate_keys_independent() {
    // Configure rate limit: 10 per second, burst of 2
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 2,
    };

    let app = create_test_app(config, true).await;

    // Exhaust limit for key1
    for _ in 0..2 {
        let request = Request::builder()
            .uri("/health")
            .header("x-api-key", "key1")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    // Verify key1 is rate limited
    let request = Request::builder()
        .uri("/health")
        .header("x-api-key", "key1")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

    // key2 should still have full quota
    for i in 0..2 {
        let request = Request::builder()
            .uri("/health")
            .header("x-api-key", "key2")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "key2 request {} should succeed",
            i + 1
        );
    }

    // key2 should now be rate limited
    let request = Request::builder()
        .uri("/health")
        .header("x-api-key", "key2")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn test_rate_limit_unauthenticated_requests() {
    // Configure rate limit: 10 per second, burst of 2
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 2,
    };

    let app = create_test_app(config, true).await;

    // Make requests without API key - should return 401 when auth is enabled
    for _ in 0..3 {
        let request = Request::builder()
            .uri("/health")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "Unauthenticated requests should be rejected when auth is enabled"
        );
    }
}

#[tokio::test]
async fn test_rate_limit_bearer_token() {
    // Configure rate limit: 10 per second, burst of 2
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 2,
    };

    let app = create_test_app(config, true).await;

    // Make requests with Bearer token
    for _ in 0..2 {
        let request = Request::builder()
            .uri("/health")
            .header("authorization", "Bearer bearer-token-123")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    // Next request should be rate limited
    let request = Request::builder()
        .uri("/health")
        .header("authorization", "Bearer bearer-token-123")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(
        response.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "Bearer token requests should be rate limited"
    );
}

#[tokio::test]
async fn test_rate_limit_all_endpoints() {
    // Configure rate limit: 10 per second, burst of 1
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 1,
    };

    let app = create_test_app(config, true).await;

    // Test different endpoints with same API key
    let endpoints = vec!["/health", "/voices"];

    for endpoint in endpoints {
        // First request should succeed
        let request = Request::builder()
            .uri(endpoint)
            .header("x-api-key", "same-key")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "First request to {} should succeed",
            endpoint
        );

        // Second request should be rate limited (we've exhausted burst)
        let request = Request::builder()
            .uri(endpoint)
            .header("x-api-key", "same-key")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::TOO_MANY_REQUESTS,
            "Second request to {} should be rate limited",
            endpoint
        );

        // Wait for rate limit to reset
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
    }
}

#[tokio::test]
async fn test_rate_limit_response_format() {
    // Configure rate limit: 10 per second, burst of 1
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 1,
    };

    let app = create_test_app(config, true).await;

    // Exhaust rate limit
    let request = Request::builder()
        .uri("/health")
        .header("x-api-key", "test-key")
        .body(Body::empty())
        .unwrap();
    let _ = app.clone().oneshot(request).await.unwrap();

    // Next request should return proper error response
    let request = Request::builder()
        .uri("/health")
        .header("x-api-key", "test-key")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

    // Verify Retry-After header exists
    let retry_after = response.headers().get("retry-after");
    assert!(retry_after.is_some(), "Should have Retry-After header");

    // Parse and verify retry after value is a number
    let retry_after_str = retry_after.unwrap().to_str().unwrap();
    let retry_seconds: u64 = retry_after_str.parse().unwrap();
    assert!(retry_seconds >= 0, "Retry-After should be >= 0");

    // Check response body
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["status"], "error");
    assert!(json["error"]
        .as_str()
        .unwrap()
        .contains("Rate limit exceeded"));
}

#[tokio::test]
async fn test_rate_limit_disabled_without_api_keys() {
    // Configure rate limit with very low burst
    let config = RateLimitConfig {
        per_second: 10,
        burst_size: 1,
    };

    // Create app WITHOUT authentication - rate limiting should be disabled
    let app = create_test_app(config, false).await;

    // Make multiple requests - should all succeed since rate limiting is disabled
    for i in 0..5 {
        let request = Request::builder()
            .uri("/health")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "Request {} should succeed when rate limiting is disabled",
            i + 1
        );
    }
}
