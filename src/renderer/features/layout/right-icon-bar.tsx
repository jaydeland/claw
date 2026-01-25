"use client"

import React, { useMemo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { GitBranch, ListTree } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { Kbd } from "../../components/ui/kbd"
import { cn } from "../../lib/utils"
import { selectedAgentChatIdAtom, diffSidebarOpenAtomFamily } from "../agents/atoms"
import { sessionFlowSidebarOpenAtom } from "../session-flow/atoms"
import { workflowPanelOpenAtom } from "../workflows/atoms"

interface RightIconBarProps {
  className?: string
}

export function RightIconBar({ className }: RightIconBarProps) {
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)

  // Diff sidebar state - per chat
  const diffSidebarAtom = useMemo(
    () => diffSidebarOpenAtomFamily(selectedChatId || ""),
    [selectedChatId]
  )
  const [isDiffOpen, setIsDiffOpen] = useAtom(diffSidebarAtom)

  // Session flow sidebar state - global
  const [isSessionFlowOpen, setIsSessionFlowOpen] = useAtom(sessionFlowSidebarOpenAtom)

  // Workflow panel state - global (for mutual exclusivity with Session Flow)
  const [workflowPanelOpen, setWorkflowPanelOpen] = useAtom(workflowPanelOpenAtom)

  const handleChangesClick = () => {
    if (!selectedChatId) return
    // Toggle diff sidebar, close session flow if opening diff
    if (!isDiffOpen) {
      setIsSessionFlowOpen(false)
    }
    setIsDiffOpen(!isDiffOpen)
  }

  const handleSessionFlowClick = () => {
    // Toggle session flow sidebar
    if (!isSessionFlowOpen) {
      // Close diff and workflow panel when opening session flow
      if (selectedChatId) {
        setIsDiffOpen(false)
      }
      if (workflowPanelOpen !== null) {
        setWorkflowPanelOpen(null)
      }
    }
    setIsSessionFlowOpen(!isSessionFlowOpen)
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 px-1 py-2 border-l border-border/50 bg-background",
        className,
      )}
    >
      {/* Changes/Diff Button */}
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleChangesClick}
            disabled={!selectedChatId}
            className={cn(
              "flex items-center justify-center rounded-md transition-all duration-150 ease-out h-8 w-8",
              isDiffOpen && selectedChatId
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
              !selectedChatId && "opacity-50 cursor-not-allowed",
            )}
            aria-label="Changes"
            aria-pressed={isDiffOpen}
          >
            <GitBranch className="h-4 w-4 flex-shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {selectedChatId ? "Changes" : "Select a workspace to view changes"}
        </TooltipContent>
      </Tooltip>

      {/* Session Flow Button */}
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleSessionFlowClick}
            className={cn(
              "flex items-center justify-center rounded-md transition-all duration-150 ease-out h-8 w-8",
              isSessionFlowOpen
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
            )}
            aria-label="Session Flow"
            aria-pressed={isSessionFlowOpen}
          >
            <ListTree className="h-4 w-4 flex-shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          Session Flow
        </TooltipContent>
      </Tooltip>

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  )
}
