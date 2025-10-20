# eSpeak-ng Data for Distribution

## Overview

The `espeak-ng-data` directory (~25 MB) contains phoneme dictionaries required for text-to-speech phonemization. This data is **committed to the repository** and bundled with distribution packages to ensure users don't need to install eSpeak-ng separately.

## Data Location

The eSpeak-ng data is already present in this repository at `packaging/espeak-ng-data/`. No additional setup is required for packaging.

## Updating eSpeak-ng Data (Optional)

If you need to update the eSpeak-ng data to a newer version, you can obtain it from your system installation or the official repository:

### From System Installation (macOS with Homebrew)

```bash
brew install espeak-ng
cp -r /opt/homebrew/share/espeak-ng-data server/packaging/
```

### From System Installation (Linux)

```bash
# Ubuntu/Debian:
sudo apt-get install espeak-ng-data
cp -r /usr/share/espeak-ng-data server/packaging/

# Fedora/RHEL:
sudo dnf install espeak-ng
cp -r /usr/share/espeak-ng-data server/packaging/
```

### From Source

```bash
cd server/packaging
git clone --depth 1 https://github.com/espeak-ng/espeak-ng.git temp-espeak
cd temp-espeak
./autogen.sh
./configure
make
cp -r espeak-ng-data ../
cd ..
rm -rf temp-espeak
```

## Why This is Needed

The `espeak-rs` library used by the Kokoro TTS engine requires eSpeak-ng phoneme data to convert text into phonemes. The library searches for this data in the following order:

1. `PIPER_ESPEAKNG_DATA_DIRECTORY` environment variable
2. Current working directory (`./espeak-ng-data`)
3. Parent directory of executable (`../espeak-ng-data`)
4. System default paths (e.g., `/opt/homebrew/share`)

During development, the binary finds the system installation. For distributed binaries, we bundle the data and set `PIPER_ESPEAKNG_DATA_DIRECTORY` during installation.

## Distribution Package Structure

```
porua-server-v0.1.0-[platform]-[arch]/
├── bin/porua_server
├── espeak-ng-data/          # ~25 MB - Bundled phoneme data
│   ├── af_dict
│   ├── en_dict
│   ├── es_dict
│   └── ... (125+ language dictionaries)
├── install.sh
└── ...
```

The `install.sh` script copies `espeak-ng-data` to the installation directory and sets `PIPER_ESPEAKNG_DATA_DIRECTORY` in the user's shell profile.

## Size Considerations

- **espeak-ng-data:** ~25 MB (committed to repository)
- **Total package size:** ~55 MB compressed
- **Installed size:** ~390 MB (binary + espeak data + TTS models)

This is acceptable for a self-contained TTS server distribution.

## Git Repository

The `espeak-ng-data` directory is **committed to the repository** to ensure:
- Consistent data across all builds and environments
- No external dependencies required for CI/CD packaging
- Simplified build process without platform-specific installation steps
- Guaranteed availability for cross-compilation builds
