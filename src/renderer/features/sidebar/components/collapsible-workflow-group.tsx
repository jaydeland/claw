"use client"

import React, { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"

interface CollapsibleWorkflowGroupProps {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
}

/**
 * Collapsible group component for workflows (agents, commands, skills)
 * Shows namespace title with item count and chevron indicator
 */
export function CollapsibleWorkflowGroup({
  title,
  count,
  expanded,
  onToggle,
  children,
  className,
}: CollapsibleWorkflowGroupProps) {
  return (
    <div className={cn("mb-2", className)}>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-1 py-1 hover:bg-muted/50 rounded transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform text-muted-foreground",
              expanded && "rotate-90"
            )}
          />
          <span className="text-xs font-medium text-muted-foreground">
            {title}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            ({count})
          </span>
        </div>
      </button>
      {expanded && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  )
}
