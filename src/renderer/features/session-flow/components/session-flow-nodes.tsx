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
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  state: "call" | "result" | "error"
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
  onClick: () => void
  onToggleExpansion?: () => void // Separate handler for expansion toggle
}

export interface AgentSpawnNodeData {
  agentId: string
  description: string
  status: "running" | "completed" | "error"
  onClick: () => void
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

// Tool Call Node - Cyan/Green/Red based on state, branches to the right
export const ToolCallNode = memo(function ToolCallNode({
  data,
}: NodeProps<ToolCallNodeData>) {
  const Icon = toolIconMap[data.toolName] || Terminal
  const isExpanded = data.isExpanded || false

  const bgColor =
    data.state === "result"
      ? "bg-green-500 border-green-600 hover:bg-green-600"
      : data.state === "error"
        ? "bg-red-500 border-red-600 hover:bg-red-600"
        : "bg-cyan-500 border-cyan-600 hover:bg-cyan-600"

  const hasMultipleInvocations = data.count && data.count > 1
  const canExpand = hasMultipleInvocations

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Node body click always navigates to message
      data.onClick()
    },
    [data]
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
            Click to navigate to tool call
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
            <GitBranch className="h-3 w-3 flex-shrink-0" />
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
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            Click to navigate to agent spawn
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
}
