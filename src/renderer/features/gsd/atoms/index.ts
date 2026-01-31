import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// GSD NAVIGATION
// ============================================

/**
 * GSD category for main content routing
 * When set to "gsd", the main content area shows the GSD view
 */
export const selectedGsdCategoryAtom = atom<"gsd" | null>(null)

/**
 * Active tab within GSD view (deprecated - kept for backwards compatibility)
 * The GSD view now shows both documentation and planning files in a single view
 */
export type GsdActiveTab = "overview" | "plans"
export const activeGsdTabAtom = atomWithStorage<GsdActiveTab>(
  "gsd:activeTab",
  "overview",
  undefined,
  { getOnInit: true },
)

// ============================================
// PROJECT SELECTION
// ============================================

/**
 * Selected project ID for GSD view (persisted)
 * null means no project selected
 */
export const selectedGsdProjectIdAtom = atomWithStorage<string | null>(
  "gsd:selectedProjectId",
  null,
  undefined,
  { getOnInit: true },
)

/**
 * Selected branch per project (persisted)
 * Maps project ID to branch name
 */
export const selectedGsdBranchesAtom = atomWithStorage<Record<string, string>>(
  "gsd:selectedBranches",
  {},
  undefined,
  { getOnInit: true },
)

// ============================================
// DOCUMENT SELECTION
// ============================================

/**
 * Currently selected .planning document path (relative to .planning/)
 * e.g., "ROADMAP.md" or "phases/phase-1/PLAN.md"
 */
export const selectedPlanningDocAtom = atom<string | null>(null)

/**
 * Currently selected GSD documentation file path (relative to bundled GSD)
 * e.g., "README.md" or "agents/gsd-executor.md"
 */
export const selectedGsdDocAtom = atom<string | null>(null)

/**
 * Expanded folders in the file tree
 * Maps path to expanded state
 */
export const expandedGsdFoldersAtom = atom<Record<string, boolean>>({})

// ============================================
// UPDATE STATE
// ============================================

/**
 * GSD update availability state
 */
export interface GsdUpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl?: string
  releaseNotes?: string
}

export const gsdUpdateInfoAtom = atom<GsdUpdateInfo | null>(null)

/**
 * Whether an update download is in progress
 */
export const gsdUpdateInProgressAtom = atom<boolean>(false)

// ============================================
// SETTINGS
// ============================================

/**
 * GSD settings
 */
export interface GsdSettings {
  useBundledGsd: boolean
  autoCheckUpdates: boolean
}

export const gsdSettingsAtom = atom<GsdSettings>({
  useBundledGsd: true,
  autoCheckUpdates: true,
})
