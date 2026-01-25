"use client"

import { useMemo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { ChevronRight, FileText, GitBranch, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react"
import {
  selectedWorkflowNodeAtom,
  selectedWorkflowCategoryAtom,
  workflowViewModeAtom,
} from "../atoms"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { lintWorkflowFile, getLintStatusSummary } from "../lib/markdown-linter"

/**
 * Header for workflow detail panel
 * Shows breadcrumb, view toggle, validation status, and actions
 */
export function WorkflowDetailHeader() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const selectedCategory = useAtomValue(selectedWorkflowCategoryAtom)
  const [viewMode, setViewMode] = useAtom(workflowViewModeAtom)
  const utils = trpc.useUtils()

  // Fetch file content for linting
  const { data: fileContent } = trpc.workflows.readFileContent.useQuery(
    { path: selectedNode?.sourcePath || "" },
    { enabled: !!selectedNode?.sourcePath && selectedNode?.type !== "mcpServer" }
  )

  // Run client-side linting
  const lintStatus = useMemo(() => {
    if (!fileContent || !selectedNode || selectedNode.type === "mcpServer") return null

    let type: "agent" | "command" | "skill" = "command"
    if (selectedNode.type === "agent") {
      type = "agent"
    } else if (selectedNode.type === "skill") {
      type = "skill"
    }

    const result = lintWorkflowFile(fileContent, type)
    return getLintStatusSummary(result)
  }, [fileContent, selectedNode])

  const handleRefresh = async () => {
    await utils.workflows.getWorkflowGraph.invalidate()
    console.log("[workflows] Refreshed workflow graph")
  }

  if (!selectedNode) return null

  // MCPs don't have markdown/flowchart views - they have a custom view
  const showViewToggle = selectedNode.type !== "mcpServer"

  return (
    <div className="border-b bg-background p-4 space-y-3">
      {/* Breadcrumb with validation status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Workflows</span>
          <ChevronRight className="h-3 w-3" />
          <span
            className="capitalize"
            title={selectedCategory === "agents" ? "Subagents (formerly called agents)" : undefined}
          >
            {selectedCategory === "agents" ? "Subagents" : selectedCategory}
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{selectedNode.name}</span>
        </div>

        {/* Validation Status Badge */}
        {lintStatus && (
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
              lintStatus.status === "valid" && "bg-green-500/10 text-green-500",
              lintStatus.status === "warnings" && "bg-yellow-500/10 text-yellow-500",
              lintStatus.status === "errors" && "bg-red-500/10 text-red-500"
            )}
          >
            {lintStatus.status === "valid" && <CheckCircle2 className="h-3 w-3" />}
            {lintStatus.status === "warnings" && <AlertTriangle className="h-3 w-3" />}
            {lintStatus.status === "errors" && <AlertCircle className="h-3 w-3" />}
            <span>{lintStatus.text}</span>
          </div>
        )}
      </div>

      {/* View Toggle and Actions */}
      <div className="flex items-center justify-between">
        {showViewToggle ? (
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
        ) : (
          <div>{/* Empty div to maintain spacing */}</div>
        )}

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
