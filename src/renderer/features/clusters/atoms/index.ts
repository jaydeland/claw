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
 * Currently selected cluster name for detail view
 * Persisted to localStorage to remember selection across sessions
 */
export const selectedClusterIdAtom = atomWithStorage<string | null>(
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

export type ClusterTab = "dashboard" | "nodes" | "logs"

/**
 * Currently selected tab in cluster detail view
 */
export const selectedClusterTabAtom = atom<ClusterTab>("dashboard")
