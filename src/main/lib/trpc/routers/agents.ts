import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { eq } from "drizzle-orm"
import { getDatabase, configSources } from "../../db"
import {
  parseAgentMd,
  generateAgentMd,
  scanAgentsDirectory,
  VALID_AGENT_MODELS,
  type FileAgent,
} from "./agent-utils"

/**
 * Get directories to scan for agents (built-in locations)
 */
function getScanLocations(type: string, cwd?: string) {
  const homeDir = os.homedir()
  const userDir = path.join(homeDir, ".claude", type)
  const projectDir = cwd ? path.join(cwd, ".claude", type) : null

  return { userDir, projectDir }
}

/**
 * Get custom plugin directories from database
 * These directories contain agents/, skills/, commands/ subdirectories
 */
function getCustomPluginDirectories(): Array<{ path: string; priority: number }> {
  const db = getDatabase()
  const sources = db
    .select()
    .from(configSources)
    .where(eq(configSources.type, "plugin"))
    .orderBy(configSources.priority)
    .all()
    .filter((s) => s.enabled)

  return sources.map((s) => ({ path: s.path, priority: s.priority }))
}

// Shared procedure for listing agents
const listAgentsProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const locations = getScanLocations("agents", input?.cwd)

    // Get custom plugin directories from database
    const customDirs = getCustomPluginDirectories()

    // Scan all directories in parallel
    const scanPromises: Promise<FileAgent[]>[] = []

    // Project agents (highest priority)
    if (locations.projectDir && input?.cwd) {
      scanPromises.push(scanAgentsDirectory(locations.projectDir, "project", input.cwd))
    }

    // User agents
    scanPromises.push(scanAgentsDirectory(locations.userDir, "user"))

    // Custom plugin directories (scan agents/ subdirectory)
    for (const customDir of customDirs) {
      const agentsDir = path.join(customDir.path, "agents")
      scanPromises.push(scanAgentsDirectory(agentsDir, "custom"))
    }

    const results = await Promise.all(scanPromises)

    // Flatten results and deduplicate by name (first source wins)
    const seenNames = new Set<string>()
    const agents: FileAgent[] = []

    for (const agentList of results) {
      for (const agent of agentList) {
        if (!seenNames.has(agent.name)) {
          seenNames.add(agent.name)
          agents.push(agent)
        }
      }
    }

    return agents
  })

