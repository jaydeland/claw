import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// Export new workflow content atoms
export {
  selectedWorkflowCategoryAtom,
  selectedWorkflowNodeBaseAtom,
  selectWorkflowItemAtom,
  workflowFileListWidthAtom,
  workflowFileListSearchAtom,
  workflowViewModeAtom,
  workflowReviewDialogOpenAtom,
  type WorkflowViewMode,
} from "./workflows-content-atoms"

// Export workflow panel atoms
export {
  workflowPanelOpenAtom,
  workflowPanelWidthAtom,
  workflowPanelFileListWidthAtom,
  type WorkflowPanelCategory,
} from "./workflow-panel-atoms"

// ============================================
// WORKFOWS SIDEBAR STATE
// ============================================

/**
 * Controls the open/closed state of the workflows sidebar section
 * Persisted to localStorage as "workflows:sidebar-open"
 */
export const workflowsSidebarOpenAtom = atomWithStorage<boolean>(
  "workflows:sidebar-open",
  true,
  undefined,
  { getOnInit: true },
)

// ============================================
// WORKFOWS TREE EXPANSION STATE
// ============================================

/**
 * Storage atom for expanded tree nodes (array-based for JSON serialization)
 * atomWithStorage serializes Set to JSON, so we store as array and convert to Set in the derived atom
 * Storage key: "workflows:expanded-nodes"
 */
const workflowsTreeExpandedNodesStorageAtom = atomWithStorage<unknown[]>(
  "workflows:expanded-nodes",
  ["agents", "commands", "skills"], // Default: top-level categories expanded (as array)
  undefined,
  { getOnInit: true },
)

/**
 * Read-write atom for expanded nodes set
 * Converts between array (storage) and Set (usage)
 * Handles corrupted localStorage data gracefully
 */
export const workflowsTreeExpandedNodesAtom = atom(
  (get): Set<string> => {
    const stored = get(workflowsTreeExpandedNodesStorageAtom)
    // Handle various storage formats: array, Set, object, or invalid data
    if (Array.isArray(stored)) {
      return new Set(stored as string[])
    }
    // Fallback: if it's an object or invalid, treat as keys array
    if (typeof stored === 'object' && stored !== null) {
      try {
        return new Set(Object.keys(stored))
      } catch {
        // Last resort: return default expanded set
        return new Set(['agents', 'commands', 'skills'])
      }
    }
    // Default for null/undefined/invalid
    return new Set(['agents', 'commands', 'skills'])
  },
  (_get, set, newSet: Set<string>) => {
    set(workflowsTreeExpandedNodesStorageAtom, Array.from(newSet))
  },
)

/**
 * Toggle a single node's expanded state
 * Note: Reads from derived Set atom, stores to storage as array
 */
export const workflowsToggleNodeAtom = atom(
  null,
  (get, set, nodeKey: string) => {
    // Read from derived atom to ensure we get a Set
    const currentSet = get(workflowsTreeExpandedNodesAtom)
    if (currentSet.has(nodeKey)) {
      // Remove from set, store as array
      const newArray = Array.from(currentSet).filter((k) => k !== nodeKey)
      set(workflowsTreeExpandedNodesStorageAtom, newArray)
    } else {
      // Add to set, store as array
      const newArray = [...currentSet, nodeKey]
      set(workflowsTreeExpandedNodesStorageAtom, newArray)
    }
  },
)

/**
 * Expand all nodes in a category
 * Note: Reads from derived Set atom, stores to storage as array
 */
export const workflowsExpandCategoryAtom = atom(
  null,
  (get, set, nodeKeys: string[]) => {
    const currentSet = get(workflowsTreeExpandedNodesAtom)
    // Add new keys to set, deduplicate, store as array
    const newSet = new Set([...currentSet, ...nodeKeys])
    set(workflowsTreeExpandedNodesStorageAtom, Array.from(newSet))
  },
)

/**
 * Collapse all nodes in a category
 * Note: Reads from derived Set atom, stores to storage as array
 */
export const workflowsCollapseCategoryAtom = atom(
  null,
  (get, set, nodeKeys: string[]) => {
    const currentSet = get(workflowsTreeExpandedNodesAtom)
    // Filter out category keys from set, store as array
    const newSet = new Set<string>()
    for (const item of currentSet) {
      if (!nodeKeys.includes(item)) {
        newSet.add(item)
      }
    }
    set(workflowsTreeExpandedNodesStorageAtom, Array.from(newSet))
  },
)

/**
 * Expand all nodes (helper for "Expand All" action)
 * Note: Stores as array for localStorage compatibility
 */
