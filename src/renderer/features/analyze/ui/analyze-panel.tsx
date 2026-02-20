"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { atom } from "jotai"
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  MiniMap,
  Panel,
  MarkerType,
} from "reactflow"
import "reactflow/dist/style.css"
import { Loader2, AlertCircle, RefreshCw, Maximize2, Minimize2, Play, X } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip"
import { trpc } from "../../../lib/trpc"
import {
  selectedAnalysisTypeAtom,
  currentDiagramDataAtom,
  diagramLoadingAtom,
  diagramErrorAtom,
  isGeneratingAtom,
  needsRefreshAtom,
  refreshReasonAtom,
  selectedNodeAtom,
  analyzeBottomTabAtom,
  analyzeSidebarWidthAtom,
  type FlowNode,
  type FlowEdge,
} from "../atoms"
import { AnalysisTypeTabs } from "./analysis-type-tabs"
import { AnalyzeNodeDetails } from "./analyze-node-details"
import { useAnalysisService } from "../lib/useAnalysisService"
import { cn } from "../../../lib/utils"

interface AnalyzePanelProps {
  projectId: string
  onClose?: () => void
}

// Custom node component for analysis diagrams
function AnalysisNode({ data, id }: { data: Record<string, unknown>; id: string }) {
  const setSelectedNode = useSetAtom(selectedNodeAtom)
  const nodeType = (data.type as string) || "default"
  const flowType = (data.flowType as string) || nodeType

  const getNodeStyle = () => {
    // Flowchart node types (new format)
    switch (flowType) {
      case "start":
      case "end":
        return "bg-emerald-50 border-emerald-500 dark:bg-emerald-950 dark:border-emerald-500 rounded-3xl border-2 font-bold"
      case "process":
        return "bg-blue-50 border-blue-500 dark:bg-blue-950 dark:border-blue-500 rounded-lg border-2"
      case "decision":
        return "bg-amber-50 border-amber-500 dark:bg-amber-950 dark:border-amber-500 rounded-lg border-2"
      case "data":
        return "bg-purple-50 border-purple-500 dark:bg-purple-950 dark:border-purple-500 rounded-lg border-2"
      case "subprocess":
        return "bg-orange-50 border-orange-500 dark:bg-orange-950 dark:border-orange-500 rounded-lg border-2 border-double"

      // Legacy node types (backward compatibility)
      case "table":
        return "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700"
      case "service":
        return "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700"
      case "database":
        return "bg-purple-50 border-purple-300 dark:bg-purple-950 dark:border-purple-700"
      case "frontend":
        return "bg-orange-50 border-orange-300 dark:bg-orange-950 dark:border-orange-700"
      case "external":
        return "bg-gray-50 border-gray-300 dark:bg-gray-900 dark:border-gray-600"
      case "entry":
      case "input":
        return "bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:border-emerald-700"
      case "output":
        return "bg-rose-50 border-rose-300 dark:bg-rose-950 dark:border-rose-700"
      default:
        return "bg-background border-border"
    }
  }

  return (
    <div
      onClick={() => setSelectedNode({ id, data, position: { x: 0, y: 0 } })}
      className={cn(
        "border-2 p-3 shadow-sm cursor-pointer transition-all hover:shadow-md min-w-[150px]",
        getNodeStyle()
      )}
    >
      <div className="font-semibold text-sm truncate">{(data.label as string) || id}</div>
      {data.description && (
        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{data.description as string}</div>
      )}
      {data.tech && (
        <div className="text-xs text-muted-foreground mt-1 font-mono">{data.tech as string}</div>
      )}
    </div>
  )
}

const nodeTypes = {
  default: AnalysisNode,
  input: AnalysisNode,
  output: AnalysisNode,
  start: AnalysisNode,
  end: AnalysisNode,
  process: AnalysisNode,
  decision: AnalysisNode,
  data: AnalysisNode,
  subprocess: AnalysisNode,
}

