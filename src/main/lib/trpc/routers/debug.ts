import { router, publicProcedure } from "../index"
import { getDatabase, projects, chats, subChats } from "../../db"
import { app, shell } from "electron"
import { z } from "zod"
import {
  getBackgroundSessionState,
  initBackgroundSession,
  resetBackgroundSession,
  generateChatTitle,
  type BackgroundSessionState,
} from "../../claude/background-session"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

// Dev mode detection
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

// Get Claude Agent SDK version from package.json
function getClaudeAgentSdkVersion(): string {
  try {
    const packageJsonPath = join(process.cwd(), "package.json")
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
      return packageJson.dependencies?.["@anthropic-ai/claude-agent-sdk"] || "unknown"
    }
  } catch (error) {
    console.error("[Debug] Failed to read SDK version:", error)
  }
  return "unknown"
}

// Get Claude Code binary version from VERSION file
function getClaudeCodeBinaryVersion(): string {
  try {
    // In development, check directly in resources/bin
    // In production, the binary is in app.asar.unpacked/resources/bin
    const versionFilePath = join(process.resourcesPath || process.cwd(), "bin", "VERSION")
    if (existsSync(versionFilePath)) {
      const versionContent = readFileSync(versionFilePath, "utf-8")
      // VERSION file format: version\nISO date\n
      return versionContent.split("\n")[0]?.trim() || "unknown"
    }
  } catch (error) {
    console.error("[Debug] Failed to read binary version:", error)
  }
  return "unknown"
}

export const debugRouter = router({
  /**
   * Get system information for debug display
   */
  getSystemInfo: publicProcedure.query(() => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev: IS_DEV,
      userDataPath: app.getPath("userData"),
      claudeAgentSdkVersion: getClaudeAgentSdkVersion(),
      claudeCodeBinaryVersion: getClaudeCodeBinaryVersion(),
    }
  }),

  /**
   * Get database statistics
   */
  getDbStats: publicProcedure.query(() => {
    const db = getDatabase()
    const projectCount = db.select().from(projects).all().length
    const chatCount = db.select().from(chats).all().length
    const subChatCount = db.select().from(subChats).all().length

    return {
      projects: projectCount,
      chats: chatCount,
      subChats: subChatCount,
    }
  }),

  /**
   * Clear all chats and sub-chats (keeps projects)
   */
  clearChats: publicProcedure.mutation(() => {
    const db = getDatabase()
    // Delete sub_chats first (foreign key constraint)
    db.delete(subChats).run()
    db.delete(chats).run()
    console.log("[Debug] Cleared all chats and sub-chats")
    return { success: true }
  }),

  /**
   * Clear all data (projects, chats, sub-chats)
   */
  clearAllData: publicProcedure.mutation(() => {
    const db = getDatabase()
    // Delete in order due to foreign key constraints
    db.delete(subChats).run()
    db.delete(chats).run()
    db.delete(projects).run()
    console.log("[Debug] Cleared all database data")
    return { success: true }
  }),

  /**
   * Open userData folder in system file manager
   */
  openUserDataFolder: publicProcedure.mutation(() => {
    const userDataPath = app.getPath("userData")
    shell.openPath(userDataPath)
    console.log("[Debug] Opened userData folder:", userDataPath)
    return { success: true }
  }),

  /**
   * Get background session state
   */
  getBackgroundSessionState: publicProcedure.query((): BackgroundSessionState => {
    return getBackgroundSessionState()
  }),

  /**
   * Initialize background session (manually)
   */
  initBackgroundSession: publicProcedure.mutation(async () => {
    const state = await initBackgroundSession()
    return state
  }),

  /**
   * Reset background session
   */
  resetBackgroundSession: publicProcedure.mutation(async () => {
    await resetBackgroundSession()
    return { success: true }
  }),

  /**
   * Test title generation using background session
   */
  testTitleGeneration: publicProcedure
    .input(z.object({ message: z.string() }))
    .mutation(async ({ input }) => {
      const title = await generateChatTitle(input.message)
      return { title }
    }),
})
