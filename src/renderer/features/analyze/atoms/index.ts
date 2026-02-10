/**
 * Analyze Feature Atoms
 *
 * State management for the project analysis panel with React Flow diagrams.
 */

import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { AnalysisType } from "../../../../main/lib/trpc/routers/analyzer"

// ============ DISPLAY MODE ============

export type AnalyzeDisplayMode = "side-peek" | "center-peek" | "full-page"

export const analyzeDisplayModeAtom = atomWithStorage<AnalyzeDisplayMode>(
  "analyze-display-mode",
  "side-peek",
  undefined,
  { getOnInit: true },
)

// Sidebar open state (persisted for side-peek mode)
export const analyzeSidebarOpenAtom = atomWithStorage<boolean>(
  "analyze-sidebar-open",
  false,
  undefined,
  { getOnInit: true },
)

// Runtime-only open state for dialog and fullscreen modes
export const analyzeSidebarOpenRuntimeAtom = atom<boolean>(false)

// Sidebar width
export const analyzeSidebarWidthAtom = atomWithStorage<number>(
  "analyze-sidebar-width",
  400,
  undefined,
  { getOnInit: true },
)

// ============ SELECTED ANALYSIS TYPE ============

export const selectedAnalysisTypeAtom = atomWithStorage<AnalysisType | null>(
  "analyze-selected-type",
  null,
  undefined,
  { getOnInit: true },
)

// ============ DIAGRAM STATE ============

export interface FlowNode {
  id: string
  type?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  width?: number
  height?: number
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  type?: string
  label?: string
  data?: Record<string, unknown>
}

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

export interface DiagramData {
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport?: FlowViewport
  summary?: string
  stats?: Record<string, unknown>
}

// Current diagram data (loaded from DB or generated)
export const currentDiagramDataAtom = atom<DiagramData | null>(null)

// Diagram loading state
export const diagramLoadingAtom = atom<boolean>(false)

// Diagram error state
export const diagramErrorAtom = atom<string | null>(null)

// ============ GENERATION STATE ============

export const isGeneratingAtom = atom<boolean>(false)

export const generationProgressAtom = atom<{
  total: number
  completed: number
  current: string
} | null>(null)

// ============ REFRESH STATE ============

export const needsRefreshAtom = atom<boolean>(false)
export const refreshReasonAtom = atom<string | null>(null)

// ============ UI STATE ============

// Expanded nodes in the diagram
export const expandedNodesAtom = atom<Set<string>>(new Set())

// Selected node for details panel
export const selectedNodeAtom = atom<FlowNode | null>(null)

// Bottom panel tab selection
export type AnalyzeBottomTab = "details" | "logs" | "stats"

export const analyzeBottomTabAtom = atomWithStorage<AnalyzeBottomTab>(
  "analyze-bottom-tab",
  "details",
  undefined,
  { getOnInit: true },
)

// ============ ACTIVE JOBS ============

export interface AnalysisJobStatus {
  id: string
  type: AnalysisType
  status: "running" | "completed" | "failed"
  log: Array<{ level: string; message: string; timestamp: string }>
  errorMessage?: string
  startedAt: Date
  completedAt?: Date
}

export const activeAnalysisJobsAtom = atom<Map<string, AnalysisJobStatus>>(new Map())

// ============ HELPERS ============

// Get effective open state based on display mode
export const effectiveAnalyzeOpenAtom = atom((get) => {
  const displayMode = get(analyzeDisplayModeAtom)
  const sidebarOpen = get(analyzeSidebarOpenAtom)
  const runtimeOpen = get(analyzeSidebarOpenRuntimeAtom)

  return displayMode === "side-peek" ? sidebarOpen : runtimeOpen
})

// Derived atom for current analysis status
export const currentAnalysisStatusAtom = atom((get) => {
  const selectedType = get(selectedAnalysisTypeAtom)
  const jobs = get(activeAnalysisJobsAtom)
  const isGenerating = get(isGeneratingAtom)

  if (!selectedType) return null

  // Find job for selected type
  for (const job of jobs.values()) {
    if (job.type === selectedType) {
      return {
        type: selectedType,
        status: job.status,
        isGenerating,
        log: job.log,
        errorMessage: job.errorMessage,
      }
    }
  }

  return {
    type: selectedType,
    status: "pending" as const,
    isGenerating,
    log: [],
    errorMessage: undefined,
  }
})
