#!/bin/bash

# Create GitHub Release and upload assets
# This script creates a GitHub release and uploads the built release files

set -e

VERSION=$(node -e "console.log(require('./package.json').version)")
RELEASE_DIR="./release"
REPO="jaydeland/claw"

echo "=================================="
echo "Creating GitHub Release v${VERSION}"
echo "=================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) not found."
    echo "Install from: https://cli.github.com/"
    echo "Or with Homebrew: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub. Run: gh auth login"
    exit 1
fi

# Files to upload
FILES=(
    "${RELEASE_DIR}/Claw-${VERSION}-arm64.dmg"
    "${RELEASE_DIR}/Claw-${VERSION}-arm64-mac.zip"
    "${RELEASE_DIR}/Claw-${VERSION}.dmg"
    "${RELEASE_DIR}/Claw-${VERSION}-mac.zip"
)

echo "Creating release v${VERSION}..."

# Create the release (or update if exists)
if gh release view "v${VERSION}" --repo "${REPO}" &> /dev/null; then
    echo "Release v${VERSION} already exists. Uploading assets..."
else
    echo "Creating new release v${VERSION}..."
    gh release create "v${VERSION}" \
        --repo "${REPO}" \
        --title "v${VERSION}" \
        --notes "Release v${VERSION}" \
        --draft=false \
        --prerelease=false
fi

echo ""
echo "Uploading assets..."

for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "Warning: File not found: $file"
        continue
    fi

    filename=$(basename "$file")
    echo "  - Uploading: $filename"
    gh release upload "v${VERSION}" "$file" --repo "${REPO}" --clobber
done

echo ""
echo "=================================="
echo "GitHub Release complete!"
echo "=================================="
echo ""
echo "Release URL:"
echo "  https://github.com/${REPO}/releases/tag/v${VERSION}"
echo ""
echo "Download links:"
echo "  Apple Silicon DMG: https://github.com/${REPO}/releases/download/v${VERSION}/Claw-${VERSION}-arm64.dmg"
echo "  Apple Silicon ZIP: https://github.com/${REPO}/releases/download/v${VERSION}/Claw-${VERSION}-arm64-mac.zip"
echo "  Intel Mac DMG:     https://github.com/${REPO}/releases/download/v${VERSION}/Claw-${VERSION}.dmg"
echo "  Intel Mac ZIP:     https://github.com/${REPO}/releases/download/v${VERSION}/Claw-${VERSION}-mac.zip"
