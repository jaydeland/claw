import { memo, useCallback } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { useAtomValue } from "jotai"
import {
  User,
  Bot,
  Terminal,
  FileEdit,
  Search,
  Globe,
  FolderSearch,
  ListTodo,
  MessageSquare,
  Zap,
  FileText,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Plug,
  Users,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { OriginalMCPIcon } from "@/components/ui/icons"
import { messageAtomFamily } from "../../agents/stores/message-store"

// Tool name to icon mapping
const toolIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bash: Terminal,
  Edit: FileEdit,
  Write: FileEdit,
  Read: FileText,
  Grep: Search,
  Glob: FolderSearch,
  WebFetch: Globe,
  WebSearch: Globe,
  Task: Zap,
  TodoWrite: ListTodo,
  AskUserQuestion: MessageSquare,
  NotebookEdit: FileEdit,
  Thinking: Bot, // Use Bot icon (same as Agents sidebar icon)
}

// Node data types
export interface UserMessageNodeData {
  id: string
  text: string
  onClick: () => void
}

export interface AssistantResponseNodeData {
  id: string
  text: string
  hasTools: boolean
  inputTokens?: number
  outputTokens?: number
  onClick: () => void
}

export interface ToolCallNodeData {
  toolCallId: string
  toolName: string
  state: "call" | "result" | "error" | "partial-error"
  isMcpTool?: boolean // Flag to identify MCP tools (format: mcp__server__tool)
  count?: number // Number of times this tool was invoked (for Thinking and Bash)
  commandPreview?: string // Preview of bash command (for Bash nodes)
  messageId?: string // Add message ID for detail fetching
  partIndex?: number // Add part index for detail fetching
  isExpanded?: boolean // Whether this node is expanded (showing detail nodes)
  // Detailed invocation info (for detail nodes)
  input?: any // Tool input parameters
  output?: any // Tool output/result
  error?: string // Error message if failed
  duration?: number // Execution duration in ms
  onClick?: () => void // Optional - only for single invocations or detail nodes
  onToggleExpansion?: () => void // Optional - only for multi-invocation parent nodes
}

export interface AgentSpawnNodeData {
  agentId: string
  description: string
  status: "running" | "completed" | "error"
  onClick: () => void
  // Optional: nested tools data for sub-agents
  nestedToolsCount?: number
}

export interface BackgroundTaskNodeData {
  taskId: string
  command: string
  description?: string
  status: "running" | "completed" | "failed" | "unknown"
  onClick: () => void
}

export interface TeamGroupNodeData {
  agents: Array<{
    agentId: string
    description: string
    status: "running" | "completed" | "error"
    partIndex: number
  }>
  messageId: string
  onAgentClick: (partIndex: number) => void
}

/**
 * Get truncated preview text from message
 */
function getMessagePreview(messageId: string): string {
  // We'll need to fetch the message from the atom store
  // This is a placeholder - actual implementation will use useAtomValue
  return "Message preview..."
}

