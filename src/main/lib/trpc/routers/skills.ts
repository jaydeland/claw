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

/**
 * Get directories to scan for skills (built-in locations)
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

interface FileSkill {
  name: string
  description: string
  source: "user" | "project" | "custom"
  path: string
  type: "skill" | "command"
}

interface FileCommand {
  name: string
  description: string
  argumentHint?: string
  source: "user" | "project" | "custom"
  path: string
  type: "skill" | "command"
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillMd(content: string): { name?: string; description?: string } {
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
    console.error("[skills] Failed to parse frontmatter:", err)
    return {}
  }
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
    console.error("[skills] Failed to parse command frontmatter:", err)
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
 * Scan a directory for SKILL.md files
 * Supports nested directory structures (e.g., skills/namespace/skill-name/SKILL.md)
 * @param namePrefix - Namespace prefix for nested skills (e.g., "gsd" for gsd:skill-name)
 */
async function scanSkillsDirectory(
  dir: string,
  source: "user" | "project" | "custom",
  namePrefix = "",
): Promise<FileSkill[]> {
  const skills: FileSkill[] = []

  try {
    // Check if directory exists
    try {
      await fs.access(dir)
    } catch {
      return skills
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      // Validate entry name for security (prevent path traversal)
      if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
        console.warn(`[skills] Skipping invalid directory name: ${entry.name}`)
        continue
      }

      const entryPath = path.join(dir, entry.name)
      const skillMdPath = path.join(entryPath, "SKILL.md")

      // Build the skill name with namespace prefix
      const skillName = namePrefix
        ? `${namePrefix}:${entry.name}`
        : entry.name

      try {
        await fs.access(skillMdPath)
        // SKILL.md exists - this is a skill directory
        const content = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(content)

        skills.push({
          name: parsed.name || skillName,  // Use frontmatter name or derived name
          description: parsed.description || "",
          source,
          path: skillMdPath,
          type: "skill",
        })
      } catch {
        // No SKILL.md in this directory - check if it's a namespace directory
        // Recurse to find nested skills
        const nestedSkills = await scanSkillsDirectory(
          entryPath,
          source,
          skillName,  // Pass current name as prefix for nested skills
        )
        skills.push(...nestedSkills)
      }
    }
  } catch (err) {
    console.error(`[skills] Failed to scan directory ${dir}:`, err)
  }

  return skills
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
        console.warn(`[skills] Skipping invalid entry name: ${entry.name}`)
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
            type: "command",
          })
        } catch (err) {
          console.warn(`[skills] Failed to read ${fullPath}:`, err)
        }
      }
    }
  } catch (err) {
    console.error(`[skills] Failed to scan commands directory ${dir}:`, err)
  }

  return commands
}

// Shared procedure for listing skills
const listSkillsProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const locations = getScanLocations("skills", input?.cwd)

    // Get custom plugin directories from database
    const customDirs = getCustomPluginDirectories()

    // Scan all directories in parallel
    const scanPromises: Promise<FileSkill[]>[] = []

    // Project skills (highest priority)
    if (locations.projectDir) {
      scanPromises.push(scanSkillsDirectory(locations.projectDir, "project"))
    }

    // User skills
    scanPromises.push(scanSkillsDirectory(locations.userDir, "user"))

    // Custom plugin directories (scan skills/ subdirectory)
    for (const customDir of customDirs) {
      const skillsDir = path.join(customDir.path, "skills")
      scanPromises.push(scanSkillsDirectory(skillsDir, "custom"))
    }

    const results = await Promise.all(scanPromises)

    // Flatten results and deduplicate by name (first source wins)
    const seenNames = new Set<string>()
    const skills: FileSkill[] = []

    for (const skillList of results) {
      for (const skill of skillList) {
        if (!seenNames.has(skill.name)) {
          seenNames.add(skill.name)
          skills.push(skill)
        }
      }
    }

    return skills
  })

// Combined procedure for listing both skills and commands
const listCombinedProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const skillLocations = getScanLocations("skills", input?.cwd)
    const customDirs = getCustomPluginDirectories()

    // Scan skills directories
    const skillPromises: Promise<FileSkill[]>[] = []

    if (skillLocations.projectDir) {
      skillPromises.push(scanSkillsDirectory(skillLocations.projectDir, "project"))
    }
    skillPromises.push(scanSkillsDirectory(skillLocations.userDir, "user"))
    for (const customDir of customDirs) {
      const skillsDir = path.join(customDir.path, "skills")
      skillPromises.push(scanSkillsDirectory(skillsDir, "custom"))
    }

    // Scan commands directories
    const homeDir = os.homedir()
    const userCommandsDir = path.join(homeDir, ".claude", "commands")
    const projectCommandsDir = input?.cwd
      ? path.join(input.cwd, ".claude", "commands")
      : null

    const commandPromises: Promise<FileCommand[]>[] = []

    if (projectCommandsDir) {
      commandPromises.push(scanCommandsDirectory(projectCommandsDir, "project"))
    }
    commandPromises.push(scanCommandsDirectory(userCommandsDir, "user"))
    for (const customDir of customDirs) {
      const commandsDir = path.join(customDir.path, "commands")
      commandPromises.push(scanCommandsDirectory(commandsDir, "custom"))
    }

    // Wait for all scans to complete
    const [skillResults, commandResults] = await Promise.all([
      Promise.all(skillPromises),
      Promise.all(commandPromises),
    ])

    // Combine and deduplicate (skills take precedence over commands with same name)
    const seenNames = new Set<string>()
    const combined: FileSkill[] = []

    // Add skills first (higher priority)
    for (const skillList of skillResults) {
      for (const skill of skillList) {
        if (!seenNames.has(skill.name)) {
          seenNames.add(skill.name)
          combined.push(skill)
        }
      }
    }

    // Add commands (skip if name already exists from skills)
    for (const commandList of commandResults) {
      for (const command of commandList) {
        if (!seenNames.has(command.name)) {
          seenNames.add(command.name)
          combined.push(command as FileSkill)
        }
      }
    }

    return combined
  })

export const skillsRouter = router({
  /**
   * List all skills from filesystem
   * - User skills: ~/.claude/skills/
   * - Project skills: .claude/skills/ (relative to cwd)
   */
  list: listSkillsProcedure,

  /**
   * Alias for list - used by @ mention
   */
  listEnabled: listSkillsProcedure,

  /**
   * List both skills and commands combined
   * Skills take precedence over commands with the same name
   */
  listCombined: listCombinedProcedure,
})
