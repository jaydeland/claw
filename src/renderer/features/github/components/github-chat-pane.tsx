"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  Send,
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
  githubSelectionAtom,
  githubChatMessagesAtom,
  githubChatContextAtom,
  githubChatLoadingAtom,
  githubStartChatAtom,
  githubDiagramDataAtom,
  type GitHubSelection,
  type GitHubChatMessage,
  type AnalysisType,
} from "../atoms"
import { trpc } from "../../../lib/trpc"
import { MemoizedMarkdown } from "../../../components/chat-markdown-renderer"
import { useContextualChat } from "../../shared/hooks/use-contextual-chat"

// Analysis labels
const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  codeflow: "Code Flow",
  db: "Database",
  architecture: "Architecture",
  build: "Build System",
}

// Original prompts used to generate each diagram type
// These provide context to Claude about what the diagram represents
const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  codeflow: `Analyze this codebase and generate a React Flow diagram showing the code flow and module dependencies.

Focus on:
1. Main entry points (index files, main functions)
2. Module hierarchy and imports
3. Function/class relationships
4. Data flow between modules
5. Key exports and their consumers

Output format: React Flow JSON with nodes (id, type, position, data) and edges (id, source, target, label).`,

  db: `Analyze this codebase and generate a React Flow diagram showing the database schema and data flow.

Focus on:
1. Database tables/collections
2. Field definitions and types
3. Relationships (1:1, 1:N, N:M)
4. Foreign keys and constraints
5. Indexes and keys
6. Migration patterns

Output format: React Flow JSON with nodes (tables) and edges (relationships).`,

  architecture: `Analyze this codebase and generate a React Flow diagram showing the high-level system architecture.

Focus on:
1. System layers (frontend, backend, database, external services)
2. Major components and their responsibilities
3. Communication patterns between components
4. External integrations (APIs, services, libraries)
5. Infrastructure components

Output format: React Flow JSON with nodes (components) and edges (connections).`,

  build: `Analyze this codebase and generate a React Flow diagram showing the build system and dependencies.

Focus on:
1. Build tools and configuration (webpack, vite, rollup, etc.)
2. Package dependencies (direct and dev)
3. Build pipeline steps
4. Scripts and commands
5. Output/bundle structure
6. CI/CD integration if present

Output format: React Flow JSON with nodes (build steps) and edges (dependencies).`,
}

interface GitHubChatPaneProps {
  projectId: string
  projectPath: string
  selection: GitHubSelection
}

// Build a stable context key for the current GitHub selection
function selectionContextKey(sel: NonNullable<GitHubSelection>): Record<string, unknown> {
  switch (sel.type) {
    case "pr":
      return { type: "pr", repoId: sel.repoId, prNumber: sel.prNumber }
    case "issue":
      return { type: "issue", repoId: sel.repoId, issueNumber: sel.issueNumber }
    case "code":
      return { type: "code", repoId: sel.repoId, path: sel.path }
    case "visualize":
      return { type: "visualize", repoId: sel.repoId, analysisType: sel.analysisType }
    default:
      return { type: "unknown" }
  }
}

