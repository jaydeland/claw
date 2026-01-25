import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { eq } from "drizzle-orm"
import { getDatabase, configSources } from "../../db"

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
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillMd(content: string): { name?: string; description?: string } {
  try {
    const { data } = matter(content)
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
})