export const workflowsExpandAllAtom = atom(null, (_get, set, allNodeKeys: string[]) => {
  set(workflowsTreeExpandedNodesStorageAtom, allNodeKeys)
})

/**
 * Collapse all nodes (helper for "Collapse All" action)
 * Note: Stores as array for localStorage compatibility
 */
export const workflowsCollapseAllAtom = atom(null, (_get, set) => {
  set(workflowsTreeExpandedNodesStorageAtom, [])
})

// ============================================
// WORKFOWS NODE SELECTION
// ============================================

/**
 * Type of a selectable workflow node
 */
export type WorkflowNodeType = "agent" | "command" | "skill" | "tool" | "mcpServer"

/**
 * Represents a selected workflow node for preview
 */
export interface WorkflowNode {
  type: WorkflowNodeType
  id: string
  name: string
  sourcePath: string
}

/**
 * Currently selected workflow node for preview panel
 * null = no node selected
 * This is an alias for selectedWorkflowNodeBaseAtom for backward compatibility
 */
export { selectedWorkflowNodeBaseAtom as selectedWorkflowNodeAtom } from "./workflows-content-atoms"

// ============================================
// WORKFOWS REFRESH TRIGGER
// ============================================

/**
 * Increment to trigger data refresh from workflows router
 * Components can use useEffect with this atom to refetch data
 * Starts at 0, increment with set(workflowsRefreshTriggerAtom, n => n + 1)
 */
export const workflowsRefreshTriggerAtom = atom<number>(0)

// ============================================
// WORKFLOWS PREVIEW PANEL STATE
// ============================================

/**
 * Controls the open/closed state of the workflows preview panel
 * Persisted to localStorage as "workflows:preview-open"
 * NOTE: This is deprecated - keeping for backward compatibility
 * The new workflow UI uses WorkflowsContent with integrated detail panel
 */
export const workflowsPreviewOpenAtom = atomWithStorage<boolean>(
  "workflows:preview-open",
  false, // Default: closed (deprecated)
  undefined,
  { getOnInit: true },
)

/**
 * Width of the workflows preview panel in pixels
 * Persisted to localStorage as "workflows:preview-width"
 */
export const workflowsPreviewWidthAtom = atomWithStorage<number>(
  "workflows:preview-width",
  400, // Default: 400px
  undefined,
  { getOnInit: true },
)

/**
 * The source file path currently displayed in the preview panel
 * null = no file selected
 */
export const workflowContentPathAtom = atom<string | null>(null)

// ============================================
// REACT FLOW DIAGRAM STATE
// ============================================

/**
 * Set of expanded node IDs in the React Flow diagram
 * Used for expandable/collapsible nodes
 */
export const workflowExpandedNodesAtom = atom<Set<string>>(new Set())

/**
 * Maximum depth level to show in the transitive dependency graph
 * 1 = direct dependencies only
 * 2 = direct + one level of transitive (default)
 * 3+ = full transitive graph
 */
export const workflowMaxDepthAtom = atomWithStorage<number>(
  "workflows:max-depth",
  2, // Default: show direct + one level of transitive
  undefined,
  { getOnInit: true },
)

/**
 * Selected dependency types to show in the diagram
 * Filters which types of dependencies are visible
 */
export interface WorkflowDependencyFilters {
  builtinTools: boolean
  mcpTools: boolean
  skills: boolean
  commands: boolean
  agents: boolean
  cliApps: boolean
  backgroundTasks: boolean
}

export const workflowDependencyFiltersAtom = atomWithStorage<WorkflowDependencyFilters>(
  "workflows:dep-filters",
  {
    builtinTools: true,
    mcpTools: true,
    skills: true,
    commands: true,
    agents: true,
    cliApps: true,
    backgroundTasks: true,
  },
  undefined,
  { getOnInit: true },
)

/**
 * Toggle a node's expanded state
 */
export const workflowToggleExpandedNodeAtom = atom(
  null,
  (get, set, nodeId: string) => {
    const current = get(workflowExpandedNodesAtom)
    const next = new Set(current)
    if (next.has(nodeId)) {
      next.delete(nodeId)
    } else {
      next.add(nodeId)
    }
    set(workflowExpandedNodesAtom, next)
  },
)

/**
 * Expand all nodes with transitive dependencies
 */
export const workflowExpandAllNodesAtom = atom(
  null,
  (_get, set, nodeIds: string[]) => {
    set(workflowExpandedNodesAtom, new Set(nodeIds))
  },
)

/**
 * Collapse all expanded nodes
 */
export const workflowCollapseAllNodesAtom = atom(
  null,
  (_get, set) => {
    set(workflowExpandedNodesAtom, new Set())
  },
)
