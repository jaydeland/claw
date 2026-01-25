import { useEffect, useMemo, useRef } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { isDesktopApp } from "../../lib/utils/platform"
import { useIsMobile } from "../../lib/hooks/use-mobile"

import {
  agentsSidebarOpenAtom,
  agentsSettingsDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  isDesktopAtom,
  isFullscreenAtom,
  customHotkeysAtom,
} from "../../lib/atoms"
import { selectedAgentChatIdAtom, selectedProjectAtom, selectedSidebarTabAtom, sidebarContentCollapsedAtom } from "../agents/atoms"
import { trpc } from "../../lib/trpc"
import { useAgentsHotkeys } from "../agents/lib/agents-hotkeys-manager"
import { toggleSearchAtom } from "../agents/search"
import { AgentsSettingsDialog } from "../../components/dialogs/agents-settings-dialog"
import { ClaudeLoginModal } from "../../components/dialogs/claude-login-modal"
import { TerminalDialog } from "../terminal"
import { TooltipProvider } from "../../components/ui/tooltip"
import { AgentsContent } from "../agents/ui/agents-content"
import { UpdateBanner } from "../../components/update-banner"
import { WindowsTitleBar } from "../../components/windows-title-bar"
import { AwsStatusBar } from "../../components/aws-status-bar"
import { useUpdateChecker } from "../../lib/hooks/use-update-checker"
import { useAgentSubChatStore } from "../../lib/stores/sub-chat-store"
import { QueueProcessor } from "../agents/components/queue-processor"
import { TrafficLights } from "../agents/components/traffic-light-spacer"
import {
  SidebarTabBar,
  HistoryTabContent,
  WorkspacesTabContent,
  CommandsTabContent,
  AgentsTabContent,
  SkillsTabContent,
  McpsTabContent,
  TerminalTabContent,
} from "../sidebar/components"
import { RightIconBar } from "./right-icon-bar"
import { Button } from "../../components/ui/button"
import { SettingsIcon } from "../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"

// ============================================================================
// Component
// ============================================================================

