#!/bin/bash
# Temporarily swap manifests for Firefox development

set -e

# Backup Chrome manifest
cp manifest.json manifest.json.bak

# Use Firefox manifest
cp manifest.firefox.json manifest.json

# Cleanup function
cleanup() {
  echo "Restoring Chrome manifest..."
  mv manifest.json.bak manifest.json
}

# Register cleanup on exit
trap cleanup EXIT INT TERM

# Run web-ext
echo "Starting Firefox with Firefox manifest..."
web-ext run --source-dir=. --start-url about:debugging --keep-profile-changes --browser-console
