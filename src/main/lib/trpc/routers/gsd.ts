import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import { app } from "electron"
import simpleGit from "simple-git"
import { getDatabase } from "../../db"
import { projects } from "../../db/schema"
import { eq } from "drizzle-orm"
import { parseRoadmap } from "../../gsd/roadmap-parser"
import matter from "gray-matter"
import yaml from "js-yaml"

// Custom YAML parser that's more forgiving with special characters
function parseYamlSafe(input: string): Record<string, any> {
  try {
    // Try standard parsing first
    return yaml.load(input, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, any>
  } catch (err) {
    // If that fails, try line-by-line parsing for simple key: value pairs
    const result: Record<string, any> = {}
    const lines = input.split('\n')
    let currentKey: string | null = null
    let currentValue = ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // Check if this is a key: value line
      const colonIndex = trimmed.indexOf(':')
      if (colonIndex > 0 && colonIndex < trimmed.length - 1) {
        // Save previous key-value if exists
        if (currentKey) {
          result[currentKey] = currentValue.trim()
        }

        // Start new key-value
        currentKey = trimmed.slice(0, colonIndex).trim()
        currentValue = trimmed.slice(colonIndex + 1).trim()
      } else if (currentKey && trimmed.startsWith('-')) {
        // Array item
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = []
        }
        (result[currentKey] as string[]).push(trimmed.slice(1).trim())
      } else if (currentKey) {
        // Continuation of previous value
        currentValue += ' ' + trimmed
      }
    }

    // Save last key-value
    if (currentKey) {
      result[currentKey] = currentValue.trim()
    }

    return result
  }
}

/**
 * Get the path to bundled GSD resources
 */
export function getBundledGsdPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "gsd")
  }

  // In dev mode, app.getAppPath() returns the project root
  // But electron-vite might compile to out/main/, so we need to handle both cases
  const appPath = app.getAppPath()
  const primaryPath = path.join(appPath, "resources", "gsd")

  // If primary path exists, use it
  // Otherwise, try navigating from the compiled output directory
  try {
    fsSync.accessSync(primaryPath)
    return primaryPath
  } catch {
    // Fallback: navigate from __dirname (out/main/) to project root
    const fallbackPath = path.join(__dirname, "..", "..", "resources", "gsd")
    return fallbackPath
  }
}

/**
 * Check if bundled GSD exists
 */
async function hasBundledGsd(): Promise<boolean> {
  try {
    const gsdPath = getBundledGsdPath()
    await fs.access(gsdPath)
    return true
  } catch {
    return false
  }
}

interface GsdCommand {
  name: string
  description: string
  path: string
  source: "bundled"
}

/**
 * Parse command .md frontmatter to extract name and description
 */
function parseGsdCommandMd(content: string): { name?: string; description?: string } {
  try {
    const { data } = matter(content, {
      engines: {
        yaml: { parse: parseYamlSafe }
      }
    })
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
    }
  } catch (err) {
    console.error("[gsd] Failed to parse frontmatter:", err)
    return {}
  }
}

/**
 * Recursively scan the bundled GSD commands directory
 */
