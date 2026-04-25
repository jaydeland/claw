import { router, publicProcedure } from "../index"
import { getDatabase, projects, chats, subChats, claudeCodeCredentials } from "../../db"
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

// Offline simulation state (in-memory)
let offlineSimulationEnabled = false

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

// Get Claude Code binary version and path
function getClaudeCodeBinaryInfo(): { version: string; path: string } {
  try {
    // In development, check resources/bin/VERSION relative to project root
    // In production, the binary is in app.asar.unpacked/resources/bin
    let versionFilePath: string
    let binaryPath: string

    if (IS_DEV) {
      // Development: resources/bin/VERSION relative to project root
      const binDir = join(process.cwd(), "resources", "bin")
      versionFilePath = join(binDir, "VERSION")
      // Determine binary path based on platform
      const platformDir = `${process.platform}-${process.arch}`
      binaryPath = join(binDir, platformDir, "claude")
      console.log("[Debug] DEV mode - Version file path:", versionFilePath)
      console.log("[Debug] DEV mode - Binary path:", binaryPath)
    } else {
      // Production: use process.resourcesPath
      const binDir = join(process.resourcesPath, "bin")
      versionFilePath = join(binDir, "VERSION")
      const platformDir = `${process.platform}-${process.arch}`
      binaryPath = join(binDir, platformDir, "claude")
      console.log("[Debug] PROD mode - Version file path:", versionFilePath)
      console.log("[Debug] PROD mode - Binary path:", binaryPath)
    }

    let version = "unknown"
    if (existsSync(versionFilePath)) {
      const versionContent = readFileSync(versionFilePath, "utf-8")
      // VERSION file format: version\nISO date\n
      version = versionContent.split("\n")[0]?.trim() || "unknown"
      console.log("[Debug] Found version:", version)
    } else {
      console.log("[Debug] VERSION file not found at:", versionFilePath)
    }

    // Verify binary exists
    if (!existsSync(binaryPath)) {
      console.log("[Debug] Binary not found at:", binaryPath)
      binaryPath = "not found"
    } else {
      console.log("[Debug] Binary found at:", binaryPath)
    }

    return { version, path: binaryPath }
  } catch (error) {
    console.error("[Debug] Failed to read binary info:", error)
    return { version: "unknown", path: "error" }
  }
}

export const debugRouter = router({
  /**
   * Get system information for debug display
   */
  getSystemInfo: publicProcedure.query(async () => {
    const binaryInfo = getClaudeCodeBinaryInfo()

    // Check if protocol is registered
    let protocolRegistered = false
    try {
      // Check if the app is set as default protocol handler
      if (app.isDefaultProtocolClient) {
        protocolRegistered = app.isDefaultProtocolClient("claw") || false
      }
    } catch (error) {
      console.error("[Debug] Failed to check protocol registration:", error)
    }

    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev: IS_DEV,
      userDataPath: app.getPath("userData"),
      claudeAgentSdkVersion: getClaudeAgentSdkVersion(),
      claudeCodeBinaryVersion: binaryInfo.version,
      claudeCodeBinaryPath: binaryInfo.path,
      protocolRegistered,
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

  /**
   * Get offline simulation state
   */
  getOfflineSimulation: publicProcedure.query(() => {
    return { enabled: offlineSimulationEnabled }
  }),

  /**
   * Set offline simulation state
   */
  setOfflineSimulation: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      offlineSimulationEnabled = input.enabled
      return { enabled: offlineSimulationEnabled }
    }),

  /**
   * Logout - clear credentials and reset session
   */
  logout: publicProcedure.mutation(() => {
    try {
      const db = getDatabase()
      // Clear credentials
      db.delete(claudeCodeCredentials).run()
      console.log("[Debug] Cleared credentials and logged out")
      return { success: true }
    } catch (error) {
      console.error("[Debug] Logout failed:", error)
      return { success: false, error: String(error) }
    }
  }),
})
