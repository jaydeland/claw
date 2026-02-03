"use client"

import { memo, useCallback } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { cn } from "@/lib/utils"
import { CheckIcon, IconSpinner } from "@/components/ui/icons"
import { X, ExternalLink, Crown, Code2, Eye, TestTube2, Hexagon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  FileCode,
  Search,
  Wrench,
  Network,
  Bot,
  Sparkles,
} from "lucide-react"
import {
  sessionFlowSubAgentsAtom,
  selectedSubAgentAtom,
  subAgentOutputDialogOpenAtom,
  isSwarmModeActiveAtom,
  swarmStatsAtom,
  type SessionSubAgent,
  type SessionNestedTool,
} from "../atoms"

interface SessionSubAgentsListProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

// Get icon for agent type - with distinct swarm worker icons
function getAgentIcon(type: string, isSwarmWorker?: boolean) {
  const iconClass = "w-3.5 h-3.5"

  // Swarm workers get distinct icons
  if (isSwarmWorker) {
    switch (type) {
      case "coordinator":
        return <Crown className={cn(iconClass, "text-amber-500")} />
      case "coder":
        return <Code2 className={cn(iconClass, "text-blue-500")} />
      case "reviewer":
        return <Eye className={cn(iconClass, "text-purple-500")} />
      case "tester":
        return <TestTube2 className={cn(iconClass, "text-green-500")} />
      default:
        return <Hexagon className={cn(iconClass, "text-orange-500")} />
    }
  }

  // Regular agent icons
  switch (type) {
    case "coder":
    case "code-writer":
      return <FileCode className={iconClass} />
    case "researcher":
    case "web-researcher":
      return <Search className={iconClass} />
    case "architect":
    case "system-architect":
      return <Network className={iconClass} />
    case "debugger":
    case "bug-fixer":
      return <Wrench className={iconClass} />
    case "ai-agent":
      return <Sparkles className={iconClass} />
    default:
      return <Bot className={iconClass} />
  }
}

// Get swarm worker label
function getSwarmWorkerLabel(type: string): string {
  switch (type) {
    case "coordinator":
      return "Coordinator"
    case "coder":
      return "Coder"
    case "reviewer":
      return "Reviewer"
    case "tester":
      return "Tester"
    default:
      return "Worker"
  }
}

// Status icon component
const SubAgentStatusIcon = memo(function SubAgentStatusIcon({
  status,
}: {
  status: SessionSubAgent["status"]
}) {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-3.5 h-3.5 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(142 76% 36%)" }}
        >
          <CheckIcon className="w-2 h-2 text-green-600 dark:text-green-500" />
        </div>
      )
    case "failed":
      return (
        <div
          className="w-3.5 h-3.5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(0 84% 60%)" }}
        >
          <X className="w-2 h-2 text-red-600 dark:text-red-500" />
        </div>
      )
    case "running":
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <IconSpinner className="w-2 h-2 text-background" />
        </div>
      )
    default:
      return (
        <div
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
})

// Format duration in human-readable format
function formatDuration(ms?: number): string {
  if (!ms || ms < 1000) return ""
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

// Tool icon helper for nested tools
function getToolIcon(toolName: string, iconClass = "w-2.5 h-2.5") {
  // Map common tool names to icons
  switch (toolName.toLowerCase()) {
    case "read":
    case "grep":
    case "glob":
      return <FileCode className={iconClass} />
    case "bash":
      return <Wrench className={iconClass} />
    case "webfetch":
    case "websearch":
      return <Search className={iconClass} />
    default:
      return <Wrench className={iconClass} />
  }
}

// Group nested tools by tool name for consolidated display
interface GroupedTool {
  toolName: string
  count: number
  hasError: boolean
  hasPending: boolean
}

function groupNestedTools(tools: SessionNestedTool[]): GroupedTool[] {
  const groups = new Map<string, GroupedTool>()

  for (const tool of tools) {
    const existing = groups.get(tool.toolName)
    if (existing) {
      existing.count++
      if (tool.status === "error") existing.hasError = true
      if (tool.status === "pending") existing.hasPending = true
    } else {
      groups.set(tool.toolName, {
        toolName: tool.toolName,
        count: 1,
        hasError: tool.status === "error",
        hasPending: tool.status === "pending",
      })
    }
  }

  // Sort by count descending, then by name
  return Array.from(groups.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.toolName.localeCompare(b.toolName)
  })
}

