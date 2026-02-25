"use client"

import { useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronRight, FileText, GitBranch, MessageSquare, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Sparkles } from "lucide-react"
import {
  selectedWorkflowNodeAtom,
  selectedWorkflowCategoryAtom,
  workflowViewModeAtom,
  workflowReviewDialogOpenAtom,
} from "../atoms"
import { selectedProjectAtom } from "../../agents/atoms"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { lintWorkflowFile, getLintStatusSummary } from "../lib/markdown-linter"
import { AiAssistantDialog } from "../../../components/ai-assistant-dialog"

/**
 * Phrases that indicate review is complete
 */
const REVIEW_COMPLETION_PHRASES = [
  "review complete",
  "file looks good",
  "no issues found",
  "all checks passed",
  "suggestions implemented",
  "changes applied",
]

/**
 * Header for workflow detail panel
 * Shows breadcrumb, view toggle, validation status, and actions
 */
export function WorkflowDetailHeader() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const selectedCategory = useAtomValue(selectedWorkflowCategoryAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [viewMode, setViewMode] = useAtom(workflowViewModeAtom)
  const [reviewDialogOpen, setReviewDialogOpen] = useAtom(workflowReviewDialogOpenAtom)
  const utils = trpc.useUtils()

  // Fetch file content for linting and review
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

    // For MCP servers, also invalidate server list and tool queries
    if (selectedNode?.type === "mcpServer" && selectedProject?.path) {
      // Refresh server settings/configuration
      await utils.mcp.listServers.invalidate({ projectPath: selectedProject.path })

      // Refresh session-cached tools for this server
      await utils.mcp.getSessionTools.invalidate({
        projectPath: selectedProject.path,
        serverId: selectedNode.id,
      })

      // Refresh direct tool query for this server
      await utils.mcp.getServerTools.invalidate({
        serverId: selectedNode.id,
        projectPath: selectedProject.path,
      })

      console.log("[workflows] Refreshed MCP server:", selectedNode.id)
    }

    console.log("[workflows] Refreshed workflow graph")
  }

  // Build the review context with file path (AI will read the file directly)
  const buildReviewContext = () => {
    if (!selectedNode?.sourcePath) return ""

    const hasLintIssues = lintStatus && lintStatus.status !== "valid"

    // Format linting issues with full details
    const formatLintIssue = (issue: any, severity: string) => {
      const parts = [
        `- **${severity}**`,
        issue.line ? `(line ${issue.line}${issue.column ? `:${issue.column}` : ''})` : '',
        issue.field ? `[${issue.field}]` : '',
        `: ${issue.message}`,
      ].filter(Boolean)

      let formatted = parts.join(' ')

      if (issue.suggestion) {
        formatted += `\n  💡 Suggestion: ${issue.suggestion}`
      }
      if (issue.fixable) {
        formatted += `\n  ✨ Auto-fixable`
      }

      return formatted
    }

    // Re-run linting to get full results for context
    let type: "agent" | "command" | "skill" = "command"
    if (selectedNode.type === "agent") {
      type = "agent"
    } else if (selectedNode.type === "skill") {
      type = "skill"
    }
    const lintResults = fileContent ? lintWorkflowFile(fileContent, type) : null

    const lintIssuesSection = hasLintIssues && lintResults
      ? `

## Linting Issues Found

${lintResults.errors.length > 0 ? `### Errors (${lintResults.errors.length})
${lintResults.errors.map((e) => formatLintIssue(e, 'Error')).join("\n\n")}` : ''}

${lintResults.warnings.length > 0 ? `### Warnings (${lintResults.warnings.length})
${lintResults.warnings.map((w) => formatLintIssue(w, 'Warning')).join("\n\n")}` : ''}`
      : "\n## Linting Issues\nNo linting issues detected."

    return `Review this ${selectedNode.type} markdown file:

File: ${selectedNode.name}
Path: ${selectedNode.sourcePath}
Type: ${selectedNode.type}
${lintIssuesSection}

Read the file at the path above and analyze:
1. **Correctness**: Is the markdown properly formatted? Are all required sections present?
2. **Linting Issues**: Address any linting errors or warnings listed above
3. **Content Quality**: Is the content clear, complete, and well-structured?
4. **Suggestions**: Provide specific recommendations for fixes`
  }

  if (!selectedNode) return null

  // MCPs don't have markdown/flowchart views - they have a custom view
  const showViewToggle = selectedNode.type !== "mcpServer"

  return (
    <>
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

              <div className="w-px h-6 bg-border mx-1" />

              <button
                onClick={() => setViewMode("chat")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
                  viewMode === "chat"
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </button>

              <div className="w-px h-6 bg-border mx-1" />

              <button
                onClick={() => setReviewDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Review
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

      {/* Review Dialog */}
      {selectedNode.type !== "mcpServer" && (
        <AiAssistantDialog
          open={reviewDialogOpen}
          onClose={() => setReviewDialogOpen(false)}
          title={`Review: ${selectedNode.name}`}
          description={`${selectedNode.type} file review with Claude`}
          icon={Sparkles}
          placeholder="Ask about specific issues or request improvements..."
          hint="The AI will analyze your file and suggest improvements."
          completionPhrases={REVIEW_COMPLETION_PHRASES}
          promptContext={buildReviewContext()}
          systemPromptType="review"
          autoSendInitialMessage={true}
          initialMessage={`Review this Claude ${selectedNode.type} file for correctness and quality.`}
          projectPath={selectedProject?.path}
          contextKey={selectedNode.sourcePath}
          completeMessage="Review complete"
          completeDescription="The file review is finished. You can close this dialog."
        />
      )}
    </>
  )
}
