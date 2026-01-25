/**
 * State management for workflow content view
 * These atoms control the category selection, file list, and detail panel views
 */
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { WorkflowNode } from "./index"

// ============================================
// WORKFLOW CATEGORY SELECTION
// ============================================

/**
 * Selected workflow category
 * null = show normal chat interface
 * non-null = show workflow file browser
 */
export const selectedWorkflowCategoryAtom = atom<
  "agents" | "commands" | "skills" | "mcps" | null
>(null)

// ============================================
// SELECTED WORKFLOW NODE (base atom)
// ============================================

/**
 * Base atom for selected workflow node
 * Currently selected workflow node for preview panel
 * null = no node selected
 */
export const selectedWorkflowNodeBaseAtom = atom<WorkflowNode | null>(null)

// ============================================
// COMBINED ACTION ATOM
// ============================================

/**
 * Combined action to select a workflow item
 * Sets both category and node atomically to prevent race conditions
 * This should be used instead of setting selectedWorkflowNodeAtom and selectedWorkflowCategoryAtom separately
 */
export const selectWorkflowItemAtom = atom(
  null,
  (get, set, params: { node: WorkflowNode; category: "agents" | "commands" | "skills" | "mcps" }) => {
    // Set both atoms in a single action - Jotai will batch these updates
    set(selectedWorkflowCategoryAtom, params.category)
    set(selectedWorkflowNodeBaseAtom, params.node)
  }
)

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
