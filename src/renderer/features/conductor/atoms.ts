/**
 * Conductor Feature Atoms
 *
 * Global state management for the Conductor job management system.
 * Uses Jotai for reactive state management with localStorage persistence.
 */

import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * View mode for displaying jobs
 */
export type ConductorViewMode = "kanban" | "list"

/**
 * Detail drawer tabs
 */
export type ConductorDetailTab = "logs" | "checkpoints" | "metadata" | "actions"

/**
 * Sort fields for job list
 */
export type ConductorSortField = "name" | "status" | "created_at" | "updated_at" | "priority"

/**
 * Sort direction
 */
export type ConductorSortDirection = "asc" | "desc"

// ============================================
// CONSTANTS
// ============================================

/**
 * Default sidebar width in pixels
 */
export const DEFAULT_CONDUCTOR_SIDEBAR_WIDTH = 264

/**
 * Default page size for pagination
 */
export const DEFAULT_CONDUCTOR_PAGE_SIZE = 50

/**
 * Available page size options
 */
export const CONDUCTOR_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const

/**
 * Detail drawer tabs in display order
 */
export const CONDUCTOR_DETAIL_TABS: ConductorDetailTab[] = [
  "logs",
  "checkpoints",
  "metadata",
  "actions",
]

// ============================================
// SIDEBAR STATE
// ============================================

/**
 * Sidebar open/closed state
 * Persisted to maintain user preference across sessions
 */
export const conductorSidebarOpenAtom = atomWithStorage<boolean>(
  "conductor-sidebar-open",
  true,
  undefined,
  { getOnInit: true },
)

/**
 * Sidebar width in pixels
 * Persisted to maintain user's preferred sidebar size
 */
export const conductorSidebarWidthAtom = atomWithStorage<number>(
  "conductor-sidebar-width",
  DEFAULT_CONDUCTOR_SIDEBAR_WIDTH,
  undefined,
  { getOnInit: true },
)

// ============================================
// VIEW STATE
// ============================================

/**
 * Current view mode for displaying jobs
 * - kanban: Card-based board view with status columns
 * - list: Table-based list view
 */
export const conductorViewModeAtom = atomWithStorage<ConductorViewMode>(
  "conductor-view-mode",
  "kanban",
  undefined,
  { getOnInit: true },
)

/**
 * Currently selected job ID for detail view
 * Transient - resets on page reload
 */
export const selectedConductorJobIdAtom = atom<string | null>(null)

/**
 * Detail drawer visibility state
 * Transient - closed by default on reload
 */
export const conductorDetailDrawerOpenAtom = atom<boolean>(false)

/**
 * Active tab in job detail drawer
 * Persisted to restore user's preferred detail view
 */
export const conductorDetailTabAtom = atomWithStorage<ConductorDetailTab>(
  "conductor-detail-tab",
  "logs",
  undefined,
  { getOnInit: true },
)

// ============================================
// FILTER STATE
// ============================================

/**
 * Active status filters (e.g., ["running", "completed"])
 * Persisted to maintain filter state across sessions
 */
export const conductorStatusFilterAtom = atomWithStorage<string[]>(
  "conductor-status-filter",
  [],
  undefined,
  { getOnInit: true },
)

/**
 * Active type filters (e.g., ["vidyard-task", "slack-notification"])
 * Persisted to maintain filter state across sessions
 */
export const conductorTypeFilterAtom = atomWithStorage<string[]>(
  "conductor-type-filter",
  [],
  undefined,
  { getOnInit: true },
)

/**
 * Search query for filtering jobs by name/description
 * Transient - cleared on reload
 */
export const conductorSearchQueryAtom = atom<string>("")

/**
 * Derived atom: true if any filters are active
 * Used to show "Clear filters" button
 */
export const hasActiveFiltersAtom = atom((get) => {
  const statusFilters = get(conductorStatusFilterAtom)
  const typeFilters = get(conductorTypeFilterAtom)
  const searchQuery = get(conductorSearchQueryAtom)

  return (
    statusFilters.length > 0 ||
    typeFilters.length > 0 ||
    searchQuery.trim().length > 0
  )
})

// ============================================
// SORT STATE
// ============================================

/**
 * Sort field for job list
 * Persisted to maintain sort preference
 */
export const conductorSortFieldAtom = atomWithStorage<ConductorSortField>(
  "conductor-sort-field",
  "created_at",
  undefined,
  { getOnInit: true },
)

/**
 * Sort direction
 * Persisted to maintain sort direction preference
 */
export const conductorSortDirectionAtom = atomWithStorage<ConductorSortDirection>(
  "conductor-sort-direction",
  "desc",
  undefined,
  { getOnInit: true },
)

// ============================================
// SELECTION STATE
// ============================================