// User Message Node - Blue, in main chain
export const UserMessageNode = memo(function UserMessageNode({
  data,
}: NodeProps<UserMessageNodeData>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="px-3 py-2 shadow-md rounded-lg bg-blue-500 text-white border border-blue-600 min-w-[160px] max-w-[180px] cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={data.onClick}
        >
          <Handle type="target" position={Position.Top} className="!bg-blue-700" />
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs truncate">{data.text}</span>
          </div>
          <Handle type="source" position={Position.Bottom} className="!bg-blue-700" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm">
        <div className="text-xs">
          <div className="font-semibold mb-1">User Message</div>
          <div className="text-muted-foreground">{data.text}</div>
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            Click to navigate to message
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

/**
 * Format token count with compact notation (e.g., 1,234 or 12.3k)
 */
function formatTokenCount(count: number | undefined): string {
  if (count === undefined || count === 0) return "0"
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return count.toLocaleString()
}

// Assistant Response Node - Purple, in main chain with right handle for tool branches
export const AssistantResponseNode = memo(function AssistantResponseNode({
  data,
}: NodeProps<AssistantResponseNodeData>) {
  const hasTokenData = data.inputTokens !== undefined || data.outputTokens !== undefined

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="px-3 py-2 shadow-md rounded-lg bg-purple-500 text-white border border-purple-600 min-w-[160px] max-w-[180px] cursor-pointer hover:bg-purple-600 transition-colors"
          onClick={data.onClick}
        >
          <Handle type="target" position={Position.Top} className="!bg-purple-700" />
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs truncate">{data.text || "..."}</span>
          </div>
          {/* Token counts footer */}
          {hasTokenData && (
            <div className="mt-1 pt-1 border-t border-purple-400/30 text-[9px] text-purple-200 font-mono">
              {formatTokenCount(data.inputTokens)} in / {formatTokenCount(data.outputTokens)} out
            </div>
          )}
          <Handle type="source" position={Position.Bottom} className="!bg-purple-700" />
          {/* Right handle for tool branches */}
          {data.hasTools && (
            <Handle
              type="source"
              position={Position.Right}
              id="tools"
              className="!bg-purple-700"
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm">
        <div className="text-xs">
          <div className="font-semibold mb-1">Assistant Response</div>
          <div className="text-muted-foreground">{data.text || "..."}</div>
          {hasTokenData && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Tokens: {formatTokenCount(data.inputTokens)} in / {formatTokenCount(data.outputTokens)} out
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            Click to navigate to message
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

// Tool Call Node - Color varies by tool type and state
export const ToolCallNode = memo(function ToolCallNode({
  data,
}: NodeProps<ToolCallNodeData>) {
  // Use OriginalMCPIcon for MCP tools, otherwise use mapped icon or Terminal as fallback
  const Icon = data.isMcpTool ? OriginalMCPIcon : (toolIconMap[data.toolName] || Terminal)
  const isExpanded = data.isExpanded || false

  // Thinking tool gets distinct purple/indigo styling
  const isThinking = data.toolName === "Thinking"

  const bgColor = data.isMcpTool
    ? // MCP tools: amber/orange tones
      data.state === "result"
        ? "bg-orange-500 border-orange-600 hover:bg-orange-600"
        : data.state === "error"
          ? "bg-red-500 border-red-600 hover:bg-red-600"
          : data.state === "partial-error"
            ? "bg-orange-500 border-orange-600 hover:bg-orange-600"
            : "bg-amber-500 border-amber-600 hover:bg-amber-600"
    : isThinking
      ? // Thinking: purple/indigo tones (distinct from other tools)
        data.state === "result"
          ? "bg-indigo-500 border-indigo-600 hover:bg-indigo-600"
          : data.state === "error"
            ? "bg-red-500 border-red-600 hover:bg-red-600"
            : "bg-purple-500 border-purple-600 hover:bg-purple-600"
      : // Regular tools: cyan/green/red/orange
        data.state === "result"
          ? "bg-green-500 border-green-600 hover:bg-green-600"
          : data.state === "error"
            ? "bg-red-500 border-red-600 hover:bg-red-600"
            : data.state === "partial-error"
              ? "bg-orange-500 border-orange-600 hover:bg-orange-600"
              : "bg-cyan-500 border-cyan-600 hover:bg-cyan-600"

  const hasMultipleInvocations = data.count && data.count > 1
  const canExpand = hasMultipleInvocations

  // AskUserQuestion shows "waiting" state when session is paused for user response
  const isWaitingForUser = data.toolName === "AskUserQuestion" && data.state === "call"

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      if (hasMultipleInvocations) {
        // Multi-invocation: toggle expansion (NO navigation)
        if (data.onToggleExpansion) {
          console.log("[ToolCallNode] Parent node clicked - toggling expansion")
          data.onToggleExpansion()
        }
      } else {
        // Single invocation: navigate
        if (data.onClick) {
          console.log("[ToolCallNode] Single invocation node clicked - navigating")
          data.onClick()
        }
      }
    },
    [data, hasMultipleInvocations]
  )

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation() // Prevent node click from firing
      console.log("[ToolCallNode] Chevron clicked:", {
        toolName: data.toolName,
        count: data.count,
        isExpanded: data.isExpanded,
        hasOnToggleExpansion: !!data.onToggleExpansion,
      })
      if (data.onToggleExpansion) {
        console.log("[ToolCallNode] Calling onToggleExpansion")
        data.onToggleExpansion()
      } else {
        console.warn("[ToolCallNode] No onToggleExpansion handler!")
      }
    },
    [data]
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`px-2.5 py-1.5 shadow-md rounded-md ${bgColor} text-white border cursor-pointer transition-colors min-w-[100px] max-w-[140px]`}
          onClick={handleClick}
        >
          <Handle type="target" position={Position.Left} className="!bg-slate-600" />
          <div className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <span className="text-[10px] font-mono truncate">{data.toolName}</span>
              {data.count && data.count > 1 && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-white/20 font-mono flex-shrink-0">
                  ×{data.count}
                </span>
              )}
              {/* Waiting indicator for AskUserQuestion */}
              {isWaitingForUser && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-yellow-400 text-yellow-900 font-mono flex-shrink-0 animate-pulse">
                  WAITING
                </span>
              )}
              {canExpand && (
                <div
                  data-expand-icon
                  className="flex-shrink-0 ml-auto cursor-pointer"
                  onClick={handleChevronClick}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </div>
              )}
            </div>
          </div>
          {data.commandPreview && (
            <div className="text-[9px] font-mono truncate mt-0.5 opacity-80">
              {data.commandPreview}
            </div>
          )}
          {/* Right handle for detail node connections when expanded */}
          {canExpand && (
            <Handle
              type="source"
              position={Position.Right}
              id="details"
              className="!bg-slate-600"
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm">
        <div className="text-xs">
          <div className="font-semibold mb-1">{data.toolName}</div>
          <div className="text-muted-foreground">
            State: <span className="capitalize">{data.state}</span>
          </div>
          {isWaitingForUser && (
            <div className="text-yellow-400 font-medium mt-1">
              Session paused - waiting for user response
            </div>
          )}
          {hasMultipleInvocations && (
            <div className="text-muted-foreground">
              Invocations: {data.count}
            </div>
          )}
          {data.commandPreview && (
            <div className="text-[10px] text-muted-foreground mt-1 font-mono">
              {data.commandPreview}
            </div>
          )}
          {/* Show detailed input for detail nodes */}
          {data.input && !hasMultipleInvocations && (
            <div className="text-[10px] text-muted-foreground mt-2">
              <div className="font-semibold mb-0.5">Input:</div>
              <div className="font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {typeof data.input === 'string'
                  ? data.input.slice(0, 200) + (data.input.length > 200 ? '...' : '')
                  : JSON.stringify(data.input, null, 2).slice(0, 200)}
              </div>
            </div>
          )}
          {/* Show output for completed detail nodes */}
          {data.output && data.state === "result" && !hasMultipleInvocations && (
            <div className="text-[10px] text-muted-foreground mt-2">
              <div className="font-semibold mb-0.5">Output:</div>
              <div className="font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {typeof data.output === 'string'
                  ? data.output.slice(0, 200) + (data.output.length > 200 ? '...' : '')
                  : JSON.stringify(data.output, null, 2).slice(0, 200)}
              </div>
            </div>
          )}
          {/* Show error for failed detail nodes */}
          {data.error && data.state === "error" && (
            <div className="text-[10px] text-red-400 mt-2">
              <div className="font-semibold mb-0.5">Error:</div>
              <div className="font-mono whitespace-pre-wrap break-words">
                {data.error.slice(0, 200) + (data.error.length > 200 ? '...' : '')}
              </div>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            {hasMultipleInvocations
              ? "Click to expand/collapse invocations"
              : "Click to navigate to tool call"}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

// Agent Spawn Node - Amber, for Task agents
export const AgentSpawnNode = memo(function AgentSpawnNode({
  data,
}: NodeProps<AgentSpawnNodeData>) {
  const bgColor =
    data.status === "completed"
      ? "bg-green-500 border-green-600 hover:bg-green-600"
      : data.status === "error"
        ? "bg-red-500 border-red-600 hover:bg-red-600"
        : "bg-amber-500 border-amber-600 hover:bg-amber-600"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`px-2.5 py-1.5 shadow-md rounded-md ${bgColor} text-white border cursor-pointer transition-colors min-w-[100px] max-w-[140px]`}
          onClick={data.onClick}
        >
          <Handle type="target" position={Position.Left} className="!bg-slate-600" />
          <div className="flex items-center gap-1.5">
            <Bot className="h-3 w-3 flex-shrink-0" />
            <span className="text-[10px] font-mono truncate">
              {data.description || "Agent"}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm">
        <div className="text-xs">
          <div className="font-semibold mb-1">Background Agent</div>
          <div className="text-muted-foreground">{data.description || "Agent"}</div>
          <div className="text-muted-foreground mt-1">
            Status: <span className="capitalize">{data.status}</span>
          </div>
          {/* Show nested tools count if available */}
          {data.nestedToolsCount && data.nestedToolsCount > 0 && (
            <div className="text-muted-foreground mt-1">
              Tools used: {data.nestedToolsCount}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            Click to navigate to agent spawn
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

// Background Task Node - For Bash commands run with run_in_background: true
// Color coded by status: blue (running), green (completed), red (failed), gray (unknown)
export const BackgroundTaskNode = memo(function BackgroundTaskNode({
  data,
}: NodeProps<BackgroundTaskNodeData>) {
  // Status-based styling
  const bgColor =
    data.status === "running"
      ? "bg-blue-500 border-blue-600 hover:bg-blue-600"
      : data.status === "completed"
        ? "bg-green-500 border-green-600 hover:bg-green-600"
        : data.status === "failed"
          ? "bg-red-500 border-red-600 hover:bg-red-600"
          : "bg-slate-500 border-slate-600 hover:bg-slate-600"

  // Status icon
  const StatusIcon =
    data.status === "running"
      ? Loader2
      : data.status === "completed"
        ? CheckCircle
        : data.status === "failed"
          ? XCircle
          : Clock

  // Truncate command for display
  const commandPreview = data.command
    ? data.command.length > 25
      ? data.command.slice(0, 22) + "..."
      : data.command
    : "Background Task"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`px-2.5 py-1.5 shadow-md rounded-md ${bgColor} text-white border cursor-pointer transition-colors min-w-[110px] max-w-[150px]`}
          onClick={data.onClick}
        >
          <Handle type="target" position={Position.Left} className="!bg-slate-600" />
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 flex-shrink-0" />
            <span className="text-[10px] font-medium truncate">Task</span>
            <StatusIcon
              className={`h-3 w-3 flex-shrink-0 ml-auto ${
                data.status === "running" ? "animate-spin" : ""
              }`}
            />
          </div>
          <div className="text-[9px] font-mono truncate mt-0.5 opacity-80">
            {commandPreview}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm">
        <div className="text-xs">
          <div className="font-semibold mb-1 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Background Task
          </div>
          <div className="text-muted-foreground">
            Status:{" "}
            <span
              className={
                data.status === "running"
                  ? "text-blue-400"
                  : data.status === "completed"
                    ? "text-green-400"
                    : data.status === "failed"
                      ? "text-red-400"
                      : "text-slate-400"
              }
            >
              {data.status}
            </span>
          </div>
          {data.command && (
            <div className="text-[10px] text-muted-foreground mt-1 font-mono break-all">
              {data.command.length > 100
                ? data.command.slice(0, 100) + "..."
                : data.command}
            </div>
          )}
          {data.description && (
            <div className="text-[10px] text-muted-foreground mt-1">
              {data.description}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            Click to navigate to task
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

// Team Group Node - Purple container for parallel sub-agents (team mode)
export const TeamGroupNode = memo(function TeamGroupNode({
  data,
}: NodeProps<TeamGroupNodeData>) {
  const completedCount = data.agents.filter((a) => a.status === "completed").length
  const hasAnyRunning = data.agents.some((a) => a.status === "running")
  const hasAnyError = data.agents.some((a) => a.status === "error")

  const bgColor = hasAnyError
    ? "bg-red-500/10 border-red-500/50"
    : hasAnyRunning
      ? "bg-purple-500/20 border-purple-500/50"
      : "bg-green-500/10 border-green-500/50"

  const headerColor = hasAnyError
    ? "text-red-400"
    : hasAnyRunning
      ? "text-purple-400"
      : "text-green-400"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`px-2 py-1.5 shadow-md rounded-lg ${bgColor} border-2 border-dashed min-w-[130px] max-w-[160px]`}
        >
          <Handle type="target" position={Position.Left} className="!bg-purple-600" />
          {/* Header */}
          <div className={`flex items-center gap-1.5 mb-1.5 ${headerColor}`}>
            <Users className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-[10px] font-semibold">
              {hasAnyRunning ? "Running Agents" : "Agents"}
            </span>
            <span className="text-[9px] opacity-70 ml-auto">
              {completedCount}/{data.agents.length}
            </span>
          </div>
          {/* Agent list */}
          <div className="space-y-1">
            {data.agents.map((agent, idx) => {
              const agentBg =
                agent.status === "completed"
                  ? "bg-green-500 hover:bg-green-600"
                  : agent.status === "error"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-amber-500 hover:bg-amber-600"

              return (
                <div
                  key={agent.agentId || idx}
                  className={`px-1.5 py-1 rounded text-white text-[9px] font-mono truncate cursor-pointer transition-colors ${agentBg}`}
                  onClick={() => data.onAgentClick(agent.partIndex)}
                >
                  <div className="flex items-center gap-1">
                    <Bot className="h-2.5 w-2.5 flex-shrink-0" />
                    <span className="truncate">{agent.description || "Agent"}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm">
        <div className="text-xs">
          <div className="font-semibold mb-1 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-purple-400" />
            Agents ({data.agents.length})
          </div>
          <div className="text-muted-foreground">
            Completed: {completedCount}/{data.agents.length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            Click an agent to navigate
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

// Export node types for ReactFlow
export const sessionFlowNodeTypes = {
  userMessage: UserMessageNode,
  assistantResponse: AssistantResponseNode,
  toolCall: ToolCallNode,
  agentSpawn: AgentSpawnNode,
  backgroundTask: BackgroundTaskNode,
  teamGroup: TeamGroupNode,
}