export function AgentsLayout() {
  // No useHydrateAtoms - desktop doesn't need SSR, atomWithStorage handles persistence
  const isMobile = useIsMobile()

  // Global desktop/fullscreen state - initialized here at root level
  const [isDesktop, setIsDesktop] = useAtom(isDesktopAtom)
  const [isFullscreen, setIsFullscreen] = useAtom(isFullscreenAtom)

  // Initialize isDesktop on mount
  useEffect(() => {
    setIsDesktop(isDesktopApp())
  }, [setIsDesktop])

  // Subscribe to fullscreen changes from Electron
  useEffect(() => {
    if (
      !isDesktop ||
      typeof window === "undefined" ||
      !window.desktopApi?.windowIsFullscreen
    )
      return

    // Get initial fullscreen state
    window.desktopApi.windowIsFullscreen().then(setIsFullscreen)

    // In dev mode, HMR breaks IPC event subscriptions, so we poll instead
    const isDev = import.meta.env.DEV
    if (isDev) {
      const interval = setInterval(() => {
        window.desktopApi?.windowIsFullscreen?.().then(setIsFullscreen)
      }, 300)
      return () => clearInterval(interval)
    }

    // In production, use events (more efficient)
    const unsubscribe = window.desktopApi.onFullscreenChange?.(setIsFullscreen)
    return unsubscribe
  }, [isDesktop, setIsFullscreen])

  // Check for updates on mount and periodically
  useUpdateChecker()

  const setSidebarOpen = useSetAtom(agentsSidebarOpenAtom)
  const [settingsOpen, setSettingsOpen] = useAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const selectedSidebarTab = useAtomValue(selectedSidebarTabAtom)
  const isContentCollapsed = useAtomValue(sidebarContentCollapsedAtom)

  // Fetch projects to validate selectedProject exists
  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  // Validated project - only valid if exists in DB
  // While loading, trust localStorage value to prevent clearing on app restart
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value to prevent flicker and clearing
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

  // Clear invalid project from storage (only after loading completes)
  useEffect(() => {
    if (
      selectedProject &&
      projects &&
      !isLoadingProjects &&
      !validatedProject
    ) {
      setSelectedProject(null)
    }
  }, [
    selectedProject,
    projects,
    isLoadingProjects,
    validatedProject,
    setSelectedProject,
  ])

  // Hide native traffic lights - we use custom traffic lights in the tab bar area
  useEffect(() => {
    if (!isDesktop) return
    if (
      typeof window === "undefined" ||
      !window.desktopApi?.setTrafficLightVisibility
    )
      return

    // Always hide native traffic lights - we use custom ones in the tab bar
    window.desktopApi.setTrafficLightVisibility(false)
  }, [isDesktop])
  const setChatId = useAgentSubChatStore((state) => state.setChatId)

  // Track if this is the initial load - skip auto-open on first load to respect saved state
  const isInitialLoadRef = useRef(true)

  // Auto-open sidebar when project is selected, close when no project
  // Skip on initial load to preserve user's saved sidebar preference
  useEffect(() => {
    if (!projects) return // Don't change sidebar state while loading

    // On initial load, just mark as loaded and don't change sidebar state
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      return
    }

    // After initial load, react to project changes
    if (validatedProject) {
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }, [validatedProject, projects, setSidebarOpen])

  // Initialize sub-chats when chat is selected
  useEffect(() => {
    if (selectedChatId) {
      setChatId(selectedChatId)
    } else {
      setChatId(null)
    }
  }, [selectedChatId, setChatId])

  // Chat search toggle
  const toggleChatSearch = useSetAtom(toggleSearchAtom)

  // Custom hotkeys config
  const customHotkeysConfig = useAtomValue(customHotkeysAtom)

  // Initialize hotkeys manager
  useAgentsHotkeys({
    setSelectedChatId,
    setSidebarOpen,
    setSettingsDialogOpen: setSettingsOpen,
    setSettingsActiveTab,
    toggleChatSearch,
    selectedChatId,
    customHotkeysConfig,
  })

  return (
    <TooltipProvider delayDuration={300}>
      {/* Global queue processor - handles message queues for all sub-chats */}
      <QueueProcessor />
      <AgentsSettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <ClaudeLoginModal />
      <TerminalDialog />
      <div className="flex flex-col w-full h-full relative overflow-hidden bg-background select-none">
        {/* Windows Title Bar (only shown on Windows with frameless window) */}
        <WindowsTitleBar />

        {/* Header - traffic lights and settings */}
        {!isMobile && isDesktop && (
          <div
            className="flex items-center justify-between h-8 pl-2 pr-2 border-b border-border/50 bg-background flex-shrink-0"
            style={{
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "drag",
            }}
          >
            <TrafficLights
              isHovered={false}
              isFullscreen={isFullscreen}
              isDesktop={isDesktop}
              className="flex-shrink-0"
            />

            {/* Settings button */}
            <div
              style={{
                // @ts-expect-error - WebKit-specific property
                WebkitAppRegion: "no-drag",
              }}
            >
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSettingsActiveTab("profile")
                      setSettingsOpen(true)
                    }}
                    className="h-6 w-6"
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Main Content with Sidebar */}
        <div className="flex-1 overflow-hidden flex min-w-0">
          {/* Sidebar Tab Bar (vertical icons) */}
          {!isMobile && (
            <div className="flex-shrink-0 border-r border-border/50 bg-background">
              <SidebarTabBar isCollapsed={true} />
            </div>
          )}

          {/* Sidebar Content Panel - shows list/navigation for selected tab */}
          {/* Note: clusters tab doesn't show sidebar content - cluster selection is via dropdown in main view */}
          {!isMobile && !isContentCollapsed && selectedSidebarTab !== "clusters" && (
            <div className="w-64 flex-shrink-0 border-r border-border/50 bg-background overflow-hidden">
              {selectedSidebarTab === "history" ? (
                <HistoryTabContent className="h-full" />
              ) : selectedSidebarTab === "chats" ? (
                <WorkspacesTabContent className="h-full" />
              ) : selectedSidebarTab === "terminal" ? (
                <TerminalTabContent className="h-full" />
              ) : selectedSidebarTab === "commands" ? (
                <CommandsTabContent className="h-full" />
              ) : selectedSidebarTab === "agents" ? (
                <AgentsTabContent className="h-full" />
              ) : selectedSidebarTab === "skills" ? (
                <SkillsTabContent className="h-full" />
              ) : selectedSidebarTab === "mcps" ? (
                <McpsTabContent className="h-full" />
              ) : null}
            </div>
          )}

          {/* Main content area */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            <AgentsContent />
          </div>

          {/* Right Icon Bar (desktop only) */}
          {!isMobile && (
            <div className="flex-shrink-0 bg-background">
              <RightIconBar />
            </div>
          )}
        </div>

        {/* Update Banner */}
        <UpdateBanner />

        {/* AWS Status Bar (shows when authenticated with AWS) */}
        <AwsStatusBar />
      </div>
    </TooltipProvider>
  )
}
