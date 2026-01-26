#!/bin/bash
set -e

# Update Homebrew cask after release
# Usage: ./scripts/update-homebrew-cask.sh
#
# This script:
# 1. Generates the cask file with correct SHA256 hashes
# 2. Clones the homebrew-claw tap repository
# 3. Updates the cask file and pushes to GitHub

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
VERSION=$(node -p "require('$DESKTOP_DIR/package.json').version")

HOMEBREW_TAP_REPO="git@github.com:jaydeland/homebrew-claw.git"
HOMEBREW_TAP_HTTPS="https://github.com/jaydeland/homebrew-claw"
TEMP_DIR="/tmp/homebrew-claw-$$"

echo "🍺 Updating Homebrew cask for Claw v$VERSION"
echo ""

# Step 1: Generate the cask file
echo "📝 Generating cask file..."
node "$SCRIPT_DIR/generate-homebrew-cask.mjs"

CASK_FILE="$DESKTOP_DIR/release/claw.rb"
if [ ! -f "$CASK_FILE" ]; then
    echo "❌ Cask file not generated at $CASK_FILE"
    exit 1
fi

echo "   Generated: $CASK_FILE"
echo ""

# Step 2: Clone the tap repository
echo "📥 Cloning homebrew-claw tap..."
if ! git clone --depth 1 "$HOMEBREW_TAP_REPO" "$TEMP_DIR" 2>/dev/null; then
    echo "❌ Failed to clone tap repository"
    echo "   Make sure the repository exists: $HOMEBREW_TAP_HTTPS"
    echo ""
    echo "   To create it:"
    echo "   1. Go to https://github.com/new"
    echo "   2. Create 'homebrew-claw' repository"
    echo "   3. Run this script again"
    exit 1
fi

# Step 3: Update the cask file
echo "📋 Updating cask file..."
mkdir -p "$TEMP_DIR/Casks"
cp "$CASK_FILE" "$TEMP_DIR/Casks/claw.rb"

# Step 4: Commit and push
cd "$TEMP_DIR"
git add Casks/claw.rb

if git diff --staged --quiet; then
    echo "ℹ️  No changes to cask file (already at v$VERSION)"
else
    git commit -m "Update claw to v$VERSION"
    git push origin main
    echo "✅ Cask updated to v$VERSION"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "=================================================="
echo "✨ Homebrew cask updated successfully!"
echo ""
echo "Users can now install/update with:"
echo "   brew install jaydeland/claw/claw"
echo "   brew upgrade claw"
echo ""
echo "Tap repository: $HOMEBREW_TAP_HTTPS"
echo "=================================================="
