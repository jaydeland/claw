import { atomWithStorage, RESET } from "jotai/utils"
import { atom } from "jotai"

/**
 * OpenUI Builder state atoms
 * Manages state for AI-generated UI component creation
 * Follows GSD pattern for project integration
 */

// ============================================
// NAVIGATION
// ============================================

/**
 * OpenUI category for main content routing
 * When set to "openui", the main content area shows the OpenUI view
 */
export const selectedOpenUICategoryAtom = atom<"openui" | null>(null)

// ============================================
// PROJECT SELECTION
// ============================================

/**
 * Selected project ID for OpenUI view (persisted)
 * null means no project selected - uses current workspace project
 */
export const selectedOpenUIProjectIdAtom = atomWithStorage<string | null>(
  "openui:selectedProjectId",
  null,
  undefined,
  { getOnInit: true },
)

// ============================================
// COMPONENT LIBRARY
// ============================================

/**
 * Registered Claw UI components available for generation
 * Populated from components/ui/ directory
 */
export interface RegisteredComponent {
  name: string
  path: string
  description?: string
  category?: string // "layout", "input", "display", "feedback"
}

export const openUIRegisteredComponentsAtom = atom<RegisteredComponent[]>([])

// ============================================
// GENERATION STATE
// ============================================

/**
 * Current prompt being edited
 */
export const openUIPromptAtom = atom<string>("")

/**
 * Whether generation is in progress
 */
export const openUIGenerationInProgressAtom = atom<boolean>(false)

/**
 * Error message from generation
 */
export const openUIGenerationErrorAtom = atom<string | null>(null)

/**
 * Raw output from Claude
 */
export const openUIGeneratedOutputAtom = atom<string>("")

// ============================================
// GENERATED COMPONENTS
// ============================================

/**
 * Generated component from database
 */
export interface GeneratedComponent {
  id: string
  name: string
  code: string
  atomsCode?: string
  description?: string
  prompt: string
  projectId: string
  chatId?: string
  filePath?: string
  isInstalled: boolean
  metadata?: {
    usedComponents?: string[]
    complexity?: "simple" | "medium" | "complex"
  }
  createdAt: number
  updatedAt: number
}

/**
 * List of generated components for current project
 */
export const openUIGeneratedComponentsAtom = atom<GeneratedComponent[]>([])

/**
 * Selected component for viewing/editing
 */
export const openUISelectedComponentIdAtom = atom<string | null>(null)

// ============================================
// UI STATE
// ============================================

/**
 * Whether the builder panel is open
 */
export const openUIBuilderOpenAtom = atomWithStorage<boolean>(
  "openui:builderOpen",
  true,
  undefined,
  { getOnInit: true }
)

/**
 * Preview scale for component preview
 */
export const openUIPreviewScaleAtom = atomWithStorage<number>(
  "openui:previewScale",
  1,
  undefined,
  { getOnInit: true }
)

/**
 * Whether to show code or preview
 */
export const openUIViewModeAtom = atomWithStorage<"code" | "preview" | "split">(
  "openui:viewMode",
  "split",
  undefined,
  { getOnInit: true }
)

/**
 * Active tab in left panel
 */
export type OpenUIPanelTab = "library" | "generated" | "templates"
export const openUIPanelActiveTabAtom = atomWithStorage<OpenUIPanelTab>(
  "openui:panelActiveTab",
  "library",
  undefined,
  { getOnInit: true }
)

// ============================================
// INSTALLATION STATE
// ============================================

/**
 * Components pending installation to project
 */
export const openUIInstallPendingAtom = atom<Set<string>>(new Set())

/**
 * Whether install dialog is open
 */
export const openUIInstallDialogOpenAtom = atom<boolean>(false)

/**
 * Component being installed
 */
export const openUIInstallingComponentAtom = atom<GeneratedComponent | null>(null)

// ============================================
// TEMPLATES
// ============================================

/**
 * Built-in templates for common component patterns
 */
export interface OpenUITemplate {
  id: string
  name: string
  description: string
  prompt: string
  category: string
  icon?: string
}

export const openUITemplatesAtom = atom<OpenUITemplate[]>([
  {
    id: "dashboard-metrics",
    name: "Dashboard Metrics",
    description: "A dashboard with metric cards showing KPIs",
    prompt: "Create a dashboard with 3 metric cards showing KPIs with icons, values, and trend indicators",
    category: "dashboard",
    icon: "LayoutDashboard",
  },
  {
    id: "kanban-board",
    name: "Kanban Board",
    description: "A task management kanban board with columns",
    prompt: "Create a kanban board for task management with columns for Todo, In Progress, and Done",
    category: "productivity",
    icon: "Columns",
  },
  {
    id: "data-table",
    name: "Data Table",
    description: "A sortable data table with pagination",
    prompt: "Create a data table with sortable columns, pagination, and row selection",
    category: "data",
    icon: "Table",
  },
  {
    id: "form-wizard",
    name: "Form Wizard",
    description: "A multi-step form wizard with progress",
    prompt: "Create a multi-step form wizard with progress indicator and navigation buttons",
    category: "forms",
    icon: "ListOrdered",
  },
  {
    id: "chat-interface",
    name: "Chat Interface",
    description: "A chat message interface with bubbles",
    prompt: "Create a chat interface with message bubbles, timestamps, and user avatars",
    category: "communication",
    icon: "MessageSquare",
  },
])

// ============================================
// TREE PANE STATE
// ============================================

/**
 * Expanded projects in the tree pane
 */
export const openUIExpandedProjectsAtom = atomWithStorage<Set<string>>(
  "openui:expandedProjects",
  new Set(),
  {
    getItem: (key) => {
      const stored = localStorage.getItem(key)
      if (!stored) return new Set()
      try {
        return new Set(JSON.parse(stored))
      } catch {
        return new Set()
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(Array.from(value)))
    },
    removeItem: (key) => localStorage.removeItem(key),
  },
  { getOnInit: true }
)

/**
 * Expanded sections in the tree pane
 */
export const openUIExpandedSectionsAtom = atomWithStorage<Set<string>>(
  "openui:expandedSections",
  new Set(),
  {
    getItem: (key) => {
      const stored = localStorage.getItem(key)
      if (!stored) return new Set()
      try {
        return new Set(JSON.parse(stored))
      } catch {
        return new Set()
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(Array.from(value)))
    },
    removeItem: (key) => localStorage.removeItem(key),
  },
  { getOnInit: true }
)

// ============================================
// CLAW RESOURCES
// ============================================

/**
 * Whether the Claw Resources section is expanded in tree pane
 */
export const openUIClawResourcesExpandedAtom = atomWithStorage<boolean>(
  "openui:clawResourcesExpanded",
  false,
  undefined,
  { getOnInit: true }
)

/**
 * Selected resource in the Claw Resources section
 */
export const openUISelectedResourceAtom = atom<"er-diagram" | "source-code" | null>(null)

// ============================================
// CLEANUP
// ============================================

/**
 * Cleanup atom for removing generated component state
 */
export const openUICleanupAtom = atom(
  null,
  (_get, _set, componentId: string) => {
    // Clear localStorage entries for this component
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.includes(`openui:${componentId}`)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
  }
)
