/**
 * Devyard scan helper utilities
 * Provides centralized logic for determining scan locations for agents, skills, and workflows
 * when Devyard authentication mode is active
 */
import path from "node:path"
import os from "node:os"
import { getDatabase, claudeCodeSettings } from "../../db"
import { eq } from "drizzle-orm"
import { getDevyardConfig } from "../../devyard-config"

export interface ScanLocations {
  userDir: string
  projectDir: string | null
  devyardDir: string | null
  hasDevyard: boolean
}

/**
 * Get scan locations for agents, skills, or commands.
 * Returns paths for all three sources: user, project, and devyard.
 *
 * @param subdirName - "agents", "skills", or "commands"
 * @param cwd - Current working directory for project scan (optional)
 * @returns Paths for user, project, and devyard sources
 */
export function getScanLocations(
  subdirName: string,
  cwd?: string
): ScanLocations {
  // User: ~/.claude/{subdirName}
  const userDir = path.join(os.homedir(), ".claude", subdirName)

  // Project: {cwd}/.claude/{subdirName}
  const projectDir = cwd ? path.join(cwd, ".claude", subdirName) : null

  // Devyard: Check if authMode is "devyard"
  let devyardDir: string | null = null

  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (settings?.authMode === "devyard") {
      const devyardConfig = getDevyardConfig()
      if (devyardConfig.enabled && devyardConfig.claudePluginDir) {
        devyardDir = path.join(devyardConfig.claudePluginDir, subdirName)
        console.log(
          `[devyard-scan] Devyard ${subdirName} directory: ${devyardDir}`
        )
      }
    }
  } catch (error) {
    console.error("[devyard-scan] Failed to get Devyard config:", error)
  }

  return {
    userDir,
    projectDir,
    devyardDir,
    hasDevyard: !!devyardDir,
  }
}

/**
 * Get config directory for workflow scanning.
 * Handles Devyard's /plugin/ subdirectory structure.
 *
 * @returns Base directory for workflows and whether it's a Devyard directory
 */
export function getWorkflowConfigDir(): { baseDir: string; isDevyard: boolean } {
  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    // Explicit customConfigDir takes precedence
    if (settings?.customConfigDir) {
      return { baseDir: settings.customConfigDir, isDevyard: false }
    }

    // Devyard mode: use plugin/ directory
    if (settings?.authMode === "devyard") {
      const config = getDevyardConfig()
      if (config.enabled && config.claudePluginDir) {
        console.log(
          `[devyard-scan] Using Devyard plugin directory: ${config.claudePluginDir}`
        )
        return { baseDir: config.claudePluginDir, isDevyard: true }
      }
    }
  } catch (error) {
    console.error("[devyard-scan] Failed to get workflow config dir:", error)
  }

  // Default: ~/.claude
  return { baseDir: path.join(os.homedir(), ".claude"), isDevyard: false }
}
