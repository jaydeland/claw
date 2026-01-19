/**
 * State management for workflow content view
 * These atoms control the category selection, file list, and detail panel views
 */
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// WORKFLOW CATEGORY SELECTION
// ============================================

/**
 * Selected workflow category
 * null = show normal chat interface
 * non-null = show workflow file browser
 */
export const selectedWorkflowCategoryAtom = atom<
  "agents" | "commands" | "skills" | null
>(null)

// ============================================
// FILE LIST SIDEBAR
// ============================================

/**
 * Width of the file list sidebar in pixels
 * Persisted to localStorage as "workflows:file-list-width"
 */
export const workflowFileListWidthAtom = atomWithStorage<number>(
  "workflows:file-list-width",
  280,
  undefined,
  { getOnInit: true }
)

/**
 * Search query for filtering file list
 * Filters by name or description
 */
export const workflowFileListSearchAtom = atom<string>("")

// ============================================
// DETAIL PANEL VIEW MODE
// ============================================

/**
 * Storage for view modes per category
 * Persisted to localStorage as "workflows:view-modes"
 * Format: { "agents": "markdown", "commands": "flowchart", ... }
 */
const workflowViewModesStorageAtom = atomWithStorage<
  Record<string, "markdown" | "flowchart">
>(
  "workflows:view-modes",
  {},
  undefined,
  { getOnInit: true }
)

/**
 * Get/set view mode for the currently selected category
 * Each category can have its own view mode preference
 * Defaults to "markdown" for new categories
 */
export const workflowViewModeAtom = atom(
  (get) => {
    const category = get(selectedWorkflowCategoryAtom)
    if (!category) return "markdown"
    const modes = get(workflowViewModesStorageAtom)
    return modes[category] ?? "markdown"
  },
  (get, set, newMode: "markdown" | "flowchart") => {
    const category = get(selectedWorkflowCategoryAtom)
    if (!category) return
    const current = get(workflowViewModesStorageAtom)
    set(workflowViewModesStorageAtom, { ...current, [category]: newMode })
  }
)
