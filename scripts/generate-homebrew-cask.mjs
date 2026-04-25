#!/usr/bin/env node

/**
 * Generate Homebrew cask file with correct version and SHA256 hashes
 *
 * This script generates a `claw.rb` cask file for distribution via Homebrew.
 *
 * Usage:
 *   node scripts/generate-homebrew-cask.mjs
 *
 * The script expects DMG files to exist in the release/ directory:
 *   - Claw-{version}-arm64.dmg
 *   - Claw-{version}.dmg
 *
 * Run this after `bun run package:mac` to generate the cask file.
 */

import { createHash } from "crypto"
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
)
const version = process.env.VERSION || packageJson.version
const releaseDir = join(__dirname, "../release")

/**
 * Calculate SHA256 hash of a file
 */
function calculateSha256(filePath) {
  const content = readFileSync(filePath)
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Find DMG file matching pattern in release directory
 */
function findDmgFile(pattern) {
  if (!existsSync(releaseDir)) {
    console.error(`Release directory not found: ${releaseDir}`)
    process.exit(1)
  }

  const files = readdirSync(releaseDir)
  const match = files.find((f) => f.includes(pattern) && f.endsWith(".dmg"))
  return match ? join(releaseDir, match) : null
}

/**
 * Generate cask Ruby file content
 */
function generateCaskContent(arm64Sha256, x64Sha256) {
  return `cask "claw" do
  arch arm: "arm64", intel: ""

  version "${version}"

  on_arm do
    sha256 "${arm64Sha256}"
    url "https://cdn.21st.dev/releases/desktop/Claw-#{version}-arm64.dmg"
  end
  on_intel do
    sha256 "${x64Sha256}"
    url "https://cdn.21st.dev/releases/desktop/Claw-#{version}.dmg"
  end

  name "Claw"
  desc "UI for parallel work with AI agents - Best UI for Claude Code"
  homepage "https://21st.dev"

  livecheck do
    url "https://cdn.21st.dev/releases/desktop/latest-mac.yml"
    strategy :electron_builder
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "Claw.app"

  zap trash: [
    "~/Library/Application Support/Claw",
    "~/Library/Application Support/dev.21st.agents",
    "~/Library/Caches/dev.21st.agents",
    "~/Library/Preferences/dev.21st.agents.plist",
    "~/Library/Saved Application State/dev.21st.agents.savedState",
  ]
end
`
}

// Main execution
console.log("=".repeat(50))
console.log("Generating Homebrew Cask")
console.log("=".repeat(50))
console.log(`Version: ${version}`)
console.log(`Release dir: ${releaseDir}`)
console.log()

// Find and hash DMG files
// electron-builder names files:
// arm64: Claw-{version}-arm64.dmg
// x64: Claw-{version}.dmg (no arch suffix)
const arm64Dmg = findDmgFile(`${version}-arm64.dmg`)
const x64Dmg = findDmgFile(`${version}.dmg`)

// Filter to get the x64 version (excludes arm64)
const x64DmgFiltered = x64Dmg && !x64Dmg.includes("arm64") ? x64Dmg : null

if (!arm64Dmg) {
  console.error(`arm64 DMG not found: Claw-${version}-arm64.dmg`)
  console.error("Build the app first with: bun run package:mac")
  process.exit(1)
}

if (!x64DmgFiltered) {
  // Try to find x64 explicitly
  const files = readdirSync(releaseDir)
  const x64Match = files.find(
    (f) =>
      f.startsWith(`Claw-${version}`) &&
      f.endsWith(".dmg") &&
      !f.includes("arm64")
  )
  if (!x64Match) {
    console.error(`x64 DMG not found: Claw-${version}.dmg`)
    console.error("Build the app first with: bun run package:mac")
    process.exit(1)
  }
}

const actualX64Dmg =
  x64DmgFiltered ||
  join(
    releaseDir,
    readdirSync(releaseDir).find(
      (f) =>
        f.startsWith(`Claw-${version}`) &&
        f.endsWith(".dmg") &&
        !f.includes("arm64")
    )
  )

console.log(`arm64 DMG: ${arm64Dmg.split("/").pop()}`)
const arm64Sha256 = calculateSha256(arm64Dmg)
console.log(`  SHA256: ${arm64Sha256}`)
console.log()

console.log(`x64 DMG: ${actualX64Dmg.split("/").pop()}`)
const x64Sha256 = calculateSha256(actualX64Dmg)
console.log(`  SHA256: ${x64Sha256}`)
console.log()

// Generate cask content
const caskContent = generateCaskContent(arm64Sha256, x64Sha256)

// Write cask file
const outputPath = join(releaseDir, "claw.rb")
writeFileSync(outputPath, caskContent)

console.log("=".repeat(50))
console.log(`Cask file written to: ${outputPath}`)
console.log()
console.log("Next steps:")
console.log("1. Test locally: brew install --cask ./release/claw.rb")
console.log("2. Audit: brew audit --cask ./release/claw.rb")
console.log("3. Run: bun run release:homebrew (to push to tap)")
console.log("=".repeat(50))
