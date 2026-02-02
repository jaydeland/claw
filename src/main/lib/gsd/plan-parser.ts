import * as fs from "fs/promises"
import * as path from "path"
import { glob } from "glob"

/**
 * Represents a parsed task from a PLAN.md file
 */
export interface GsdTask {
  taskId: string           // From <task id="..."> or generated from index
  title: string            // From <name> element
  description: string      // Full task content
  type?: string            // From type attribute (auto, checkpoint, etc.)
}

/**
 * Represents a parsed PLAN.md file
 */
export interface GsdPlan {
  planNumber: string       // "01", "02", etc.
  phaseNumber: string      // Parent phase
  planPath: string         // Full file path
  wave: number             // From frontmatter
  autonomous: boolean      // From frontmatter
  tasks: GsdTask[]         // Parsed tasks
  mustHaves: string[]      // Verification criteria
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): Record<string, any> {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return {}

  const frontmatter: Record<string, any> = {}
  const lines = frontmatterMatch[1].split("\n")

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/)
    if (match) {
      const key = match[1]
      let value: any = match[2].trim()

      // Parse booleans
      if (value === "true") value = true
      else if (value === "false") value = false
      // Parse numbers
      else if (/^\d+$/.test(value)) value = parseInt(value, 10)
      // Parse arrays
      else if (value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1).split(",").map(v => v.trim())
      }

      frontmatter[key] = value
    }
  }

  return frontmatter
}

/**
 * Parse tasks from PLAN.md content
 */
function parseTasks(content: string): GsdTask[] {
  const tasks: GsdTask[] = []

  // Match task XML blocks
  const taskRegex = /<task[^>]*>([\s\S]*?)<\/task>/g
  const taskMatches = Array.from(content.matchAll(taskRegex))

  for (let i = 0; i < taskMatches.length; i++) {
    const taskMatch = taskMatches[i]
    const taskContent = taskMatch[1]
    const taskTag = taskMatch[0]

    // Extract task ID from attributes if present
    const idMatch = taskTag.match(/id=["']([^"']+)["']/)
    const typeMatch = taskTag.match(/type=["']([^"']+)["']/)

    const taskId = idMatch?.[1] || `task-${i + 1}`
    const taskType = typeMatch?.[1]

    // Extract task name
    const nameMatch = taskContent.match(/<name>([\s\S]*?)<\/name>/)
    const title = nameMatch?.[1]?.trim() || `Task ${i + 1}`

    tasks.push({
      taskId,
      title,
      description: taskContent.trim(),
      type: taskType,
    })
  }

  return tasks
}

/**
 * Parse must_haves section from PLAN.md content
 */
function parseMustHaves(content: string): string[] {
  const mustHaves: string[] = []

  // Look for must_haves section
  const mustHavesMatch = content.match(/##\s*must_haves\s*\n([\s\S]*?)(?=\n##|$)/i)
  if (mustHavesMatch) {
    const mustHavesContent = mustHavesMatch[1]
    const lines = mustHavesContent.split("\n")

    for (const line of lines) {
      const itemMatch = line.match(/^[-*]\s*\[[ x]\]\s*(.+)/)
      if (itemMatch) {
        mustHaves.push(itemMatch[1].trim())
      }
    }
  }

  return mustHaves
}

/**
 * Find phase directory in .planning/phases/
 */
async function findPhaseDirectory(projectPath: string, phaseNumber: string): Promise<string | null> {
  const phasesDir = path.join(projectPath, ".planning", "phases")

  try {
    const entries = await fs.readdir(phasesDir, { withFileTypes: true })

    // Look for directories matching pattern: {number}-{name} or {number}.{number}-{name}
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      // Match phase numbers like "01", "02", "02.1"
      const match = entry.name.match(/^([\d.]+)/)
      if (match && match[1] === phaseNumber) {
        return path.join(phasesDir, entry.name)
      }
    }
  } catch (err) {
    console.error(`Failed to find phase directory for phase ${phaseNumber}:`, err)
  }

  return null
}

/**
 * Parse all PLAN.md files for a given phase
 * @param projectPath - Root path of the project
 * @param phaseNumber - Phase number (e.g., "01", "02.1")
 * @returns Array of parsed plan files
 */
export async function parsePhasePlans(
  projectPath: string,
  phaseNumber: string
): Promise<GsdPlan[]> {
  const plans: GsdPlan[] = []

  // Find phase directory
  const phaseDir = await findPhaseDirectory(projectPath, phaseNumber)
  if (!phaseDir) {
    return plans
  }

  // Find all PLAN.md files
  const planFiles = await glob(`${phaseDir}/*-PLAN.md`)

  for (const planPath of planFiles) {
    try {
      const content = await fs.readFile(planPath, "utf-8")

      // Parse frontmatter
      const frontmatter = parseFrontmatter(content)

      // Extract plan number from filename (e.g., "01-02-PLAN.md" → "02")
      const filename = path.basename(planPath)
      const planNumMatch = filename.match(/\d+-([\d.]+)-PLAN\.md/)
      const planNumber = planNumMatch?.[1] || "01"

      // Parse tasks
      const tasks = parseTasks(content)

      // Parse must_haves
      const mustHaves = parseMustHaves(content)

      plans.push({
        planNumber,
        phaseNumber,
        planPath,
        wave: frontmatter.wave || 1,
        autonomous: frontmatter.autonomous || false,
        tasks,
        mustHaves,
      })
    } catch (err) {
      console.error(`Failed to parse plan file ${planPath}:`, err)
    }
  }

  return plans
}
