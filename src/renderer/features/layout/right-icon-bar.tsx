"use client"

import React, { useMemo, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronsRight, ChevronsLeft, GitBranch, ListTree, Check } from "lucide-react"
import { IconSidePeek, IconCenterPeek, IconFullPage } from "../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"
import { selectedAgentChatIdAtom, diffSidebarOpenAtomFamily, diffViewDisplayModeAtom, type DiffViewDisplayMode } from "../agents/atoms"
import {
  sessionFlowDisplayModeAtom,
  sessionFlowSidebarOpenAtom,
  sessionFlowSidebarOpenRuntimeAtom,
} from "../session-flow/atoms"
import { workflowPanelOpenAtom } from "../workflows/atoms"
import { rightIconBarExpandedAtom } from "./atoms"
import { trpc } from "../../lib/trpc"

type DisplayMode = "side-peek" | "center-peek" | "full-page"

const LAYOUT_MODES = [
  {
    value: "side-peek" as const,
    label: "Sidebar",
    Icon: IconSidePeek,
  },
  {
    value: "center-peek" as const,
    label: "Dialog",
    Icon: IconCenterPeek,
  },
  {
    value: "full-page" as const,
    label: "Fullscreen",
    Icon: IconFullPage,
  },
]

interface LayoutModeSelectorProps {
  mode: DisplayMode
  onModeChange: (mode: DisplayMode) => void
}

function LayoutModeSelector({ mode, onModeChange }: LayoutModeSelectorProps) {
  const currentMode = LAYOUT_MODES.find((m) => m.value === mode) ?? LAYOUT_MODES[0]
  const CurrentIcon = currentMode.Icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-6 p-0 flex-shrink-0 flex items-center justify-center rounded hover:bg-foreground/10"
        >
          <CurrentIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LAYOUT_MODES.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onModeChange(value)}
            className="flex items-center gap-2"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            {mode === value && (
              <Check className="h-4 w-4 text-muted-foreground ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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

  // Diff display mode
  const [diffDisplayMode, setDiffDisplayMode] = useAtom(diffViewDisplayModeAtom)

  // Session flow display mode and state
  const [sessionFlowDisplayMode, setSessionFlowDisplayMode] = useAtom(sessionFlowDisplayModeAtom)
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
                  <LayoutModeSelector
                    mode={diffDisplayMode}
                    onModeChange={(mode) => setDiffDisplayMode(mode as DiffViewDisplayMode)}
                  />
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
                  <LayoutModeSelector
                    mode={sessionFlowDisplayMode}
                    onModeChange={setSessionFlowDisplayMode}
                  />
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