// Individual sub-agent item component
const SubAgentItem = memo(function SubAgentItem({
  agent,
  isLast,
  onClick,
  onOpenDialog,
}: {
  agent: SessionSubAgent
  isLast: boolean
  onClick: () => void
  onOpenDialog: () => void
}) {
  const hasOutput = !!agent.output || !!agent.error
  const duration = formatDuration(agent.duration)
  const nestedToolsCount = agent.nestedTools?.length || 0

  // Calculate indentation for hierarchy (16px per depth level)
  const depthIndent = (agent.depth || 0) * 16

  return (
    <div
      className={cn(
        "w-full flex flex-col",
        "hover:bg-muted/50 transition-colors",
        !isLast && "border-b border-border/30",
        // Subtle left border for swarm workers
        agent.isSwarmWorker && "border-l-2",
        agent.isSwarmWorker && agent.type === "coordinator" && "border-l-amber-500/50",
        agent.isSwarmWorker && agent.type === "coder" && "border-l-blue-500/50",
        agent.isSwarmWorker && agent.type === "reviewer" && "border-l-purple-500/50",
        agent.isSwarmWorker && agent.type === "tester" && "border-l-green-500/50"
      )}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1.5"
        style={{ paddingLeft: `${10 + depthIndent}px` }}
      >
        {/* Hierarchy connector line for nested agents */}
        {(agent.depth || 0) > 0 && (
          <div className="flex-shrink-0 w-2 h-full flex items-center">
            <div className="w-1.5 h-[1px] bg-border/50" />
          </div>
        )}

        <button
          onClick={onClick}
          disabled={!hasOutput && agent.status !== "running"}
          className={cn(
            "flex-1 flex items-center gap-2 min-w-0 text-left",
            hasOutput || agent.status === "running" ? "cursor-pointer" : "cursor-default opacity-60"
          )}
        >
          <div className="flex-shrink-0">
            {getAgentIcon(agent.type, agent.isSwarmWorker)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium truncate">{agent.description}</span>
              {/* Swarm worker badge */}
              {agent.isSwarmWorker && (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-4 px-1 text-[9px] flex-shrink-0",
                    agent.type === "coordinator" && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                    agent.type === "coder" && "border-blue-500/50 text-blue-600 dark:text-blue-400",
                    agent.type === "reviewer" && "border-purple-500/50 text-purple-600 dark:text-purple-400",
                    agent.type === "tester" && "border-green-500/50 text-green-600 dark:text-green-400"
                  )}
                >
                  {getSwarmWorkerLabel(agent.type)}
                </Badge>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              {!agent.isSwarmWorker && (
                <span className="capitalize">{agent.type.replace(/-/g, " ")}</span>
              )}
              {agent.isSwarmWorker && (
                <span className="text-muted-foreground/70">Swarm</span>
              )}
              {duration && (
                <>
                  <span>·</span>
                  <span className="tabular-nums">{duration}</span>
                </>
              )}
              {nestedToolsCount > 0 && (
                <>
                  <span>·</span>
                  <span className="tabular-nums">{nestedToolsCount} request{nestedToolsCount !== 1 ? "s" : ""}</span>
                </>
              )}
            </div>
          </div>
          <SubAgentStatusIcon status={agent.status} />
        </button>

        {/* Dialog button */}
        {hasOutput && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 flex-shrink-0 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenDialog()
                }}
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">View output</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Nested tools summary - grouped by tool type */}
      {nestedToolsCount > 0 && (
        <div
          className="px-2.5 pb-1.5"
          style={{ paddingLeft: `${32 + depthIndent}px` }}
        >
          <div className="flex flex-wrap gap-1">
            {groupNestedTools(agent.nestedTools!).map((group) => (
              <Badge
                key={group.toolName}
                variant="outline"
                className={cn(
                  "h-4 px-1 text-[9px] gap-0.5",
                  group.hasError && "border-red-500/50 text-red-600 dark:text-red-400",
                  group.hasPending && !group.hasError && "border-foreground/50"
                )}
              >
                {getToolIcon(group.toolName)}
                <span>{group.toolName}</span>
                {group.count > 1 && (
                  <span className="ml-0.5 tabular-nums text-muted-foreground">({group.count})</span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

export const SessionSubAgentsList = memo(function SessionSubAgentsList({
  onScrollToMessage,
}: SessionSubAgentsListProps) {
  const subAgents = useAtomValue(sessionFlowSubAgentsAtom)
  const setSelectedAgent = useSetAtom(selectedSubAgentAtom)
  const setDialogOpen = useSetAtom(subAgentOutputDialogOpenAtom)
  const isSwarmMode = useAtomValue(isSwarmModeActiveAtom)
  const swarmStats = useAtomValue(swarmStatsAtom)

  const handleAgentClick = useCallback(
    (agent: SessionSubAgent) => {
      // If agent has output, open dialog
      if (agent.output || agent.error) {
        setSelectedAgent(agent)
        setDialogOpen(true)
      } else if (agent.status === "running") {
        // If running, scroll to the message
        onScrollToMessage(agent.messageId, agent.partIndex)
      }
    },
    [onScrollToMessage, setSelectedAgent, setDialogOpen]
  )

  const handleOpenDialog = useCallback(
    (agent: SessionSubAgent) => {
      setSelectedAgent(agent)
      setDialogOpen(true)
    },
    [setSelectedAgent, setDialogOpen]
  )

  const completedCount = subAgents.filter((a) => a.status === "completed").length
  const totalCount = subAgents.length

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 flex-shrink-0">
          <span className="text-xs font-medium">Session Sub Agents</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            0
          </Badge>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
          No sub agents yet. Claude will spawn sub agents when using the Task tool.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 flex-shrink-0">
        <span className="text-xs font-medium">Session Sub Agents</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {completedCount}/{totalCount}
        </Badge>

        {/* Swarm mode indicator */}
        {isSwarmMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[10px] gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400 ml-auto"
              >
                <Hexagon className="w-2.5 h-2.5" />
                Swarm
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="font-medium">Swarm Mode Active</div>
                <div className="text-muted-foreground">
                  {swarmStats.coordinatorCount > 0 && (
                    <div className="flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-500" />
                      {swarmStats.coordinatorCount} Coordinator{swarmStats.coordinatorCount !== 1 ? "s" : ""}
                    </div>
                  )}
                  {swarmStats.coderCount > 0 && (
                    <div className="flex items-center gap-1">
                      <Code2 className="w-3 h-3 text-blue-500" />
                      {swarmStats.coderCount} Coder{swarmStats.coderCount !== 1 ? "s" : ""}
                    </div>
                  )}
                  {swarmStats.reviewerCount > 0 && (
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-purple-500" />
                      {swarmStats.reviewerCount} Reviewer{swarmStats.reviewerCount !== 1 ? "s" : ""}
                    </div>
                  )}
                  {swarmStats.testerCount > 0 && (
                    <div className="flex items-center gap-1">
                      <TestTube2 className="w-3 h-3 text-green-500" />
                      {swarmStats.testerCount} Tester{swarmStats.testerCount !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Sub agents list */}
      <div className="flex-1 overflow-y-auto">
        {subAgents.map((agent, idx) => (
          <SubAgentItem
            key={agent.agentId}
            agent={agent}
            isLast={idx === subAgents.length - 1}
            onClick={() => handleAgentClick(agent)}
            onOpenDialog={() => handleOpenDialog(agent)}
          />
        ))}
      </div>
    </div>
  )
})
