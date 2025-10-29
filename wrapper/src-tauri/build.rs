use std::path::PathBuf;

fn main() {
    // Standard Tauri build
    tauri_build::build();

    // Copy server binary to resources
    copy_server_binary();

    // Copy espeak-ng-data
    copy_directory(
        "../../server/packaging/espeak-ng-data",
        "resources/espeak-ng-data",
    );

    // Copy samples
    copy_directory("../../server/samples", "resources/samples");

    // Rerun if server binary changes
    println!("cargo:rerun-if-changed=../../server/target/release/porua_server");
    println!("cargo:rerun-if-changed=../../server/packaging/espeak-ng-data");
    println!("cargo:rerun-if-changed=../../server/samples");
}

fn copy_server_binary() {
    let target = std::env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());

    let binary_name = if target.contains("windows") {
        "porua_server.exe"
    } else {
        "porua_server"
    };

    // Try target-specific path first (for cross-compilation), then fallback to default
    let server_binary_src = {
        let target_path = PathBuf::from(format!("../../server/target/{}/release/{}", target, binary_name));
        if target_path.exists() {
            target_path
        } else {
            PathBuf::from(format!("../../server/target/release/{}", binary_name))
        }
    };

    let dest = PathBuf::from("resources").join(binary_name);

    if server_binary_src.exists() {
        std::fs::create_dir_all("resources").expect("Failed to create resources directory");

        std::fs::copy(&server_binary_src, &dest).expect(&format!(
            "Failed to copy server binary from {:?} to {:?}",
            server_binary_src, dest
        ));

        println!("Copied server binary to {:?}", dest);

        // Print architecture info on macOS
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            if let Ok(output) = Command::new("lipo").arg("-info").arg(&dest).output() {
                if output.status.success() {
                    println!("Server binary architecture: {}", String::from_utf8_lossy(&output.stdout));
                }
            }
        }
    } else {
        eprintln!(
            "Warning: Server binary not found at {:?}. Build the server first with: cd ../../server && cargo build --release",
            server_binary_src
        );
        eprintln!("Continuing build without server binary - installation will fail at runtime.");
    }
}

fn copy_directory(src: &str, dst: &str) {
    let src_path = PathBuf::from(src);
    let dst_path = PathBuf::from(dst);

    if src_path.exists() {
        std::fs::create_dir_all(&dst_path).expect(&format!("Failed to create directory {:?}", dst_path));

        copy_dir_recursive(&src_path, &dst_path).expect(&format!(
            "Failed to copy directory from {:?} to {:?}",
            src_path, dst_path
        ));

        println!("Copied directory from {:?} to {:?}", src_path, dst_path);
    } else {
        eprintln!("Warning: Source directory {:?} not found. Skipping.", src_path);
    }
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
        }
    }

    Ok(())
}
