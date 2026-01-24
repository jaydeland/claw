import { memo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
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
} from "lucide-react"

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
  onClick: () => void
}

export interface ToolCallNodeData {
  toolCallId: string
  toolName: string
  state: "call" | "result" | "error"
  onClick: () => void
}

export interface AgentSpawnNodeData {
  agentId: string
  description: string
  status: "running" | "completed" | "error"
  onClick: () => void
}

// User Message Node - Blue, in main chain
export const UserMessageNode = memo(function UserMessageNode({
  data,
}: NodeProps<UserMessageNodeData>) {
  return (
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
  )
})

// Assistant Response Node - Purple, in main chain with right handle for tool branches
export const AssistantResponseNode = memo(function AssistantResponseNode({
  data,
}: NodeProps<AssistantResponseNodeData>) {
  return (
    <div
      className="px-3 py-2 shadow-md rounded-lg bg-purple-500 text-white border border-purple-600 min-w-[160px] max-w-[180px] cursor-pointer hover:bg-purple-600 transition-colors"
      onClick={data.onClick}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-700" />
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 flex-shrink-0" />
        <span className="text-xs truncate">{data.text || "..."}</span>
      </div>
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
  )
})

// Tool Call Node - Cyan/Green/Red based on state, branches to the right
export const ToolCallNode = memo(function ToolCallNode({
  data,
}: NodeProps<ToolCallNodeData>) {
  const Icon = toolIconMap[data.toolName] || Terminal

  const bgColor =
    data.state === "result"
      ? "bg-green-500 border-green-600 hover:bg-green-600"
      : data.state === "error"
        ? "bg-red-500 border-red-600 hover:bg-red-600"
        : "bg-cyan-500 border-cyan-600 hover:bg-cyan-600"

  return (
    <div
      className={`px-2.5 py-1.5 shadow-md rounded-md ${bgColor} text-white border cursor-pointer transition-colors min-w-[100px] max-w-[140px]`}
      onClick={data.onClick}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-600" />
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 flex-shrink-0" />
        <span className="text-[10px] font-mono truncate">{data.toolName}</span>
      </div>
    </div>
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
  )
})

// Export node types for ReactFlow
export const sessionFlowNodeTypes = {
  userMessage: UserMessageNode,
  assistantResponse: AssistantResponseNode,
  toolCall: ToolCallNode,
  agentSpawn: AgentSpawnNode,
}