async function scanBundledGsdCommands(): Promise<GsdCommand[]> {
  const commands: GsdCommand[] = []
  const gsdPath = getBundledGsdPath()
  const commandsDir = path.join(gsdPath, "commands")

  try {
    // Check if commands directory exists
    try {
      await fs.access(commandsDir)
    } catch (accessErr) {
      console.warn(`[gsd] Commands directory not found at: ${commandsDir}`)
      console.warn(`[gsd] getBundledGsdPath() returned: ${gsdPath}`)
      console.warn(`[gsd] app.getAppPath() returned: ${app.getAppPath()}`)
      console.warn(`[gsd] app.isPackaged: ${app.isPackaged}`)
      return commands
    }

    // Recursively scan for .md files
    async function scanDir(dir: string, prefix = ""): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        // Validate entry name for security
        if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
          continue
        }

        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Recursively scan nested directories
          const nestedPrefix = prefix ? `${prefix}:${entry.name}` : entry.name
          await scanDir(fullPath, nestedPrefix)
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          try {
            const content = await fs.readFile(fullPath, "utf-8")
            const parsed = parseGsdCommandMd(content)

            // Build command name from file path if not in frontmatter
            const baseName = entry.name.replace(/\.md$/, "")
            const derivedName = prefix ? `${prefix}:${baseName}` : baseName

            commands.push({
              name: parsed.name || derivedName,
              description: parsed.description || "",
              path: fullPath,
              source: "bundled",
            })
          } catch (err) {
            console.warn(`[gsd] Failed to read ${fullPath}:`, err)
          }
        }
      }
    }

    await scanDir(commandsDir)

    // Log success for debugging
    if (commands.length > 0) {
      console.log(`[gsd] Found ${commands.length} bundled GSD commands in ${commandsDir}`)
    } else {
      console.warn(`[gsd] No .md files found in ${commandsDir}`)
    }
  } catch (err) {
    console.error(`[gsd] Failed to scan commands directory:`, err)
  }

  return commands
}

/**
 * Read bundled GSD package.json
 */
