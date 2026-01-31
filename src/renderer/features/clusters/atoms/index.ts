import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// CLUSTERS SIDEBAR STATE
// ============================================

/**
 * Selected clusters category in sidebar
 * null = show chat view, "clusters" = show clusters view
 */
export const selectedClustersCategoryAtom = atom<"clusters" | null>(null)

// ============================================
// CLUSTER SELECTION
// ============================================

/**
 * Default cluster ID (persisted to localStorage)
 * When set, this cluster will be auto-selected on app start and shown in status bar
 */
export const defaultClusterIdAtom = atomWithStorage<string | null>(
  "clusters:default-cluster-id",
  null,
  undefined,
  { getOnInit: true }
)

/**
 * Base atom for selected cluster (persisted to localStorage)
 * This stores the user's explicit selection or the auto-selected default
 */
const selectedClusterIdBaseAtom = atomWithStorage<string | null>(
  "clusters:selected-cluster-id",
  null,
  undefined,
  { getOnInit: true }
)

/**
 * Helper function to get the default cluster from a list
 * Prefers "staging-cluster" if available, otherwise returns the first cluster
 */
export function getDefaultCluster(clusters: Array<{ name: string }>): string | null {
  if (!clusters || clusters.length === 0) return null

  // Prefer staging-cluster if available
  const stagingCluster = clusters.find((c) => c.name === "staging-cluster")
  if (stagingCluster) return stagingCluster.name

  // Fallback to first cluster
  return clusters[0].name
}

/**
 * Atom that stores the available clusters list
 * This is set by the component when clusters are loaded from tRPC
 */
export const availableClustersAtom = atom<Array<{ name: string }>>([])

/**
 * Derived atom that ensures a cluster is always selected when clusters are available
 * READ: Returns the current selection, or auto-selects the default cluster if set
 * WRITE: Updates the selected cluster and persists to localStorage
 */
export const selectedClusterIdAtom = atom(
  (get) => {
    const baseSelection = get(selectedClusterIdBaseAtom)
    const defaultClusterId = get(defaultClusterIdAtom)
    const clusters = get(availableClustersAtom)

    // If no clusters available yet, return null
    if (!clusters || clusters.length === 0) {
      return null
    }

    // Always prefer staging-cluster if it exists (overrides localStorage)
    const hasStagingCluster = clusters.some((c) => c.name === "staging-cluster")
    if (hasStagingCluster) {
      return "staging-cluster"
    }

    // If we have a base selection and it's still valid, keep it
    if (baseSelection) {
      const isValid = clusters.some((c) => c.name === baseSelection)
      if (isValid) {
        return baseSelection
      }
    }

    // If user has set a default cluster and it's valid, use it
    if (defaultClusterId) {
      const isValid = clusters.some((c) => c.name === defaultClusterId)
      if (isValid) {
        return defaultClusterId
      }
    }

    // No valid selection - return first cluster
    return getDefaultCluster(clusters)
  },
  (get, set, newValue: string | null) => {
    // When writing, update both the base atom and persist to localStorage
    set(selectedClusterIdBaseAtom, newValue)
  }
)

// ============================================
// CLUSTERS SEARCH STATE
// ============================================

/**
 * Search query for filtering clusters
 */
export const clusterSearchAtom = atom<string>("")

// ============================================
// NAMESPACE SELECTION
// ============================================

/**
 * Currently selected namespace for viewing pods/resources
 * null = use default namespace from settings
 */
export const selectedNamespaceAtom = atom<string | null>(null)

// ============================================
// TAB SELECTION
// ============================================

export type ClusterTab = "dashboard" | "pvcs" | "pods" | "services" | "deployments" | "logs" | "devspace"

/**
 * Currently selected tab in cluster detail view
 */
export const selectedClusterTabAtom = atom<ClusterTab>("dashboard")
