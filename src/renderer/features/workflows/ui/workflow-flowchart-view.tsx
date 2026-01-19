"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { useAtomValue } from "jotai"
import mermaid from "mermaid"
import { selectedWorkflowNodeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import {
  generateMermaidFromAgent,
  generateMermaidForCommandOrSkill,
} from "../lib/mermaid-generator"
import { Loader2 } from "lucide-react"

// Initialize Mermaid once
let mermaidInitialized = false

/**
 * Flowchart view for workflow files
 * Visualizes dependencies using Mermaid.js
 */
export function WorkflowFlowchartView() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const { data: workflowGraph } = trpc.workflows.getWorkflowGraph.useQuery()
  const [isRendering, setIsRendering] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize Mermaid
  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 14,
        flowchart: {
          curve: "basis",
          padding: 20,
          nodeSpacing: 50,
          rankSpacing: 50,
        },
      })
      mermaidInitialized = true
    }
  }, [])

  // Generate mermaid syntax
  const mermaidCode = useMemo(() => {
    if (!selectedNode || !workflowGraph) return ""

    try {
      if (selectedNode.type === "agent") {
        const agent = workflowGraph.agents.find(a => a.id === selectedNode.id)
        return agent ? generateMermaidFromAgent(agent) : ""
      } else if (selectedNode.type === "command" || selectedNode.type === "skill") {
        return generateMermaidForCommandOrSkill(
          selectedNode.type,
          selectedNode.name,
          workflowGraph.agents
        )
      }
    } catch (err) {
      console.error("[workflow-flowchart] Failed to generate mermaid:", err)
      setError(err instanceof Error ? err.message : "Failed to generate flowchart")
      return ""
    }

    return ""
  }, [selectedNode, workflowGraph])

  // Render mermaid when code changes
  useEffect(() => {
    if (!mermaidCode || !containerRef.current) {
      setIsRendering(false)
      return
    }

    setIsRendering(true)
    setError(null)

    const render = async () => {
      try {
        // Clear previous content
        if (containerRef.current) {
          containerRef.current.innerHTML = ""
        }

        // Generate unique ID for this diagram
        const id = `mermaid-${Date.now()}`

        // Render mermaid
        const { svg } = await mermaid.render(id, mermaidCode)

        // Insert SVG
        if (containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch (err) {
        console.error("[workflow-flowchart] Failed to render mermaid:", err)
        setError(err instanceof Error ? err.message : "Failed to render flowchart")
      } finally {
        setIsRendering(false)
      }
    }

    render()
  }, [mermaidCode])

  if (!selectedNode) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Select a file to view flowchart</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center space-y-2 max-w-md">
          <p className="text-sm text-destructive font-medium">
            Failed to generate flowchart
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-background">
      {isRendering && (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Mermaid container */}
      <div
        ref={containerRef}
        className="p-8 min-h-full flex items-center justify-center"
        style={{ display: isRendering ? "none" : "flex" }}
      />
    </div>
  )
}
