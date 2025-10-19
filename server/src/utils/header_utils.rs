use axum::{extract::ConnectInfo, extract::Request, http::HeaderMap};
use std::net::{IpAddr, SocketAddr};

/// Extract API key from HTTP headers
///
/// Supports both X-API-Key header and Authorization: Bearer header.
/// X-API-Key takes precedence if both are present.
///
/// # Examples
///
/// ```
/// use axum::http::HeaderMap;
/// use porua_server::utils::header_utils::extract_api_key;
///
/// let mut headers = HeaderMap::new();
/// headers.insert("x-api-key", "my-secret-key".parse().unwrap());
/// assert_eq!(extract_api_key(&headers), Some("my-secret-key".to_string()));
/// ```
pub fn extract_api_key(headers: &HeaderMap) -> Option<String> {
    // Try X-API-Key header first
    if let Some(key) = headers.get("x-api-key") {
        if let Ok(key_str) = key.to_str() {
            return Some(key_str.to_string());
        }
    }

    // Try Authorization: Bearer header
    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            if let Some(stripped) = auth_str.strip_prefix("Bearer ") {
                return Some(stripped.to_string());
            }
        }
    }

    None
}

/// Extract client IP address from HTTP request
///
/// Supports X-Forwarded-For, X-Real-IP headers (for proxies/load balancers),
/// and falls back to connection IP address.
///
/// # Priority Order
/// 1. X-Forwarded-For header (leftmost IP = original client)
/// 2. X-Real-IP header (nginx proxy)
/// 3. Connection IP from socket address
///
/// # Examples
///
/// ```ignore
/// use axum::extract::Request;
/// use porua_server::utils::header_utils::extract_client_ip;
///
/// let ip = extract_client_ip(&request)?;
/// println!("Client IP: {}", ip);
/// ```
pub fn extract_client_ip<B>(request: &Request<B>) -> Result<IpAddr, String> {
    // Try X-Forwarded-For first (for proxies/load balancers)
    if let Some(forwarded_for) = request.headers().get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded_for.to_str() {
            // Take leftmost IP (original client)
            if let Some(ip_str) = forwarded_str.split(',').next() {
                if let Ok(ip) = ip_str.trim().parse::<IpAddr>() {
                    return Ok(ip);
                }
            }
        }
    }

    // Try X-Real-IP (nginx)
    if let Some(real_ip) = request.headers().get("x-real-ip") {
        if let Ok(ip_str) = real_ip.to_str() {
            if let Ok(ip) = ip_str.trim().parse::<IpAddr>() {
                return Ok(ip);
            }
        }
    }

    // Fallback: Extract from connection (axum extensions)
    if let Some(connect_info) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        return Ok(connect_info.0.ip());
    }

    Err("Unable to extract client IP address".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_api_key_x_api_key_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "test-key".parse().unwrap());
        assert_eq!(extract_api_key(&headers), Some("test-key".to_string()));
    }

    #[test]
    fn test_extract_api_key_bearer_token() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer test-token".parse().unwrap());
        assert_eq!(extract_api_key(&headers), Some("test-token".to_string()));
    }

    #[test]
    fn test_extract_api_key_prefers_x_api_key() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "x-key".parse().unwrap());
        headers.insert("authorization", "Bearer bearer-key".parse().unwrap());
        assert_eq!(extract_api_key(&headers), Some("x-key".to_string()));
    }

    #[test]
    fn test_extract_api_key_no_header() {
        let headers = HeaderMap::new();
        assert_eq!(extract_api_key(&headers), None);
    }

    #[test]
    fn test_extract_api_key_invalid_bearer_format() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "InvalidFormat".parse().unwrap());
        assert_eq!(extract_api_key(&headers), None);
    }
}
