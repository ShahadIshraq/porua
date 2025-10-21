#!/bin/bash

# Install git hooks from .githooks directory

HOOKS_DIR=".githooks"

if [ ! -d "$HOOKS_DIR" ]; then
    echo "Error: $HOOKS_DIR directory not found"
    exit 1
fi

# Determine git hooks directory (handle both regular repos and worktrees)
if [ -f ".git" ]; then
    # Git worktree - read the gitdir path
    GIT_DIR=$(grep "gitdir:" .git | cut -d' ' -f2)
    GIT_HOOKS_DIR="$GIT_DIR/hooks"
elif [ -d ".git" ]; then
    # Regular git repository
    GIT_HOOKS_DIR=".git/hooks"
else
    echo "Error: Not a git repository"
    exit 1
fi

# Create hooks directory if it doesn't exist
if [ ! -d "$GIT_HOOKS_DIR" ]; then
    echo "Creating hooks directory: $GIT_HOOKS_DIR"
    mkdir -p "$GIT_HOOKS_DIR"
fi

echo "Installing git hooks..."

# Install pre-commit hook
if [ -f "$HOOKS_DIR/pre-commit" ]; then
    cp "$HOOKS_DIR/pre-commit" "$GIT_HOOKS_DIR/pre-commit"
    chmod +x "$GIT_HOOKS_DIR/pre-commit"
    echo "✓ Installed pre-commit hook"
else
    echo "⚠ pre-commit hook not found in $HOOKS_DIR"
fi

echo ""
echo "Git hooks installed successfully!"
echo ""
echo "The pre-commit hook will:"
echo "  - Validate plugin version consistency (if manifest files changed)"
echo "  - Check server code formatting"
echo "  - Run server tests"
echo ""
echo "To skip the hook (not recommended), use: git commit --no-verify"
