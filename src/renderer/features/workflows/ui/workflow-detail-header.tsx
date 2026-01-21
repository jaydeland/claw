"use client"

import { useAtom, useAtomValue } from "jotai"
import { ChevronRight, FileText, GitBranch, RefreshCw } from "lucide-react"
import {
  selectedWorkflowNodeAtom,
  selectedWorkflowCategoryAtom,
  workflowViewModeAtom,
} from "../atoms"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"

/**
 * Header for workflow detail panel
 * Shows breadcrumb, view toggle, and actions
 */
export function WorkflowDetailHeader() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const selectedCategory = useAtomValue(selectedWorkflowCategoryAtom)
  const [viewMode, setViewMode] = useAtom(workflowViewModeAtom)
  const utils = trpc.useUtils()

  const handleRefresh = async () => {
    await utils.workflows.getWorkflowGraph.invalidate()
    console.log("[workflows] Refreshed workflow graph")
  }

  if (!selectedNode) return null

  return (
    <div className="border-b bg-background p-4 space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Workflows</span>
        <ChevronRight className="h-3 w-3" />
        <span className="capitalize">{selectedCategory}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">{selectedNode.name}</span>
      </div>

      {/* View Toggle and Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("markdown")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
              viewMode === "markdown"
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <FileText className="h-4 w-4" />
            Markdown
          </button>

          <button
            onClick={() => setViewMode("flowchart")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
              viewMode === "flowchart"
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <GitBranch className="h-4 w-4" />
            Flowchart
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title="Refresh workflow graph (use after changing settings)"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
    </div>
  )
}
