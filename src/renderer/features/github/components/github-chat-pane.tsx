"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  Send,
  Square,
  Loader2,
  Sparkles,
  GitPullRequest,
  CircleDot,
  FileCode,
  GitBranch,
  RefreshCw,
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import {
  githubChatMessagesAtom,
  githubChatContextAtom,
  githubStartChatAtom,
  type GitHubSelection,
  type GitHubChatMessage,
  type AnalysisType,
} from "../atoms"
import { trpc } from "../../../lib/trpc"
import { MemoizedMarkdown } from "../../../components/chat-markdown-renderer"

// Analysis labels
const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  codeflow: "Code Flow",
  db: "Database",
  architecture: "Architecture",
  build: "Build System",
}

// ---------------------------------------------------------------------------
// ClaudeSubscription — isolated child component so React's `key` prop can
// force a fresh tRPC subscription for every new message exchange.
// ---------------------------------------------------------------------------

interface ClaudeSubscriptionProps {
  subChatId: string
  chatId: string
  prompt: string
  projectPath: string
  onDelta: (accumulatedText: string) => void
  onFinish: (finalText: string) => void
  onError: (msg: string) => void
}

const ClaudeSubscription = memo(function ClaudeSubscription({
  subChatId,
  chatId,
  prompt,
  projectPath,
  onDelta,
  onFinish,
  onError,
}: ClaudeSubscriptionProps) {
  // Keep latest callbacks in refs so stale closures are never an issue
  const onDeltaRef = useRef(onDelta)
  const onFinishRef = useRef(onFinish)
  const onErrorRef = useRef(onError)
  onDeltaRef.current = onDelta
  onFinishRef.current = onFinish
  onErrorRef.current = onError

  // Accumulate streaming text within one subscription lifetime
  const streamingTextRef = useRef("")

  trpc.claude.chat.useSubscription(
    { subChatId, chatId, prompt, cwd: projectPath, projectPath, mode: "agent" },
    {
      enabled: true,
      onData: (chunk) => {
        if (chunk.type === "text-delta") {
          streamingTextRef.current += chunk.delta
          onDeltaRef.current(streamingTextRef.current)
        } else if (chunk.type === "finish") {
          onFinishRef.current(streamingTextRef.current)
          streamingTextRef.current = ""
        } else if (chunk.type === "error" || chunk.type === "auth-error") {
          const msg = (chunk as any).errorText || "An error occurred"
          onErrorRef.current(msg)
          streamingTextRef.current = ""
        }
      },
      onError: (err) => {
        onErrorRef.current(err.message)
        streamingTextRef.current = ""
      },
    }
  )

  return null
})

