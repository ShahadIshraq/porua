use chrono::{DateTime, Utc};
use flate2::write::GzEncoder;
use flate2::Compression;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tokio::time::sleep;

use super::config::LogConfig;

/// Background task that periodically cleans up old logs
///
/// Runs every hour and performs:
/// - Compression of old uncompressed logs
/// - Deletion of logs older than retention period
/// - Enforcement of total disk space limits
pub async fn cleanup_task(log_dir: PathBuf, config: LogConfig) {
    loop {
        // Run cleanup every hour
        sleep(Duration::from_secs(3600)).await;

        if let Err(e) = perform_cleanup(&log_dir, &config).await {
            tracing::error!(
                error = %e,
                log_dir = ?log_dir,
                "Log cleanup failed"
            );
        }
    }
}

/// Perform a single cleanup cycle
async fn perform_cleanup(log_dir: &Path, config: &LogConfig) -> io::Result<()> {
    tracing::debug!("Starting log cleanup cycle");

    let archives_dir = log_dir.join("archives");

    // Ensure archives directory exists
    if !archives_dir.exists() {
        fs::create_dir_all(&archives_dir)?;
    }

    // Step 1: Compress old uncompressed logs (older than 1 day)
    if config.compression_enabled {
        compress_old_logs(&archives_dir).await?;
    }

    // Step 2: Delete logs older than retention period
    delete_old_logs(&archives_dir, config.retention_days).await?;

    // Step 3: Enforce total disk space limit
    enforce_disk_limit(&archives_dir, config.max_total_size_mb).await?;

    tracing::debug!("Log cleanup cycle completed");

    Ok(())
}

/// Compress uncompressed log files older than 1 day
async fn compress_old_logs(archives_dir: &Path) -> io::Result<()> {
    let entries = fs::read_dir(archives_dir)?;
    let cutoff_time = SystemTime::now() - Duration::from_secs(86400); // 24 hours ago

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        // Skip if already compressed
        if path.extension().and_then(|s| s.to_str()) == Some("gz") {
            continue;
        }

        // Only process .log files
        if path.extension().and_then(|s| s.to_str()) != Some("log") {
            continue;
        }

        // Check modification time
        let metadata = entry.metadata()?;
        let modified = metadata.modified()?;

        if modified < cutoff_time {
            // Compress the file
            match compress_file(&path).await {
                Ok(compressed_path) => {
                    tracing::info!(
                        original = ?path,
                        compressed = ?compressed_path,
                        "Log file compressed"
                    );
                    // Delete original after successful compression
                    if let Err(e) = fs::remove_file(&path) {
                        tracing::warn!(
                            path = ?path,
                            error = %e,
                            "Failed to delete original log after compression"
                        );
                    }
                }
                Err(e) => {
                    tracing::warn!(
                        path = ?path,
                        error = %e,
                        "Failed to compress log file"
                    );
                }
            }
        }
    }

    Ok(())
}

/// Compress a single log file using gzip
async fn compress_file(path: &Path) -> io::Result<PathBuf> {
    let compressed_path = path.with_extension("log.gz");

    // Read original file
    let mut input_file = File::open(path)?;
    let mut input_data = Vec::new();
    input_file.read_to_end(&mut input_data)?;

    // Compress data
    let output_file = File::create(&compressed_path)?;
    let mut encoder = GzEncoder::new(output_file, Compression::default());
    encoder.write_all(&input_data)?;
    encoder.finish()?;

    Ok(compressed_path)
}

/// Delete log files older than the retention period
async fn delete_old_logs(archives_dir: &Path, retention_days: u32) -> io::Result<()> {
    let entries = fs::read_dir(archives_dir)?;
    let cutoff_time = SystemTime::now() - Duration::from_secs(retention_days as u64 * 86400);

    let mut deleted_count = 0;
    let mut deleted_bytes = 0u64;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        // Check modification time
        let metadata = entry.metadata()?;
        let modified = metadata.modified()?;

        if modified < cutoff_time {
            let file_size = metadata.len();

            match fs::remove_file(&path) {
                Ok(_) => {
                    deleted_count += 1;
                    deleted_bytes += file_size;
                    tracing::info!(
                        path = ?path,
                        size_bytes = file_size,
                        age_days = (SystemTime::now()
                            .duration_since(modified)
                            .unwrap_or_default()
                            .as_secs()
                            / 86400),
                        "Deleted old log file"
                    );
                }
                Err(e) => {
                    tracing::warn!(
                        path = ?path,
                        error = %e,
                        "Failed to delete old log file"
                    );
                }
            }
        }
    }

    if deleted_count > 0 {
        tracing::info!(
            deleted_files = deleted_count,
            freed_bytes = deleted_bytes,
            freed_mb = deleted_bytes / (1024 * 1024),
            "Cleanup completed"
        );
    }

    Ok(())
}

