import { existsSync, statSync, unlinkSync, readdirSync, rmSync } from "fs"
import { readFile, writeFile } from "fs/promises"
import { eq } from "drizzle-orm"
import { app } from "electron"
import * as path from "path"
import { getDatabase, backgroundTasks, subChats, chats } from "../db"

/**
 * Configuration for output file cleanup
 */
export interface CleanupConfig {
  /** Delete files older than this many days (default: 7) */
  maxAgeDays: number
  /** Truncate files larger than this (default: 50MB) */
  maxSizeBytes: number
}

/**
 * Configuration for session directory cleanup
 */
export interface SessionCleanupConfig {
  /** Delete session directories older than this many hours (default: 24) */
  maxAgeHours: number
  /** Directories to always preserve (default: ["background-utility"]) */
  preserveDirectories: string[]
}

const DEFAULT_CONFIG: CleanupConfig = {
  maxAgeDays: 7,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
}

const DEFAULT_SESSION_CONFIG: SessionCleanupConfig = {
  maxAgeHours: 24,
  preserveDirectories: ["background-utility"],
}

/**
 * Clean up old and large output files
 * - Deletes files older than maxAgeDays
 * - Truncates files larger than maxSizeBytes (keeps last 1MB)
 * - Removes orphaned task records
 */
export async function cleanupOldOutputFiles(
  config: CleanupConfig = DEFAULT_CONFIG
): Promise<{ deleted: number; truncated: number }> {
  const db = getDatabase()
  const tasks = db.select().from(backgroundTasks).all()

  let deleted = 0
  let truncated = 0
  const now = Date.now()
  const maxAge = config.maxAgeDays * 24 * 60 * 60 * 1000

  for (const task of tasks) {
    if (!task.outputFile) continue

    // Check if file exists
    if (!existsSync(task.outputFile)) {
      // Output file doesn't exist - remove orphaned record
      try {
        db.delete(backgroundTasks).where(eq(backgroundTasks.id, task.id)).run()
        deleted++
        console.log(`[Cleanup] Removed orphaned task record: ${task.id}`)
      } catch (err) {
        console.error(`[Cleanup] Failed to remove task record ${task.id}:`, err)
      }
      continue
    }

    try {
      const stat = statSync(task.outputFile)

      // Delete old files
      if (now - stat.mtimeMs > maxAge) {
        try {
          unlinkSync(task.outputFile)
          db.delete(backgroundTasks).where(eq(backgroundTasks.id, task.id)).run()
          deleted++
          console.log(`[Cleanup] Deleted old output file and task: ${task.id}`)
        } catch (err) {
          console.error(`[Cleanup] Failed to delete ${task.outputFile}:`, err)
        }
        continue
      }

      // Truncate large files (keep last 1MB)
      if (stat.size > config.maxSizeBytes) {
        try {
          await truncateFile(task.outputFile, 1024 * 1024)
          truncated++
          console.log(`[Cleanup] Truncated large file: ${task.outputFile}`)
        } catch (err) {
          console.error(`[Cleanup] Failed to truncate ${task.outputFile}:`, err)
        }
      }
    } catch (err) {
      console.error(`[Cleanup] Error processing ${task.outputFile}:`, err)
    }
  }

  return { deleted, truncated }
}

/**
 * Truncate a file, keeping only the last N bytes
 */
async function truncateFile(filePath: string, keepBytes: number): Promise<void> {
  const content = await readFile(filePath, "utf-8")
  if (content.length > keepBytes) {
    const truncated = "... (output truncated - showing last 1MB) ...\n" + content.slice(-keepBytes)
    await writeFile(filePath, truncated, "utf-8")
  }
}

/**
 * Clean up old Claude session directories
 *
 * Session directories are created per SubChat/Chat in:
 *   {userData}/claude-sessions/{subChatId|chatId}
 *
 * This function:
 * - Deletes session directories older than maxAgeHours
 * - Preserves "background-utility" (persistent session)
 * - Preserves sessions that are still associated with active SubChats
 * - Handles locked files gracefully
 *
 * @param config - Session cleanup configuration
 * @returns Number of directories deleted
 */
