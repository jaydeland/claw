import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"

/**
 * Get directories to scan for skills
 */
function getScanLocations(type: string, cwd?: string) {
  const homeDir = os.homedir()
  const userDir = path.join(homeDir, ".claude", type)
  const projectDir = cwd ? path.join(cwd, ".claude", type) : null

  return { userDir, projectDir }
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
 */
async function scanSkillsDirectory(
  dir: string,
  source: "user" | "project" | "custom",
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

      const skillMdPath = path.join(dir, entry.name, "SKILL.md")

      try {
        await fs.access(skillMdPath)
        const content = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(content)

        skills.push({
          name: parsed.name || entry.name,
          description: parsed.description || "",
          source,
          path: skillMdPath,
        })
      } catch (err) {
        // Skill directory doesn't have SKILL.md or read failed - skip it
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

    // Scan directories in parallel
    const [userSkills, projectSkills] = await Promise.all([
      scanSkillsDirectory(locations.userDir, "user"),
      locations.projectDir
        ? scanSkillsDirectory(locations.projectDir, "project")
        : Promise.resolve<FileSkill[]>([]),
    ])

    // Return all skills, priority: project > user
    return [...projectSkills, ...userSkills]
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