function AnalyzePanelInner({ projectId, onClose }: AnalyzePanelProps) {
  const selectedType = useAtomValue(selectedAnalysisTypeAtom)
  const [diagramData, setDiagramData] = useAtom(currentDiagramDataAtom)
  const [isLoading, setIsLoading] = useAtom(diagramLoadingAtom)
  const [error, setError] = useAtom(diagramErrorAtom)
  const [isGenerating, setIsGenerating] = useAtom(isGeneratingAtom)
  const [needsRefresh, setNeedsRefresh] = useAtom(needsRefreshAtom)
  const [refreshReason, setRefreshReason] = useAtom(refreshReasonAtom)
  const selectedNode = useAtomValue(selectedNodeAtom)
  const setSelectedNode = useSetAtom(selectedNodeAtom)
  const bottomTab = useAtomValue(analyzeBottomTabAtom)
  const [sidebarWidth, setSidebarWidth] = useAtom(analyzeSidebarWidthAtom)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const reactFlowInstance = useReactFlow()
  const [isFullscreen, setIsFullscreen] = useState(false)

  // tRPC queries and mutations
  const { data: diagram, refetch } = trpc.analyzer.get.useQuery(
    { projectId, type: selectedType! },
    { enabled: !!selectedType && !!projectId }
  )

  // Get project path for analysis
  const { data: project } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId }
  )

  // Analysis service for generating diagrams (uses background session, no chat needed)
  const { generateAnalysis, generateAll, cancelAnalysis } = useAnalysisService({
    projectId,
    projectPath: project?.path || "",
  })

  // Load diagram data when available
  useEffect(() => {
    if (diagram) {
      try {
        const nodes = JSON.parse(diagram.nodes) as FlowNode[]
        const edges = JSON.parse(diagram.edges) as FlowEdge[]
        const viewport = diagram.viewport ? JSON.parse(diagram.viewport) : null

        // Debug: log raw edge data to understand structure
        if (edges.length > 0) {
          console.log("Raw edge data sample:", edges[0])
          console.log("Raw node data sample:", nodes[0])
        }

        // Debug: log raw data structure
        console.log("Diagram nodes sample:", nodes[0])
        console.log("Diagram edges sample:", edges[0])

        setDiagramData({
          nodes,
          edges,
          viewport,
          summary: diagram.summary || undefined,
          stats: diagram.stats ? JSON.parse(diagram.stats) : undefined,
        })

        // Transform to React Flow format
        const flowNodes: Node[] = nodes.map((n) => {
          // Handle multiple node data formats - type might be in different places
          const nodeType = n.type || (n.data?.type as string) || (n.data?.flowType as string) || "default"
          return {
            id: n.id,
            type: nodeType,
            position: n.position,
            data: n.data,
            width: n.width,
            height: n.height,
          }
        })

        const strokeColor = "#64748b"
        const flowEdges: Edge[] = edges
          .map((e, index) => {
            // Handle multiple edge data formats
            // Try various property names for source/target
            const rawEdge = e as Record<string, unknown>
            let source = e.source || rawEdge.from as string || rawEdge.sourceNode as string || rawEdge.start as string
            let target = e.target || rawEdge.to as string || rawEdge.targetNode as string || rawEdge.end as string

            // Filter out the string "undefined" which can happen from JSON parsing
            if (source === "undefined") source = undefined
            if (target === "undefined") target = undefined

            if (!source || !target) {
              console.warn(`Edge ${index} missing source/target:`, e, { source, target })
              return null
            }

            const color = e.data?.critical ? "#ef4444" : strokeColor

            // Build edge object, excluding undefined handle properties
            const edge: Edge = {
              id: e.id || `edge-${index}`,
              source,
              target,
              type: e.type || "smoothstep",
              label: e.label,
              data: e.data,
              animated: e.data?.critical || false,
              style: {
                stroke: color,
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: color,
              },
            }

            // Only add handles if they are valid strings (not undefined or "undefined")
            const sourceHandle = rawEdge.sourceHandle as string | undefined
            const targetHandle = rawEdge.targetHandle as string | undefined
            if (sourceHandle && sourceHandle !== "undefined") {
              edge.sourceHandle = sourceHandle
            }
            if (targetHandle && targetHandle !== "undefined") {
              edge.targetHandle = targetHandle
            }

            return edge
          })
          .filter((e): e is Edge => e !== null)

        setNodes(flowNodes)
        setEdges(flowEdges)

        // Restore viewport if available
        if (viewport) {
          reactFlowInstance.setViewport(viewport)
        } else {
          // Auto-fit on first load
          setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100)
        }
      } catch (err) {
        console.error("Failed to parse diagram data:", err)
        setError("Failed to parse diagram data")
      }
    }
  }, [diagram, setDiagramData, setNodes, setEdges, reactFlowInstance, setError])

  // Handle generate/refresh
  const handleGenerate = useCallback(async () => {
    if (!selectedType) return

    const result = await generateAnalysis(selectedType)
    if (result) {
      // Poll for completion (in real implementation, this would be via subscription)
      const pollInterval = setInterval(async () => {
        const updated = await refetch()
        if (updated.data?.status === "complete" || updated.data?.status === "error") {
          clearInterval(pollInterval)
        }
      }, 1000)

      // Stop polling after 60 seconds
      setTimeout(() => clearInterval(pollInterval), 60000)
    }
  }, [selectedType, generateAnalysis, refetch])

  // Handle generate all
  const handleGenerateAll = useCallback(async () => {
    await generateAll()
  }, [generateAll])

  const handleSkip = useCallback(async () => {
    await cancelAnalysis()
  }, [cancelAnalysis])

  // Handle refresh check
  const handleCheckRefresh = useCallback(() => {
    if (!diagram?.id) return

    // This would check git status and file hashes
    // For now, we'll just clear the refresh flag
    setNeedsRefresh(false)
    setRefreshReason(null)
  }, [diagram?.id, setNeedsRefresh, setRefreshReason])

  // On node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode({
        id: node.id,
        data: node.data as Record<string, unknown>,
        position: node.position,
      })
    },
    [setSelectedNode]
  )

  // Empty state
  if (!selectedType) {
    return (
      <TooltipProvider>
        <div className="h-full flex flex-col bg-background">
          {/* Main content area */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-muted-foreground mb-4">
              Select an analysis type from the tabs below to get started
            </div>
          </div>

          {/* Bottom panel with tabs */}
          <div className="border-t border-border">
            <AnalysisTypeTabs projectId={projectId} />
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold capitalize">{selectedType} Analysis</h3>
            {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-1">
            {needsRefresh && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleCheckRefresh} className="text-amber-500">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Changes detected
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{refreshReason || "Code changes detected"}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateAll}
                  disabled={isGenerating}
                  className="hidden sm:flex"
                >
                  <Play className="h-4 w-4 mr-1" />
                  Generate All
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generate all 4 analysis types in parallel</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={isGenerating ? handleSkip : handleGenerate}
                  className={isGenerating ? "text-destructive hover:text-destructive" : ""}
                >
                  {isGenerating ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isGenerating ? "Skip/Cancel analysis" : "Regenerate analysis"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* React Flow diagram */}
          <div className="flex-1 relative">
            {error ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <div className="text-destructive font-medium mb-2">Error loading diagram</div>
                <div className="text-muted-foreground text-sm mb-4">{error}</div>
                <Button onClick={handleGenerate} variant="outline">
                  Try Again
                </Button>
              </div>
            ) : nodes.length === 0 && !isLoading ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="text-muted-foreground mb-4">
                  No diagram data available. Generate an analysis to see the visualization.
                </div>
                <Button onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Generate {selectedType} Analysis
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={{
                  type: "smoothstep",
                  style: { stroke: "#64748b", strokeWidth: 2 },
                  markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
                }}
                minZoom={0.1}
                maxZoom={2}
                fitView
                attributionPosition="bottom-right"
              >
                <Background variant="dots" gap={20} size={1} />
                <Controls />
                <MiniMap
                  className="bg-background border border-border rounded-lg shadow-sm"
                  maskColor="rgb(0, 0, 0, 0.1)"
                  nodeColor={(node) => {
                    const flowType = node.data?.flowType as string
                    const type = node.data?.type as string
                    const nodeType = flowType || type

                    switch (nodeType) {
                      // Flowchart node types
                      case "start":
                      case "end":
                        return "#10b981" // emerald
                      case "process":
                        return "#3b82f6" // blue
                      case "decision":
                        return "#f59e0b" // amber
                      case "data":
                        return "#a855f7" // purple
                      case "subprocess":
                        return "#f97316" // orange

                      // Legacy node types
                      case "table":
                        return "#3b82f6"
                      case "service":
                        return "#22c55e"
                      case "database":
                        return "#a855f7"
                      case "frontend":
                        return "#f97316"
                      default:
                        return "#6b7280"
                    }
                  }}
                />
              </ReactFlow>
            )}
          </div>

          {/* Right sidebar for node details */}
          {selectedNode && bottomTab === "details" && (
            <div
              className="border-l border-border bg-muted/30 overflow-y-auto"
              style={{ width: sidebarWidth }}
            >
              <AnalyzeNodeDetails node={selectedNode} onClose={() => setSelectedNode(null)} />
            </div>
          )}
        </div>

        {/* Bottom panel with tabs */}
        <div className="border-t border-border">
          <AnalysisTypeTabs />
        </div>
      </div>
    </TooltipProvider>
  )
}

export function AnalyzePanel(props: AnalyzePanelProps) {
  return (
    <ReactFlowProvider>
      <AnalyzePanelInner {...props} />
    </ReactFlowProvider>
  )
}
