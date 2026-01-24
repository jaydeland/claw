import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, configSources } from "../../db"
import { eq, and } from "drizzle-orm"
import { getDevyardConfig } from "../../devyard-config"
import type { McpConfigFile } from "../../../lib/config/types"
import { getConsolidatedConfig as getConsolidatedConfigFromModule } from "../../config/consolidator"

// ============ TYPES ============

export interface McpConfigFileWithMetadata {
  id: string // ID from database (for custom sources) or source type (project/devyard/user)
  type: "project" | "devyard" | "user" | "custom"
  path: string
  priority: number
  enabled: boolean
  serverCount: number
  exists: boolean
  error?: string
}

export interface PluginDirectoryWithMetadata {
  id: string
  path: string
  priority: number
  enabled: boolean
  skillCount: number
  agentCount: number
  commandCount: number
  exists: boolean
  error?: string
}

export interface ValidationResult {
  valid: boolean
  error?: string
  metadata?: {
    serverCount?: number
    skillCount?: number
    agentCount?: number
    commandCount?: number
  }
}

// ============ HELPER FUNCTIONS ============

/**
 * Get built-in MCP config paths (project, devyard, user)
 * These are always present, even if files don't exist
 */
function getBuiltInMcpPaths(projectPath?: string): McpConfigFileWithMetadata[] {
  const paths: McpConfigFileWithMetadata[] = []

  // Project path (priority 10)
  if (projectPath) {
    paths.push({
      id: "project",
      type: "project",
      path: path.join(projectPath, ".1code", "mcp.json"),
      priority: 10,
      enabled: true,
      serverCount: 0,
      exists: false,
    })
  }

  // Devyard path (priority 20)
  const devyardConfig = getDevyardConfig()
  if (devyardConfig.enabled && devyardConfig.claudeConfigDir) {
    paths.push({
      id: "devyard",
      type: "devyard",
      path: path.join(devyardConfig.claudeConfigDir, "mcp.json"),
      priority: 20,
      enabled: true,
      serverCount: 0,
      exists: false,
    })
  }

  // User path (priority 100)
  paths.push({
    id: "user",
    type: "user",
    path: path.join(os.homedir(), ".claude", "mcp.json"),
    priority: 100,
    enabled: true,
    serverCount: 0,
    exists: false,
  })

  return paths
}

/**
 * Check if a file exists and is readable
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Validate and parse an MCP config file
 */
async function validateMcpConfig(filePath: string): Promise<ValidationResult> {
  try {
    // Check if file exists
    const exists = await fileExists(filePath)
    if (!exists) {
      return { valid: false, error: "File does not exist" }
    }

    // Try to read and parse JSON
    const content = await fs.readFile(filePath, "utf-8")
    const config = JSON.parse(content) as McpConfigFile

    // Count servers
    const serverCount = config.mcpServers ? Object.keys(config.mcpServers).length : 0

    return {
      valid: true,
      metadata: { serverCount },
    }
  } catch (error) {
    if ((error as Error).message.includes("JSON")) {
      return { valid: false, error: "Invalid JSON format" }
    }
    return { valid: false, error: (error as Error).message }
  }
}

/**
 * Validate a plugin directory
 */
async function validatePluginDirectory(dirPath: string): Promise<ValidationResult> {
  try {
    // Check if directory exists
    const stats = await fs.stat(dirPath)
    if (!stats.isDirectory()) {
      return { valid: false, error: "Path is not a directory" }
    }

    // Count skills, agents, commands
    let skillCount = 0
    let agentCount = 0
    let commandCount = 0

    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirName = entry.name.toLowerCase()
        if (dirName === "skills" || dirName === "skill") {
          const skillFiles = await fs.readdir(path.join(dirPath, entry.name))
          skillCount = skillFiles.filter((f) => f.endsWith(".md")).length
        } else if (dirName === "agents" || dirName === "agent") {
          const agentFiles = await fs.readdir(path.join(dirPath, entry.name))
          agentCount = agentFiles.filter((f) => f.endsWith(".md")).length
        } else if (dirName === "commands" || dirName === "command") {
          const commandFiles = await fs.readdir(path.join(dirPath, entry.name))
          commandCount = commandFiles.filter((f) => f.endsWith(".md")).length
        }
      }
    }

    return {
      valid: true,
      metadata: { skillCount, agentCount, commandCount },
    }
  } catch (error) {
    return { valid: false, error: (error as Error).message }
  }
}

/**
 * Load metadata for an MCP config file
 */
async function loadMcpMetadata(
  fileInfo: McpConfigFileWithMetadata
): Promise<McpConfigFileWithMetadata> {
  const validation = await validateMcpConfig(fileInfo.path)
  return {
    ...fileInfo,
    exists: validation.valid,
    serverCount: validation.metadata?.serverCount ?? 0,
    error: validation.error,
  }
}

/**
 * Load metadata for a plugin directory
 */
async function loadPluginMetadata(
  dirInfo: PluginDirectoryWithMetadata
): Promise<PluginDirectoryWithMetadata> {
  const validation = await validatePluginDirectory(dirInfo.path)
  return {
    ...dirInfo,
    exists: validation.valid,
    skillCount: validation.metadata?.skillCount ?? 0,
    agentCount: validation.metadata?.agentCount ?? 0,
    commandCount: validation.metadata?.commandCount ?? 0,
    error: validation.error,
  }
}

// ============ ROUTER ============

