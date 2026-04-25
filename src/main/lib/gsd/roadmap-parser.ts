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
 * Supports two formats:
 *   1. Checkbox list: `- [ ] **Phase 01: Name** - Description`
 *   2. Heading-based: `## Phase 1: Name` with detail sections
 * @param projectPath - Root path of the project
 * @returns Array of parsed phases
 */
export async function parseRoadmap(projectPath: string): Promise<GsdPhase[]> {
  const roadmapPath = path.join(projectPath, ".planning", "ROADMAP.md")
  const content = await fs.readFile(roadmapPath, "utf-8")

  // Try checkbox format first, fall back to heading-based format
  const phases = parseCheckboxFormat(content)
  if (phases.length > 0) return phases

  return parseHeadingFormat(content)
}

/**
 * Parse checkbox-based phase list format:
 * `- [ ] **Phase 01: Name** - Description`
 */
function parseCheckboxFormat(content: string): GsdPhase[] {
  const phases: GsdPhase[] = []

  const phaseListRegex = /^-\s*\[([ x])\]\s*\*\*Phase\s+([\d.]+):\s*([^\*]+)\*\*\s*-\s*(.+)$/gim
  const phaseMatches = Array.from(content.matchAll(phaseListRegex))

  if (phaseMatches.length === 0) return phases

  // Parse progress table for status
  const progressTableRegex = /^\|\s*([\d.]+)\.\s*([^|]+)\|\s*\d+\/\d+\s*\|\s*([^|]+)\|/gim
  const progressMatches = Array.from(content.matchAll(progressTableRegex))
  const statusMap = new Map<string, string>()

  for (const match of progressMatches) {
    const phaseNum = match[1].trim()
    const status = match[3].trim().toLowerCase()
    statusMap.set(phaseNum, status)
  }

  for (const match of phaseMatches) {
    const checkbox = match[1]
    const phaseNumber = match[2]
    const phaseName = match[3].trim()
    const description = match[4].trim()

    const detailSection = extractDetailSection(content, phaseNumber, phaseName, "###")
    const parsed = parsePhaseDetailSection(detailSection)

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
      goal: parsed.goal,
      successCriteria: parsed.successCriteria,
      dependsOn: parsed.dependsOn,
      requirements: parsed.requirements,
      plansList: parsed.plansList,
    })
  }

  return phases
}

/**
 * Parse heading-based phase format:
 * `## Phase 1: Name`
 * with **Goal**, **Requirements**, **Success Criteria**, **Dependencies** fields
 */
function parseHeadingFormat(content: string): GsdPhase[] {
  const phases: GsdPhase[] = []

  // Match ## Phase N: Name or ## Phase N.N: Name
  const headingRegex = /^##\s+Phase\s+([\d.]+):\s*(.+)$/gim
  const headingMatches = Array.from(content.matchAll(headingRegex))

  if (headingMatches.length === 0) return phases

  // Build a status map from "State Tracking" section or similar
  const statusMap = buildStatusMapFromContent(content)

  for (const match of headingMatches) {
    const phaseNumber = match[1]
    const phaseName = match[2].trim()

    const detailSection = extractDetailSection(content, phaseNumber, phaseName, "##")
    const parsed = parsePhaseDetailSection(detailSection)

    // Determine status from state tracking section
    let status: GsdPhase["status"] = "not_started"
    const trackedStatus = statusMap.get(phaseNumber)
    if (trackedStatus) {
      status = trackedStatus
    }

    phases.push({
      phaseNumber,
      phaseName,
      description: parsed.goal || phaseName,
      status,
      goal: parsed.goal,
      successCriteria: parsed.successCriteria,
      dependsOn: parsed.dependsOn,
      requirements: parsed.requirements,
      plansList: parsed.plansList,
    })
  }

  return phases
}

/**
 * Extract the detail section for a phase between its heading and the next same-level heading
 */
function extractDetailSection(content: string, phaseNumber: string, phaseName: string, headingLevel: string): string {
  const escapedName = phaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedNumber = phaseNumber.replace(".", "\\.")

  // Match this phase's heading and capture content until the next same-level heading or end
  const phaseDetailRegex = new RegExp(
    `${headingLevel}\\s+Phase\\s+${escapedNumber}:\\s*${escapedName}([\\s\\S]*?)(?=\\n${headingLevel}\\s|$)`,
    "i"
  )
  const detailMatch = content.match(phaseDetailRegex)
  return detailMatch?.[1] || ""
}

