import { useMemo, useState, memo } from "react"
import { FileText, Server, Zap, Bot, Loader2, Terminal, ChevronDown, ChevronRight } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { useAtomValue } from "jotai"
import { selectedAgentChatIdAtom } from "../../agents/atoms"
import { ContextSection, ContextSectionEmpty } from "./context-section"
import { ClaudeMdItem, SourceBadge } from "./claude-md-item"
import type { McpServerInfo, SkillInfo, AgentInfo, CommandInfo } from "../types"
import { calculateLoadedContextTokens } from "../types"
import { cn } from "@/lib/utils"
import { formatTokenCount, formatDuration } from "@/lib/format-tokens"
import {
  messageIdsAtom,
  messageAtomFamily,
  messageTokenDataAtom,
  userMessageIdsAtom,
  messageMetadataAtomFamily,
  currentSubChatIdAtom,
} from "../../agents/stores/message-store"

// ============ Running Tokens Section ============

interface RequestTokenData {
  requestNumber: number
  userMessageId: string
  assistantMessageId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  preview: string
  durationMs?: number
}

/**
 * Single request token item - expandable row showing input/output for one request
 */
const RequestTokenItem = memo(function RequestTokenItem({
  data,
}: {
  data: RequestTokenData
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border border-border/30 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-muted/30 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 bg-muted text-muted-foreground">
          Request #{data.requestNumber}
        </span>
        <span className="text-xs truncate flex-1 text-foreground">
          {data.preview}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {formatTokenCount(data.totalTokens)}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 bg-muted/10 border-t border-border/30 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Input Tokens:</span>
            <span className="font-mono">{data.inputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Output Tokens:</span>
            <span className="font-mono">{data.outputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[10px] pt-1 border-t border-border/30">
            <span className="text-muted-foreground font-medium">Total:</span>
            <span className="font-mono font-medium">{data.totalTokens.toLocaleString()}</span>
          </div>
          {data.durationMs && data.durationMs > 0 && (
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-mono">{formatDuration(data.durationMs)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

/**
 * Wrapper to fetch message data and render RequestTokenItem
 */
const RequestTokenItemWithData = memo(function RequestTokenItemWithData({
  requestNumber,
  userMessageId,
  assistantMessageId,
}: {
  requestNumber: number
  userMessageId: string
  assistantMessageId: string
}) {
  const userMessage = useAtomValue(messageAtomFamily(userMessageId))
  const assistantMessage = useAtomValue(messageAtomFamily(assistantMessageId))
  const subChatId = useAtomValue(currentSubChatIdAtom)

  // Try stored metadata first (survives AI SDK normalization), fallback to message.metadata
  const storedMetadata = useAtomValue(
    messageMetadataAtomFamily(`${subChatId}:${assistantMessageId}`)
  )

  const data = useMemo((): RequestTokenData => {
    // Get preview from user message
    let preview = ""
    if (userMessage?.parts) {
      const textPart = userMessage.parts.find((p: any) => p.type === "text")
      const text = textPart?.text || ""
      preview = text.length > 60 ? text.slice(0, 60) + "..." : text
    }

    // Try stored metadata first, fallback to message.metadata (like messageTokenDataAtom does)
    const metadata = storedMetadata || (assistantMessage?.metadata as any)
    const inputTokens = metadata?.inputTokens || 0
    const outputTokens = metadata?.outputTokens || 0

    console.log("[RequestTokenItemWithData] Reading metadata:", {
      subChatId,
      assistantMessageId,
      metadataKey: `${subChatId}:${assistantMessageId}`,
      storedMetadata,
      assistantMessageMetadata: assistantMessage?.metadata,
      inputTokens,
      outputTokens,
    })

    return {
      requestNumber,
      userMessageId,
      assistantMessageId,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      preview: preview || "Request",
      durationMs: metadata?.durationMs,
    }
  }, [userMessage, assistantMessage, storedMetadata, requestNumber, userMessageId, assistantMessageId, subChatId])

  return <RequestTokenItem data={data} />
})

/**
 * Running Tokens Section - shows token usage per request in the session
 * Displays a subtotal header and expandable items for each request (user message + response)
 */
function RunningTokensSection() {
  const messageIds = useAtomValue(messageIdsAtom)
  const userMessageIds = useAtomValue(userMessageIdsAtom)
  const tokenData = useAtomValue(messageTokenDataAtom)

  // Build list of requests (user message + assistant response pairs)
  const requestList = useMemo(() => {
    const result: { requestNumber: number; userMessageId: string; assistantMessageId: string }[] = []
    const userIdSet = new Set(userMessageIds)
    let requestNumber = 1

    for (let i = 0; i < messageIds.length; i++) {
      const id = messageIds[i]!

      if (userIdSet.has(id)) {
        const userMessageId = id
        let assistantMessageId = ""

        // Look for the assistant response
        for (let j = i + 1; j < messageIds.length; j++) {
          const nextId = messageIds[j]!
          if (userIdSet.has(nextId)) {
            break // Next user message, no assistant response
          }
          // Found the assistant response
          assistantMessageId = nextId
          break
        }

        result.push({
          requestNumber,
          userMessageId,
          assistantMessageId,
        })

        requestNumber++
      }
    }

    return result
  }, [messageIds, userMessageIds])

  if (requestList.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Subtotal Header */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded-md">
        <span className="text-xs text-muted-foreground">API Usage</span>
        <span className="text-sm font-medium text-foreground">
          {formatTokenCount(tokenData.totalTokens)}
        </span>
      </div>

      {/* Each request as its own dropdown, indented */}
      <div className="pl-3 space-y-1">
        {requestList.map((item) => (
          <RequestTokenItemWithData
            key={item.userMessageId}
            requestNumber={item.requestNumber}
            userMessageId={item.userMessageId}
            assistantMessageId={item.assistantMessageId}
          />
        ))}
      </div>
    </div>
  )
}

interface LoadedContextPanelProps {
  projectPath?: string
}

export function LoadedContextPanel({ projectPath }: LoadedContextPanelProps) {
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)

  // Query the chat to get project info
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: selectedChatId! },
    { enabled: !!selectedChatId }
  )

  // Query project to get path
  const { data: projectData } = trpc.projects.get.useQuery(
    { id: chatData?.projectId || "" },
    { enabled: !!chatData?.projectId }
  )

  // Use provided projectPath or get from project data
  const effectiveProjectPath = projectPath || projectData?.path

  // Fetch loaded context
  const { data, isLoading, error } = trpc.loadedContext.getLoadedContext.useQuery(
    { projectPath: effectiveProjectPath },
    { enabled: !!effectiveProjectPath || true } // Always fetch, will use user context as fallback
  )

  // Calculate token counts (must be before any returns per Rules of Hooks)
  const tokenCounts = useMemo(() => {
    if (!data) return null
    return calculateLoadedContextTokens(data)
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading context...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load context: {error.message}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No context available
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      {/* Initial Context Section - grouped startup context */}
      <div className="flex flex-col gap-2">
        {/* Initial Context Header */}
        {tokenCounts && tokenCounts.total > 0 && (
          <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded-md">
            <span className="text-xs text-muted-foreground">Initial Context</span>
            <span className="text-sm font-medium text-foreground">
              ~{formatTokenCount(tokenCounts.total)}
            </span>
          </div>
        )}

        {/* Indented dropdowns under Start Tokens */}
        <div className="flex flex-col gap-2 pl-3">
          {/* CLAUDE.md Section */}
          <ContextSection
            title="CLAUDE.md"
            icon={FileText}
            count={data.claudeMdFiles.length}
            tokenCount={tokenCounts?.claudeMd}
          >
          {data.claudeMdFiles.length === 0 ? (
            <ContextSectionEmpty message="No CLAUDE.md files found" />
          ) : (
            data.claudeMdFiles.map((file) => (
              <ClaudeMdItem key={file.path} file={file} />
            ))
          )}
        </ContextSection>

        {/* MCP Servers Section */}
        <ContextSection
          title="MCP Servers"
          icon={Server}
          count={data.mcpServers.length}
          tokenCount={tokenCounts?.mcpServers}
        >
          {data.mcpServers.length === 0 ? (
            <ContextSectionEmpty message="No MCP servers configured" />
          ) : (
            data.mcpServers.map((server) => (
              <McpServerItem key={server.name} server={server} />
            ))
          )}
        </ContextSection>

        {/* Commands Section */}
        <ContextSection
          title="Commands"
          icon={Terminal}
          count={data.commands.length}
          tokenCount={tokenCounts?.commands}
        >
          {data.commands.length === 0 ? (
            <ContextSectionEmpty message="No commands found" />
          ) : (
            data.commands.map((command) => (
              <CommandItem key={command.path} command={command} />
            ))
          )}
        </ContextSection>

        {/* Skills Section */}
        <ContextSection
          title="Skills"
          icon={Zap}
          count={data.skills.length}
          tokenCount={tokenCounts?.skills}
        >
          {data.skills.length === 0 ? (
            <ContextSectionEmpty message="No skills found" />
          ) : (
            data.skills.map((skill) => (
              <SkillItem key={skill.path} skill={skill} />
            ))
          )}
        </ContextSection>

        {/* Agents Section */}
        <ContextSection
          title="Agents"
          icon={Bot}
          count={data.agents.length}
          tokenCount={tokenCounts?.agents}
        >
          {data.agents.length === 0 ? (
            <ContextSectionEmpty message="No agents found" />
          ) : (
          data.agents.map((agent) => (
            <AgentItem key={agent.path} agent={agent} />
          ))
        )}
          </ContextSection>
        </div>
      </div>

      {/* Running Tokens Section - shows per-request token usage */}
      <RunningTokensSection />
    </div>
  )
}

// ============ Item Components ============

interface McpServerItemProps {
  server: McpServerInfo
}

function McpServerItem({ server }: McpServerItemProps) {
  const statusConfig = {
    running: { label: "Running", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
    failed: { label: "Failed", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
    needs_auth: { label: "Needs Auth", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
    disabled: { label: "Disabled", className: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
    no_auth_needed: { label: "Ready", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
    configured: { label: "Ready", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
    missing_credentials: { label: "Missing Creds", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  }

  const { label, className } = statusConfig[server.status] || statusConfig.disabled

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
      <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs font-medium flex-1 truncate">{server.name}</span>
      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", className)}>
        {label}
      </span>
      <SourceBadge source={server.source} />
    </div>
  )
}

interface SkillItemProps {
  skill: SkillInfo
}

function SkillItem({ skill }: SkillItemProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
      <Zap className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{skill.name}</div>
        {skill.description && (
          <div className="text-[10px] text-muted-foreground truncate">{skill.description}</div>
        )}
      </div>
      <SourceBadge source={skill.source} />
    </div>
  )
}

interface AgentItemProps {
  agent: AgentInfo
}

function AgentItem({ agent }: AgentItemProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
      <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{agent.name}</div>
        {agent.description && (
          <div className="text-[10px] text-muted-foreground truncate">{agent.description}</div>
        )}
      </div>
      {agent.model && (
        <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
          {agent.model}
        </span>
      )}
      <SourceBadge source={agent.source} />
    </div>
  )
}

interface CommandItemProps {
  command: CommandInfo
}

function CommandItem({ command }: CommandItemProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
      <Terminal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">/{command.name}</div>
        {command.description && (
          <div className="text-[10px] text-muted-foreground truncate">{command.description}</div>
        )}
      </div>
      <SourceBadge source={command.source} />
    </div>
  )
}