export const GitHubChatPane = memo(function GitHubChatPane({
  projectId,
  projectPath,
  selection,
}: GitHubChatPaneProps) {
  const messages = useAtomValue(githubChatMessagesAtom)
  const isLoading = useAtomValue(githubChatLoadingAtom)
  const setMessages = useSetAtom(githubChatMessagesAtom)
  const setChatContext = useSetAtom(githubChatContextAtom)
  const startChat = useAtomValue(githubStartChatAtom)
  const setStartChat = useSetAtom(githubStartChatAtom)
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Contextual chat session — persisted per GitHub selection context
  const contextKey = selection ? selectionContextKey(selection) : { type: "none" }
  const { chatId, subChatId, create: createContextualChat, reset: resetContextualChat } = useContextualChat({
    sourceView: "github",
    sourceContext: contextKey,
    projectId,
    enabled: !!selection && !!projectId,
  })

  // Local session state (mirrors DB chatId/subChatId for streaming)
  const [session, setSession] = useState<{ chatId: string; subChatId: string } | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const streamingTextRef = useRef("")

  // Sync DB session into local state when it becomes available
  useEffect(() => {
    if (chatId && subChatId && !session) {
      setSession({ chatId, subChatId })
    }
  }, [chatId, subChatId, session])

  // Track analysis generation state
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState<string | null>(null)

  // Get current diagram data for visualize mode system instructions
  const diagramData = useAtomValue(githubDiagramDataAtom)

  // Skip clearing on first mount so restored session/messages survive a reload
  const isFirstMount = useRef(true)

  // tRPC mutations and queries
  const createSessionMutation = trpc.github.createChatSession.useMutation()
  const generateMutation = trpc.analyzer.generateViaBackground.useMutation()
  const updateDiagramMutation = trpc.analyzer.update.useMutation()
  const { data: existingDiagram, refetch: refetchDiagram } = trpc.analyzer.get.useQuery(
    { projectId, type: (selection as { analysisType: AnalysisType })?.analysisType || "codeflow" },
    { enabled: selection?.type === "visualize" && !!projectId }
  )

  // Parse AI response for diagram updates and apply them
  const applyDiagramUpdates = useCallback(async (content: string) => {
    // Look for JSON code blocks with action: "update_diagram"
    const jsonMatch = content.match(/```json\s*\n?(\{[\s\S]*?\})\n?```/)
    if (!jsonMatch) return

    try {
      const data = JSON.parse(jsonMatch[1])
      if (data.action !== "update_diagram" || !data.nodes || !data.edges) return

      // Validate the update data
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        console.warn("[GitHubChatPane] Invalid diagram update data: nodes and edges must be arrays")
        return
      }

      // Check if we have a valid diagram to update
      if (!existingDiagram?.id) {
        console.warn("[GitHubChatPane] No existing diagram to update")
        return
      }

      // Apply the update
      await updateDiagramMutation.mutateAsync({
        id: existingDiagram.id,
        nodes: data.nodes,
        edges: data.edges,
        summary: data.summary || existingDiagram.summary || undefined,
      })

      // Refetch to update the UI
      await refetchDiagram()

      // Add a system message about the update
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `✅ Diagram updated successfully! ${data.summary || ""}`,
          timestamp: new Date(),
        },
      ])
    } catch (err) {
      console.error("[GitHubChatPane] Failed to parse or apply diagram update:", err)
    }
  }, [existingDiagram, updateDiagramMutation, refetchDiagram, setMessages])

  // Clear local streaming state when selection changes.
  // The DB session for the new context will be loaded via useContextualChat.
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    setSession(null)
    setPendingPrompt(null)
    setIsStreaming(false)
    setStreamingContent("")
    streamingTextRef.current = ""
    setMessages([])
  }, [selection?.type,
    (selection as any)?.prNumber,
    (selection as any)?.issueNumber,
    (selection as any)?.path,
    (selection as any)?.analysisType,
    setMessages,
  ])

  // Subscribe to Claude chat stream
  trpc.claude.chat.useSubscription(
    {
      subChatId: session?.subChatId ?? "__none__",
      chatId: session?.chatId ?? "__none__",
      prompt: pendingPrompt ?? "",
      cwd: projectPath,
      projectPath,
      mode: "agent",
      disableMcpAndSkills: selection?.type === "visualize",
    },
    {
      enabled: !!session && !!pendingPrompt,
      onData: (chunk) => {
        if (chunk.type === "text-delta") {
          streamingTextRef.current += chunk.delta
          setStreamingContent(streamingTextRef.current)
        } else if (chunk.type === "finish") {
          // Finalize the streaming message
          if (streamingTextRef.current) {
            const finalContent = streamingTextRef.current
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: "assistant" as const,
                content: finalContent,
                timestamp: new Date(),
              },
            ])
            // Check for diagram updates in visualize mode
            if (selection?.type === "visualize") {
              void applyDiagramUpdates(finalContent)
            }
          }
          streamingTextRef.current = ""
          setStreamingContent("")
          setPendingPrompt(null)
          setIsStreaming(false)
        } else if (chunk.type === "error" || chunk.type === "auth-error") {
          const errorMsg = (chunk as any).errorText || "An error occurred"
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant" as const,
              content: `Error: ${errorMsg}`,
              timestamp: new Date(),
            },
          ])
          streamingTextRef.current = ""
          setStreamingContent("")
          setPendingPrompt(null)
          setIsStreaming(false)
        }
      },
      onError: (err) => {
        console.error("[GitHubChatPane] Chat subscription error:", err)
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant" as const,
            content: `Error: ${err.message}`,
            timestamp: new Date(),
          },
        ])
        streamingTextRef.current = ""
        setStreamingContent("")
        setPendingPrompt(null)
        setIsStreaming(false)
      },
    }
  )

  // Subscribe to background analysis progress (for visualize type)
  trpc.analyzer.subscribeBackgroundProgress.useSubscription(undefined, {
    onData: (update: { jobId: string; type: AnalysisType; status: string; progress?: number; message?: string; error?: string }) => {
      if (!update.jobId || update.type !== isGeneratingAnalysis) return

      if (update.status === "completed") {
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
        const errorMessage: GitHubChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: `❌ Analysis failed: ${update.error || "Unknown error"}`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
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
      // Clear prior state then fire immediately
      setMessages([])
      setSession(null)
      setPendingPrompt(null)
      streamingTextRef.current = ""
      setStreamingContent("")
      // Use setTimeout so state resets propagate before startClaudeSession reads them
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
  const buildInitialPrompt = useCallback((sel: NonNullable<GitHubSelection>): string => {
    switch (sel.type) {
      case "code":
        return `Please explain the code in \`${sel.path}\`. The full path is: ${projectPath}/${sel.path}\n\nFocus on:\n- What the code does\n- Key functions and classes\n- How it fits into the project\n- Any notable patterns or design decisions`
      case "pr":
        return `Please review pull request #${sel.prNumber} in the repository at ${projectPath}.\n\nUse the Bash tool with \`gh pr view ${sel.prNumber}\` and \`gh pr diff ${sel.prNumber}\` to get the PR details and diff.\n\nProvide:\n- Overall assessment\n- Potential issues or concerns\n- Suggestions for improvement`
      case "issue":
        return `Help me plan the implementation of issue #${sel.issueNumber} in the repository at ${projectPath}.\n\nUse the Bash tool with \`gh issue view ${sel.issueNumber}\` to get the issue details.\n\nProvide:\n- Implementation approach\n- Files to modify\n- Step-by-step plan`
      case "visualize":
        return `I'm viewing the ${ANALYSIS_LABELS[sel.analysisType]} diagram for this repository in the left pane.

Repository root: ${projectPath}

Please help me understand this diagram by:
1. Explaining what the diagram represents at a high level
2. Describing the key components (nodes) and their relationships (edges)
3. Identifying any patterns, clusters, or architectural insights
4. Pointing out any potential issues or areas for improvement

You can also suggest modifications to the diagram if you'd like to reorganize it, add missing components, or improve the layout. When suggesting changes, please provide the complete updated diagram data in the JSON format specified in the diagram context.`
      default:
        return ""
    }
  }, [projectPath])

  const startClaudeSession = useCallback(async (prompt: string, displayMessage: string) => {
    if (!selection) return

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
      analysisType: selection.type === "visualize" ? selection.analysisType : undefined,
    })

    try {
      // Use existing DB chat if available, otherwise create a new one
      let resolvedChatId = chatId
      let resolvedSubChatId = subChatId
      if (!resolvedChatId || !resolvedSubChatId) {
        const result = await createContextualChat()
        resolvedChatId = result.chatId
        resolvedSubChatId = result.subChatId
      }
      setSession({ chatId: resolvedChatId, subChatId: resolvedSubChatId })
      streamingTextRef.current = ""
      setStreamingContent("")
      setIsStreaming(true)
      setPendingPrompt(prompt)
    } catch (err) {
      const errorMessage: GitHubChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Failed to start session: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    }
  }, [selection, chatId, subChatId, createContextualChat, setMessages, setChatContext])

  const handleActionClick = useCallback(async () => {
    if (!selection) return

    // For visualize type, trigger diagram generation
    if (selection.type === "visualize") {
      const analysisType = selection.analysisType
      const label = ANALYSIS_LABELS[analysisType]

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
        const result = await generateMutation.mutateAsync({ projectId, projectPath, type: analysisType })
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

    // For code/pr/issue: start a real Claude session
    const prompt = buildInitialPrompt(selection)
    let displayMessage = ""
    if (selection.type === "code") displayMessage = `Explain the code in \`${selection.path}\``
    else if (selection.type === "pr") displayMessage = `Review PR #${selection.prNumber}`
    else if (selection.type === "issue") displayMessage = `Plan issue #${selection.issueNumber}`

    await startClaudeSession(prompt, displayMessage)
  }, [selection, projectId, projectPath, generateMutation, buildInitialPrompt, startClaudeSession, setMessages, setChatContext])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    // For visualize mode without a session, create one first
    let resolvedSession = session
    if (!resolvedSession && selection?.type === "visualize") {
      try {
        // Create a contextual chat session for visualize mode
        let resolvedChatId = chatId
        let resolvedSubChatId = subChatId
        if (!resolvedChatId || !resolvedSubChatId) {
          const result = await createContextualChat()
          resolvedChatId = result.chatId
          resolvedSubChatId = result.subChatId
        }
        resolvedSession = { chatId: resolvedChatId, subChatId: resolvedSubChatId }
        setSession(resolvedSession)
        setChatContext({
          type: "visualize",
          repoId: selection.repoId,
          repoName: selection.repoName,
          analysisType: selection.analysisType,
        })
      } catch (err) {
        console.error("Failed to create session for visualize chat:", err)
        const errorMessage: GitHubChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: `Failed to start session: ${err instanceof Error ? err.message : "Unknown error"}`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
        return
      }
    }

    // Still require a session after attempting to create one
    if (!resolvedSession) return

    const userInput = input.trim()
    setInput("")

    const userMessage: GitHubChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userInput,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    streamingTextRef.current = ""
    setStreamingContent("")
    setIsStreaming(true)

    // Start with just the user's input - this is what we want to send to Claude
    let prompt = userInput

    // Add diagram context for visualize mode if this is the first message to Claude
    // (Check if no session exists yet - UI messages may exist but no actual Claude conversation)
    if (selection?.type === "visualize" && !session) {
      // Get the current diagram data from the atom (real-time UI state) or fall back to DB data
      const currentDiagram = diagramData || (existingDiagram ? {
        nodes: existingDiagram.nodes ? JSON.parse(existingDiagram.nodes) : [],
        edges: existingDiagram.edges ? JSON.parse(existingDiagram.edges) : [],
        viewport: existingDiagram.viewport ? JSON.parse(existingDiagram.viewport) : null,
        summary: existingDiagram.summary || undefined,
        stats: existingDiagram.stats ? JSON.parse(existingDiagram.stats) : undefined,
      } : null)

      // Get the original prompt used to generate this diagram type
      const analysisType = selection.analysisType
      const originalPrompt = ANALYSIS_PROMPTS[analysisType]

      const diagramContext = `

=== SYSTEM INSTRUCTIONS ===

You are an AI assistant embedded in a split-view interface. A React Flow diagram is displayed in the left pane, and this chat is in the right pane. Your role is to help the user understand, analyze, and modify the diagram in real-time.

The repository root is: ${projectPath}
This is the working directory for all file operations.

=== DIAGRAM TYPE ===
${ANALYSIS_LABELS[analysisType]} Analysis

=== ORIGINAL ANALYSIS PROMPT ===
${originalPrompt}

=== CURRENT DIAGRAM DATA ===

**Nodes (${currentDiagram?.nodes?.length || 0}):**
${currentDiagram?.nodes?.length ? JSON.stringify(currentDiagram.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data
        })), null, 2) : "No nodes available"}

**Edges (${currentDiagram?.edges?.length || 0}):**
${currentDiagram?.edges?.length ? JSON.stringify(currentDiagram.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label,
          data: e.data
        })), null, 2) : "No edges available"}

**Viewport:**
${currentDiagram?.viewport ? JSON.stringify(currentDiagram.viewport, null, 2) : "Default (not saved)"}

**Summary:**
${currentDiagram?.summary || existingDiagram?.summary || "No summary available"}

**Stats:**
${currentDiagram?.stats ? JSON.stringify(currentDiagram.stats, null, 2) : existingDiagram?.stats ? JSON.stringify(JSON.parse(existingDiagram.stats), null, 2) : "No stats available"}

=== HOW TO MODIFY THE DIAGRAM (RIGHT PANE UI) ===

You can help the user modify the diagram by providing complete updated diagram data in your response. When the user requests changes:

1. **Explain the changes** you plan to make
2. **Provide the updated data** in this exact JSON format:

\`\`\`json
{
  "action": "update_diagram",
  "nodes": [
    {
      "id": "node-id",
      "type": "default|input|output|process|decision|subprocess",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Display Name",
        "description": "Brief description",
        "type": "component|service|module|file|function"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "source": "source-node-id",
      "target": "target-node-id",
      "type": "smoothstep|default|straight",
      "label": "relationship name"
    }
  ],
  "summary": "Description of changes made"
}
\`\`\`

**CRITICAL RULES FOR UPDATES:**
- Include ALL nodes that should remain (omitted nodes will be deleted)
- Node IDs must be unique and match exactly in edges
- Every edge's "source" and "target" MUST reference an existing node ID
- Position coordinates should be in range 0-1000 for x and y
- Use "smoothstep" edge type for best visual results
- Maintain consistent flow direction (top-to-bottom or left-to-right)

=== AVAILABLE NODE TYPES ===

Visual node types (affect styling):
- "input" / "start": Entry points (green, rounded)
- "output" / "end": Exit points (green, rounded)
- "default": Standard node (gray)
- "process": Processing step (blue)
- "decision": Decision point (amber/orange)
- "data": Data store (purple)
- "subprocess": Sub-process (orange with double border)

Semantic types (in data.type field):
- "service", "database", "frontend", "external", "layer"
- "table", "file", "function", "class", "module"

=== HOW TO SAVE DIAGRAM CHANGES (DATABASE) ===

When you provide diagram updates via the JSON format above, the application will automatically:
1. Parse your JSON response
2. Update the React Flow diagram in the left pane (right pane UI)
3. Save the changes to the database via the analyzer.update API
4. Refresh the diagram view to show the updated visualization

The database stores:
- Nodes and edges as JSON strings
- Viewport state (zoom, pan position)
- Summary and statistics
- Timestamps for versioning

=== END DIAGRAM CONTEXT ===

The user is now asking about this diagram. You can:
1. Explain what the diagram shows and how components relate
2. Suggest improvements or identify missing elements
3. Answer specific questions about nodes or edges
4. Generate complete updated diagram data when changes are requested
5. Help troubleshoot issues with the visualization

Be specific in your explanations and always reference node IDs when discussing particular elements.`
      prompt = prompt + diagramContext
    }

    // For follow-up messages with an active session, include the conversation history
    // as a fallback in case session resumption fails (e.g. session expiry, config cleanup)
    // Note: This is only applied when we have a session - for visualize mode first message,
    // we keep the prompt clean with just the user's question + diagram context
    if (session && messages.length > 0) {
      const historyText = messages
        .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
        .join("\n\n")
      prompt = `<conversation_history>\n${historyText}\n</conversation_history>\n\nHuman: ${prompt}`
    }

    setPendingPrompt(prompt)
  }, [input, isStreaming, session, selection, chatId, subChatId, createContextualChat, setSession, setChatContext, setMessages, messages, existingDiagram, diagramData, projectPath])

  const getActionButton = () => {
    if (!selection) return null
    const isCurrentlyGenerating = isGeneratingAnalysis !== null || isStreaming

    switch (selection.type) {
      case "pr":
        return (
          <Button onClick={handleActionClick} className="w-full" disabled={isCurrentlyGenerating}>
            {isCurrentlyGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Review with AI
          </Button>
        )
      case "issue":
        return (
          <Button onClick={handleActionClick} className="w-full" disabled={isCurrentlyGenerating}>
            {isCurrentlyGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Plan Issue
          </Button>
        )
      case "code":
        return (
          <Button onClick={handleActionClick} className="w-full" disabled={isCurrentlyGenerating}>
            {isCurrentlyGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
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

  // Check if there's an existing diagram for visualize mode
  const hasExistingDiagram = existingDiagram && existingDiagram.nodes && existingDiagram.nodes !== "[]"

  // Allow chatting when:
  // 1. We have an active session, OR
  // 2. We're in visualize mode with an existing diagram (session will be created on first message)
  const canSendMessage = (!!session || (selection?.type === "visualize" && hasExistingDiagram)) && !isStreaming

  // Reset chat (archive old, create new) and start a new review
  const handleReviewReset = useCallback(async () => {
    setSession(null)
    setPendingPrompt(null)
    setIsStreaming(false)
    setStreamingContent("")
    streamingTextRef.current = ""
    setMessages([])
    await resetContextualChat()
    // Trigger the action after state clears
    setTimeout(() => handleActionClick(), 0)
  }, [handleActionClick, setMessages, resetContextualChat])

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
              {selection.type === "pr" ? "Re-review" : selection.type === "issue" ? "Re-plan" : "Re-explain"}
            </Button>
          )}
        </div>
      </div>

      {/* Action button area — shown only when no messages yet */}
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
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
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
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={canSendMessage ? "Ask a follow-up question..." : "Ask Claude..."}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={!canSendMessage}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || !canSendMessage}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
})
