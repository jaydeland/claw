"use client"

import { memo, useState, useEffect, useRef } from "react"
import { ChevronRight, Users } from "lucide-react"
import { AgentTaskTool } from "./agent-task-tool"
import { getToolStatus } from "./agent-tool-registry"
import { cn } from "../../../lib/utils"

interface AgentTeamGroupProps {
  taskParts: any[]
  nestedToolsMap: Map<string, any[]>
  chatStatus?: string
  isStreaming: boolean
}

// Format elapsed time in a human-readable format
function formatElapsedTime(ms: number): string {
  if (ms < 1000) return ""
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

// Custom equality check for memo optimization
function areTeamGroupPropsEqual(
  prevProps: AgentTeamGroupProps,
  nextProps: AgentTeamGroupProps
): boolean {
  if (prevProps.isStreaming !== nextProps.isStreaming) return false
  if (prevProps.chatStatus !== nextProps.chatStatus) return false
  if (prevProps.taskParts.length !== nextProps.taskParts.length) return false
  if (prevProps.nestedToolsMap.size !== nextProps.nestedToolsMap.size) return false

  // Check if task parts changed (by toolCallId)
  for (let i = 0; i < prevProps.taskParts.length; i++) {
    if (prevProps.taskParts[i]?.toolCallId !== nextProps.taskParts[i]?.toolCallId) {
      return false
    }
    // Check state changes
    if (prevProps.taskParts[i]?.state !== nextProps.taskParts[i]?.state) {
      return false
    }
  }

  return true
}

export const AgentTeamGroup = memo(function AgentTeamGroup({
  taskParts,
  nestedToolsMap,
  chatStatus,
  isStreaming,
}: AgentTeamGroupProps) {
  // Default: expanded while streaming, stays expanded when done (user can collapse)
  const [isExpanded, setIsExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track elapsed time for running team
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  // Check if any task is still pending
  const hasAnyPending = taskParts.some((part) => {
    const { isPending } = getToolStatus(part, chatStatus)
    return isPending
  })

  // Count completed vs total
  const completedCount = taskParts.filter((part) => {
    const { isPending } = getToolStatus(part, chatStatus)
    return !isPending
  }).length
  const totalCount = taskParts.length

  // Track elapsed time while any task is running
  useEffect(() => {
    if (hasAnyPending) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now()
      }
      const interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(Date.now() - startTimeRef.current)
        }
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [hasAnyPending])

  const elapsedTimeDisplay = formatElapsedTime(elapsedMs)

  // Build subtitle
  const agentLabel = totalCount === 1 ? "agent" : "agents"
  const subtitle = hasAnyPending
    ? `${completedCount}/${totalCount} ${agentLabel}`
    : `${totalCount} ${agentLabel}`

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      {/* Header - clickable to toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex items-center gap-2 py-1.5 px-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <Users className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className={cn(
            "text-xs font-medium whitespace-nowrap",
            hasAnyPending ? "text-purple-500" : "text-muted-foreground"
          )}>
            {hasAnyPending ? "Running Team" : "Team"}
          </span>
          <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
            {subtitle}
          </span>
          {elapsedTimeDisplay && (
            <span className="text-xs text-muted-foreground/50 tabular-nums flex-shrink-0">
              {elapsedTimeDisplay}
            </span>
          )}
        </div>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out flex-shrink-0",
            isExpanded && "rotate-90",
            !isExpanded && "opacity-0 group-hover:opacity-100",
          )}
        />
      </div>

      {/* Task list - only show when expanded */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="border-t border-border/30 divide-y divide-border/20"
        >
          {taskParts.map((part, idx) => {
            const nestedTools = nestedToolsMap.get(part.toolCallId) || []
            return (
              <div key={part.toolCallId || idx} className="bg-background/50">
                <AgentTaskTool
                  part={part}
                  nestedTools={nestedTools}
                  chatStatus={chatStatus}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}, areTeamGroupPropsEqual)
