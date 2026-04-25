"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Viewport,
  MarkerType,
  BackgroundVariant,
} from "reactflow"
import "reactflow/dist/style.css"
import { toPng } from "html-to-image"
import { Loader2, Download, Database } from "lucide-react"
import { toast } from "sonner"
import { Button } from "../../../components/ui/button"
import { TableNode } from "../components/er-table-node"
import { generateNodesFromSchema, generateEdgesFromSchema, clawSchema } from "../lib/schema-parser"

export function ErDiagramView() {
  return (
    <ReactFlowProvider>
      <ErDiagramViewInner />
    </ReactFlowProvider>
  )
}

function ErDiagramViewInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [isLayouting, setIsLayouting] = useState(true)
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)

  // Initialize diagram with schema data
  useEffect(() => {
    const initialNodes = generateNodesFromSchema()
    const initialEdges = generateEdgesFromSchema()

    // Apply simple grid layout for initial render
    const layoutedNodes = applyGridLayout(initialNodes)
    const layoutedEdges = initialEdges

    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
    setIsLayouting(false)
  }, [setNodes, setEdges])

  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent, viewport: Viewport) => {
    // Could persist viewport to localStorage if desired
    console.log("Viewport changed:", viewport)
  }, [])

  const exportToPng = useCallback(async () => {
    if (!reactFlowInstance || nodes.length === 0) {
      toast.error("Diagram not ready")
      return
    }

    try {
      // Fit view first
      reactFlowInstance.fitView({ padding: 0.2 })
      await new Promise(resolve => setTimeout(resolve, 500))

      // Calculate bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

      nodes.forEach((node) => {
        const x = node.position.x
        const y = node.position.y
        const width = node.width || 220
        const height = node.height || (node.data?.columns?.length || 5) * 24 + 60

        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + width)
        maxY = Math.max(maxY, y + height)
      })

      const padding = 80
      minX -= padding
      minY -= padding
      maxX += padding
      maxY += padding

      const width = maxX - minX
      const height = maxY - minY

      // Create canvas and draw
      const canvas = document.createElement("canvas")
      const scale = 2
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        toast.error("Canvas not available")
        return
      }

      ctx.scale(scale, scale)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, width, height)

      // Draw edges first
      ctx.strokeStyle = "#64748b"
      ctx.lineWidth = 2

      edges.forEach((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source)
        const targetNode = nodes.find(n => n.id === edge.target)

        if (sourceNode && targetNode) {
          const sx = sourceNode.position.x + (sourceNode.width || 220) / 2 - minX
          const sy = sourceNode.position.y + (sourceNode.height || 100) - minY
          const tx = targetNode.position.x + (targetNode.width || 220) / 2 - minX
          const ty = targetNode.position.y - minY

          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(tx, ty)
          ctx.stroke()

          // Arrow head
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
        }
      })

      // Draw nodes
      nodes.forEach((node) => {
        const x = node.position.x - minX
        const y = node.position.y - minY
        const w = node.width || 220
        const h = (node.data?.columns?.length || 5) * 24 + 60

        // Shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.15)"
        ctx.shadowBlur = 8
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 3

        // Background
        ctx.fillStyle = "#ffffff"
        ctx.strokeStyle = "#94a3b8"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, 8)
        ctx.fill()
        ctx.stroke()

        // Reset shadow
        ctx.shadowColor = "transparent"

        // Header
        const gradient = ctx.createLinearGradient(x, y, x, y + 40)
        gradient.addColorStop(0, "#2563eb")
        gradient.addColorStop(1, "#1d4ed8")
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, y, w, 40, [8, 8, 0, 0])
        ctx.fill()

        // Table name
        ctx.font = "600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        ctx.fillStyle = "#ffffff"
        ctx.textAlign = "center"
        ctx.fillText(node.data?.tableName || node.id, x + w / 2, y + 22)

        // Columns
        ctx.textAlign = "left"
        ctx.font = "11px 'SF Mono', 'Monaco', monospace"
        ctx.fillStyle = "#475569"

        const columns = node.data?.columns as any[] || []
        columns.forEach((col, idx) => {
          const colY = y + 52 + idx * 22
          const pkIndicator = col.isPrimaryKey ? "🔑 " : ""
          const fkIndicator = col.isForeignKey && !col.isPrimaryKey ? "🔗 " : ""
          ctx.fillText(`${pkIndicator}${fkIndicator}${col.name}  ${col.type}`, x + 12, colY)
        })
      })

      const pngDataUrl = canvas.toDataURL("image/png")

      if (!pngDataUrl || pngDataUrl.length < 100) {
        toast.error("Generated PNG is empty")
        return
      }

      const link = document.createElement("a")
      link.download = "claw-er-diagram.png"
      link.href = pngDataUrl
      link.click()
      toast.success("ER diagram exported")
    } catch (err) {
      console.error("ER diagram export failed:", err)
      toast.error("Failed to export ER diagram")
    }
  }, [reactFlowInstance, nodes, edges])

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Database Schema</h3>
          <span className="text-sm text-muted-foreground">• {clawSchema.length} tables</span>
          {isLayouting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {nodes.length > 0 && (
          <Button variant="ghost" size="sm" onClick={exportToPng} className="h-7 px-2 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export PNG
          </Button>
        )}
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onMoveEnd={handleMoveEnd}
          onInit={setReactFlowInstance}
          nodeTypes={{ table: TableNode }}
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { stroke: "#64748b", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
          }}
          minZoom={0.1}
          maxZoom={2}
          attributionPosition="bottom-right"
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
          <MiniMap
            className="bg-background border border-border rounded-lg shadow-sm"
            maskColor="rgb(0, 0, 0, 0.1)"
            nodeColor={(node) => {
              return "#3b82f6"
            }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}

/**
 * Apply a simple grid layout to nodes
 * This is a simpler alternative to ELK for ER diagrams
 */
function applyGridLayout(nodes: Node[]): Node[] {
  const columns = 4
  const rowHeight = 280
  const colWidth = 280
  const hGap = 50
  const vGap = 50

  return nodes.map((node, idx) => {
    const row = Math.floor(idx / columns)
    const col = idx % columns
    return {
      ...node,
      position: {
        x: col * (colWidth + hGap),
        y: row * (rowHeight + vGap),
      },
      width: colWidth,
      height: (node.data?.columns?.length || 5) * 24 + 60,
    }
  })
}
