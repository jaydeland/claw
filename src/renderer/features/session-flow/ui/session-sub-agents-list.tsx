"use client"

import { memo, useCallback } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { cn } from "@/lib/utils"
import { CheckIcon, IconSpinner } from "@/components/ui/icons"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Brain,
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
  type SessionSubAgent,
} from "../atoms"

interface SessionSubAgentsListProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

// Get icon for agent type
function getAgentIcon(type: string) {
  const iconClass = "w-3.5 h-3.5"
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

// Individual sub-agent item component
const SubAgentItem = memo(function SubAgentItem({
  agent,
  isLast,
  onClick,
}: {
  agent: SessionSubAgent
  isLast: boolean
  onClick: () => void
}) {
  const hasOutput = !!agent.output || !!agent.error
  const duration = formatDuration(agent.duration)

  return (
    <button
      onClick={onClick}
      disabled={!hasOutput && agent.status !== "running"}
      className={cn(
        "w-full flex items-center gap-2 px-2.5 py-1.5 text-left",
        "hover:bg-muted/50 transition-colors",
        hasOutput || agent.status === "running" ? "cursor-pointer" : "cursor-default opacity-60",
        !isLast && "border-b border-border/30"
      )}
    >
      <div className="flex-shrink-0 text-muted-foreground">
        {getAgentIcon(agent.type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{agent.description}</div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="capitalize">{agent.type.replace(/-/g, " ")}</span>
          {duration && (
            <>
              <span>•</span>
              <span className="tabular-nums">{duration}</span>
            </>
          )}
        </div>
      </div>
      <SubAgentStatusIcon status={agent.status} />
    </button>
  )
})

export const SessionSubAgentsList = memo(function SessionSubAgentsList({
  onScrollToMessage,
}: SessionSubAgentsListProps) {
  const subAgents = useAtomValue(sessionFlowSubAgentsAtom)
  const setSelectedAgent = useSetAtom(selectedSubAgentAtom)
  const setDialogOpen = useSetAtom(subAgentOutputDialogOpenAtom)

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
      </div>

      {/* Sub agents list */}
      <div className="flex-1 overflow-y-auto">
        {subAgents.map((agent, idx) => (
          <SubAgentItem
            key={agent.agentId}
            agent={agent}
            isLast={idx === subAgents.length - 1}
            onClick={() => handleAgentClick(agent)}
          />
        ))}
      </div>
    </div>
  )
})
