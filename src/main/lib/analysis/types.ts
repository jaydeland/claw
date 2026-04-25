/**
 * Analysis Types
 *
 * Shared types for the analysis feature.
 */

// Analysis types
export type AnalysisType = "codeflow" | "db" | "architecture" | "build"

// Flowchart node types
export type FlowchartNodeType = "start" | "end" | "process" | "decision" | "data" | "subprocess"

// Flow node data
export interface FlowNode {
  id: string
  type?: FlowchartNodeType | "default" | "input" | "output" | "group" | string // Support new flowchart types + legacy types
  position: { x: number; y: number }
  data: {
    label?: string
    description?: string
    flowType?: FlowchartNodeType // Explicit flowchart type in data
    type?: string // Legacy type field for backward compatibility
    [key: string]: unknown
  }
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
  noDatabaseFound?: boolean // Flag indicating no database was found in the project
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
