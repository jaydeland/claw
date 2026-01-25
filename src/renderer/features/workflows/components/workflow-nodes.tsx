import { useState } from "react"
import { Handle, Position } from "reactflow"
import { ChevronRight, Terminal, Zap, Lock, Unlock, FileEdit, BookOpen, Settings, GitFork } from "lucide-react"

// Permission mode badge configuration
type PermissionMode = 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan'

interface PermissionBadgeConfig {
  icon: React.ComponentType<{ className?: string }>
  label: string
  className: string
  tooltip: string
}

const permissionBadges: Record<PermissionMode, PermissionBadgeConfig> = {
  bypassPermissions: {
    icon: Unlock,
    label: "Bypass",
    className: "bg-red-500/30 text-red-200 border-red-400/50",
    tooltip: "Bypasses all permission checks (dangerous)",
  },
  acceptEdits: {
    icon: FileEdit,
    label: "Accept",
    className: "bg-green-500/30 text-green-200 border-green-400/50",
    tooltip: "Auto-accepts file edits",
  },
  plan: {
    icon: BookOpen,
    label: "Plan",
    className: "bg-blue-500/30 text-blue-200 border-blue-400/50",
    tooltip: "Read-only plan mode",
  },
  dontAsk: {
    icon: Settings,
    label: "Auto",
    className: "bg-yellow-500/30 text-yellow-200 border-yellow-400/50",
    tooltip: "Auto-approves actions without asking",
  },
  default: {
    icon: Lock,
    label: "Default",
    className: "bg-gray-500/30 text-gray-200 border-gray-400/50",
    tooltip: "Standard permission mode",
  },
}

