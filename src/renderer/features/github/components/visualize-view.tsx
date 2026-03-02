"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeChange,
  type Viewport,
  MarkerType,
} from "reactflow"
import "reactflow/dist/style.css"
import { Loader2, AlertCircle, RefreshCw, GitBranch, Database, Layers, Wrench } from "lucide-react"
import { applyDiagramLayout } from "../lib/diagram-layout"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  githubDiagramDataAtom,
  githubDiagramLoadingAtom,
  githubDiagramErrorAtom,
  type FlowNode,
  type FlowEdge,
  type AnalysisType,
} from "../atoms"

interface VisualizeViewProps {
  projectId: string
  projectPath: string
  analysisType: AnalysisType
  repoName: string
}

export const VisualizeView = memo(function VisualizeView({
  projectId,
  projectPath,
  analysisType,
  repoName,
}: VisualizeViewProps) {
  return (
    <ReactFlowProvider>
      <VisualizeViewInner
        projectId={projectId}
        projectPath={projectPath}
        analysisType={analysisType}
        repoName={repoName}
      />
    </ReactFlowProvider>
  )
})

const analysisLabels: Record<AnalysisType, string> = {
  codeflow: "Code Flow",
  db: "Database",
  architecture: "Architecture",
  build: "Build System",
}

const analysisIcons: Record<AnalysisType, React.ComponentType<{ className?: string }>> = {
  codeflow: GitBranch,
  db: Database,
  architecture: Layers,
  build: Wrench,
}

