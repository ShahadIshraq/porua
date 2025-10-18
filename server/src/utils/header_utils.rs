use axum::http::HeaderMap;

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
