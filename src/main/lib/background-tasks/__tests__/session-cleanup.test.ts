/**
 * Tests for session directory cleanup
 *
 * These tests verify the cleanup logic for Claude session directories.
 * Note: These are integration tests that interact with the filesystem.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import * as fs from "fs"
import * as path from "path"
import { app } from "electron"
import {
  cleanupSessionDirectories,
  getSessionCleanupPreview,
  type SessionCleanupConfig,
} from "../cleanup"

// Mock app.getPath for testing
const testUserDataPath = path.join(__dirname, ".test-userdata")

// Store original getPath
const originalGetPath = app?.getPath

describe("Session Cleanup", () => {
  // Skip if not in a proper Electron environment
  const canRunTests = typeof app !== "undefined" && app?.getPath

  beforeAll(() => {
    if (!canRunTests) {
      console.log("Skipping session cleanup tests (no Electron app context)")
      return
    }

    // Create test directory structure
    const sessionsDir = path.join(testUserDataPath, "claude-sessions")
    fs.mkdirSync(sessionsDir, { recursive: true })

    // Mock app.getPath
    if (app) {
      ;(app as any).getPath = (name: string) => {
        if (name === "userData") return testUserDataPath
        return originalGetPath.call(app, name)
      }
    }
  })

  afterAll(() => {
    // Restore original getPath
    if (app && originalGetPath) {
      ;(app as any).getPath = originalGetPath
    }

    // Clean up test directory
    if (fs.existsSync(testUserDataPath)) {
      fs.rmSync(testUserDataPath, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    if (!canRunTests) return

    // Reset test sessions directory
    const sessionsDir = path.join(testUserDataPath, "claude-sessions")
    if (fs.existsSync(sessionsDir)) {
      fs.rmSync(sessionsDir, { recursive: true, force: true })
    }
    fs.mkdirSync(sessionsDir, { recursive: true })
  })

  it("should preserve background-utility directory", async () => {
    if (!canRunTests) return

    const sessionsDir = path.join(testUserDataPath, "claude-sessions")

    // Create background-utility directory
    const bgUtilDir = path.join(sessionsDir, "background-utility")
    fs.mkdirSync(bgUtilDir, { recursive: true })
    fs.writeFileSync(path.join(bgUtilDir, "test.txt"), "test")

    // Set modification time to 48 hours ago (older than default 24h retention)
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000)
    fs.utimesSync(bgUtilDir, oldTime, oldTime)

    const result = await cleanupSessionDirectories()

    // background-utility should be preserved
    expect(result.preserved).toBe(1)
    expect(result.deleted).toBe(0)
    expect(fs.existsSync(bgUtilDir)).toBe(true)
  })

  it("should delete directories older than maxAgeHours", async () => {
    if (!canRunTests) return

    const sessionsDir = path.join(testUserDataPath, "claude-sessions")

    // Create an old session directory
    const oldSessionDir = path.join(sessionsDir, "old-session-id")
    fs.mkdirSync(oldSessionDir, { recursive: true })
    fs.writeFileSync(path.join(oldSessionDir, "test.txt"), "test")

    // Set modification time to 48 hours ago
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000)
    fs.utimesSync(oldSessionDir, oldTime, oldTime)

    const config: SessionCleanupConfig = {
      maxAgeHours: 24,
      preserveDirectories: ["background-utility"],
    }

    const result = await cleanupSessionDirectories(config)

    expect(result.deleted).toBe(1)
    expect(fs.existsSync(oldSessionDir)).toBe(false)
  })

  it("should preserve directories newer than maxAgeHours", async () => {
    if (!canRunTests) return

    const sessionsDir = path.join(testUserDataPath, "claude-sessions")

    // Create a new session directory
    const newSessionDir = path.join(sessionsDir, "new-session-id")
    fs.mkdirSync(newSessionDir, { recursive: true })
    fs.writeFileSync(path.join(newSessionDir, "test.txt"), "test")

    // Set modification time to 1 hour ago (newer than 24h retention)
    const newTime = new Date(Date.now() - 1 * 60 * 60 * 1000)
    fs.utimesSync(newSessionDir, newTime, newTime)

    const config: SessionCleanupConfig = {
      maxAgeHours: 24,
      preserveDirectories: ["background-utility"],
    }

    const result = await cleanupSessionDirectories(config)

    expect(result.preserved).toBe(1)
    expect(result.deleted).toBe(0)
    expect(fs.existsSync(newSessionDir)).toBe(true)
  })

  it("should preview cleanup without deleting", async () => {
    if (!canRunTests) return

    const sessionsDir = path.join(testUserDataPath, "claude-sessions")

    // Create test directories
    const bgUtilDir = path.join(sessionsDir, "background-utility")
    const oldSessionDir = path.join(sessionsDir, "old-session")
    const newSessionDir = path.join(sessionsDir, "new-session")

    fs.mkdirSync(bgUtilDir, { recursive: true })
    fs.mkdirSync(oldSessionDir, { recursive: true })
    fs.mkdirSync(newSessionDir, { recursive: true })

    // Set times
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const newTime = new Date(Date.now() - 1 * 60 * 60 * 1000)

    fs.utimesSync(bgUtilDir, oldTime, oldTime)
    fs.utimesSync(oldSessionDir, oldTime, oldTime)
    fs.utimesSync(newSessionDir, newTime, newTime)

    const config: SessionCleanupConfig = {
      maxAgeHours: 24,
      preserveDirectories: ["background-utility"],
    }

    const preview = getSessionCleanupPreview(config)

    expect(preview.total).toBe(3)
    expect(preview.wouldDelete).toBeGreaterThanOrEqual(1) // old-session should be marked for deletion
    expect(preview.wouldPreserve).toBeGreaterThanOrEqual(2) // background-utility and new-session

    // Verify nothing was actually deleted
    expect(fs.existsSync(bgUtilDir)).toBe(true)
    expect(fs.existsSync(oldSessionDir)).toBe(true)
    expect(fs.existsSync(newSessionDir)).toBe(true)
  })

  it("should handle empty sessions directory", async () => {
    if (!canRunTests) return

    const sessionsDir = path.join(testUserDataPath, "claude-sessions")
    fs.mkdirSync(sessionsDir, { recursive: true })

    const result = await cleanupSessionDirectories()

    expect(result.deleted).toBe(0)
    expect(result.preserved).toBe(0)
    expect(result.errors).toBe(0)
  })

  it("should handle non-existent sessions directory", async () => {
    if (!canRunTests) return

    // Remove sessions directory
    const sessionsDir = path.join(testUserDataPath, "claude-sessions")
    if (fs.existsSync(sessionsDir)) {
      fs.rmSync(sessionsDir, { recursive: true, force: true })
    }

    const result = await cleanupSessionDirectories()

    expect(result.deleted).toBe(0)
    expect(result.preserved).toBe(0)
    expect(result.errors).toBe(0)
  })
})
