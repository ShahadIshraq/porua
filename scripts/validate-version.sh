#!/bin/bash

# Validate that Cargo.toml version matches git tag

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 1.0.0"
    exit 1
fi

TAG_VERSION="$1"

# Extract version from Cargo.toml
CARGO_VERSION=$(cargo metadata --manifest-path server/Cargo.toml --no-deps --format-version 1 | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "Cargo.toml version: $CARGO_VERSION"
echo "Tag version: $TAG_VERSION"

if [ "$CARGO_VERSION" != "$TAG_VERSION" ]; then
    echo ""
    echo "Error: Version mismatch!"
    echo "  Cargo.toml has version $CARGO_VERSION"
    echo "  But trying to tag as $TAG_VERSION"
    echo ""
    echo "Please update server/Cargo.toml version to match the tag."
    exit 1
fi

echo ""
echo "✓ Version validation passed!"
echo ""
echo "To create and push the tag, run:"
echo "  git tag -a v$TAG_VERSION -m \"Release v$TAG_VERSION\""
echo "  git push origin v$TAG_VERSION"