function VisualizeViewInner({
  projectId,
  projectPath,
  analysisType,
  repoName,
}: VisualizeViewProps) {
  const [diagramData, setDiagramData] = useAtom(githubDiagramDataAtom)
  const [isLoading, setIsLoading] = useAtom(githubDiagramLoadingAtom)
  const [error, setError] = useAtom(githubDiagramErrorAtom)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [isLayouting, setIsLayouting] = useState(false)
  const reactFlowInstance = useReactFlow()

  const updateDiagramMutation = trpc.analyzer.update.useMutation()
  const diagramIdRef = useRef<string | null>(null)
  const saveNodesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch diagram from database
  const { data: diagram, refetch } = trpc.analyzer.get.useQuery(
    { projectId, type: analysisType },
    { enabled: !!projectId }
  )

  // Keep diagramIdRef in sync so callbacks don't go stale
  useEffect(() => {
    if (diagram?.id) diagramIdRef.current = diagram.id
  }, [diagram?.id])

  // Persist node positions after a drag ends (debounced)
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)

    const dragEnds = changes.filter(
      (c): c is NodeChange & { type: "position"; id: string; position: { x: number; y: number } } =>
        c.type === "position" && (c as any).dragging === false && !!(c as any).position
    )

    if (dragEnds.length === 0 || !diagramIdRef.current) return

    if (saveNodesTimerRef.current) clearTimeout(saveNodesTimerRef.current)
    saveNodesTimerRef.current = setTimeout(() => {
      // Apply the drag-end positions onto current nodes and save
      const posMap = new Map(dragEnds.map((c) => [(c as any).id, (c as any).position]))
      const updatedNodes: FlowNode[] = nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: posMap.get(n.id) ?? n.position,
        data: n.data as Record<string, unknown>,
        width: n.width ?? undefined,
        height: n.height ?? undefined,
      }))
      updateDiagramMutation.mutate({ id: diagramIdRef.current!, nodes: updatedNodes })
    }, 400)
  }, [nodes, onNodesChange, updateDiagramMutation])

  // Persist viewport after pan / zoom ends
  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent, viewport: Viewport) => {
    if (!diagramIdRef.current) return
    updateDiagramMutation.mutate({ id: diagramIdRef.current, viewport })
  }, [updateDiagramMutation])

  // Load diagram data when available
  useEffect(() => {
    if (diagram && diagram.nodes && diagram.edges) {
      try {
        const flowNodes = JSON.parse(diagram.nodes) as FlowNode[]
        const flowEdges = JSON.parse(diagram.edges) as FlowEdge[]
        const viewport = diagram.viewport ? JSON.parse(diagram.viewport) : null

        setDiagramData({
          nodes: flowNodes,
          edges: flowEdges,
          viewport,
          summary: diagram.summary || undefined,
          stats: diagram.stats ? JSON.parse(diagram.stats) : undefined,
        })

        // Transform to React Flow format
        const transformedNodes: Node[] = flowNodes.map((n) => ({
          id: n.id,
          type: n.type || "default",
          position: n.position,
          data: n.data,
          width: n.width,
          height: n.height,
        }))

        const nodeIdSet = new Set(transformedNodes.map((n) => n.id))

        const strokeColor = "#64748b"
        const transformedEdges: Edge[] = flowEdges
          .map((e, index) => {
            const rawEdge = e as Record<string, unknown>
            let source = e.source || (rawEdge.from as string)
            let target = e.target || (rawEdge.to as string)

            if (source === "undefined") source = undefined
            if (target === "undefined") target = undefined

            if (!source || !target) {
              return null
            }

            // Skip edges that reference non-existent nodes
            if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) {
              return null
            }

            const edge: Edge = {
              id: e.id || `edge-${index}`,
              source,
              target,
              type: e.type || "smoothstep",
              label: e.label,
              data: e.data,
              animated: e.data?.critical || false,
              style: { stroke: strokeColor, strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
            }

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

        // Apply ELK layout when no saved viewport exists (new or regenerated diagram).
        // When a viewport is saved the user manually arranged the diagram — preserve it.
        if (!viewport) {
          setIsLayouting(true)
          applyDiagramLayout(transformedNodes, transformedEdges)
            .then(({ nodes: ln, edges: le }) => {
              setNodes(ln)
              setEdges(le)
              // Persist ELK positions immediately so they survive the next load
              if (diagram?.id) {
                const flowNodes: FlowNode[] = ln.map((n) => ({
                  id: n.id,
                  type: n.type,
                  position: n.position,
                  data: n.data as Record<string, unknown>,
                  width: n.width ?? undefined,
                  height: n.height ?? undefined,
                }))
                updateDiagramMutation.mutate({ id: diagram.id, nodes: flowNodes })
              }
              // fitView then save resulting viewport (300ms for animation)
              setTimeout(() => {
                reactFlowInstance.fitView({ padding: 0.15, duration: 200 })
                setTimeout(() => {
                  if (diagram?.id) {
                    updateDiagramMutation.mutate({
                      id: diagram.id,
                      viewport: reactFlowInstance.getViewport(),
                    })
                  }
                }, 300)
              }, 50)
            })
            .finally(() => setIsLayouting(false))
        } else {
          setNodes(transformedNodes)
          setEdges(transformedEdges)
          reactFlowInstance.setViewport(viewport)
        }
      } catch (err) {
        console.error("Failed to parse diagram data:", err)
        setError("Failed to parse diagram data")
      }
    }
  }, [diagram, setDiagramData, setNodes, setEdges, reactFlowInstance, setError])

  const Icon = analysisIcons[analysisType]
  const label = analysisLabels[analysisType]

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">{label}</h3>
          <span className="text-sm text-muted-foreground">• {repoName}</span>
          {isLayouting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <div className="text-destructive font-medium mb-2">Error loading diagram</div>
            <div className="text-muted-foreground text-sm mb-4">{error}</div>
            <Button variant="outline" onClick={() => setError(null)}>
              Clear Error
            </Button>
          </div>
        ) : nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <div className="text-muted-foreground mb-4">
              No diagram data available. Click "Generate" in the chat pane to create one.
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onMoveEnd={handleMoveEnd}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { stroke: "#64748b", strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
            }}
            minZoom={0.1}
            maxZoom={2}
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
                  case "start":
                  case "end":
                    return "#10b981"
                  case "process":
                    return "#3b82f6"
                  case "decision":
                    return "#f59e0b"
                  case "data":
                    return "#a855f7"
                  case "subprocess":
                    return "#f97316"
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
    </div>
  )
}

// Custom node component (reused from analyze-panel)
function AnalysisNode({ data, id }: { data: Record<string, unknown>; id: string }) {
  const nodeType = (data.type as string) || "default"
  const flowType = (data.flowType as string) || nodeType

  const getNodeStyle = () => {
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
    <>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !border-slate-500" />
      <div
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
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !border-slate-500" />
    </>
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