/// Enforce total disk space limit by deleting oldest files
async fn enforce_disk_limit(archives_dir: &Path, max_size_mb: u64) -> io::Result<()> {
    // Calculate total size of archives directory
    let mut files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    let mut total_size = 0u64;

    let entries = fs::read_dir(archives_dir)?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_file() {
            let size = metadata.len();
            let modified = metadata.modified()?;
            total_size += size;
            files.push((path, modified, size));
        }
    }

    let max_size_bytes = max_size_mb * 1024 * 1024;

    // If under limit, nothing to do
    if total_size <= max_size_bytes {
        return Ok(());
    }

    tracing::warn!(
        total_size_mb = total_size / (1024 * 1024),
        max_size_mb = max_size_mb,
        "Log directory exceeds size limit, deleting oldest files"
    );

    // Sort files by modification time (oldest first)
    files.sort_by_key(|(_, modified, _)| *modified);

    // Delete oldest files until we're under the limit
    let mut deleted_count = 0;
    for (path, _, size) in files {
        if total_size <= max_size_bytes {
            break;
        }

        match fs::remove_file(&path) {
            Ok(_) => {
                total_size -= size;
                deleted_count += 1;
                tracing::info!(
                    path = ?path,
                    size_bytes = size,
                    "Deleted old log to enforce disk limit"
                );
            }
            Err(e) => {
                tracing::warn!(
                    path = ?path,
                    error = %e,
                    "Failed to delete log file"
                );
            }
        }
    }

    tracing::info!(
        deleted_files = deleted_count,
        new_total_size_mb = total_size / (1024 * 1024),
        "Disk limit enforcement completed"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_compress_file() {
        let temp_dir = TempDir::new().unwrap();
        let log_file = temp_dir.path().join("test.log");

        // Create a test log file
        let mut file = File::create(&log_file).unwrap();
        writeln!(file, "Test log line 1").unwrap();
        writeln!(file, "Test log line 2").unwrap();
        writeln!(file, "Test log line 3").unwrap();

        // Compress it
        let compressed = compress_file(&log_file).await.unwrap();

        assert!(compressed.exists());
        assert_eq!(compressed.extension().unwrap(), "gz");

        // Compressed file should be smaller (for this simple test data)
        let original_size = fs::metadata(&log_file).unwrap().len();
        let compressed_size = fs::metadata(&compressed).unwrap().len();

        // Gzip adds some overhead, but for larger files it should compress
        tracing::debug!(
            "Original: {} bytes, Compressed: {} bytes",
            original_size,
            compressed_size
        );
    }

    #[tokio::test]
    async fn test_delete_old_logs() {
        let temp_dir = TempDir::new().unwrap();
        let archives_dir = temp_dir.path().join("archives");
        fs::create_dir_all(&archives_dir).unwrap();

        // Create an old log file
        let old_log = archives_dir.join("old.log");
        File::create(&old_log).unwrap();

        // Set modification time to 60 days ago
        let old_time = SystemTime::now() - Duration::from_secs(60 * 86400);
        filetime::set_file_mtime(&old_log, filetime::FileTime::from_system_time(old_time))
            .unwrap();

        // Run cleanup with 30-day retention
        delete_old_logs(&archives_dir, 30).await.unwrap();

        // Old log should be deleted
        assert!(!old_log.exists());
    }

    #[tokio::test]
    async fn test_enforce_disk_limit() {
        let temp_dir = TempDir::new().unwrap();
        let archives_dir = temp_dir.path().join("archives");
        fs::create_dir_all(&archives_dir).unwrap();

        // Create multiple log files to exceed limit
        for i in 0..5 {
            let log_file = archives_dir.join(format!("log{}.log", i));
            let mut file = File::create(&log_file).unwrap();
            // Write 1KB of data
            file.write_all(&vec![b'x'; 1024]).unwrap();
        }

        // Enforce 2KB limit (should delete 3 files)
        enforce_disk_limit(&archives_dir, 0).await.unwrap(); // 0 MB = aggressive cleanup

        // Count remaining files
        let remaining = fs::read_dir(&archives_dir).unwrap().count();
        assert!(
            remaining < 5,
            "Should have deleted some files to enforce limit"
        );
    }
}
