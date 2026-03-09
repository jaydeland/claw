import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import yaml from "js-yaml"
import { eq } from "drizzle-orm"
import { getDatabase, configSources } from "../../db"

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

export interface FileCommand {
  name: string
  description: string
  argumentHint?: string
  source: "user" | "project" | "custom"
  path: string
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

/**
 * Parse command .md frontmatter to extract description and argument-hint
 */
function parseCommandMd(content: string): {
  description?: string
  argumentHint?: string
} {
  try {
    const { data } = matter(content, {
      engines: {
        yaml: { parse: parseYamlSafe }
      }
    })
    return {
      description:
        typeof data.description === "string" ? data.description : undefined,
      argumentHint:
        typeof data["argument-hint"] === "string"
          ? data["argument-hint"]
          : undefined,
    }
  } catch (err) {
    console.error("[commands] Failed to parse frontmatter:", err)
    return {}
  }
}

/**
 * Validate entry name for security (prevent path traversal)
 */
function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

/**
 * Recursively scan a directory for .md command files
 * Supports namespaces via nested folders: git/commit.md → git:commit
 */
async function scanCommandsDirectory(
  dir: string,
  source: "user" | "project" | "custom",
  prefix = "",
): Promise<FileCommand[]> {
  const commands: FileCommand[] = []

  try {
    // Check if directory exists
    try {
      await fs.access(dir)
    } catch {
      return commands
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!isValidEntryName(entry.name)) {
        console.warn(`[commands] Skipping invalid entry name: ${entry.name}`)
        continue
      }

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan nested directories
        const nestedCommands = await scanCommandsDirectory(
          fullPath,
          source,
          prefix ? `${prefix}:${entry.name}` : entry.name,
        )
        commands.push(...nestedCommands)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.md$/, "")
        const commandName = prefix ? `${prefix}:${baseName}` : baseName

        try {
          const content = await fs.readFile(fullPath, "utf-8")
          const parsed = parseCommandMd(content)

          commands.push({
            name: commandName,
            description: parsed.description || "",
            argumentHint: parsed.argumentHint,
            source,
            path: fullPath,
          })
        } catch (err) {
          console.warn(`[commands] Failed to read ${fullPath}:`, err)
        }
      }
    }
  } catch (err) {
    console.error(`[commands] Failed to scan directory ${dir}:`, err)
  }

  return commands
}

export const commandsRouter = router({
  /**
   * List all commands from filesystem
   * - User commands: ~/.claude/commands/
   * - Project commands: .claude/commands/ (relative to projectPath)
   * - Custom commands: from plugin directories in database
   */
  list: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const userCommandsDir = path.join(os.homedir(), ".claude", "commands")

      // Get custom plugin directories from database
      const customDirs = getCustomPluginDirectories()

      // Scan all directories in parallel
      const scanPromises: Promise<FileCommand[]>[] = []

      // Project commands (highest priority)
      if (input?.projectPath) {
        const projectCommandsDir = path.join(
          input.projectPath,
          ".claude",
          "commands",
        )
        scanPromises.push(scanCommandsDirectory(projectCommandsDir, "project"))
      }

      // User commands
      scanPromises.push(scanCommandsDirectory(userCommandsDir, "user"))

      // Custom plugin directories (scan commands/ subdirectory)
      for (const customDir of customDirs) {
        const commandsDir = path.join(customDir.path, "commands")
        scanPromises.push(scanCommandsDirectory(commandsDir, "custom"))
      }

      const results = await Promise.all(scanPromises)

      // Flatten results and deduplicate by name (first source wins)
      const seenNames = new Set<string>()
      const commands: FileCommand[] = []

      for (const commandList of results) {
        for (const command of commandList) {
          if (!seenNames.has(command.name)) {
            seenNames.add(command.name)
            commands.push(command)
          }
        }
      }

      return commands
    }),

  /**
   * Get content of a specific command file (without frontmatter)
   */
  getContent: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      // Security: prevent path traversal
      if (input.path.includes("..")) {
        throw new Error("Invalid path")
      }

      try {
        const content = await fs.readFile(input.path, "utf-8")
        const { content: body } = matter(content, {
          engines: {
            yaml: { parse: parseYamlSafe }
          }
        })
        return { content: body.trim() }
      } catch (err) {
        console.error(`[commands] Failed to read command content:`, err)
        return { content: "" }
      }
    }),
})
