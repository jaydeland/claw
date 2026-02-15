"use client"

import { useState, useMemo, useEffect } from "react"
import { useAtomValue } from "jotai"
import { Loader2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react"
import { selectedWorkflowNodeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import { AiAssistantDialog } from "../../../components/ai-assistant-dialog"
import { lintWorkflowFile } from "../lib/markdown-linter"

/**
 * Review greeting message
 */
const REVIEW_GREETING = `I'll help you review your markdown file for correctness and quality.

Share the file content or describe what you'd like me to check, and I'll analyze:
- **Formatting**: Proper markdown structure and syntax
- **Required sections**: All necessary frontmatter and sections
- **Content quality**: Clarity, completeness, and organization
- **Best practices**: Suggestions for improvement

What would you like me to review?`

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
 * Review With Claude View
 * Opens an AI Assistant dialog to review the workflow/skill/agent file
 */
export function WorkflowReviewView() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Fetch file content
  const { data: fileContent, isLoading: isLoadingContent } = trpc.workflows.readFileContent.useQuery(
    { path: selectedNode?.sourcePath || "" },
    { enabled: !!selectedNode?.sourcePath && selectedNode?.type !== "mcpServer" }
  )

  // Auto-open dialog when file content is loaded
  useEffect(() => {
    if (fileContent && selectedNode && selectedNode.type !== "mcpServer") {
      // Small delay to ensure smooth animation
      const timer = setTimeout(() => setDialogOpen(true), 100)
      return () => clearTimeout(timer)
    }
  }, [fileContent, selectedNode?.sourcePath])

  // Run client-side linting
  const lintResults = useMemo(() => {
    if (!fileContent || !selectedNode || selectedNode.type === "mcpServer") return null

    let type: "agent" | "command" | "skill" = "command"
    if (selectedNode.type === "agent") {
      type = "agent"
    } else if (selectedNode.type === "skill") {
      type = "skill"
    }

    return lintWorkflowFile(fileContent, type)
  }, [fileContent, selectedNode])

  const hasLintIssues = lintResults && (lintResults.errors.length > 0 || lintResults.warnings.length > 0)
  const issuesSummary = lintResults
    ? `${lintResults.errors.length} error(s), ${lintResults.warnings.length} warning(s)`
    : "No linting issues"

  // Build the review context with linting results and file content
  const buildReviewContext = () => {
    if (!fileContent || !selectedNode) return ""

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

## File Content
\`\`\`markdown
${fileContent}
\`\`\`

Please analyze:
1. **Correctness**: Is the markdown properly formatted? Are all required sections present?
2. **Linting Issues**: Address any linting errors or warnings listed above
3. **Content Quality**: Is the content clear, complete, and well-structured?
4. **Suggestions**: Provide specific recommendations for fixes`
  }

  if (!selectedNode || selectedNode.type === "mcpServer") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Review not available for this item</p>
      </div>
    )
  }

  if (isLoadingContent || !fileContent) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* Background view - shows while dialog is closed */}
      {!dialogOpen && (
        <div className="flex flex-col h-full">
          {/* Status Bar */}
          <div className="flex-shrink-0 border-b bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              {hasLintIssues ? (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">{issuesSummary}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">No linting issues</span>
                </>
              )}
            </div>
          </div>

          {/* Loading state */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Starting review...</p>
          </div>
        </div>
      )}

      {/* AI Assistant Dialog for Review */}
      <AiAssistantDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`Review: ${selectedNode.name}`}
        description={`${selectedNode.type} file review with Claude`}
        icon={Sparkles}
        initialGreeting={REVIEW_GREETING}
        placeholder="Ask about specific issues or request improvements..."
        hint="The AI will analyze your file and suggest improvements."
        completionPhrases={REVIEW_COMPLETION_PHRASES}
        promptContext={buildReviewContext()}
        systemPromptType="review"
        completeMessage="Review complete"
        completeDescription="The file review is finished. You can close this dialog."
      />
    </>
  )
}
