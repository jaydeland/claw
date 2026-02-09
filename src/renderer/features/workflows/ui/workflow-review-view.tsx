"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Loader2, Sparkles, AlertCircle, CheckCircle2, X } from "lucide-react"
import { selectedWorkflowNodeAtom, workflowPanelOpenAtom } from "../atoms"
import { selectedAgentChatIdAtom, selectedProjectAtom } from "../../agents/atoms"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { lintWorkflowFile } from "../lib/markdown-linter"
import { toast } from "sonner"
import * as path from "path"
import { ChatView } from "../../agents/main/active-chat"

/**
 * Review With Claude View
 * Creates an interactive Claude session in the MD file's directory
 * Automatically sends review prompt and allows continued interaction
 * Uses Opus model for comprehensive analysis
 */
export function WorkflowReviewView() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setWorkflowPanelOpen = useSetAtom(workflowPanelOpenAtom)
  const [reviewChatId, setReviewChatId] = useState<string | null>(null)
  const [hasStartedReview, setHasStartedReview] = useState(false)

  // Use ref to prevent double-execution in StrictMode and race conditions
  // Refs update synchronously, unlike state which is batched
  const isStartingReviewRef = useRef(false)

  // Get or create the Home workspace (always use Home for reviews)
  const { data: homeWorkspace } = trpc.projects.getHomeWorkspace.useQuery()

  // Fetch file content
  const utils = trpc.useUtils()
  const { data: fileContent } = trpc.workflows.readFileContent.useQuery(
    { path: selectedNode?.sourcePath || "" },
    { enabled: !!selectedNode?.sourcePath && selectedNode?.type !== "mcpServer" }
  )

  // Watch for file changes and auto-refresh
  trpc.workflows.watchFile.useSubscription(
    { path: selectedNode?.sourcePath || "" },
    {
      enabled: !!selectedNode?.sourcePath && selectedNode?.type !== "mcpServer",
      onData: () => {
        console.log('[WorkflowReview] File changed, refreshing content...')
        // Invalidate and refetch file content (linting will auto-update via useMemo)
        utils.workflows.readFileContent.invalidate({ path: selectedNode?.sourcePath || "" })
      },
      onError: (error) => {
        console.error('[WorkflowReview] File watch error:', error)
      },
    }
  )

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

  // Create chat mutation
  const createChatMutation = trpc.chats.create.useMutation({
    onSuccess: (data) => {
      setReviewChatId(data.id)
      setSelectedChatId(data.id)
      utils.chats.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Auto-start review session when tab opens
  // Uses ref to prevent double-execution in React StrictMode
  useEffect(() => {
    // Guard: Check all conditions including ref (synchronous check)
    if (
      fileContent &&
      selectedNode &&
      homeWorkspace &&
      !hasStartedReview &&
      !reviewChatId &&
      !isStartingReviewRef.current &&
      !createChatMutation.isPending
    ) {
      handleStartReview()
    }
  }, [fileContent, selectedNode, homeWorkspace, hasStartedReview, reviewChatId, createChatMutation.isPending])

  // Persist review chat ID per file to reconnect to existing sessions
  const reviewChatIdStorageKey = `workflow-review-chat:${selectedNode?.sourcePath}`

  // Load persisted review chat ID when file changes
  useEffect(() => {
    // Reset state first
    setReviewChatId(null)
    setHasStartedReview(false)
    isStartingReviewRef.current = false

    // Then try to load persisted session
    if (selectedNode?.sourcePath) {
      const stored = localStorage.getItem(reviewChatIdStorageKey)
      if (stored) {
        // Verify the chat still exists
        utils.chats.get.fetch({ id: stored }).then((chat) => {
          if (chat) {
            console.log('[WorkflowReview] Reconnecting to existing review session:', stored)
            setReviewChatId(stored)
            setSelectedChatId(stored)
            setHasStartedReview(true)
            isStartingReviewRef.current = true
          } else {
            // Chat was deleted, clear storage
            console.log('[WorkflowReview] Stored chat not found, will create new session')
            localStorage.removeItem(reviewChatIdStorageKey)
          }
        }).catch(() => {
          localStorage.removeItem(reviewChatIdStorageKey)
        })
      }
    }
  }, [selectedNode?.sourcePath, reviewChatIdStorageKey, utils.chats.get, setSelectedChatId])

  // Persist review chat ID when created
  useEffect(() => {
    if (reviewChatId && selectedNode?.sourcePath) {
      localStorage.setItem(reviewChatIdStorageKey, reviewChatId)
    }
  }, [reviewChatId, selectedNode?.sourcePath, reviewChatIdStorageKey])

  const handleStartReview = async () => {
    if (!fileContent || !selectedNode || !homeWorkspace) return

    // Guard: Prevent double execution with synchronous ref check
    if (isStartingReviewRef.current || createChatMutation.isPending) return

    // Set ref immediately (synchronous) to prevent race conditions
    // This runs before state updates are batched
    isStartingReviewRef.current = true
    setHasStartedReview(true)

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

    const lintIssuesSection = hasLintIssues
      ? `

## Linting Issues Found

${lintResults!.errors.length > 0 ? `### Errors (${lintResults!.errors.length})
${lintResults!.errors.map((e) => formatLintIssue(e, 'Error')).join("\n\n")}` : ''}

${lintResults!.warnings.length > 0 ? `### Warnings (${lintResults!.warnings.length})
${lintResults!.warnings.map((w) => formatLintIssue(w, 'Warning')).join("\n\n")}` : ''}`
      : "\n## Linting Issues\nNo linting issues detected."

    const reviewPrompt = `Review this ${selectedNode.type} markdown file for correctness and quality.

File: ${selectedNode.name}
Path: ${selectedNode.sourcePath}
Type: ${selectedNode.type}

${lintIssuesSection}

## Content to Review
\`\`\`markdown
${fileContent}
\`\`\`

Please analyze:
1. **Correctness**: Is the markdown properly formatted? Are all required sections present?
2. **Linting Issues**: Address any linting errors or warnings listed above
3. **Content Quality**: Is the content clear, complete, and well-structured?
4. **Suggestions**: Provide specific recommendations for fixes

If there are no issues, confirm the file is correct and ask if I'd like suggestions for potential improvements.`

    // Create a new chat in the Home workspace with Opus
    createChatMutation.mutate({
      projectId: homeWorkspace.id,
      name: `Review: ${selectedNode.name}`,
      initialMessageParts: [{ type: "text", text: reviewPrompt }],
      useWorktree: false, // Use Home workspace path directly
      mode: "agent",
      model: "opus", // Use Opus for comprehensive review
      // Note: The chat will run in the Home workspace directory
      // The MD file will be accessible via its absolute path
    })
  }

  if (!selectedNode || selectedNode.type === "mcpServer") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Review not available for this item</p>
      </div>
    )
  }

  if (!fileContent) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!homeWorkspace) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground ml-2">Loading Home workspace...</p>
      </div>
    )
  }

  // Show loading while creating chat
  if (createChatMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Starting interactive review session with Opus...
        </p>
      </div>
    )
  }

  // Once chat is created, show the chat interface embedded in this view
  if (reviewChatId) {
    return (
      <div className="flex flex-col h-full">
        {/* Header with file info and close button */}
        <div className="flex-shrink-0 border-b bg-muted/30 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  Review: {selectedNode.name}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                  <span className={hasLintIssues ? "text-amber-500" : "text-green-500"}>
                    {issuesSummary}
                  </span>
                  <span className="text-muted-foreground/50">•</span>
                  <span>Opus</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 flex-shrink-0"
              onClick={() => {
                // Reset review state to show initial view
                setReviewChatId(null)
                setHasStartedReview(false)
                isStartingReviewRef.current = false
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Embedded chat interface */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatView
            chatId={reviewChatId}
            isSidebarOpen={false}
            onToggleSidebar={() => {}}
            selectedTeamName={undefined}
            selectedTeamImageUrl={undefined}
            isMobileFullscreen={false}
            onBackToChats={() => {}}
            onOpenPreview={() => {}}
            onOpenDiff={() => {}}
            onOpenTerminal={() => {}}
          />
        </div>
      </div>
    )
  }

  // Initial state - ready to start
  return (
    <div className="flex flex-col h-full">
      {/* Status Bar */}
      <div className="flex-shrink-0 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Linting Status */}
            <div className="flex items-center gap-2 text-sm">
              {hasLintIssues ? (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-muted-foreground">{issuesSummary}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">No linting issues</span>
                </>
              )}
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleStartReview}
            disabled={createChatMutation.isPending || hasStartedReview}
            className="gap-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Start Review Session
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <Sparkles className="h-16 w-16 text-primary opacity-20" />
        <div className="text-center space-y-3 max-w-md">
          <h3 className="text-lg font-semibold">Interactive Review with Opus</h3>
          <p className="text-sm text-muted-foreground">
            Click "Start Review Session" to create an interactive Claude session that will:
          </p>
          <ul className="text-sm text-muted-foreground text-left space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Run in the directory where your {selectedNode.type} file is located</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Automatically review the file for correctness and linting issues</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Allow you to continue the conversation and request improvements</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Use Opus for the most comprehensive analysis</span>
            </li>
          </ul>
        </div>
        <div className="p-4 bg-muted/50 rounded-lg text-xs space-y-1.5 w-full max-w-md">
          <div className="flex justify-between">
            <span className="text-muted-foreground">File:</span>
            <span className="font-mono text-right truncate ml-2">{selectedNode.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Path:</span>
            <span className="font-mono text-right truncate ml-2 text-xs">
              {selectedNode.sourcePath}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Linting:</span>
            <span className={hasLintIssues ? "text-amber-500" : "text-green-500"}>
              {issuesSummary}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
