"use client"

import { memo, useCallback, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Send,
  Loader2,
  Sparkles,
  GitPullRequest,
  CircleDot,
  FileCode,
  GitBranch,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import {
  githubSelectionAtom,
  githubChatMessagesAtom,
  githubChatContextAtom,
  githubChatLoadingAtom,
  type GitHubSelection,
  type GitHubChatMessage,
  type AnalysisType,
} from "../atoms"
import { trpc } from "../../../lib/trpc"

// Analysis labels
const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  codeflow: "Code Flow",
  db: "Database",
  architecture: "Architecture",
  build: "Build System",
}

interface GitHubChatPaneProps {
  projectId: string
  projectPath: string
  selection: GitHubSelection
}

export const GitHubChatPane = memo(function GitHubChatPane({
  projectId,
  projectPath,
  selection,
}: GitHubChatPaneProps) {
  const messages = useAtomValue(githubChatMessagesAtom)
  const chatContext = useAtomValue(githubChatContextAtom)
  const isLoading = useAtomValue(githubChatLoadingAtom)
  const setMessages = useSetAtom(githubChatMessagesAtom)
  const setChatContext = useSetAtom(githubChatContextAtom)
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track analysis generation state
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState<string | null>(null)

  // tRPC mutations and queries
  const generateMutation = trpc.analyzer.generateViaBackground.useMutation()
  const { data: existingDiagram, refetch: refetchDiagram } = trpc.analyzer.get.useQuery(
    { projectId, type: (selection as { analysisType: AnalysisType })?.analysisType || "codeflow" },
    { enabled: selection?.type === "visualize" && !!projectId }
  )

  // Subscribe to background analysis progress
  trpc.analyzer.subscribeBackgroundProgress.useSubscription(undefined, {
    onData: (update: { jobId: string; type: AnalysisType; status: string; progress?: number; message?: string; error?: string }) => {
      // Only handle updates for our project/type
      if (!update.jobId || update.type !== isGeneratingAnalysis) return

      if (update.status === "completed") {
        // Add completion message
        const assistantMessage: GitHubChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: `✅ ${ANALYSIS_LABELS[update.type]} analysis completed! The diagram has been updated.`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setIsGeneratingAnalysis(null)
        refetchDiagram()
      } else if (update.status === "failed") {
        // Add error message
        const errorMessage: GitHubChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: `❌ Analysis failed: ${update.error || "Unknown error"}`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
        setIsGeneratingAnalysis(null)
      } else if (update.status === "running" && update.message) {
        // Update the last assistant message with progress
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role === "assistant" && last.content.startsWith("🔄")) {
            return [...prev.slice(0, -1), { ...last, content: `🔄 ${update.message}` }]
          }
          return prev
        })
      }
    },
    onError: (err) => {
      console.error("[GitHubChatPane] Progress subscription error:", err)
    },
  })

  const handleActionClick = useCallback(async () => {
    if (!selection) return

    // For visualize type, trigger diagram generation via chat
    if (selection.type === "visualize") {
      const analysisType = selection.analysisType
      const label = ANALYSIS_LABELS[analysisType]

      // Clear previous messages and add context
      const userMessage: GitHubChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: `Generate ${label} analysis diagram`,
        timestamp: new Date(),
      }

      const assistantMessage: GitHubChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `🔄 Starting ${label} analysis...`,
        timestamp: new Date(),
      }

      setMessages([userMessage, assistantMessage])
      setChatContext({
        type: "visualize",
        repoId: selection.repoId,
        repoName: selection.repoName,
        analysisType,
      })
      setIsGeneratingAnalysis(analysisType)

      try {
        const result = await generateMutation.mutateAsync({
          projectId,
          projectPath,
          type: analysisType,
        })

        if (!result.success) {
          const errorMessage: GitHubChatMessage = {
            id: Date.now().toString(),
            role: "assistant",
            content: `❌ Failed to start analysis: ${result.error || "Unknown error"}`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, errorMessage])
          setIsGeneratingAnalysis(null)
        }
        // Success will be handled by the subscription
      } catch (error) {
        const errorMessage: GitHubChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: `❌ Error: ${error instanceof Error ? error.message : "Failed to start analysis"}`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
        setIsGeneratingAnalysis(null)
      }
      return
    }

    // For other types, clear chat and set context (existing behavior)
    setMessages([])
    setChatContext({
      type: selection.type,
      repoId: selection.repoId,
      repoName: selection.repoName,
      prNumber: selection.type === "pr" ? selection.prNumber : undefined,
      issueNumber: selection.type === "issue" ? selection.issueNumber : undefined,
      filePath: selection.type === "code" ? selection.path : undefined,
    })

    // TODO: Start the appropriate chat session with context
    // This will be wired up with Claude SDK integration
  }, [selection, setMessages, setChatContext, projectId, projectPath, generateMutation, refetchDiagram])

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return

    const userMessage: GitHubChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")

    // TODO: Send to Claude and get response
    // This will be wired up with Claude SDK integration
  }, [input, isLoading, setMessages])

  const getActionButton = () => {
    if (!selection) return null

    const isCurrentlyGenerating = isGeneratingAnalysis !== null

    switch (selection.type) {
      case "pr":
        return (
          <Button onClick={handleActionClick} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Review with AI
          </Button>
        )
      case "issue":
        return (
          <Button onClick={handleActionClick} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Plan Issue
          </Button>
        )
      case "code":
        return (
          <Button onClick={handleActionClick} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Explain Code
          </Button>
        )
      case "visualize":
        const hasDiagram = existingDiagram && existingDiagram.nodes && existingDiagram.nodes !== "[]"

        return (
          <Button
            onClick={handleActionClick}
            className="w-full"
            disabled={isCurrentlyGenerating}
          >
            {isCurrentlyGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating {ANALYSIS_LABELS[selection.analysisType]}...
              </>
            ) : hasDiagram ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate {ANALYSIS_LABELS[selection.analysisType]}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate {ANALYSIS_LABELS[selection.analysisType]}
              </>
            )}
          </Button>
        )
      default:
        return null
    }
  }

  const getSelectionTitle = () => {
    if (!selection) return null

    switch (selection.type) {
      case "pr":
        return (
          <div className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-green-500" />
            <span>PR #{selection.prNumber}</span>
          </div>
        )
      case "issue":
        return (
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-green-500" />
            <span>Issue #{selection.issueNumber}</span>
          </div>
        )
      case "code":
        return (
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{selection.path}</span>
          </div>
        )
      case "visualize":
        return (
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span>{ANALYSIS_LABELS[selection.analysisType]}</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with selection info */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{getSelectionTitle()}</div>
        </div>
      </div>

      {/* Action button area */}
      {selection && messages.length === 0 && (
        <div className="p-4 border-b border-border">
          {getActionButton()}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 && !selection && (
            <div className="text-center text-muted-foreground py-8">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select an item to start chatting</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Claude..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading || messages.length === 0}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading || messages.length === 0}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
})