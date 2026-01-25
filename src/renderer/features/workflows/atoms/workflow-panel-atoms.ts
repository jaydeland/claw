import { atomWithStorage } from "jotai/utils"

/**
 * Type for which workflow panel category is currently open
 * null means no workflow panel is open
 */
export type WorkflowPanelCategory = "agents" | "commands" | "skills" | "mcps" | null

/**
 * Atom to track which workflow panel is currently open
 * Uses global state (not per-chat) since workflows are reference documentation
 * Persisted to localStorage so last viewed category is restored on app reload
 */
export const workflowPanelOpenAtom = atomWithStorage<WorkflowPanelCategory>(
  "workflows:panel-open",
  null,
  undefined,
  { getOnInit: true }
)

/**
 * Atom to track the width of the workflow panel
 * Default: 600px, Range: 400-1000px
 * Persisted to localStorage
 */
export const workflowPanelWidthAtom = atomWithStorage<number>(
  "workflows:panel-width",
  600,
  undefined,
  { getOnInit: true }
)

/**
 * Atom to track the width of the file list within the workflow panel
 * This controls the horizontal split between file list and detail view
 * Default: 280px
 * Persisted to localStorage
 */
export const workflowPanelFileListWidthAtom = atomWithStorage<number>(
  "workflows:panel-file-list-width",
  280,
  undefined,
  { getOnInit: true }
)
