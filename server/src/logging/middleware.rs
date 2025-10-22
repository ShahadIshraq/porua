use axum::{
    body::Body,
    extract::Request,
    http::{HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::time::Instant;
use uuid::Uuid;

/// Request ID wrapper for tracking requests through the system
#[derive(Clone, Debug)]
pub struct RequestId(pub String);

/// Middleware to generate unique request IDs for correlation
pub async fn request_id_middleware(mut req: Request, next: Next) -> Response {
    // Generate or extract request ID
    let request_id = req
        .headers()
        .get("X-Request-ID")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Store in request extensions for access by handlers
    req.extensions_mut().insert(RequestId(request_id.clone()));

    // Process request
    let mut response = next.run(req).await;

    // Add request ID to response headers for client tracking
    if let Ok(header_value) = HeaderValue::from_str(&request_id) {
        response
            .headers_mut()
            .insert("X-Request-ID", header_value);
    }

    response
}

/// Middleware to log all HTTP requests to access log
pub async fn access_log_middleware(req: Request, next: Next) -> Response {
    let start = Instant::now();

    // Extract request information
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();
    let query = uri.query().map(|q| q.to_string());

    // Extract request ID if available
    let request_id = req
        .extensions()
        .get::<RequestId>()
        .map(|id| id.0.clone())
        .unwrap_or_else(|| "unknown".to_string());

    // Extract client information
    let client_ip = extract_client_ip(&req);
    let user_agent = req
        .headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    // Extract API key hash if present (for security, only log first 8 chars of hash)
    let api_key_hash = req
        .headers()
        .get("x-api-key")
        .or_else(|| req.headers().get("authorization"))
        .and_then(|v| v.to_str().ok())
        .map(|key| {
            // Extract just the key part from "Bearer <key>"
            let key = if key.starts_with("Bearer ") {
                &key[7..]
            } else {
                key
            };
            // Hash and take first 8 chars for privacy
            format!("{:x}", md5::compute(key.as_bytes()))
                .chars()
                .take(8)
                .collect::<String>()
        });

    // Execute request
    let response = next.run(req).await;

    // Extract response information
    let status = response.status();
    let duration = start.elapsed();

    // Try to get content length from response
    let bytes_sent = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);

    // Get content type
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    // Log to access log with JSON structured data
    tracing::info!(
        target: "access_log",
        request_id = %request_id,
        client_ip = %client_ip,
        method = %method,
        path = %path,
        query = ?query,
        status = status.as_u16(),
        duration_ms = duration.as_millis() as u64,
        bytes_sent = bytes_sent,
        user_agent = %user_agent,
        api_key_hash = ?api_key_hash,
        content_type = %content_type,
        "HTTP request completed"
    );

    // Check for slow requests and log to application log
    let slow_threshold_ms = std::env::var("LOG_SLOW_REQUEST_THRESHOLD_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(5000);

    if duration.as_millis() as u64 > slow_threshold_ms {
        tracing::warn!(
            request_id = %request_id,
            path = %path,
            duration_ms = duration.as_millis() as u64,
            threshold_ms = slow_threshold_ms,
            "Slow request detected"
        );
    }

    response
}

/// Extract client IP from request, checking X-Forwarded-For and X-Real-IP headers
fn extract_client_ip(req: &Request) -> String {
    // Check X-Forwarded-For header first (for proxy/load balancer setups)
    if let Some(forwarded) = req.headers().get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded.to_str() {
            // Take the first IP in the comma-separated list
            if let Some(first_ip) = forwarded_str.split(',').next() {
                return first_ip.trim().to_string();
            }
        }
    }

    // Check X-Real-IP header (used by some proxies)
    if let Some(real_ip) = req.headers().get("x-real-ip") {
        if let Ok(ip_str) = real_ip.to_str() {
            return ip_str.to_string();
        }
    }

    // Fallback to connection remote address if available
    // Note: In Axum 0.7, this would need to be extracted via ConnectInfo extension
    // For now, return unknown since we don't have direct access to socket addr
    "unknown".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_id_generation() {
        let id1 = Uuid::new_v4().to_string();
        let id2 = Uuid::new_v4().to_string();
        assert_ne!(id1, id2, "Request IDs should be unique");
        assert_eq!(id1.len(), 36, "UUID should be 36 characters");
    }

    #[test]
    fn test_api_key_hashing() {
        let key = "secret-api-key-12345";
        let hash = format!("{:x}", md5::compute(key.as_bytes()))
            .chars()
            .take(8)
            .collect::<String>();
        assert_eq!(hash.len(), 8, "Hash should be truncated to 8 chars");
        assert_ne!(hash, key, "Hash should not be the original key");
    }
}
