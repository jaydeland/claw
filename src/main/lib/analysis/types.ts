/**
 * Analysis Types
 *
 * Shared types for the analysis feature.
 */

// Analysis types
export type AnalysisType = "codeflow" | "db" | "architecture" | "build"

// Flow node data
export interface FlowNode {
  id: string
  type?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  width?: number
  height?: number
}

// Flow edge data
export interface FlowEdge {
  id: string
  source: string
  target: string
  type?: string
  label?: string
  data?: Record<string, unknown>
}

// Analysis result
export interface AnalysisResult {
  nodes: FlowNode[]
  edges: FlowEdge[]
  summary?: string
  stats?: Record<string, unknown>
}

// Re-export from background-analysis-runner to avoid circular dependency
export interface AnalysisProgressUpdate {
  jobId: string
  diagramId: string
  type: AnalysisType
  status: "started" | "running" | "completed" | "failed"
  progress?: number
  message?: string
  result?: AnalysisResult
  error?: string
}
