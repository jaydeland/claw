import { useCallback, useEffect, useState, useMemo, useRef } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { isDesktopApp } from "../../lib/utils/platform"
import { useIsMobile } from "../../lib/hooks/use-mobile"

import {
  agentsSidebarOpenAtom,
  agentsSidebarWidthAtom,
  agentsSettingsDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  isDesktopAtom,
  isFullscreenAtom,
  anthropicOnboardingCompletedAtom,
  customHotkeysAtom,
} from "../../lib/atoms"
import { selectedAgentChatIdAtom, selectedProjectAtom } from "../agents/atoms"
import { trpc } from "../../lib/trpc"
import { useAgentsHotkeys } from "../agents/lib/agents-hotkeys-manager"
import { toggleSearchAtom } from "../agents/search"
import { AgentsSettingsDialog } from "../../components/dialogs/agents-settings-dialog"
import { ClaudeLoginModal } from "../../components/dialogs/claude-login-modal"
import { TooltipProvider } from "../../components/ui/tooltip"
import { AgentsContent } from "../agents/ui/agents-content"
import { ChatTabBar } from "../agents/ui/chat-tab-bar"
import { UpdateBanner } from "../../components/update-banner"
import { WindowsTitleBar } from "../../components/windows-title-bar"
import { AwsStatusBar } from "../../components/aws-status-bar"
import { useUpdateChecker } from "../../lib/hooks/use-update-checker"
import { useAgentSubChatStore } from "../../lib/stores/sub-chat-store"
import { QueueProcessor } from "../agents/components/queue-processor"
import { TrafficLights } from "../agents/components/traffic-light-spacer"

// ============================================================================
// Constants
// ============================================================================

// Sidebar constants kept for potential future use
const SIDEBAR_CLOSE_HOTKEY = "⌘\\"

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

  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const [sidebarWidth, setSidebarWidth] = useAtom(agentsSidebarWidthAtom)
  const [settingsOpen, setSettingsOpen] = useAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom
  )

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

  // Desktop user state
  const [desktopUser, setDesktopUser] = useState<{
    id: string
    email: string
    name: string | null
    imageUrl: string | null
    username: string | null
  } | null>(null)

  // Fetch desktop user on mount
  useEffect(() => {
    async function fetchUser() {
      if (window.desktopApi?.getUser) {
        const user = await window.desktopApi.getUser()
        setDesktopUser(user)
      }
    }
    fetchUser()
  }, [])

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

  // Handle sign out
  const handleSignOut = useCallback(async () => {
    // Clear selected project and anthropic onboarding on logout
    setSelectedProject(null)
    setSelectedChatId(null)
    setAnthropicOnboardingCompleted(false)
    if (window.desktopApi?.logout) {
      await window.desktopApi.logout()
    }
  }, [setSelectedProject, setSelectedChatId, setAnthropicOnboardingCompleted])

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

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [setSidebarOpen])

  // Handle new chat from tab bar
  const handleNewChat = useCallback(() => {
    setSelectedChatId(null)
  }, [setSelectedChatId])

  // Handle open settings from tab bar
  const handleOpenSettings = useCallback(() => {
    setSettingsActiveTab("profile")
    setSettingsOpen(true)
  }, [setSettingsActiveTab, setSettingsOpen])

  // Track hover state for traffic lights
  const [isTabBarHovered, setIsTabBarHovered] = useState(false)

  return (
    <TooltipProvider delayDuration={300}>
      {/* Global queue processor - handles message queues for all sub-chats */}
      <QueueProcessor />
      <AgentsSettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <ClaudeLoginModal />
      <div className="flex flex-col w-full h-full relative overflow-hidden bg-background select-none">
        {/* Windows Title Bar (only shown on Windows with frameless window) */}
        <WindowsTitleBar />

        {/* Tab Bar Header with Traffic Lights */}
        {!isMobile && (
          <div
            className="flex items-center border-b border-border/50 bg-background flex-shrink-0"
            onMouseEnter={() => setIsTabBarHovered(true)}
            onMouseLeave={() => setIsTabBarHovered(false)}
          >
            {/* Traffic lights area - draggable for window movement */}
            {isDesktop && (
              <div
                className="flex items-center h-10 pl-2 pr-1 flex-shrink-0"
                style={{
                  // @ts-expect-error - WebKit-specific property
                  WebkitAppRegion: "drag",
                }}
              >
                <TrafficLights
                  isHovered={isTabBarHovered}
                  isFullscreen={isFullscreen}
                  isDesktop={isDesktop}
                  className="flex-shrink-0"
                />
              </div>
            )}
            {/* Tab bar takes remaining space */}
            <div className="flex-1 min-w-0">
              <ChatTabBar
                onNewChat={handleNewChat}
                onOpenSettings={handleOpenSettings}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <AgentsContent />
        </div>

        {/* Update Banner */}
        <UpdateBanner />

        {/* AWS Status Bar (shows when authenticated with AWS) */}
        <AwsStatusBar />
      </div>
    </TooltipProvider>
  )
}
