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
  /** Whether this is a nested sub-group (adds extra indentation) */
  nested?: boolean
}

/**
 * Collapsible group component for workflows (agents, commands, skills)
 * Shows namespace title with item count and chevron indicator
 * Supports nested sub-groups with proper indentation
 */
export function CollapsibleWorkflowGroup({
  title,
  count,
  expanded,
  onToggle,
  children,
  className,
  nested = false,
}: CollapsibleWorkflowGroupProps) {
  return (
    <div className={cn(nested ? "mb-1" : "mb-2", className)}>
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center justify-between w-full py-1 hover:bg-muted/50 rounded transition-colors",
          nested ? "px-0.5" : "px-1"
        )}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={cn(
              "transition-transform text-muted-foreground",
              expanded && "rotate-90",
              nested ? "h-2.5 w-2.5" : "h-3 w-3"
            )}
          />
          <span className={cn(
            "font-medium text-muted-foreground",
            nested ? "text-[10px]" : "text-xs"
          )}>
            {title}
          </span>
          <span className={cn(
            "text-muted-foreground/60",
            nested ? "text-[9px]" : "text-[10px]"
          )}>
            ({count})
          </span>
        </div>
      </button>
      {expanded && (
        <div className={cn(
          "mt-0.5 space-y-0.5",
          nested ? "ml-3" : "ml-4"
        )}>
          {children}
        </div>
      )}
    </div>
  )
}