export const configManagementRouter = router({
  /**
   * Get consolidated config (merged view of all MCP configs)
   */
  getConsolidatedConfig: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }))
    .query(async ({ input }) => {
      return await getConsolidatedConfigFromModule(input.projectPath)
    }),

  /**
   * List all MCP config files (built-in + custom)
   */
  listMcpConfigFiles: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }))
    .query(async ({ input }) => {
      // Get built-in paths
      const builtInPaths = getBuiltInMcpPaths(input.projectPath)

      // Load metadata for built-in paths
      const builtInWithMetadata = await Promise.all(
        builtInPaths.map((p) => loadMcpMetadata(p))
      )

      // Get custom paths from database
      const db = getDatabase()
      const customSources = db
        .select()
        .from(configSources)
        .where(eq(configSources.type, "mcp"))
        .orderBy(configSources.priority)
        .all()

      // Load metadata for custom sources
      const customWithMetadata = await Promise.all(
        customSources.map(async (source) => {
          const fileInfo: McpConfigFileWithMetadata = {
            id: source.id,
            type: "custom",
            path: source.path,
            priority: source.priority,
            enabled: source.enabled,
            serverCount: 0,
            exists: false,
          }
          return loadMcpMetadata(fileInfo)
        })
      )

      // Combine and sort by priority
      const allConfigs = [...builtInWithMetadata, ...customWithMetadata].sort(
        (a, b) => a.priority - b.priority
      )

      return { configs: allConfigs }
    }),

  /**
   * List all plugin directories
   */
  listPluginDirectories: publicProcedure.query(async () => {
    const db = getDatabase()
    const sources = db
      .select()
      .from(configSources)
      .where(eq(configSources.type, "plugin"))
      .orderBy(configSources.priority)
      .all()

    // Load metadata for each directory
    const directoriesWithMetadata = await Promise.all(
      sources.map(async (source) => {
        const dirInfo: PluginDirectoryWithMetadata = {
          id: source.id,
          path: source.path,
          priority: source.priority,
          enabled: source.enabled,
          skillCount: 0,
          agentCount: 0,
          commandCount: 0,
          exists: false,
        }
        return loadPluginMetadata(dirInfo)
      })
    )

    return { directories: directoriesWithMetadata }
  }),

  /**
   * Add a custom MCP config path
   */
  addMcpConfigPath: publicProcedure
    .input(
      z.object({
        path: z.string(),
        priority: z.number().optional().default(50),
      })
    )
    .mutation(async ({ input }) => {
      // Validate the path
      const validation = await validateMcpConfig(input.path)
      if (!validation.valid) {
        throw new Error(`Invalid MCP config file: ${validation.error}`)
      }

      const db = getDatabase()

      // Check if path already exists
      const existing = db
        .select()
        .from(configSources)
        .where(
          and(eq(configSources.type, "mcp"), eq(configSources.path, input.path))
        )
        .get()

      if (existing) {
        throw new Error("This config file is already added")
      }

      // Insert new source
      const [newSource] = db
        .insert(configSources)
        .values({
          type: "mcp",
          path: input.path,
          priority: input.priority,
          enabled: true,
        })
        .returning()
        .all()

      return { success: true, id: newSource!.id }
    }),

  /**
   * Remove a custom MCP config path
   */
  removeMcpConfigPath: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Verify it's a custom source (not built-in)
      const source = db
        .select()
        .from(configSources)
        .where(and(eq(configSources.id, input.id), eq(configSources.type, "mcp")))
        .get()

      if (!source) {
        throw new Error("Config source not found")
      }

      // Delete from database
      db.delete(configSources).where(eq(configSources.id, input.id)).run()

      return { success: true }
    }),

  /**
   * Add a custom plugin directory
   */
  addPluginDirectory: publicProcedure
    .input(
      z.object({
        path: z.string(),
        priority: z.number().optional().default(50),
      })
    )
    .mutation(async ({ input }) => {
      // Validate the directory
      const validation = await validatePluginDirectory(input.path)
      if (!validation.valid) {
        throw new Error(`Invalid plugin directory: ${validation.error}`)
      }

      const db = getDatabase()

      // Check if path already exists
      const existing = db
        .select()
        .from(configSources)
        .where(
          and(eq(configSources.type, "plugin"), eq(configSources.path, input.path))
        )
        .get()

      if (existing) {
        throw new Error("This plugin directory is already added")
      }

      // Insert new source
      const [newSource] = db
        .insert(configSources)
        .values({
          type: "plugin",
          path: input.path,
          priority: input.priority,
          enabled: true,
        })
        .returning()
        .all()

      return { success: true, id: newSource!.id }
    }),

  /**
   * Remove a custom plugin directory
   */
  removePluginDirectory: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Verify it's a plugin source
      const source = db
        .select()
        .from(configSources)
        .where(and(eq(configSources.id, input.id), eq(configSources.type, "plugin")))
        .get()

      if (!source) {
        throw new Error("Plugin directory not found")
      }

      // Delete from database
      db.delete(configSources).where(eq(configSources.id, input.id)).run()

      return { success: true }
    }),

  /**
   * Validate a path before adding
   */
  validatePath: publicProcedure
    .input(
      z.object({
        path: z.string(),
        type: z.enum(["mcp", "plugin"]),
      })
    )
    .query(async ({ input }) => {
      if (input.type === "mcp") {
        return validateMcpConfig(input.path)
      } else {
        return validatePluginDirectory(input.path)
      }
    }),

  /**
   * Toggle enabled/disabled status for a custom config source
   */
  toggleSource: publicProcedure
    .input(
      z.object({
        id: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Update enabled status
      db.update(configSources)
        .set({ enabled: input.enabled })
        .where(eq(configSources.id, input.id))
        .run()

      return { success: true }
    }),

  /**
   * Update priority for a custom config source
   */
  updatePriority: publicProcedure
    .input(
      z.object({
        id: z.string(),
        priority: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Update priority
      db.update(configSources)
        .set({ priority: input.priority })
        .where(eq(configSources.id, input.id))
        .run()

      return { success: true }
    }),
})
