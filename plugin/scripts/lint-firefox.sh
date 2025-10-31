#!/bin/bash
# Lint using Firefox manifest

set -e

# Backup Chrome manifest
cp manifest.json manifest.json.bak

# Use Firefox manifest temporarily
cp manifest.firefox.json manifest.json

# Cleanup function
cleanup() {
  mv manifest.json.bak manifest.json
}

# Register cleanup on exit
trap cleanup EXIT INT TERM

# Run lint
web-ext lint --source-dir=.