export function AgentNode({ data }: { data: { name: string; description: string; permissionMode?: PermissionMode } }) {
  const badge = data.permissionMode ? permissionBadges[data.permissionMode] : null
  const BadgeIcon = badge?.icon

  return (
    <div className="px-6 py-4 shadow-lg rounded-lg bg-purple-600 text-white border-2 border-purple-700 min-w-[200px]">
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-lg">{data.name}</div>
        {badge && BadgeIcon && (
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${badge.className}`}
            title={badge.tooltip}
          >
            <BadgeIcon className="h-3 w-3" />
            <span>{badge.label}</span>
          </div>
        )}
      </div>
      {data.description && (
        <div className="text-sm opacity-80 mt-1 line-clamp-2">{data.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function ToolNode({ data }: { data: { name: string; category?: string; server?: string } }) {
  const isMcp = data.category === "mcp"
  const bgColor = isMcp ? "bg-pink-500" : "bg-blue-500"
  const borderColor = isMcp ? "border-pink-600" : "border-blue-600"

  return (
    <div className={`px-4 py-2 shadow-md rounded-md ${bgColor} text-white border ${borderColor}`}>
      <Handle type="target" position={Position.Top} />
      <div className="font-mono text-sm">{data.name}</div>
      {data.server && (
        <div className="text-xs opacity-75 mt-0.5">{data.server}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function SkillNode({ data }: { data: { name: string; context?: 'fork'; agent?: string } }) {
  const hasForkContext = data.context === 'fork'

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-green-500 text-white border border-green-600">
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <div className="text-sm">{data.name}</div>
        {hasForkContext && (
          <div
            className="flex items-center gap-0.5 px-1 py-0.5 rounded text-xs bg-green-700/50 border border-green-400/50"
            title="Runs in forked context (separate execution)"
          >
            <GitFork className="h-3 w-3" />
            <span>Fork</span>
          </div>
        )}
      </div>
      {data.agent && (
        <div className="text-xs opacity-75 mt-0.5">Agent: {data.agent}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function CommandNode({ data }: { data: { name: string } }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-orange-500 text-white border border-orange-600">
      <Handle type="target" position={Position.Top} />
      <div className="text-sm">/{data.name}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function McpNode({ data }: { data: { name: string } }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-pink-500 text-white border border-pink-600">
      <Handle type="target" position={Position.Top} />
      <div className="text-sm font-mono">MCP: {data.name}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export function ToolGroupNode({
  data,
}: {
  data: { name: string; tools: string[]; category: string }
}) {
  const isBuiltin = data.category === "builtin"
  const bgColor = isBuiltin ? "bg-blue-500" : "bg-pink-500"
  const borderColor = isBuiltin ? "border-blue-600" : "border-pink-600"

  return (
    <div
      className={`${bgColor} ${borderColor} border-2 rounded-lg p-3 shadow-lg min-w-[180px] text-white`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-sm mb-2 border-b border-white/30 pb-2">{data.name}</div>
      <div className="space-y-1 mt-2">
        {data.tools.map((tool, idx) => (
          <div key={idx} className="text-xs font-mono opacity-90">
            {typeof tool === "string" ? tool : tool}
          </div>
        ))}
      </div>
    </div>
  )
}

interface CliAppMetadata {
  name: string
  commands: string[]
}

export function CliAppNode({ data }: { data: { apps: CliAppMetadata[] } }) {
  const [expandedApp, setExpandedApp] = useState<string | null>(null)

  // Defensive: ensure apps is an array and filter out invalid items
  const validApps = (data.apps || []).filter(app => app && typeof app === 'object' && app.name)

  return (
    <div className="bg-cyan-500 border-cyan-600 border-2 rounded-lg p-3 shadow-lg min-w-[200px] max-w-[280px] text-white">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-sm mb-2 border-b border-white/30 pb-2 flex items-center gap-2">
        <Terminal className="h-4 w-4" />
        CLI Apps
      </div>
      <div className="space-y-2 mt-2">
        {validApps.map((app, idx) => (
          <div key={idx} className="group">
            <button
              onClick={() => setExpandedApp(expandedApp === app.name ? null : app.name)}
              className="w-full text-left flex items-center justify-between text-sm font-mono opacity-90 hover:opacity-100 transition-opacity"
            >
              <span className="flex items-center gap-1">
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${expandedApp === app.name ? 'rotate-90' : ''}`}
                />
                {app.name}
              </span>
              {app.commands.length > 0 && (
                <span className="text-xs opacity-60">{app.commands.length}</span>
              )}
            </button>

            {/* Expandable command examples */}
            {expandedApp === app.name && app.commands.length > 0 && (
              <div className="ml-4 mt-1 space-y-1 border-l border-white/20 pl-2">
                {app.commands.map((cmd, cmdIdx) => (
                  <div
                    key={cmdIdx}
                    className="text-xs font-mono opacity-70 truncate"
                    title={cmd}
                  >
                    $ {cmd}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface BackgroundTaskMetadata {
  type: string
  description: string
  agentName?: string
}

export function BackgroundTaskNode({ data }: { data: { tasks: BackgroundTaskMetadata[] } }) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  // Map task types to readable labels and icons
  const taskLabels: Record<string, { label: string; icon: string }> = {
    'background-agent': { label: 'Background Agent', icon: '🔄' },
    'parallel-agents': { label: 'Parallel Execution', icon: '⚡' },
    'async-task': { label: 'Async Task', icon: '⏳' },
    'background-tasks': { label: 'Background Tasks', icon: '📋' },
  }

  // Defensive: ensure tasks is an array and filter out invalid items
  const validTasks = (data.tasks || []).filter(task => task && typeof task === 'object' && task.type)

  return (
    <div className="bg-amber-500 border-amber-600 border-2 rounded-lg p-3 shadow-lg min-w-[200px] max-w-[280px] text-white">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-sm mb-2 border-b border-white/30 pb-2 flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Background Tasks
      </div>
      <div className="space-y-2 mt-2">
        {validTasks.map((task, idx) => {
          const taskInfo = taskLabels[task.type] || { label: task.type, icon: '📋' }
          const isExpanded = expandedTask === `${task.type}-${idx}`

          return (
            <div key={idx} className="group">
              <button
                onClick={() => setExpandedTask(isExpanded ? null : `${task.type}-${idx}`)}
                className="w-full text-left flex items-center gap-2 text-sm hover:opacity-100 opacity-90 transition-opacity"
              >
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
                <span>{taskInfo.icon}</span>
                <span>{taskInfo.label}</span>
              </button>

              {/* Expandable description */}
              {isExpanded && task.description && (
                <div className="ml-6 mt-1 text-xs opacity-75 italic border-l border-white/20 pl-2">
                  {task.description}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
