/**
 * GSD status type
 */
export type GsdStatus = "not_started" | "in_progress" | "complete" | "deferred"

/**
 * Conductor status type
 */
export type ConductorStatus = "to_do" | "in_progress" | "review" | "done" | "blocked"

/**
 * Map GSD phase status to Conductor job status
 *
 * Enhanced workflow mapping:
 * - not_started → to_do
 * - in_progress → in_progress
 * - complete (not verified) → review
 * - complete (verified) → done
 * - deferred → blocked
 *
 * @param gsdStatus - GSD phase status from ROADMAP.md
 * @param isVerified - Whether the phase has been verified complete
 * @returns Conductor job status
 */
export function mapGsdToConductor(
  gsdStatus: GsdStatus,
  isVerified: boolean = false
): ConductorStatus {
  switch (gsdStatus) {
    case "not_started":
      return "to_do"
    case "in_progress":
      return "in_progress"
    case "complete":
      // Use review state for unverified completion
      return isVerified ? "done" : "review"
    case "deferred":
      return "blocked"
    default:
      console.warn(`Unknown GSD status: ${gsdStatus}, defaulting to to_do`)
      return "to_do"
  }
}

/**
 * Map Conductor job status to GSD phase status
 *
 * Note: This is used when syncing back to GSD
 *
 * @param conductorStatus - Conductor job status
 * @returns GSD status to write to ROADMAP.md
 */
export function mapConductorToGsd(conductorStatus: ConductorStatus): GsdStatus {
  switch (conductorStatus) {
    case "to_do":
      return "not_started"
    case "in_progress":
      return "in_progress"
    case "review":
      // Review means complete but not verified
      return "complete"
    case "done":
      // Done means complete and verified
      return "complete"
    case "blocked":
      return "deferred"
    default:
      console.warn(`Unknown Conductor status: ${conductorStatus}, defaulting to not_started`)
      return "not_started"
  }
}