async function getBundledPackageJson(): Promise<{ version: string; name: string } | null> {
  try {
    const packagePath = path.join(getBundledGsdPath(), "package.json")
    const content = await fs.readFile(packagePath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Recursively list files in a directory
 */
async function listFilesRecursive(
  dir: string,
  basePath: string = "",
  filter?: (name: string) => boolean
): Promise<Array<{ name: string; path: string; isDirectory: boolean }>> {
  const results: Array<{ name: string; path: string; isDirectory: boolean }> = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      // Skip hidden files and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue

      // Apply filter if provided
      if (filter && !filter(entry.name)) continue

      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

      results.push({
        name: entry.name,
        path: relativePath,
        isDirectory: entry.isDirectory(),
      })

      if (entry.isDirectory()) {
        const subEntries = await listFilesRecursive(
          path.join(dir, entry.name),
          relativePath,
          filter
        )
        results.push(...subEntries)
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return results
}

/**
 * GSD tRPC Router
 *
 * Provides access to:
 * - Bundled GSD documentation and version info
 * - Project .planning/ directory contents
 * - GSD update checking and downloading
 * - GSD settings management
 */
export const gsdRouter = router({
  // ============================================
  // Bundled GSD Procedures
  // ============================================

  /**
   * Get bundled GSD version info
   */
  getVersion: publicProcedure.query(async () => {
    const pkg = await getBundledPackageJson()
    const exists = await hasBundledGsd()

    return {
      exists,
      version: pkg?.version ?? null,
      name: pkg?.name ?? null,
    }
  }),

  /**
   * List all bundled GSD commands
   * These are commands from resources/gsd/commands/ directory
   */
  listCommands: publicProcedure.query(async () => {
    return scanBundledGsdCommands()
  }),

  /**
   * Read bundled GSD README.md
   */
  getOverview: publicProcedure.query(async () => {
    try {
      const readmePath = path.join(getBundledGsdPath(), "README.md")
      const content = await fs.readFile(readmePath, "utf-8")
      return { content }
    } catch (err) {
      return { content: null, error: "README.md not found in bundled GSD" }
    }
  }),

  /**
   * List all documentation files in bundled GSD
   */
  listGsdDocs: publicProcedure.query(async () => {
    const gsdPath = getBundledGsdPath()

    // Get all markdown files and key directories
    const allFiles = await listFilesRecursive(gsdPath)

    // Filter to relevant files
    const docs = allFiles.filter((f) => {
      if (f.isDirectory) {
        // Include key directories
        return ["agents", "commands", "get-shit-done", "scripts"].includes(f.name)
      }
      // Include markdown files at root
      return f.name.endsWith(".md")
    })

    return { files: docs }
  }),

  /**
   * Read a specific file from bundled GSD
   */
  readGsdDoc: publicProcedure
    .input(z.object({ filePath: z.string() }))
    .query(async ({ input }) => {
      // Security: prevent path traversal
      const normalizedPath = path.normalize(input.filePath)
      if (normalizedPath.includes("..") || path.isAbsolute(normalizedPath)) {
        return { content: null, error: "Invalid path" }
      }

      try {
        const fullPath = path.join(getBundledGsdPath(), normalizedPath)
        const content = await fs.readFile(fullPath, "utf-8")
        return { content }
      } catch {
        return { content: null, error: "File not found" }
      }
    }),

  // ============================================
  // Project .planning Procedures
  // ============================================

  /**
   * Check if a project has .planning/ directory
   */
  hasPlanningDocs: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      try {
        const planningPath = path.join(input.projectPath, ".planning")
        await fs.access(planningPath)

        // Check if it has any content
        const entries = await fs.readdir(planningPath)
        const hasContent = entries.length > 0

        return { exists: true, hasContent }
      } catch {
        return { exists: false, hasContent: false }
      }
    }),

  /**
   * List files in project's .planning/ directory
   */
  listPlanningDocs: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        branch: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const planningPath = path.join(input.projectPath, ".planning")

      try {
        const files = await listFilesRecursive(planningPath)
        return { files }
      } catch {
        return { files: [], error: ".planning directory not found" }
      }
    }),

  /**
   * Read a specific file from project's .planning/
   */
  readPlanningDoc: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        filePath: z.string(),
      })
    )
    .query(async ({ input }) => {
      // Security: prevent path traversal
      const normalizedPath = path.normalize(input.filePath)
      if (normalizedPath.includes("..") || path.isAbsolute(normalizedPath)) {
        return { content: null, error: "Invalid path" }
      }

      try {
        const fullPath = path.join(input.projectPath, ".planning", normalizedPath)
        const content = await fs.readFile(fullPath, "utf-8")
        return { content }
      } catch {
        return { content: null, error: "File not found" }
      }
    }),

  /**
   * Parse STATE.md to get current planning state
   */
  getPlanningState: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      try {
        const statePath = path.join(input.projectPath, ".planning", "STATE.md")
        const content = await fs.readFile(statePath, "utf-8")

        // Parse current phase section
        const phaseMatch = content.match(/\*\*Phase\s+(\d+)\*\*:\s*([^\n]+)/)
        const phaseNumber = phaseMatch?.[1] || null
        const phaseName = phaseMatch?.[2]?.trim() || null

        // Parse status
        const statusMatch = content.match(/Status:\s*([^\n]+)/i)
        const phaseStatus = statusMatch?.[1]?.trim() || "Unknown"

        // Parse blockers section
        const blockersSection = content.match(/##\s*Blockers[\s\S]*?(?=##|$)/i)
        const blockers: string[] = []
        if (blockersSection) {
          const blockerMatches = blockersSection[0].matchAll(/^-\s*(.+)$/gm)
          for (const match of blockerMatches) {
            const blocker = match[1].trim()
            if (blocker && blocker.toLowerCase() !== "none currently.") {
              blockers.push(blocker)
            }
          }
        }

        // Parse next actions section
        const actionsSection = content.match(/##\s*Next Actions[\s\S]*?(?=##|$)/i)
        const nextActions: string[] = []
        if (actionsSection) {
          const actionMatches = actionsSection[0].matchAll(/^\d+\.\s*(.+)$/gm)
          for (const match of actionMatches) {
            nextActions.push(match[1].trim())
          }
        }

        // Parse decisions made
        const decisionsSection = content.match(/##\s*Decisions Made[\s\S]*?(?=##|$)/i)
        const decisions: Array<{ decision: string; madeIn: string; status: string }> = []
        if (decisionsSection) {
          const decisionRows = decisionsSection[0].matchAll(/^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/gm)
          for (const match of decisionRows) {
            const decision = match[1].trim()
            if (decision && decision !== "Decision") {
              decisions.push({
                decision,
                madeIn: match[2].trim(),
                status: match[3].trim(),
              })
            }
          }
        }

        // Parse phase history
        const historySection = content.match(/##\s*Phase History[\s\S]*?(?=##|$)/i)
        const phaseHistory: Array<{ phase: string; started: string; completed: string; notes: string }> = []
        if (historySection) {
          const historyRows = historySection[0].matchAll(/^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/gm)
          for (const match of historyRows) {
            const phase = match[1].trim()
            if (phase && phase !== "Phase" && phase !== "-") {
              phaseHistory.push({
                phase,
                started: match[2].trim(),
                completed: match[3].trim(),
                notes: match[4].trim(),
              })
            }
          }
        }

        return {
          currentPhase: phaseNumber
            ? {
                number: phaseNumber,
                name: phaseName,
                status: phaseStatus,
              }
            : null,
          blockers,
          nextActions,
          decisions,
          phaseHistory,
        }
      } catch {
        return {
          currentPhase: null,
          blockers: [],
          nextActions: [],
          decisions: [],
          phaseHistory: [],
          error: "STATE.md not found",
        }
      }
    }),

  /**
   * Write a file to project's .planning/ directory
   */
  writePlanningDoc: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        filePath: z.string(), // relative to .planning/
        content: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Security: prevent path traversal
      const normalizedPath = path.normalize(input.filePath)
      if (normalizedPath.includes("..") || path.isAbsolute(normalizedPath)) {
        throw new Error("Invalid path")
      }

      try {
        const fullPath = path.join(input.projectPath, ".planning", normalizedPath)

        // Ensure parent directory exists
        const dirPath = path.dirname(fullPath)
        await fs.mkdir(dirPath, { recursive: true })

        // Write file
        await fs.writeFile(fullPath, input.content, "utf-8")

        return { success: true }
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : "Failed to write file"
        )
      }
    }),

  /**
   * Get git branches for a project
   */
  getBranches: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      try {
        const git = simpleGit(input.projectPath)

        // Check if it's a git repo
        const isRepo = await git.checkIsRepo()
        if (!isRepo) {
          return { branches: [], current: null, error: "Not a git repository" }
        }

        const branchSummary = await git.branchLocal()

        return {
          branches: branchSummary.all,
          current: branchSummary.current,
          error: null,
        }
      } catch (err) {
        return {
          branches: [],
          current: null,
          error: err instanceof Error ? err.message : "Failed to get branches",
        }
      }
    }),

  // ============================================
  // Update Procedures
  // ============================================

  /**
   * Check for GSD updates from GitHub
   */
  checkForUpdates: publicProcedure.query(async () => {
    const pkg = await getBundledPackageJson()
    const currentVersion = pkg?.version ?? "0.0.0"

    try {
      // Fetch latest release from GitHub
      const response = await fetch(
        "https://api.github.com/repos/glittercowboy/get-shit-done/releases/latest",
        {
          headers: {
            "User-Agent": "Claw-Desktop-App",
            Accept: "application/vnd.github.v3+json",
          },
        }
      )

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const release = await response.json()
      const latestVersion = release.tag_name?.replace(/^v/, "") ?? "0.0.0"

      // Simple version comparison (works for semver)
      const updateAvailable = latestVersion !== currentVersion &&
        latestVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0

      return {
        currentVersion,
        latestVersion,
        updateAvailable,
        releaseUrl: release.html_url,
        releaseNotes: release.body?.slice(0, 500), // First 500 chars
        publishedAt: release.published_at,
      }
    } catch (err) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        error: err instanceof Error ? err.message : "Failed to check for updates",
      }
    }
  }),

  /**
   * Download and install GSD update
   * Note: This updates resources/gsd/ which requires app restart
   */
  downloadUpdate: publicProcedure
    .input(z.object({ version: z.string() }))
    .mutation(async ({ input }) => {
      const gsdPath = getBundledGsdPath()

      try {
        // Fetch release info for the specific version
        const releaseUrl = `https://api.github.com/repos/glittercowboy/get-shit-done/releases/tags/v${input.version}`
        const response = await fetch(releaseUrl, {
          headers: {
            "User-Agent": "Claw-Desktop-App",
            Accept: "application/vnd.github.v3+json",
          },
        })

        if (!response.ok) {
          throw new Error(`Release not found: v${input.version}`)
        }

        const release = await response.json()
        const tarballUrl = release.tarball_url

        // Download tarball
        const tarballResponse = await fetch(tarballUrl, {
          headers: { "User-Agent": "Claw-Desktop-App" },
        })

        if (!tarballResponse.ok) {
          throw new Error("Failed to download release tarball")
        }

        // Save to temp location
        const tempDir = path.join(app.getPath("temp"), "gsd-update")
        const tarballPath = path.join(tempDir, "gsd.tar.gz")

        await fs.mkdir(tempDir, { recursive: true })

        const buffer = await tarballResponse.arrayBuffer()
        await fs.writeFile(tarballPath, Buffer.from(buffer))

        // Extract using tar command
        const { exec } = await import("child_process")
        const { promisify } = await import("util")
        const execAsync = promisify(exec)

        // Backup existing GSD
        const backupPath = `${gsdPath}.backup`
        try {
          await fs.rm(backupPath, { recursive: true, force: true })
          await fs.rename(gsdPath, backupPath)
        } catch {
          // No existing GSD to backup
        }

        // Create fresh GSD directory and extract
        await fs.mkdir(gsdPath, { recursive: true })
        await execAsync(`tar -xzf "${tarballPath}" -C "${gsdPath}" --strip-components=1`)

        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true })
        await fs.rm(backupPath, { recursive: true, force: true })

        return {
          success: true,
          message: `Updated to v${input.version}. Please restart the app.`,
          requiresRestart: true,
        }
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : "Update failed",
          requiresRestart: false,
        }
      }
    }),

  // ============================================
  // Settings Procedures
  // ============================================

  /**
   * Get GSD settings
   */
  getSettings: publicProcedure.query(async () => {
    // TODO: Read from database or electron-store
    // For now, return defaults
    return {
      useBundledGsd: true,
      autoCheckUpdates: true,
    }
  }),

  /**
   * Update GSD settings
   */
  updateSettings: publicProcedure
    .input(
      z.object({
        useBundledGsd: z.boolean().optional(),
        autoCheckUpdates: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // TODO: Save to database or electron-store
      return { success: true, settings: input }
    }),

  // ============================================
  // Batch GSD Status Procedures
  // ============================================

  /**
   * Get GSD status for multiple projects (for workspace selector)
   */
  getGsdStatusBatch: publicProcedure
    .input(z.object({ projectIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const results: Record<
        string,
        {
          hasPlanningDir: boolean
          phaseCount: number
          inProgressCount: number
        }
      > = {}

      for (const projectId of input.projectIds) {
        try {
          const project = db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .get()

          if (!project) continue

          const planningPath = path.join(project.path, ".planning")

          // Check if .planning directory exists
          try {
            await fs.access(planningPath)
          } catch {
            results[projectId] = {
              hasPlanningDir: false,
              phaseCount: 0,
              inProgressCount: 0,
            }
            continue
          }

          // Try to parse ROADMAP.md
          let phaseCount = 0
          let inProgressCount = 0

          try {
            const phases = await parseRoadmap(project.path)
            phaseCount = phases.length
            inProgressCount = phases.filter((p) => p.status === "in_progress").length
          } catch (err) {
            console.error(`Failed to parse ROADMAP.md for project ${projectId}:`, err)
          }

          results[projectId] = {
            hasPlanningDir: true,
            phaseCount,
            inProgressCount,
          }
        } catch (err) {
          console.error(`Error processing project ${projectId}:`, err)
          results[projectId] = {
            hasPlanningDir: false,
            phaseCount: 0,
            inProgressCount: 0,
          }
        }
      }

      return results
    }),
})