/**
 * Parse common fields from a phase detail section
 */
function parsePhaseDetailSection(detailSection: string): {
  goal: string
  successCriteria: string[]
  dependsOn: string | null
  requirements: string[]
  plansList: string[]
} {
  // Extract goal
  const goalMatch = detailSection.match(/\*\*Goal\*\*:\s*(.+)/i)
  const goal = goalMatch?.[1]?.trim() || ""

  // Extract depends on (handles both "Depends on" and "Dependencies")
  const dependsOnMatch = detailSection.match(/\*\*(?:Depends on|Dependencies)\*\*:\s*(.+)/i)
  let dependsOn = dependsOnMatch?.[1]?.trim() || null
  if (dependsOn && (dependsOn.toLowerCase() === "nothing" || dependsOn.toLowerCase() === "none")) {
    dependsOn = null
  }

  // Extract requirements (handles both bracketed and comma-separated)
  const requirementsMatch = detailSection.match(/\*\*Requirements\*\*:\s*\[?([^\]\n]+)\]?/i)
  const requirements = requirementsMatch
    ? requirementsMatch[1].split(",").map(r => r.trim()).filter(Boolean)
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

  // Extract plans list (checkbox format)
  const plansListRegex = /-\s*\[([ x])\]\s*([\d.-]+):\s*(.+)/gi
  const planMatches = Array.from(detailSection.matchAll(plansListRegex))
  const plansList = planMatches.map(m => `${m[2].trim()}: ${m[3].trim()}`)

  return { goal, successCriteria, dependsOn, requirements, plansList }
}

/**
 * Build a phase status map from State Tracking or similar sections in the ROADMAP.md
 */
function buildStatusMapFromContent(content: string): Map<string, GsdPhase["status"]> {
  const statusMap = new Map<string, GsdPhase["status"]>()

  // Look for "Current Phase" references
  const currentPhaseMatch = content.match(/(?:current\s+phase|in\s+progress)[:\s]*(?:phase\s+)?([\d.]+)/i)
  if (currentPhaseMatch) {
    statusMap.set(currentPhaseMatch[1], "in_progress")
  }

  // Look for "Current Phase" as a list item: `- Phase 1: Name`
  const currentPhaseSection = content.match(/###?\s*Current Phase[\s\S]*?(?=###|$)/i)
  if (currentPhaseSection) {
    const phaseRefMatches = currentPhaseSection[0].matchAll(/Phase\s+([\d.]+)/gi)
    for (const m of phaseRefMatches) {
      // Don't overwrite if we already set it from the header match
      if (!statusMap.has(m[1])) {
        statusMap.set(m[1], "in_progress")
      }
    }
  }

  // Look for "Completed Phases" section
  const completedSection = content.match(/###?\s*Completed Phases[\s\S]*?(?=###|$)/i)
  if (completedSection) {
    const completedMatches = completedSection[0].matchAll(/Phase\s+([\d.]+)/gi)
    for (const m of completedMatches) {
      statusMap.set(m[1], "complete")
    }
    // Check if it says "(None)" meaning no phases are completed
    if (completedSection[0].match(/\(none\)/i)) {
      // No completed phases, don't add anything
    }
  }

  // Look for progress table format: | N | Name | X/Y | Status |
  const progressTableRegex = /^\|\s*([\d.]+)\s*\|[^|]*\|[^|]*\|\s*([^|]+)\|/gim
  const progressMatches = Array.from(content.matchAll(progressTableRegex))
  for (const match of progressMatches) {
    const phaseNum = match[1].trim()
    const status = match[2].trim().toLowerCase()
    if (status.includes("in progress") || status.includes("in_progress")) {
      statusMap.set(phaseNum, "in_progress")
    } else if (status.includes("complete")) {
      statusMap.set(phaseNum, "complete")
    } else if (status.includes("deferred")) {
      statusMap.set(phaseNum, "deferred")
    }
  }

  return statusMap
}
