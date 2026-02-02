import * as fs from "fs/promises"
import * as path from "path"

/**
 * Represents a parsed GSD phase from ROADMAP.md
 */
export interface GsdPhase {
  phaseNumber: string      // "01", "02", "02.1"
  phaseName: string
  description: string
  status: "not_started" | "in_progress" | "complete" | "deferred"
  goal: string
  successCriteria: string[]
  dependsOn: string | null // "Phase 1", "Phase 2.1", etc.
  requirements: string[]   // ["REQ-01", "REQ-02"]
  plansList: string[]      // ["01-01: Description", "01-02: Description"]
}

/**
 * Parse ROADMAP.md to extract phase information
 * @param projectPath - Root path of the project
 * @returns Array of parsed phases
 */
export async function parseRoadmap(projectPath: string): Promise<GsdPhase[]> {
  const roadmapPath = path.join(projectPath, ".planning", "ROADMAP.md")
  const content = await fs.readFile(roadmapPath, "utf-8")

  const phases: GsdPhase[] = []

  // Parse phase list section (overview with checkboxes)
  const phaseListRegex = /^-\s*\[([ x])\]\s*\*\*Phase\s+([\d.]+):\s*([^\*]+)\*\*\s*-\s*(.+)$/gim
  const phaseMatches = Array.from(content.matchAll(phaseListRegex))

  // Parse progress table for status
  const progressTableRegex = /^\|\s*([\d.]+)\.\s*([^|]+)\|\s*\d+\/\d+\s*\|\s*([^|]+)\|/gim
  const progressMatches = Array.from(content.matchAll(progressTableRegex))
  const statusMap = new Map<string, string>()

  for (const match of progressMatches) {
    const phaseNum = match[1].trim()
    const status = match[3].trim().toLowerCase()
    statusMap.set(phaseNum, status)
  }

  // Parse each phase details section
  for (const match of phaseMatches) {
    const checkbox = match[1]
    const phaseNumber = match[2]
    const phaseName = match[3].trim()
    const description = match[4].trim()

    // Find the detailed section for this phase
    const phaseDetailRegex = new RegExp(
      `###\\s+Phase\\s+${phaseNumber.replace(".", "\\.")}:\\s*${phaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s\\S]*?)(?=###|$)`,
      "i"
    )
    const detailMatch = content.match(phaseDetailRegex)
    const detailSection = detailMatch?.[1] || ""

    // Extract goal
    const goalMatch = detailSection.match(/\*\*Goal\*\*:\s*(.+)/i)
    const goal = goalMatch?.[1]?.trim() || ""

    // Extract depends on
    const dependsOnMatch = detailSection.match(/\*\*Depends on\*\*:\s*(.+)/i)
    const dependsOn = dependsOnMatch?.[1]?.trim() || null

    // Extract requirements
    const requirementsMatch = detailSection.match(/\*\*Requirements\*\*:\s*\[([^\]]+)\]/i)
    const requirements = requirementsMatch
      ? requirementsMatch[1].split(",").map(r => r.trim())
      : []

    // Extract success criteria (numbered list after "Success Criteria")
    const successCriteriaMatch = detailSection.match(/\*\*Success Criteria\*\*[^:]*:\s*\n((?:\s*\d+\.\s*.+\n?)+)/i)
    const successCriteria: string[] = []
    if (successCriteriaMatch) {
      const criteriaLines = successCriteriaMatch[1].split("\n")
      for (const line of criteriaLines) {
        const criteriaMatch = line.match(/^\s*\d+\.\s*(.+)$/)
        if (criteriaMatch) {
          successCriteria.push(criteriaMatch[1].trim())
        }
      }
    }

    // Extract plans list
    const plansListRegex = /-\s*\[([ x])\]\s*([\d.-]+):\s*(.+)/gi
    const planMatches = Array.from(detailSection.matchAll(plansListRegex))
    const plansList = planMatches.map(m => `${m[2].trim()}: ${m[3].trim()}`)

    // Determine status
    let status: GsdPhase["status"] = "not_started"
    const tableStatus = statusMap.get(phaseNumber)

    if (tableStatus) {
      if (tableStatus.includes("in progress")) {
        status = "in_progress"
      } else if (tableStatus.includes("complete")) {
        status = "complete"
      } else if (tableStatus.includes("deferred")) {
        status = "deferred"
      }
    } else if (checkbox === "x") {
      status = "complete"
    }

    phases.push({
      phaseNumber,
      phaseName,
      description,
      status,
      goal,
      successCriteria,
      dependsOn: dependsOn === "Nothing" || !dependsOn ? null : dependsOn,
      requirements,
      plansList,
    })
  }

  return phases
}