export const agentsRouter = router({
  /**
   * List all agents from filesystem
   * - User agents: ~/.claude/agents/
   * - Project agents: .claude/agents/ (relative to cwd)
   */
  list: listAgentsProcedure,

  /**
   * Alias for list - used by @ mention
   */
  listEnabled: listAgentsProcedure,

  /**
   * Get single agent by name
   */
  get: publicProcedure
    .input(z.object({ name: z.string(), cwd: z.string().optional() }))
    .query(async ({ input }) => {
      const scanLocs = getScanLocations("agents", input.cwd)

      const locations = [
        { dir: scanLocs.userDir, source: "user" as const },
        ...(scanLocs.projectDir ? [{ dir: scanLocs.projectDir, source: "project" as const }] : []),
      ]

      for (const { dir, source } of locations) {
        const agentPath = path.join(dir, `${input.name}.md`)
        try {
          const content = await fs.readFile(agentPath, "utf-8")
          const parsed = parseAgentMd(content, `${input.name}.md`)
          return {
            ...parsed,
            source,
            path: agentPath,
          }
        } catch {
          continue
        }
      }
      return null
    }),

  /**
   * Create a new agent
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        prompt: z.string(),
        tools: z.array(z.string()).optional(),
        disallowedTools: z.array(z.string()).optional(),
        model: z.enum(VALID_AGENT_MODELS).optional(),
        source: z.enum(["user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Validate name (kebab-case, no special chars)
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      if (!safeName || safeName.includes("..")) {
        throw new Error("Invalid agent name")
      }

      // Determine target directory
      let targetDir: string
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project agents")
        }
        targetDir = path.join(input.cwd, ".claude", "agents")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "agents")
      }

      // Ensure directory exists
      await fs.mkdir(targetDir, { recursive: true })

      const agentPath = path.join(targetDir, `${safeName}.md`)

      // Check if already exists
      try {
        await fs.access(agentPath)
        throw new Error(`Agent "${safeName}" already exists`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err
        }
      }

      // Generate and write file
      const content = generateAgentMd({
        name: safeName,
        description: input.description,
        prompt: input.prompt,
        tools: input.tools,
        disallowedTools: input.disallowedTools,
        model: input.model,
      })

      await fs.writeFile(agentPath, content, "utf-8")

      return {
        name: safeName,
        path: agentPath,
        source: input.source,
      }
    }),

  /**
   * Update an existing agent
   */
  update: publicProcedure
    .input(
      z.object({
        originalName: z.string(),
        name: z.string(),
        description: z.string(),
        prompt: z.string(),
        tools: z.array(z.string()).optional(),
        disallowedTools: z.array(z.string()).optional(),
        model: z.enum(VALID_AGENT_MODELS).optional(),
        source: z.enum(["user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Validate names
      const safeOriginalName = input.originalName.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      if (!safeOriginalName || !safeName || safeName.includes("..")) {
        throw new Error("Invalid agent name")
      }

      // Determine target directory
      let targetDir: string
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project agents")
        }
        targetDir = path.join(input.cwd, ".claude", "agents")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "agents")
      }

      const originalPath = path.join(targetDir, `${safeOriginalName}.md`)
      const newPath = path.join(targetDir, `${safeName}.md`)

      // Check original exists
      try {
        await fs.access(originalPath)
      } catch {
        throw new Error(`Agent "${safeOriginalName}" not found`)
      }

      // If renaming, check new name doesn't exist
      if (safeOriginalName !== safeName) {
        try {
          await fs.access(newPath)
          throw new Error(`Agent "${safeName}" already exists`)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            throw err
          }
        }
      }

      // Generate and write file
      const content = generateAgentMd({
        name: safeName,
        description: input.description,
        prompt: input.prompt,
        tools: input.tools,
        disallowedTools: input.disallowedTools,
        model: input.model,
      })

      // Delete old file if renaming
      if (safeOriginalName !== safeName) {
        await fs.unlink(originalPath)
      }

      await fs.writeFile(newPath, content, "utf-8")

      return {
        name: safeName,
        path: newPath,
        source: input.source,
      }
    }),

  /**
   * Delete an agent
   */
  delete: publicProcedure
    .input(
      z.object({
        name: z.string(),
        source: z.enum(["user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      if (!safeName || safeName.includes("..")) {
        throw new Error("Invalid agent name")
      }

      let targetDir: string
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project agents")
        }
        targetDir = path.join(input.cwd, ".claude", "agents")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "agents")
      }

      const agentPath = path.join(targetDir, `${safeName}.md`)

      await fs.unlink(agentPath)

      return { deleted: true }
    }),

  /**
   * Read the content of an agent file
   * Used by the agent detail view to show raw markdown content
   */
  readFileContent: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const homeDir = os.homedir()
      const claudeDir = path.join(homeDir, ".claude")

      // Security: resolve both paths and ensure target is within allowed directories
      const resolvedTarget = path.resolve(input.path)
      const resolvedClaudeDir = path.resolve(claudeDir)

      // Check if path is within ~/.claude/ or is a valid project .claude path
      const isInClaudeDir = resolvedTarget.startsWith(resolvedClaudeDir)
      const isInProjectClaudeDir = resolvedTarget.includes(`${path.sep}.claude${path.sep}agents${path.sep}`)

      if (!isInClaudeDir && !isInProjectClaudeDir) {
        throw new Error("Access denied: path is outside allowed directories")
      }

      // Path traversal check
      if (input.path.includes("..")) {
        throw new Error("Access denied: path traversal detected")
      }

      // Check if path is a file (not a directory)
      try {
        const stats = await fs.stat(resolvedTarget)
        if (!stats.isFile()) {
          throw new Error("Path is not a file")
        }
      } catch (err) {
        throw new Error(`File not found: ${input.path}`)
      }

      // Read and return file content
      return await fs.readFile(resolvedTarget, "utf-8")
    }),
})