// ---------------------------------------------------------------------------
// GitHubChatPane
// ---------------------------------------------------------------------------

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
  const setMessages = useSetAtom(githubChatMessagesAtom)
  const setChatContext = useSetAtom(githubChatContextAtom)
  const startChat = useAtomValue(githubStartChatAtom)
  const setStartChat = useSetAtom(githubStartChatAtom)
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Claude session state
  const [session, setSession] = useState<{ chatId: string; subChatId: string } | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  // Incremented on every new message to force ClaudeSubscription remount
  const [subKey, setSubKey] = useState(0)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")

  // Track analysis generation state
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState<string | null>(null)

  // tRPC mutations and queries
  const createSessionMutation = trpc.github.createChatSession.useMutation()
  const generateMutation = trpc.analyzer.generateViaBackground.useMutation()
  const { data: existingDiagram, refetch: refetchDiagram } = trpc.analyzer.get.useQuery(
    { projectId, type: (selection as { analysisType: AnalysisType })?.analysisType || "codeflow" },
    { enabled: selection?.type === "visualize" && !!projectId }
  )

  // Subscription callbacks
  const handleSubscriptionDelta = useCallback((accumulatedText: string) => {
    setStreamingContent(accumulatedText)
  }, [])

  const handleSubscriptionFinish = useCallback(
    (finalText: string) => {
      if (finalText) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant" as const,
            content: finalText,
            timestamp: new Date(),
          },
        ])
      }
      setStreamingContent("")
      setPendingPrompt(null)
      setIsStreaming(false)
    },
    [setMessages]
  )

  const handleSubscriptionError = useCallback(
    (msg: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: `Error: ${msg}`,
          timestamp: new Date(),
        },
      ])
      setStreamingContent("")
      setPendingPrompt(null)
      setIsStreaming(false)
    },
    [setMessages]
  )

  // Clear session and messages when selection changes
  useEffect(() => {
    setSession(null)
    setPendingPrompt(null)
    setIsStreaming(false)
    setStreamingContent("")
    setMessages([])
  }, [
    selection?.type,
    (selection as any)?.prNumber,
    (selection as any)?.issueNumber,
    (selection as any)?.path,
    (selection as any)?.analysisType,
    setMessages,
  ])

  // Subscribe to background analysis progress (for visualize type)
  trpc.analyzer.subscribeBackgroundProgress.useSubscription(undefined, {
    onData: (update: {
      jobId: string
      type: AnalysisType
      status: string
      progress?: number
      message?: string
      error?: string
    }) => {
      if (!update.jobId || update.type !== isGeneratingAnalysis) return

      if (update.status === "completed") {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `✅ ${ANALYSIS_LABELS[update.type]} analysis completed! The diagram has been updated.`,
            timestamp: new Date(),
          },
        ])
        setIsGeneratingAnalysis(null)
        refetchDiagram()
      } else if (update.status === "failed") {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `❌ Analysis failed: ${update.error || "Unknown error"}`,
            timestamp: new Date(),
          },
        ])
        setIsGeneratingAnalysis(null)
      } else if (update.status === "running" && update.message) {
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

  // Handle start chat signal (from content pane buttons)
  useEffect(() => {
    if (!startChat) return
    setStartChat(null)
    if (startChat.autoStart) {
      setMessages([])
      setSession(null)
      setPendingPrompt(null)
      setStreamingContent("")
      setTimeout(() => startClaudeSession(startChat.message, startChat.message.slice(0, 120)), 0)
    } else {
      setInput(startChat.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startChat])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  // Build initial prompt based on selection type
  const buildInitialPrompt = useCallback(
    (sel: NonNullable<GitHubSelection>): string => {
      switch (sel.type) {
        case "code":
          return `Please explain the code in \`${sel.path}\`. The full path is: ${projectPath}/${sel.path}\n\nFocus on:\n- What the code does\n- Key functions and classes\n- How it fits into the project\n- Any notable patterns or design decisions\n\nIMPORTANT: Do not make any code changes without first presenting your proposed changes and getting explicit approval.`
        case "pr":
          return `Please review pull request #${sel.prNumber} in the repository at ${projectPath}.\n\nUse the Bash tool with \`gh pr view ${sel.prNumber}\` and \`gh pr diff ${sel.prNumber}\` to get the PR details and diff.\n\nProvide:\n- Overall assessment\n- Potential issues or concerns\n- Suggestions for improvement\n\nIMPORTANT: Do not make any code changes without first presenting your proposed changes and getting explicit approval.`
        case "issue":
          return `Help me plan the implementation of issue #${sel.issueNumber} in the repository at ${projectPath}.\n\nUse the Bash tool with \`gh issue view ${sel.issueNumber}\` to get the issue details.\n\nProvide:\n- Implementation approach\n- Files to modify\n- Step-by-step plan\n\nIMPORTANT: Do not make any code changes without first presenting your proposed plan and getting explicit approval.`
        default:
          return ""
      }
    },
    [projectPath]
  )

  const startClaudeSession = useCallback(
    async (prompt: string, displayMessage: string) => {
      if (!selection || selection.type === "visualize") return

      const userMessage: GitHubChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: displayMessage,
        timestamp: new Date(),
      }
      setMessages([userMessage])
      setChatContext({
        type: selection.type,
        repoId: selection.repoId,
        repoName: selection.repoName,
        prNumber: selection.type === "pr" ? selection.prNumber : undefined,
        issueNumber: selection.type === "issue" ? selection.issueNumber : undefined,
        filePath: selection.type === "code" ? selection.path : undefined,
      })

      try {
        const { chatId, subChatId } = await createSessionMutation.mutateAsync({
          projectId,
          name: displayMessage.slice(0, 60),
          mode: "agent",
        })
        setSession({ chatId, subChatId })
        setStreamingContent("")
        setIsStreaming(true)
        setSubKey((k) => k + 1)
        setPendingPrompt(prompt)
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `Failed to start session: ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: new Date(),
          },
        ])
      }
    },
    [selection, projectId, createSessionMutation, setMessages, setChatContext]
  )

  const handleActionClick = useCallback(async () => {
    if (!selection) return

    // For visualize type, trigger diagram generation
    if (selection.type === "visualize") {
      const analysisType = selection.analysisType
      const label = ANALYSIS_LABELS[analysisType]

      setMessages([
        {
          id: Date.now().toString(),
          role: "user",
          content: `Generate ${label} analysis diagram`,
          timestamp: new Date(),
        },
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `🔄 Starting ${label} analysis...`,
          timestamp: new Date(),
        },
      ])
      setChatContext({
        type: "visualize",
        repoId: selection.repoId,
        repoName: selection.repoName,
        analysisType,
      })
      setIsGeneratingAnalysis(analysisType)

      try {
        const result = await generateMutation.mutateAsync({ projectId, projectPath, type: analysisType })
        if (!result.success) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: `❌ Failed to start analysis: ${result.error || "Unknown error"}`,
              timestamp: new Date(),
            },
          ])
          setIsGeneratingAnalysis(null)
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `❌ Error: ${error instanceof Error ? error.message : "Failed to start analysis"}`,
            timestamp: new Date(),
          },
        ])
        setIsGeneratingAnalysis(null)
      }
      return
    }

    // For code/pr/issue: start a real Claude session
    const prompt = buildInitialPrompt(selection)
    let displayMessage = ""
    if (selection.type === "code") displayMessage = `Explain the code in \`${selection.path}\``
    else if (selection.type === "pr") displayMessage = `Review PR #${selection.prNumber}`
    else if (selection.type === "issue") displayMessage = `Plan issue #${selection.issueNumber}`

    await startClaudeSession(prompt, displayMessage)
  }, [
    selection,
    projectId,
    projectPath,
    generateMutation,
    buildInitialPrompt,
    startClaudeSession,
    setMessages,
    setChatContext,
  ])

  const handleStop = useCallback(() => {
    if (streamingContent) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: streamingContent,
          timestamp: new Date(),
        },
      ])
    }
    setStreamingContent("")
    setPendingPrompt(null)
    setIsStreaming(false)
  }, [streamingContent, setMessages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !session) return

    const userInput = input.trim()
    setInput("")

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content: userInput,
        timestamp: new Date(),
      },
    ])
    setStreamingContent("")
    setIsStreaming(true)
    setSubKey((k) => k + 1)
    setPendingPrompt(userInput)
  }, [input, isStreaming, session, setMessages])

  const getActionButton = () => {
    if (!selection) return null
    const isCurrentlyGenerating = isGeneratingAnalysis !== null || isStreaming

    switch (selection.type) {
      case "pr":
        return (
          <Button onClick={handleActionClick} className="w-full" disabled={isCurrentlyGenerating}>
            {isCurrentlyGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Review with AI
          </Button>
        )
      case "issue":
        return (
          <Button onClick={handleActionClick} className="w-full" disabled={isCurrentlyGenerating}>
            {isCurrentlyGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Plan Issue
          </Button>
        )
      case "code":
        return (
          <Button onClick={handleActionClick} className="w-full" disabled={isCurrentlyGenerating}>
            {isCurrentlyGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Explain Code
          </Button>
        )
      case "visualize": {
        const hasDiagram = existingDiagram && existingDiagram.nodes && existingDiagram.nodes !== "[]"
        return (
          <Button onClick={handleActionClick} className="w-full" disabled={isCurrentlyGenerating}>
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
      }
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

  const canSendMessage = !!session && !isStreaming

  // Reset chat and start a new review
  const handleReviewReset = useCallback(() => {
    setSession(null)
    setPendingPrompt(null)
    setIsStreaming(false)
    setStreamingContent("")
    setMessages([])
    setTimeout(() => handleActionClick(), 0)
  }, [handleActionClick, setMessages])

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with selection info */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground min-w-0 flex-1">{getSelectionTitle()}</div>
          {/* Persistent action button for PR/issue/code when chat is active */}
          {selection && messages.length > 0 && selection.type !== "visualize" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReviewReset}
              disabled={isStreaming}
              className="flex-shrink-0 text-xs h-7 px-2"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              {selection.type === "pr"
                ? "Re-review"
                : selection.type === "issue"
                  ? "Re-plan"
                  : "Re-explain"}
            </Button>
          )}
        </div>
      </div>

      {/* Action button area — shown only when no messages yet */}
      {selection && messages.length === 0 && (
        <div className="p-4 border-b border-border">{getActionButton()}</div>
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
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
              >
                {message.role === "assistant" ? (
                  <MemoizedMarkdown content={message.content} id={message.id} size="sm" />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
                {streamingContent ? (
                  <MemoizedMarkdown content={streamingContent} id="streaming" size="sm" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
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
            onKeyDown={(e) => e.key === "Enter" && !isStreaming && handleSend()}
            placeholder={isStreaming ? "Waiting for response..." : canSendMessage ? "Ask a follow-up question..." : "Ask Claude..."}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={!session}
          />
          {isStreaming ? (
            <Button size="icon" variant="outline" onClick={handleStop} title="Stop generation">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={handleSend} disabled={!input.trim() || !canSendMessage}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Subscription runner — keyed so each new message gets a fresh subscription */}
      {session && pendingPrompt && (
        <ClaudeSubscription
          key={subKey}
          subChatId={session.subChatId}
          chatId={session.chatId}
          prompt={pendingPrompt}
          projectPath={projectPath}
          onDelta={handleSubscriptionDelta}
          onFinish={handleSubscriptionFinish}
          onError={handleSubscriptionError}
        />
      )}
    </div>
  )
})
