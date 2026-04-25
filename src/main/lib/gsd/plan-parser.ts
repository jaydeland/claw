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
 * Parse YAML frontmatter from markdown content (standard `---` delimited)
 */
function parseFrontmatter(content: string): Record<string, any> {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return {}

  return parseYamlKeyValues(frontmatterMatch[1])
}

/**
 * Parse frontmatter from a YAML code block within the document
 * Handles format like:
 * ```yaml
 * wave: 1
 * autonomous: true
 * ```
 */
function parseFrontmatterFromCodeBlock(content: string): Record<string, any> {
  const codeBlockMatch = content.match(/```ya?ml\s*\n([\s\S]*?)\n```/)
  if (!codeBlockMatch) return {}

  return parseYamlKeyValues(codeBlockMatch[1])
}

/**
 * Parse simple YAML key: value pairs from a string
 */
function parseYamlKeyValues(yamlContent: string): Record<string, any> {
  const result: Record<string, any> = {}
  const lines = yamlContent.split("\n")

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
        value = value.slice(1, -1).split(",").map((v: string) => v.trim())
      }

      result[key] = value
    }
  }

  return result
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
 * Supports headings: "must_haves", "Must-Haves", "Goal-Backward Must-Haves"
 */
function parseMustHaves(content: string): string[] {
  const mustHaves: string[] = []

  // Look for must_haves section (multiple heading variants)
  const mustHavesMatch = content.match(/##\s*(?:goal-backward\s+)?must[_-]haves?\s*\n([\s\S]*?)(?=\n---|\n##|$)/i)
  if (mustHavesMatch) {
    const mustHavesContent = mustHavesMatch[1]
    const lines = mustHavesContent.split("\n")

    for (const line of lines) {
      // Match checkbox items: `- [ ] text` or `- [x] text`
      const checkboxMatch = line.match(/^[-*]\s*\[[ x]\]\s*(.+)/)
      if (checkboxMatch) {
        mustHaves.push(checkboxMatch[1].trim())
        continue
      }
      // Also match plain list items: `- text`
      const plainMatch = line.match(/^[-*]\s+(.+)/)
      if (plainMatch) {
        mustHaves.push(plainMatch[1].trim())
      }
    }
  }

  return mustHaves
}

/**
 * Normalize a phase number for comparison (strip leading zeros from each segment)
 * "01" → "1", "02.1" → "2.1", "1" → "1"
 */
function normalizePhaseNumber(num: string): string {
  return num.split(".").map(s => String(parseInt(s, 10))).join(".")
}

/**
 * Find phase directory in .planning/phases/
 * Handles both zero-padded ("01") and unpadded ("1") phase numbers
 */
async function findPhaseDirectory(projectPath: string, phaseNumber: string): Promise<string | null> {
  const phasesDir = path.join(projectPath, ".planning", "phases")
  const normalizedTarget = normalizePhaseNumber(phaseNumber)

  try {
    const entries = await fs.readdir(phasesDir, { withFileTypes: true })

    // Look for directories matching pattern: {number}-{name} or {number}.{number}-{name}
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      // Match phase numbers like "01", "02", "02.1"
      const match = entry.name.match(/^([\d.]+)/)
      if (match && normalizePhaseNumber(match[1]) === normalizedTarget) {
        return path.join(phasesDir, entry.name)
      }
    }
  } catch (err) {
    console.error(`Failed to find phase directory for phase ${phaseNumber}:`, err)
  }

  return null
}

/**
 * Parse all plan files for a given phase
 * Supports multiple naming conventions:
 *   - `*-PLAN.md` (e.g., `01-02-PLAN.md`)
 *   - `NN-name.md` (e.g., `01-cloud-models-ui.md`)
 *   - Any `.md` file in the phase directory
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

  // First try specific *-PLAN.md pattern
  let planFiles = await glob(`${phaseDir}/*-PLAN.md`)

  // If no *-PLAN.md files found, fall back to all .md files in the directory
  // (excluding VERIFICATION.md, RESEARCH.md-like files that aren't plans)
  if (planFiles.length === 0) {
    const allMdFiles = await glob(`${phaseDir}/*.md`)
    planFiles = allMdFiles.filter((f) => {
      const name = path.basename(f).toLowerCase()
      // Exclude known non-plan files
      if (name === "verification.md") return false
      // Include files that start with a number (plan convention) or contain "plan"
      return /^\d+/.test(name) || name.includes("plan")
    })
  }

  for (const planPath of planFiles) {
    try {
      const content = await fs.readFile(planPath, "utf-8")

      // Parse frontmatter (standard YAML or embedded in code block)
      let frontmatter = parseFrontmatter(content)
      if (Object.keys(frontmatter).length === 0) {
        frontmatter = parseFrontmatterFromCodeBlock(content)
      }

      // Extract plan number from filename
      const filename = path.basename(planPath)
      // Try: "01-02-PLAN.md" → "02", or "01-name.md" → "01", or "02-name.md" → "02"
      const planNumMatch = filename.match(/\d+-([\d.]+)-PLAN\.md/) || filename.match(/^([\d.]+)/)
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