export async function cleanupSessionDirectories(
  config: SessionCleanupConfig = DEFAULT_SESSION_CONFIG
): Promise<{ deleted: number; preserved: number; errors: number }> {
  const sessionsDir = path.join(app.getPath("userData"), "claude-sessions")

  // Check if sessions directory exists
  if (!existsSync(sessionsDir)) {
    console.log("[Cleanup] Session directory does not exist, skipping")
    return { deleted: 0, preserved: 0, errors: 0 }
  }

  let deleted = 0
  let preserved = 0
  let errors = 0
  const now = Date.now()
  const maxAge = config.maxAgeHours * 60 * 60 * 1000

  try {
    // Get all session directories
    const entries = readdirSync(sessionsDir, { withFileTypes: true })
    const directories = entries.filter((e) => e.isDirectory()).map((e) => e.name)

    // Get active session IDs from database
    const activeSessionIds = getActiveSessionIds()

    for (const dirName of directories) {
      // Skip preserved directories (e.g., background-utility)
      if (config.preserveDirectories.includes(dirName)) {
        console.log(`[Cleanup] Preserving protected session: ${dirName}`)
        preserved++
        continue
      }

      const dirPath = path.join(sessionsDir, dirName)

      try {
        const stat = statSync(dirPath)
        const ageMs = now - stat.mtimeMs
        const ageHours = ageMs / (60 * 60 * 1000)

        // Check if session is still active in database
        if (activeSessionIds.has(dirName)) {
          console.log(`[Cleanup] Preserving active session: ${dirName} (updated recently)`)
          preserved++
          continue
        }

        // Delete if older than max age
        if (ageMs > maxAge) {
          try {
            rmSync(dirPath, { recursive: true, force: true })
            deleted++
            console.log(`[Cleanup] Deleted old session directory: ${dirName} (${ageHours.toFixed(1)}h old)`)
          } catch (deleteErr) {
            // Handle locked files (e.g., session still in use)
            const errMsg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr)
            if (errMsg.includes("EBUSY") || errMsg.includes("ENOTEMPTY")) {
              console.log(`[Cleanup] Session directory locked, skipping: ${dirName}`)
              preserved++
            } else {
              console.error(`[Cleanup] Failed to delete session ${dirName}:`, deleteErr)
              errors++
            }
          }
        } else {
          // Directory is not old enough yet
          preserved++
        }
      } catch (statErr) {
        console.error(`[Cleanup] Error checking session ${dirName}:`, statErr)
        errors++
      }
    }
  } catch (err) {
    console.error("[Cleanup] Error reading sessions directory:", err)
    errors++
  }

  return { deleted, preserved, errors }
}

/**
 * Get IDs of sessions that are still active in the database
 * Returns a Set containing both SubChat IDs and Chat IDs
 * (since sessions can use either depending on backend type)
 */
function getActiveSessionIds(): Set<string> {
  const activeIds = new Set<string>()

  try {
    const db = getDatabase()

    // Get all SubChat IDs (these are used as session directory names)
    const allSubChats = db.select({ id: subChats.id }).from(subChats).all()
    for (const sc of allSubChats) {
      activeIds.add(sc.id)
    }

    // Get all Chat IDs (used for Ollama sessions)
    const allChats = db.select({ id: chats.id }).from(chats).all()
    for (const c of allChats) {
      activeIds.add(c.id)
    }

  } catch (err) {
    console.error("[Cleanup] Error fetching active session IDs:", err)
  }

  return activeIds
}

/**
 * Timer for cleanup scheduler
 */
let cleanupTimer: NodeJS.Timeout | null = null

/**
 * Run all cleanup tasks
 * - Output file cleanup (old task output files)
 * - Session directory cleanup (old Claude session directories)
 */