/**
 * Set of selected job IDs for bulk actions
 * Transient - cleared on page reload
 */
export const selectedConductorJobIdsAtom = atom<Set<string>>(new Set())

/**
 * Derived atom: true if any jobs are selected
 * Used to show/hide bulk action toolbar
 */
export const hasConductorJobsSelectedAtom = atom((get) => {
  const selectedIds = get(selectedConductorJobIdsAtom)
  return selectedIds.size > 0
})

/**
 * Derived atom: count of selected jobs
 * Used to display selection count in bulk action toolbar
 */
export const selectedConductorJobCountAtom = atom((get) => {
  const selectedIds = get(selectedConductorJobIdsAtom)
  return selectedIds.size
})

// ============================================
// PAGINATION STATE
// ============================================

/**
 * Current page number (1-indexed)
 * Transient - resets to page 1 on reload
 */
export const conductorPageAtom = atom<number>(1)

/**
 * Items per page
 * Persisted to maintain user's preferred page size
 */
export const conductorPageSizeAtom = atomWithStorage<number>(
  "conductor-page-size",
  DEFAULT_CONDUCTOR_PAGE_SIZE,
  undefined,
  { getOnInit: true },
)

// ============================================
// FORM STATE
// ============================================

/**
 * Parent job ID for new job creation form
 * When set, new jobs will be created as children of this parent
 */
export const newJobParentIdAtom = atom<string | null>(null)

/**
 * New job form visibility
 * Controls whether the job creation form is expanded in sidebar
 */
export const newJobFormOpenAtom = atom<boolean>(false)

// ============================================
// UI STATE
// ============================================

/**
 * Global loading state for Conductor operations
 * Used to show loading spinner during data fetches
 */
export const conductorLoadingAtom = atom<boolean>(false)

/**
 * Global error message
 * Shown in error banner when set
 */
export const conductorErrorAtom = atom<string | null>(null)

/**
 * Refresh trigger counter
 * Increment to trigger data refresh without remounting components
 */
export const conductorRefreshTriggerAtom = atom<number>(0)

// ============================================
// GSD INTEGRATION STATE
// ============================================

/**
 * Selected workspace (project) IDs for GSD import
 * Persisted to maintain user's workspace selection across sessions
 */
export const conductorSelectedWorkspaceIdsAtom = atomWithStorage<string[]>(
  "conductor-selected-workspace-ids",
  [],
  undefined,
  { getOnInit: true },
)

/**
 * GSD import dialog visibility
 */
export const gsdImportDialogOpenAtom = atom<boolean>(false)

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Helper to toggle a filter value in an array
 * Used for status and type filter management
 *
 * @example
 * const filters = ["running", "completed"]
 * toggleFilter(filters, "running") // ["completed"]
 * toggleFilter(filters, "failed") // ["running", "completed", "failed"]
 */
export const toggleFilter = (filters: string[], value: string): string[] => {
  return filters.includes(value)
    ? filters.filter((f) => f !== value)
    : [...filters, value]
}

/**
 * Helper to clear all filters
 * Returns empty arrays and empty string
 *
 * @example
 * const cleared = clearAllFilters()
 * // { statusFilters: [], typeFilters: [], searchQuery: "" }
 */
export const clearAllFilters = () => ({
  statusFilters: [],
  typeFilters: [],
  searchQuery: "",
})

/**
 * Helper to toggle job selection
 * Returns new Set with job ID added or removed
 *
 * @example
 * const selected = new Set(["job-1", "job-2"])
 * toggleJobSelection(selected, "job-2") // Set(["job-1"])
 * toggleJobSelection(selected, "job-3") // Set(["job-1", "job-2", "job-3"])
 */
export const toggleJobSelection = (
  selectedIds: Set<string>,
  jobId: string,
): Set<string> => {
  const newSet = new Set(selectedIds)
  if (newSet.has(jobId)) {
    newSet.delete(jobId)
  } else {
    newSet.add(jobId)
  }
  return newSet
}

/**
 * Helper to select/deselect all jobs
 * If all jobs are selected, deselects all. Otherwise, selects all.
 *
 * @example
 * const allJobIds = ["job-1", "job-2", "job-3"]
 * const selected = new Set(["job-1"])
 * toggleAllJobSelection(allJobIds, selected) // Set(["job-1", "job-2", "job-3"])
 *
 * const allSelected = new Set(allJobIds)
 * toggleAllJobSelection(allJobIds, allSelected) // Set()
 */
export const toggleAllJobSelection = (
  jobIds: string[],
  currentSelected: Set<string>,
): Set<string> => {
  // If all are selected, deselect all. Otherwise, select all.
  const allSelected = jobIds.every((id) => currentSelected.has(id))
  return allSelected ? new Set() : new Set(jobIds)
}
