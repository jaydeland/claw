"use client"

import React, { useMemo, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronsRight, ChevronsLeft, GitBranch, ListTree } from "lucide-react"
import { IconSidePeek } from "../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { cn } from "../../lib/utils"
import { selectedAgentChatIdAtom, diffSidebarOpenAtomFamily } from "../agents/atoms"
import {
  sessionFlowDisplayModeAtom,
  sessionFlowSidebarOpenAtom,
  sessionFlowSidebarOpenRuntimeAtom,
} from "../session-flow/atoms"
import { workflowPanelOpenAtom } from "../workflows/atoms"
import { rightIconBarExpandedAtom } from "./atoms"
import { trpc } from "../../lib/trpc"

interface RightIconBarProps {
  className?: string
}

export function RightIconBar({ className }: RightIconBarProps) {
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)

  // Icon bar expanded state
  const [isExpanded, setIsExpanded] = useAtom(rightIconBarExpandedAtom)

  // Query current chat data to check for worktree
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: selectedChatId! },
    { enabled: !!selectedChatId }
  )

  // Query project to check if it's a git repo
  const { data: projectData } = trpc.projects.get.useQuery(
    { id: chatData?.projectId || "" },
    { enabled: !!chatData?.projectId }
  )

  // Determine if this is a worktree-based chat
  const isWorktreeMode = !!chatData?.branch

  // Check if project is a git repo (for showing Changes icon)
  const isGitRepo = !!projectData?.gitRemoteUrl || isWorktreeMode

  // Diff sidebar state - per chat
  const diffSidebarAtom = useMemo(
    () => diffSidebarOpenAtomFamily(selectedChatId || ""),
    [selectedChatId]
  )
  const [isDiffOpen, setIsDiffOpen] = useAtom(diffSidebarAtom)

  // Session flow display mode and state
  const sessionFlowDisplayMode = useAtomValue(sessionFlowDisplayModeAtom)
  const [isSessionFlowOpen, setIsSessionFlowOpen] = useAtom(sessionFlowSidebarOpenAtom)
  const [sessionFlowRuntimeOpen, setSessionFlowRuntimeOpen] = useAtom(sessionFlowSidebarOpenRuntimeAtom)

  // Workflow panel state - global (for mutual exclusivity with Session Flow)
  const [workflowPanelOpen, setWorkflowPanelOpen] = useAtom(workflowPanelOpenAtom)

  // Determine which session flow open state to use based on display mode
  const effectiveSessionFlowOpen = sessionFlowDisplayMode === "side-peek"
    ? isSessionFlowOpen
    : sessionFlowRuntimeOpen

  // Auto-close Changes panel when switching to non-git repos
  useEffect(() => {
    if (!isGitRepo && isDiffOpen) {
      setIsDiffOpen(false)
    }
  }, [isGitRepo, isDiffOpen, setIsDiffOpen])

  const handleChangesClick = () => {
    if (!selectedChatId) return
    // Toggle diff sidebar, close session flow if opening diff
    if (!isDiffOpen) {
      setIsSessionFlowOpen(false)
    }
    setIsDiffOpen(!isDiffOpen)
  }

  const handleSessionFlowClick = () => {
    // Toggle session flow based on display mode
    const currentlyOpen = effectiveSessionFlowOpen

    if (!currentlyOpen) {
      // Close diff and workflow panel when opening session flow
      if (selectedChatId) {
        setIsDiffOpen(false)
      }
      if (workflowPanelOpen !== null) {
        setWorkflowPanelOpen(null)
      }
    }

    // Toggle the appropriate state based on display mode
    if (sessionFlowDisplayMode === "side-peek") {
      setIsSessionFlowOpen(!isSessionFlowOpen)
    } else {
      setSessionFlowRuntimeOpen(!sessionFlowRuntimeOpen)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 px-1 py-2 border-l border-border/50 bg-background transition-all duration-200 ease-out overflow-hidden",
        isExpanded ? "w-[200px] items-stretch" : "items-center",
        className,
      )}
    >
      {/* Expand/Collapse button - always at top */}
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "flex items-center justify-center rounded-md transition-all duration-150 ease-out h-8",
              isExpanded ? "w-full hover:bg-foreground/5" : "w-8",
              "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
            )}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isExpanded ? (
              <ChevronsLeft className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronsRight className="h-4 w-4 flex-shrink-0" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {isExpanded ? "Collapse" : "Expand"}
        </TooltipContent>
      </Tooltip>

      {/* Changes/Diff Button - show if git repo */}
      {isGitRepo && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleChangesClick}
              disabled={!selectedChatId}
              className={cn(
                "flex items-center rounded-md transition-all duration-150 ease-out h-8",
                isExpanded ? "gap-2 px-2 w-full" : "justify-center w-8",
                isDiffOpen && selectedChatId
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                !selectedChatId && "opacity-50 cursor-not-allowed",
              )}
              aria-label="Changes"
              aria-pressed={isDiffOpen}
            >
              <GitBranch className="h-4 w-4 flex-shrink-0" />
              {isExpanded && (
                <>
                  <span className="text-sm flex-1 text-left">Changes</span>
                  <IconSidePeek className="h-4 w-4 flex-shrink-0 opacity-50" />
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {selectedChatId ? "Changes" : "Select a workspace to view changes"}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Session Flow Button - always show when chat is selected */}
      {selectedChatId && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleSessionFlowClick}
              className={cn(
                "flex items-center rounded-md transition-all duration-150 ease-out h-8",
                isExpanded ? "gap-2 px-2 w-full" : "justify-center w-8",
                effectiveSessionFlowOpen
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
              )}
              aria-label="Session Flow"
              aria-pressed={effectiveSessionFlowOpen}
            >
              <ListTree className="h-4 w-4 flex-shrink-0" />
              {isExpanded && (
                <>
                  <span className="text-sm flex-1 text-left">Session Flow</span>
                  <IconSidePeek className="h-4 w-4 flex-shrink-0 opacity-50" />
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            Session Flow
          </TooltipContent>
        </Tooltip>
      )}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  )
}