async function runAllCleanupTasks(): Promise<void> {
  // Output file cleanup
  try {
    const outputResult = await cleanupOldOutputFiles()
    if (outputResult.deleted > 0 || outputResult.truncated > 0) {
      console.log(`[Cleanup] Output files: deleted=${outputResult.deleted}, truncated=${outputResult.truncated}`)
    }
  } catch (err) {
    console.error("[Cleanup] Output file cleanup failed:", err)
  }

  // Session directory cleanup
  try {
    const sessionResult = await cleanupSessionDirectories()
    if (sessionResult.deleted > 0 || sessionResult.errors > 0) {
      console.log(
        `[Cleanup] Session directories: deleted=${sessionResult.deleted}, preserved=${sessionResult.preserved}, errors=${sessionResult.errors}`
      )
    }
  } catch (err) {
    console.error("[Cleanup] Session directory cleanup failed:", err)
  }
}

/**
 * Start the cleanup scheduler (runs every hour)
 */
export function startCleanupScheduler(): void {
  if (cleanupTimer) {
    console.log("[Cleanup] Scheduler already running")
    return
  }

  console.log("[Cleanup] Starting scheduler (runs every hour)")

  // Run cleanup every hour
  cleanupTimer = setInterval(
    async () => {
      await runAllCleanupTasks()
    },
    60 * 60 * 1000 // 1 hour
  )

  // Run initial cleanup after 30 seconds (gives app time to fully initialize)
  setTimeout(async () => {
    console.log("[Cleanup] Running initial cleanup...")
    await runAllCleanupTasks()
  }, 30000)
}

/**
 * Stop the cleanup scheduler
 */
export function stopCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
    console.log("[Cleanup] Scheduler stopped")
  }
}

/**
 * Manually run all cleanup tasks (for testing or on-demand cleanup)
 * Returns combined results from all cleanup operations
 */
export async function runCleanupNow(): Promise<{
  outputFiles: { deleted: number; truncated: number }
  sessionDirs: { deleted: number; preserved: number; errors: number }
}> {
  console.log("[Cleanup] Manual cleanup triggered")

  const outputFiles = await cleanupOldOutputFiles()
  const sessionDirs = await cleanupSessionDirectories()

  console.log("[Cleanup] Manual cleanup complete:", { outputFiles, sessionDirs })

  return { outputFiles, sessionDirs }
}

/**
 * Get session cleanup statistics without actually deleting anything (dry run)
 * Useful for previewing what would be cleaned up
 */
export function getSessionCleanupPreview(
  config: SessionCleanupConfig = DEFAULT_SESSION_CONFIG
): {
  total: number
  wouldDelete: number
  wouldPreserve: number
  directories: Array<{ name: string; ageHours: number; action: "delete" | "preserve"; reason: string }>
} {
  const sessionsDir = path.join(app.getPath("userData"), "claude-sessions")

  if (!existsSync(sessionsDir)) {
    return { total: 0, wouldDelete: 0, wouldPreserve: 0, directories: [] }
  }

  const now = Date.now()
  const maxAge = config.maxAgeHours * 60 * 60 * 1000
  const activeSessionIds = getActiveSessionIds()
  const directories: Array<{ name: string; ageHours: number; action: "delete" | "preserve"; reason: string }> = []

  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true })
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name)

    for (const dirName of dirNames) {
      const dirPath = path.join(sessionsDir, dirName)
      let ageHours = 0
      let action: "delete" | "preserve" = "preserve"
      let reason = ""

      try {
        const stat = statSync(dirPath)
        const ageMs = now - stat.mtimeMs
        ageHours = ageMs / (60 * 60 * 1000)

        if (config.preserveDirectories.includes(dirName)) {
          action = "preserve"
          reason = "Protected directory"
        } else if (activeSessionIds.has(dirName)) {
          action = "preserve"
          reason = "Active in database"
        } else if (ageMs > maxAge) {
          action = "delete"
          reason = `Older than ${config.maxAgeHours}h`
        } else {
          action = "preserve"
          reason = "Not old enough"
        }
      } catch {
        action = "preserve"
        reason = "Could not read stats"
      }

      directories.push({ name: dirName, ageHours: Math.round(ageHours * 10) / 10, action, reason })
    }
  } catch (err) {
    console.error("[Cleanup] Error getting preview:", err)
  }

  return {
    total: directories.length,
    wouldDelete: directories.filter((d) => d.action === "delete").length,
    wouldPreserve: directories.filter((d) => d.action === "preserve").length,
    directories,
  }
}
