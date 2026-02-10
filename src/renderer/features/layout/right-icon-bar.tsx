"use client"

import React, { useMemo, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronsRight, ChevronsLeft, GitBranch, ListTree, Check, FileStack, Rocket, BarChart3 } from "lucide-react"
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
import {
  selectedAgentChatIdAtom,
  diffSidebarOpenAtomFamily,
  diffViewDisplayModeAtom,
  type DiffViewDisplayMode,
  gsdChatSidebarOpenAtom,
  gsdDisplayModeAtom,
  gsdChatSidebarOpenRuntimeAtom,
} from "../agents/atoms"
import {
  sessionFlowDisplayModeAtom,
  sessionFlowSidebarOpenAtom,
  sessionFlowSidebarOpenRuntimeAtom,
} from "../session-flow/atoms"
import {
  loadedContextDisplayModeAtom,
  loadedContextSidebarOpenAtom,
  loadedContextSidebarOpenRuntimeAtom,
} from "../loaded-context/atoms"
import {
  analyzeDisplayModeAtom,
  analyzeSidebarOpenAtom,
  analyzeSidebarOpenRuntimeAtom,
} from "../analyze/atoms"
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

  // Loaded context display mode and state
  const [loadedContextDisplayMode, setLoadedContextDisplayMode] = useAtom(loadedContextDisplayModeAtom)
  const [isLoadedContextOpen, setIsLoadedContextOpen] = useAtom(loadedContextSidebarOpenAtom)
  const [loadedContextRuntimeOpen, setLoadedContextRuntimeOpen] = useAtom(loadedContextSidebarOpenRuntimeAtom)

  // Workflow panel state - global (for mutual exclusivity with Session Flow)
  const [workflowPanelOpen, setWorkflowPanelOpen] = useAtom(workflowPanelOpenAtom)

  // GSD display mode and state
  const [gsdDisplayMode, setGsdDisplayMode] = useAtom(gsdDisplayModeAtom)
  const [isGsdOpen, setIsGsdOpen] = useAtom(gsdChatSidebarOpenAtom)
  const [gsdRuntimeOpen, setGsdRuntimeOpen] = useAtom(gsdChatSidebarOpenRuntimeAtom)

  // Analyze display mode and state
  const [analyzeDisplayMode, setAnalyzeDisplayMode] = useAtom(analyzeDisplayModeAtom)
  const [isAnalyzeOpen, setIsAnalyzeOpen] = useAtom(analyzeSidebarOpenAtom)
  const [analyzeRuntimeOpen, setAnalyzeRuntimeOpen] = useAtom(analyzeSidebarOpenRuntimeAtom)

  // Determine which session flow open state to use based on display mode
  const effectiveSessionFlowOpen = sessionFlowDisplayMode === "side-peek"
    ? isSessionFlowOpen
    : sessionFlowRuntimeOpen

  // Determine which loaded context open state to use based on display mode
  const effectiveLoadedContextOpen = loadedContextDisplayMode === "side-peek"
    ? isLoadedContextOpen
    : loadedContextRuntimeOpen

  // Determine which GSD open state to use based on display mode
  const effectiveGsdOpen = gsdDisplayMode === "side-peek" ? isGsdOpen : gsdRuntimeOpen

  // Determine which Analyze open state to use based on display mode
  const effectiveAnalyzeOpen = analyzeDisplayMode === "side-peek" ? isAnalyzeOpen : analyzeRuntimeOpen

  // Auto-close Changes panel when switching to non-git repos
  useEffect(() => {
    if (!isGitRepo && isDiffOpen) {
      setIsDiffOpen(false)
    }
  }, [isGitRepo, isDiffOpen, setIsDiffOpen])

  const handleChangesClick = () => {
    if (!selectedChatId) return
    // Toggle diff sidebar, close other panels if opening diff
    if (!isDiffOpen) {
      setIsSessionFlowOpen(false)
      setIsLoadedContextOpen(false)
      setIsGsdOpen(false)
    }
    setIsDiffOpen(!isDiffOpen)
  }

  const handleSessionFlowClick = () => {
    // Toggle session flow based on display mode
    const currentlyOpen = effectiveSessionFlowOpen

    if (!currentlyOpen) {
      // Close other panels when opening session flow
      if (selectedChatId) {
        setIsDiffOpen(false)
      }
      if (workflowPanelOpen !== null) {
        setWorkflowPanelOpen(null)
      }
      setIsLoadedContextOpen(false)
      setIsGsdOpen(false)
    }

    // Toggle the appropriate state based on display mode
    if (sessionFlowDisplayMode === "side-peek") {
      setIsSessionFlowOpen(!isSessionFlowOpen)
    } else {
      setSessionFlowRuntimeOpen(!sessionFlowRuntimeOpen)
    }
  }

  const handleLoadedContextClick = () => {
    // Toggle loaded context based on display mode
    const currentlyOpen = effectiveLoadedContextOpen

    if (!currentlyOpen) {
      // Close other panels when opening loaded context
      if (selectedChatId) {
        setIsDiffOpen(false)
      }
      setIsSessionFlowOpen(false)
      setIsGsdOpen(false)
      if (workflowPanelOpen !== null) {
        setWorkflowPanelOpen(null)
      }
    }

    // Toggle the appropriate state based on display mode
    if (loadedContextDisplayMode === "side-peek") {
      setIsLoadedContextOpen(!isLoadedContextOpen)
    } else {
      setLoadedContextRuntimeOpen(!loadedContextRuntimeOpen)
    }
  }

  const handleGsdClick = () => {
    // Toggle GSD based on display mode
    const currentlyOpen = effectiveGsdOpen

    if (!currentlyOpen) {
      // Close other panels when opening GSD
      if (selectedChatId) {
        setIsDiffOpen(false)
      }
      setIsSessionFlowOpen(false)
      setIsLoadedContextOpen(false)
      if (workflowPanelOpen !== null) {
        setWorkflowPanelOpen(null)
      }
    }

    // Toggle the appropriate state based on display mode
    if (gsdDisplayMode === "side-peek") {
      setIsGsdOpen(!isGsdOpen)
    } else {
      setGsdRuntimeOpen(!gsdRuntimeOpen)
    }
  }

  const handleAnalyzeClick = () => {
    // Toggle Analyze based on display mode
    const currentlyOpen = effectiveAnalyzeOpen

    if (!currentlyOpen) {
      // Close other panels when opening Analyze
      if (selectedChatId) {
        setIsDiffOpen(false)
      }
      setIsSessionFlowOpen(false)
      setIsLoadedContextOpen(false)
      setIsGsdOpen(false)
      if (workflowPanelOpen !== null) {
        setWorkflowPanelOpen(null)
      }
    }

    // Toggle the appropriate state based on display mode
    if (analyzeDisplayMode === "side-peek") {
      setIsAnalyzeOpen(!isAnalyzeOpen)
    } else {
      setAnalyzeRuntimeOpen(!analyzeRuntimeOpen)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 px-1 py-2 border-l border-border/50 bg-muted/50 transition-all duration-200 ease-out overflow-hidden",
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
              isExpanded ? "w-full hover:bg-foreground/10" : "w-8",
              "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
            )}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isExpanded ? (
              <ChevronsRight className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronsLeft className="h-4 w-4 flex-shrink-0" />
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
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
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
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
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

      {/* Session Context Button - always show when chat is selected */}
      {selectedChatId && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleLoadedContextClick}
              className={cn(
                "flex items-center rounded-md transition-all duration-150 ease-out h-8",
                isExpanded ? "gap-2 px-2 w-full" : "justify-center w-8",
                effectiveLoadedContextOpen
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
              )}
              aria-label="Session Context"
              aria-pressed={effectiveLoadedContextOpen}
            >
              <FileStack className="h-4 w-4 flex-shrink-0" />
              {isExpanded && (
                <>
                  <span className="text-sm flex-1 text-left">Session Context</span>
                  <LayoutModeSelector
                    mode={loadedContextDisplayMode}
                    onModeChange={setLoadedContextDisplayMode}
                  />
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            Session Context
          </TooltipContent>
        </Tooltip>
      )}

      {/* GSD Planning Button - always show when chat is selected */}
      {selectedChatId && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleGsdClick}
              className={cn(
                "flex items-center rounded-md transition-all duration-150 ease-out h-8",
                isExpanded ? "gap-2 px-2 w-full" : "justify-center w-8",
                effectiveGsdOpen
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
              )}
              aria-label="GSD Planning"
              aria-pressed={effectiveGsdOpen}
            >
              <Rocket className="h-4 w-4 flex-shrink-0" />
              {isExpanded && (
                <>
                  <span className="text-sm flex-1 text-left">GSD Planning</span>
                  <LayoutModeSelector
                    mode={gsdDisplayMode}
                    onModeChange={setGsdDisplayMode}
                  />
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            GSD Planning
          </TooltipContent>
        </Tooltip>
      )}

      {/* Analyze Button - always show when chat is selected */}
      {selectedChatId && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleAnalyzeClick}
              className={cn(
                "flex items-center rounded-md transition-all duration-150 ease-out h-8",
                isExpanded ? "gap-2 px-2 w-full" : "justify-center w-8",
                effectiveAnalyzeOpen
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
              )}
              aria-label="Analyze"
              aria-pressed={effectiveAnalyzeOpen}
            >
              <BarChart3 className="h-4 w-4 flex-shrink-0" />
              {isExpanded && (
                <>
                  <span className="text-sm flex-1 text-left">Analyze</span>
                  <LayoutModeSelector
                    mode={analyzeDisplayMode}
                    onModeChange={setAnalyzeDisplayMode}
                  />
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            Analyze
          </TooltipContent>
        </Tooltip>
      )}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  )
}
