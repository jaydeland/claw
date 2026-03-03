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
import { toPng, toSvg } from "html-to-image"
import { Loader2, AlertCircle, Download, GitBranch, Database, Layers, Wrench } from "lucide-react"
import { toast } from "sonner"
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

  const generatePngDataUrl = useCallback(async (): Promise<string | null> => {
    if (!reactFlowInstance || nodes.length === 0) {
      console.error("[VisualizeView] ReactFlow instance not available or no nodes")
      return null
    }

    try {
      // Fit view to ensure all nodes are visible
      reactFlowInstance.fitView({ padding: 0.2 })

      // Wait for layout to settle
      await new Promise(resolve => setTimeout(resolve, 500))

      // Calculate bounds from all nodes with extra space for descriptions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

      nodes.forEach((node) => {
        const x = node.position.x
        const y = node.position.y
        // Increase default width/height to accommodate text
        const width = (node.width || 180)
        const height = (node.height || 80)

        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + width)
        maxY = Math.max(maxY, y + height)
      })

      // Add generous padding
      const padding = 80
      minX -= padding
      minY -= padding
      maxX += padding
      maxY += padding

      const width = maxX - minX
      const height = maxY - minY

      console.log("[VisualizeView] Canvas dimensions:", { width, height, nodeCount: nodes.length })

      // Create a canvas and draw the graph manually with higher resolution
      const canvas = document.createElement("canvas")
      const scale = 3 // Higher resolution for better text quality
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        console.error("[VisualizeView] Canvas context not available")
        return null
      }

      // Scale context for high DPI
      ctx.scale(scale, scale)

      // Fill white background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, width, height)

      // Draw edges first (so they're behind nodes)
      ctx.strokeStyle = "#64748b"
      ctx.lineWidth = 2

      edges.forEach((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source)
        const targetNode = nodes.find(n => n.id === edge.target)

        if (sourceNode && targetNode) {
          const sx = sourceNode.position.x + (sourceNode.width || 180) / 2 - minX
          const sy = sourceNode.position.y + (sourceNode.height || 80) - minY
          const tx = targetNode.position.x + (targetNode.width || 180) / 2 - minX
          const ty = targetNode.position.y - minY

          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(tx, ty)
          ctx.stroke()

          // Draw arrow head
          const angle = Math.atan2(ty - sy, tx - sx)
          const arrowLength = 12
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(
            tx - arrowLength * Math.cos(angle - Math.PI / 6),
            ty - arrowLength * Math.sin(angle - Math.PI / 6)
          )
          ctx.lineTo(
            tx - arrowLength * Math.cos(angle + Math.PI / 6),
            ty - arrowLength * Math.sin(angle + Math.PI / 6)
          )
          ctx.closePath()
          ctx.fillStyle = "#64748b"
          ctx.fill()

          // Draw edge label if available
          if (edge.label) {
            const midX = (sx + tx) / 2
            const midY = (sy + ty) / 2

            // Draw label background
            ctx.font = "400 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            const labelText = edge.label as string
            const metrics = ctx.measureText(labelText)
            const labelPadding = 6
            const labelWidth = metrics.width + labelPadding * 2
            const labelHeight = 18

            ctx.fillStyle = "#ffffff"
            ctx.strokeStyle = "#e5e7eb"
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(
              midX - labelWidth / 2,
              midY - labelHeight / 2,
              labelWidth,
              labelHeight,
              4
            )
            ctx.fill()
            ctx.stroke()

            // Draw label text
            ctx.fillStyle = "#64748b"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(labelText, midX, midY)

            // Reset text alignment
            ctx.textAlign = "left"
            ctx.textBaseline = "top"
          }
        }
      })

      // Helper to get node colors based on type
      const getNodeColors = (flowType: string): { bg: string; border: string } => {
        switch (flowType) {
          case "start":
          case "end":
            return { bg: "#ecfdf5", border: "#10b981" } // emerald
          case "process":
            return { bg: "#eff6ff", border: "#3b82f6" } // blue
          case "decision":
            return { bg: "#fffbeb", border: "#f59e0b" } // amber
          case "data":
            return { bg: "#faf5ff", border: "#a855f7" } // purple
          case "subprocess":
            return { bg: "#fff7ed", border: "#f97316" } // orange
          case "table":
            return { bg: "#eff6ff", border: "#93c5fd" } // blue-300
          case "service":
            return { bg: "#f0fdf4", border: "#86efac" } // green
          case "database":
            return { bg: "#faf5ff", border: "#d8b4fe" } // purple-300
          case "frontend":
            return { bg: "#fff7ed", border: "#fdba74" } // orange-300
          case "external":
            return { bg: "#f9fafb", border: "#d1d5db" } // gray
          case "entry":
          case "input":
            return { bg: "#ecfdf5", border: "#86efac" } // emerald-300
          case "output":
            return { bg: "#fff1f2", border: "#fda4af" } // rose-300
          default:
            return { bg: "#ffffff", border: "#e5e7eb" } // default
        }
      }

      // Draw nodes with proper styling
      ctx.textAlign = "left"
      ctx.textBaseline = "top"

      nodes.forEach((node) => {
        const x = node.position.x - minX
        const y = node.position.y - minY
        const w = node.width || 180
        const h = node.height || 80

        const flowType = (node.data?.flowType as string) || (node.data?.type as string) || "default"
        const colors = getNodeColors(flowType)

        // Draw node background with shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.15)"
        ctx.shadowBlur = 8
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 3

        ctx.fillStyle = colors.bg
        ctx.strokeStyle = colors.border
        ctx.lineWidth = 2
        ctx.beginPath()

        // Use different shapes for different types
        if (flowType === "start" || flowType === "end") {
          // Rounded pill shape
          ctx.roundRect(x, y, w, h, h / 2)
        } else {
          // Regular rounded rectangle
          ctx.roundRect(x, y, w, h, 10)
        }

        ctx.fill()
        ctx.stroke()

        // Reset shadow for text
        ctx.shadowColor = "transparent"
        ctx.shadowBlur = 0

        // Draw node label (bold, larger text)
        ctx.fillStyle = "#111827" // gray-900 for better contrast
        const label = (node.data?.label as string) || node.id
        const padding = 14

        // Set font for label measurement
        ctx.font = "600 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

        // Truncate label if too long
        const maxWidth = w - padding * 2
        let displayLabel = label
        if (ctx.measureText(label).width > maxWidth) {
          while (ctx.measureText(displayLabel + "...").width > maxWidth && displayLabel.length > 0) {
            displayLabel = displayLabel.slice(0, -1)
          }
          displayLabel += "..."
        }

        ctx.fillText(displayLabel, x + padding, y + padding)

        // Draw description if available
        if (node.data?.description) {
          ctx.font = "400 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          ctx.fillStyle = "#6b7280" // gray-500
          const desc = node.data.description as string

          // Word wrap description if needed
          const words = desc.split(" ")
          let line = ""
          let lineY = y + padding + 22
          const lineHeight = 16
          const maxLines = 2

          let lineCount = 0
          for (let i = 0; i < words.length && lineCount < maxLines; i++) {
            const testLine = line + words[i] + " "
            const metrics = ctx.measureText(testLine)

            if (metrics.width > maxWidth && i > 0) {
              ctx.fillText(line.trim(), x + padding, lineY)
              line = words[i] + " "
              lineY += lineHeight
              lineCount++
            } else {
              line = testLine
            }
          }

          // Draw last line (possibly truncated)
          if (lineCount < maxLines && line.trim()) {
            let displayLine = line.trim()
            if (ctx.measureText(displayLine).width > maxWidth) {
              while (ctx.measureText(displayLine + "...").width > maxWidth && displayLine.length > 0) {
                displayLine = displayLine.slice(0, -1)
              }
              displayLine += "..."
            }
            ctx.fillText(displayLine, x + padding, lineY)
          }
        }

        // Draw tech info if available
        if (node.data?.tech) {
          ctx.font = "400 11px 'SF Mono', 'Monaco', 'Courier New', monospace"
          ctx.fillStyle = "#6b7280" // gray-500
          const tech = node.data.tech as string
          const techY = node.data?.description ? y + h - padding - 12 : y + padding + 22

          // Truncate tech if needed
          let displayTech = tech
          if (ctx.measureText(tech).width > maxWidth) {
            while (ctx.measureText(displayTech + "...").width > maxWidth && displayTech.length > 0) {
              displayTech = displayTech.slice(0, -1)
            }
            displayTech += "..."
          }
          ctx.fillText(displayTech, x + padding, techY)
        }
      })

      const pngDataUrl = canvas.toDataURL("image/png")
      console.log("[VisualizeView] PNG generated from canvas (length):", pngDataUrl.length)

      if (!pngDataUrl || pngDataUrl.length < 100) {
        console.error("[VisualizeView] Generated PNG is empty")
        return null
      }

      return pngDataUrl
    } catch (err) {
      console.error("[VisualizeView] PNG generation failed:", err)
      return null
    }
  }, [reactFlowInstance, nodes, edges])

  const exportToPng = useCallback(async () => {
    const dataUrl = await generatePngDataUrl()
    if (!dataUrl) {
      toast.error("Failed to generate PNG")
      return
    }

    const link = document.createElement("a")
    link.download = `${repoName}-${label.toLowerCase().replace(/\s+/g, "-")}.png`
    link.href = dataUrl
    link.click()
    toast.success("PNG exported successfully")
  }, [generatePngDataUrl, repoName, label])


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
        {nodes.length > 0 && (
          <Button variant="ghost" size="sm" onClick={exportToPng} className="h-7 px-2 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export PNG
          </Button>
        )}
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