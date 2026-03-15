"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
// import { useSearchParams, useRouter } from "next/navigation" // Desktop doesn't use next/navigation
// Desktop: mock Next.js navigation hooks
const useSearchParams = () => ({ get: (_key: string) => null })
const useRouter = () => ({ push: (_url: string) => {}, replace: (_url: string, _opts?: { scroll?: boolean }) => {} })
// Desktop: mock Clerk hooks
const useUser = () => ({ user: null })
const useClerk = () => ({ signOut: (_opts?: { redirectUrl?: string }) => Promise.resolve() })
import {
  selectedAgentChatIdAtom,
  previousAgentChatIdAtom,
  agentsMobileViewModeAtom,
  agentsPreviewSidebarOpenAtom,
  agentsSidebarOpenAtom,
  selectedSidebarTabAtom,
  selectedProjectDetailIdAtom,
  selectedProjectAtom,
} from "../atoms"
import {
  selectedTeamIdAtom,
  agentsQuickSwitchOpenAtom,
  agentsQuickSwitchSelectedIndexAtom,
  subChatsQuickSwitchOpenAtom,
  subChatsQuickSwitchSelectedIndexAtom,
  ctrlTabTargetAtom,
  selectedClawDetailIdAtom,
} from "../../../lib/atoms"
import { NewChatForm } from "../main/new-chat-form"
import { ChatView } from "../main/active-chat"
import { api } from "../../../lib/mock-api"
import { trpc } from "../../../lib/trpc"
import { useIsMobile } from "../../../lib/hooks/use-mobile"
import { AgentsSidebar } from "../../sidebar/agents-sidebar"
import { AgentPreview } from "./agent-preview"
import { AgentDiffView } from "./agent-diff-view"
import { TerminalSidebar, TerminalMainView, terminalSidebarOpenAtom } from "../../terminal"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../stores/sub-chat-store"
import { useShallow } from "zustand/react/shallow"
// import { useClerk, useUser } from "@clerk/nextjs"
// import { useCombinedAuth } from "@/lib/hooks/use-combined-auth"
const useCombinedAuth = () => ({ userId: null }) // Desktop mock
import { selectedWorkflowCategoryAtom } from "../../workflows/atoms"
import { WorkflowsContent } from "../../workflows/ui/workflows-content"
import { selectedMcpCategoryAtom } from "../../mcp/atoms"
import { McpContent } from "../../mcp/ui/mcp-content"
import { selectedClustersCategoryAtom } from "../../clusters/atoms"
import { ClustersContent } from "../../clusters/ui/clusters-content"
import { selectedGsdCategoryAtom } from "../../gsd/atoms"
import { GsdContent } from "../../gsd/ui/gsd-content"
import { GitHubView } from "../../github/components/github-view"
import { WorkspaceGitHubView } from "../../github/components/workspace-github-view"
import { workspaceGithubSelectionAtom } from "../../github/atoms"
import { AgentsQuickSwitchDialog } from "../components/agents-quick-switch-dialog"
import { SubChatsQuickSwitchDialog } from "../components/subchats-quick-switch-dialog"
import { HistoryChatView } from "../../history"
import { ProjectDetailPage } from "./project-detail-page"
import { PromptsView } from "../../prompts/ui/prompts-view"
import { ErDiagramView } from "../../er-diagram/ui/er-diagram-view"
import { ExecutionHistoryViewer } from "../../sidebar/components/execution-history-viewer"
import { ClawEditView } from "../../sidebar/components/claw-edit-view"
import { ClawDetailPage } from "../../claws/ui/claw-detail-page"
import { selectedSettingsCategoryAtom } from "../atoms"
import { Zap } from "lucide-react"
import { CcSettingsContent } from "../../settings/ui/cc-settings-content"
import { PinnedTabsBar } from "../components/pinned-tabs-bar"
// Desktop mock
const useIsAdmin = () => false

// Main Component
export function AgentsContent() {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const selectedSidebarTab = useAtomValue(selectedSidebarTabAtom)
  const selectedProjectDetailId = useAtomValue(selectedProjectDetailIdAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectedWorkflowCategory = useAtomValue(selectedWorkflowCategoryAtom)
  const selectedMcpCategory = useAtomValue(selectedMcpCategoryAtom)
  const selectedClustersCategory = useAtomValue(selectedClustersCategoryAtom)
  const selectedGsdCategory = useAtomValue(selectedGsdCategoryAtom)
  const selectedSettingsCategory = useAtomValue(selectedSettingsCategoryAtom)
  const [selectedClaw, setSelectedClaw] = useAtom(selectedClawAtom)
  const [isEditingClaw, setIsEditingClaw] = useAtom(isEditingClawAtom)
  const workspaceGithubSelection = useAtomValue(workspaceGithubSelectionAtom)

  const [selectedTeamId] = useAtom(selectedTeamIdAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const [previewSidebarOpen, setPreviewSidebarOpen] = useAtom(
    agentsPreviewSidebarOpenAtom,
  )
  const [mobileViewMode, setMobileViewMode] = useAtom(agentsMobileViewModeAtom)
  const setTerminalSidebarOpen = useSetAtom(terminalSidebarOpenAtom)

  const searchParams = useSearchParams()
  const router = useRouter()
  const isInitialized = useRef(false)
  const isFirstRenderRef = useRef(true) // Skip URL sync on first render to avoid race condition
  const isNavigatingRef = useRef(false)
  const newChatFormKeyRef = useRef(0)
  const isMobile = useIsMobile()
  const [isHydrated, setIsHydrated] = useState(false)
  const { userId } = useCombinedAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const isAdmin = useIsAdmin()

  // Quick-switch dialog state - Agents (Opt+Ctrl+Tab)
  const [quickSwitchOpen, setQuickSwitchOpen] = useAtom(
    agentsQuickSwitchOpenAtom,
  )
  const [quickSwitchSelectedIndex, setQuickSwitchSelectedIndex] = useAtom(
    agentsQuickSwitchSelectedIndexAtom,
  )
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null)
  const modifierKeysHeldRef = useRef(false)
  const wasShiftPressedRef = useRef(false)
  const isQuickSwitchingRef = useRef(false)
  const frozenRecentChatsRef = useRef<typeof agentChats>([]) // Frozen snapshot for dialog

  // Ctrl+Tab target preference
  const ctrlTabTarget = useAtomValue(ctrlTabTargetAtom)

  // Quick-switch dialog state - Sub-chats (Ctrl+Tab)
  const [subChatQuickSwitchOpen, setSubChatQuickSwitchOpen] = useAtom(
    subChatsQuickSwitchOpenAtom,
  )
  const [subChatQuickSwitchSelectedIndex, setSubChatQuickSwitchSelectedIndex] =
    useAtom(subChatsQuickSwitchSelectedIndexAtom)
  const subChatHoldTimerRef = useRef<NodeJS.Timeout | null>(null)
  const subChatModifierKeysHeldRef = useRef(false)
  const subChatWasShiftPressedRef = useRef(false)
  const frozenSubChatsRef = useRef<SubChatMeta[]>([])
  // Refs to avoid effect re-running when dialog state changes (prevents keyup event loss)
  const subChatQuickSwitchOpenRef = useRef(subChatQuickSwitchOpen)
  const subChatQuickSwitchSelectedIndexRef = useRef(
    subChatQuickSwitchSelectedIndex,
  )
  subChatQuickSwitchOpenRef.current = subChatQuickSwitchOpen
  subChatQuickSwitchSelectedIndexRef.current = subChatQuickSwitchSelectedIndex

  // Get sub-chats from store with shallow comparison
  const { allSubChats, openSubChatIds, activeSubChatId, setActiveSubChat } = useAgentSubChatStore(
    useShallow((state) => ({
      allSubChats: state.allSubChats,
      openSubChatIds: state.openSubChatIds,
      activeSubChatId: state.activeSubChatId,
      setActiveSubChat: state.setActiveSubChat,
    }))
  )

  // Fetch teams for header
  const { data: teams } = api.teams.getUserTeams.useQuery(undefined, {
    enabled: !!selectedTeamId,
  })
  const selectedTeam = teams?.find((t: any) => t.id === selectedTeamId) as any

  // Fetch agent chats for keyboard navigation and mobile view
  const { data: agentChats } = api.agents.getAgentChats.useQuery(
    { teamId: selectedTeamId! },
    { enabled: !!selectedTeamId },
  )

  // Fetch all projects for git info (like sidebar does)
  const { data: projects } = trpc.projects.list.useQuery()

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  // Fetch current chat data for preview info
  const { data: chatData } = api.agents.getAgentChat.useQuery(
    { chatId: selectedChatId! },
    { enabled: !!selectedChatId },
  )

  // Fetch start commands for the project - these run when a new terminal is created
  const mobileProjectId = (chatData as any)?.project?.id as string | undefined
  const { data: mobileStartCommandsData } = trpc.projects.getStartCommands.useQuery(
    { id: mobileProjectId ?? "" },
    { enabled: !!mobileProjectId },
  )
  const mobileStartCommands = useMemo(
    () => mobileStartCommandsData?.commands ?? [],
    [mobileStartCommandsData]
  )

  // Track previous chat ID for navigation after archive
  const [previousChatId, setPreviousChatId] = useAtom(previousAgentChatIdAtom)
  const prevSelectedChatIdRef = useRef<string | null>(null)

  // Update previousChatId when selectedChatId changes
  useEffect(() => {
    // Only update if we're switching from one chat to another
    if (prevSelectedChatIdRef.current && prevSelectedChatIdRef.current !== selectedChatId) {
      setPreviousChatId(prevSelectedChatIdRef.current)
    }
    prevSelectedChatIdRef.current = selectedChatId
  }, [selectedChatId, setPreviousChatId])

  // Note: Archive mutations moved to AgentsSidebar to share undo stack with Cmd+Z

  // Track hydration
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // On mount: read URL → set atom
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    const chatIdFromUrl = searchParams.get("chat")
    if (chatIdFromUrl) {
      setSelectedChatId(chatIdFromUrl)
    }
  }, [searchParams, setSelectedChatId])

  // When atom changes: update URL and increment NewChatForm key when returning to new chat view
  useEffect(() => {
    // Skip the first render - let the URL read effect set the initial value first
    // This prevents a race condition where this effect would clear the chat param
    // before the atom has been updated from the URL
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }

    const currentChatId = searchParams.get("chat")
    if (selectedChatId !== currentChatId) {
      const url = new URL(window.location.href)
      if (selectedChatId) {
        url.searchParams.set("chat", selectedChatId)
      } else {
        url.searchParams.delete("chat")
        // Increment key to force NewChatForm remount and trigger focus
        newChatFormKeyRef.current += 1
      }
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }, [selectedChatId, searchParams, router, quickSwitchOpen])

  // Auto-close sidebars on mobile devices
  useEffect(() => {
    if (isMobile && isHydrated) {
      setSidebarOpen(false)
      setPreviewSidebarOpen(false)
    }
  }, [isMobile, isHydrated, setSidebarOpen, setPreviewSidebarOpen])

  // On mobile: when chat is selected, switch to chat mode
  useEffect(() => {
    if (isMobile && selectedChatId && mobileViewMode === "chats") {
      setMobileViewMode("chat")
    }
  }, [isMobile, selectedChatId, mobileViewMode, setMobileViewMode])

  // On mobile: when in terminal mode, sync with terminal sidebar close
  const terminalSidebarOpen = useAtomValue(terminalSidebarOpenAtom)
  useEffect(() => {
    // If terminal sidebar closed while in terminal mode, go back to chat
    if (isMobile && mobileViewMode === "terminal" && !terminalSidebarOpen) {
      setMobileViewMode("chat")
    }
  }, [isMobile, mobileViewMode, terminalSidebarOpen, setMobileViewMode])

  // On mobile: hide native traffic lights when not in "chats" mode
  // Traffic lights should only show in the agents list view
  useEffect(() => {
    if (!isMobile) return
    if (
      typeof window === "undefined" ||
      !window.desktopApi?.setTrafficLightVisibility
    )
      return

    // Hide traffic lights when not in chats list mode
    if (mobileViewMode !== "chats") {
      window.desktopApi.setTrafficLightVisibility(false)
    }
  }, [isMobile, mobileViewMode])

  // Get recent chats for quick-switch dialog
  // Order: current chat first (left), then previous chats by last updated
  // IMPORTANT: Only recalculate when dialog is closed to prevent flickering
  const sortedChats = agentChats
    ? [...agentChats].sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
      )
    : []

  let recentChats: typeof sortedChats = []
  // Use frozen chats when dialog is open to prevent recalculation
  if (
    quickSwitchOpen &&
    frozenRecentChatsRef.current &&
    frozenRecentChatsRef.current.length > 0
  ) {
    recentChats = frozenRecentChatsRef.current ?? []
  } else if (selectedChatId) {
    // Put current chat first, then take next 4
    const currentChat = sortedChats.find((c) => c.id === selectedChatId)
    const otherChats = sortedChats
      .filter((c) => c.id !== selectedChatId)
      .slice(0, 4)
    recentChats = currentChat ? [currentChat, ...otherChats] : otherChats
  } else {
    recentChats = sortedChats.slice(0, 5)
  }

  // Keyboard navigation: Quick switch between workspaces
  // Shortcut depends on ctrlTabTarget preference:
  // - "workspaces" (default): Ctrl+Tab switches workspaces
  // - "agents": Opt+Ctrl+Tab switches workspaces
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Determine shortcut based on preference
      const isCtrlTabOnly =
        e.ctrlKey && e.key === "Tab" && !e.altKey && !e.metaKey
      const isOptCtrlTab =
        e.altKey && e.ctrlKey && e.key === "Tab" && !e.metaKey

      // Workspace switch: Ctrl+Tab by default, or Opt+Ctrl+Tab when ctrlTabTarget is "agents"
      const isWorkspaceSwitchShortcut =
        ctrlTabTarget === "workspaces" ? isCtrlTabOnly : isOptCtrlTab

      if (isWorkspaceSwitchShortcut) {
        e.preventDefault()
        wasShiftPressedRef.current = e.shiftKey

        if (recentChats.length === 0) return

        // If dialog is open, navigate through chats
        if (quickSwitchOpen) {
          let nextIndex: number
          if (e.shiftKey) {
            // Shift + Tab = Previous
            nextIndex = quickSwitchSelectedIndex - 1
            if (nextIndex < 0) {
              nextIndex = (frozenRecentChatsRef.current?.length ?? 1) - 1
            }
          } else {
            // Tab = Next
            nextIndex =
              (quickSwitchSelectedIndex + 1) %
              (frozenRecentChatsRef.current?.length ?? 1)
          }
          setQuickSwitchSelectedIndex(nextIndex)
          return
        }

        // If dialog is not open yet, start hold timer
        if (!quickSwitchOpen && !holdTimerRef.current) {
          modifierKeysHeldRef.current = true

          // Freeze current recentChats snapshot for this dialog session
          frozenRecentChatsRef.current = [...recentChats]

          // Start timer to show dialog after 30ms (almost instant)
          holdTimerRef.current = setTimeout(() => {
            // Clear timer ref AFTER it fires - this is critical for close detection
            holdTimerRef.current = null
            if (modifierKeysHeldRef.current) {
              // Show dialog
              setQuickSwitchOpen(true)

              // Current chat is always at index 0 (left), select next chat (index 1)
              // For Shift+Tab, select last chat
              if (wasShiftPressedRef.current) {
                // Shift: go to last chat
                setQuickSwitchSelectedIndex(
                  (frozenRecentChatsRef.current?.length ?? 1) - 1,
                )
              } else {
                // Tab: go to next chat (index 1), or wrap to 0 if only one chat
                setQuickSwitchSelectedIndex(
                  (frozenRecentChatsRef.current?.length ?? 1) > 1 ? 1 : 0,
                )
              }
            }
          }, 30)

          return
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // ESC to close dialog without navigating
      if (e.key === "Escape" && quickSwitchOpen) {
        e.preventDefault()
        modifierKeysHeldRef.current = false
        isQuickSwitchingRef.current = false // Unblock selectedChatId changes

        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current)
          holdTimerRef.current = null
        }

        setQuickSwitchOpen(false)
        setQuickSwitchSelectedIndex(0)
        return
      }

      // When modifier key is released
      // For workspaces mode (Ctrl+Tab only): react to Control release
      // For agents mode (Opt+Ctrl+Tab): react to Alt or Control release
      const isRelevantKeyRelease =
        ctrlTabTarget === "workspaces"
          ? e.key === "Control"
          : e.key === "Alt" || e.key === "Control"

      if (isRelevantKeyRelease) {
        modifierKeysHeldRef.current = false

        // If timer is still running (quick press - dialog not shown yet)
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current)
          holdTimerRef.current = null
          isQuickSwitchingRef.current = false // Unblock

          // Do quick switch without showing dialog
          if (!isNavigatingRef.current && agentChats && agentChats.length > 0) {
            // Get sorted chat list
            const sortedChats = [...agentChats].sort(
              (a, b) =>
                new Date(b.updatedAt || 0).getTime() -
                new Date(a.updatedAt || 0).getTime(),
            )
            isNavigatingRef.current = true
            setTimeout(() => {
              isNavigatingRef.current = false
            }, 300)

            // If no chat selected, select first one
            if (!selectedChatId) {
              setSelectedChatId(sortedChats[0].id)
              return
            }

            // Find current index
            const currentIndex = sortedChats.findIndex(
              (chat) => chat.id === selectedChatId,
            )

            if (currentIndex === -1) {
              setSelectedChatId(sortedChats[0].id)
              return
            }

            // Navigate forward or backward
            let nextIndex: number
            if (wasShiftPressedRef.current) {
              nextIndex = currentIndex - 1
              if (nextIndex < 0) {
                nextIndex = sortedChats.length - 1
              }
            } else {
              nextIndex = currentIndex + 1
              if (nextIndex >= sortedChats.length) {
                nextIndex = 0
              }
            }

            setSelectedChatId(sortedChats[nextIndex].id)
          }
          return
        }

        // If dialog is open, navigate to selected chat and close
        if (quickSwitchOpen) {
          const selectedChat =
            frozenRecentChatsRef.current?.[quickSwitchSelectedIndex]

          if (selectedChat) {
            setSelectedChatId(selectedChat.id)
          }

          setQuickSwitchOpen(false)
          setQuickSwitchSelectedIndex(0)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
      }
    }
  }, [
    agentChats,
    selectedChatId,
    setSelectedChatId,
    quickSwitchOpen,
    setQuickSwitchOpen,
    quickSwitchSelectedIndex,
    setQuickSwitchSelectedIndex,
    ctrlTabTarget,
    // Note: recentChats removed - we use frozenRecentChatsRef instead
  ])

  // Get open sub-chats for quick-switch (only tabs that are open in the selector)
  // Sorted by position in openSubChatIds, with active first
  // Limited to 5 items for quick-switch dialog
  const recentSubChats = useMemo(() => {
    if (!openSubChatIds || openSubChatIds.length === 0) return []

    // Get sub-chat metadata for open tabs
    const openSubChats = openSubChatIds
      .map((id) => allSubChats.find((c) => c.id === id))
      .filter((c): c is SubChatMeta => c !== undefined)

    if (openSubChats.length === 0) return []

    // Put active sub-chat first, keep rest in tab order, limit to 5
    if (activeSubChatId) {
      const activeChat = openSubChats.find((c) => c.id === activeSubChatId)
      const otherChats = openSubChats.filter((c) => c.id !== activeSubChatId).slice(0, 4)
      return activeChat ? [activeChat, ...otherChats] : openSubChats.slice(0, 5)
    }
    return openSubChats.slice(0, 5)
  }, [openSubChatIds, allSubChats, activeSubChatId])

  // Keyboard navigation: Quick switch between agents (sub-chats within workspace)
  // Shortcut depends on ctrlTabTarget preference:
  // - "workspaces" (default): Opt+Ctrl+Tab switches agents
  // - "agents": Ctrl+Tab switches agents
  // Uses refs for dialog state to avoid effect re-running and losing keyup events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Determine shortcut based on preference
      const isCtrlTabOnly =
        e.ctrlKey && e.key === "Tab" && !e.altKey && !e.metaKey
      const isOptCtrlTab =
        e.altKey && e.ctrlKey && e.key === "Tab" && !e.metaKey

      // Agent switch: Opt+Ctrl+Tab by default, or Ctrl+Tab when ctrlTabTarget is "agents"
      const isAgentSwitchShortcut =
        ctrlTabTarget === "agents" ? isCtrlTabOnly : isOptCtrlTab

      if (isAgentSwitchShortcut) {
        e.preventDefault()
        subChatWasShiftPressedRef.current = e.shiftKey

        // If dialog is open, navigate through sub-chats
        if (subChatQuickSwitchOpenRef.current) {
          let nextIndex: number
          if (e.shiftKey) {
            nextIndex = subChatQuickSwitchSelectedIndexRef.current - 1
            if (nextIndex < 0) {
              nextIndex = (frozenSubChatsRef.current?.length ?? 1) - 1
            }
          } else {
            nextIndex =
              (subChatQuickSwitchSelectedIndexRef.current + 1) %
              (frozenSubChatsRef.current?.length ?? 1)
          }
          setSubChatQuickSwitchSelectedIndex(nextIndex)
          return
        }

        // If dialog is not open yet, start hold timer
        if (
          !subChatQuickSwitchOpenRef.current &&
          !subChatHoldTimerRef.current
        ) {
          // Get fresh data from store for snapshot
          const store = useAgentSubChatStore.getState()
          const currentOpenIds = store.openSubChatIds
          const currentAllSubChats = store.allSubChats
          const currentActiveId = store.activeSubChatId

          if (currentOpenIds.length === 0) return

          subChatModifierKeysHeldRef.current = true

          // Build frozen snapshot from current store state
          const openSubChats = currentOpenIds
            .map((id) => currentAllSubChats.find((c) => c.id === id))
            .filter((c): c is SubChatMeta => c !== undefined)

          if (openSubChats.length === 0) return

          // Put active sub-chat first, limit to 5
          if (currentActiveId) {
            const activeChat = openSubChats.find(
              (c) => c.id === currentActiveId,
            )
            const otherChats = openSubChats.filter(
              (c) => c.id !== currentActiveId,
            ).slice(0, 4)
            frozenSubChatsRef.current = activeChat
              ? [activeChat, ...otherChats]
              : openSubChats.slice(0, 5)
          } else {
            frozenSubChatsRef.current = openSubChats.slice(0, 5)
          }

          subChatHoldTimerRef.current = setTimeout(() => {
            // Clear timer ref AFTER it fires - this is critical for close detection
            subChatHoldTimerRef.current = null
            if (subChatModifierKeysHeldRef.current) {
              // Update ref immediately so keyUp can detect dialog is open
              // (before React re-renders and updates the ref from state)
              subChatQuickSwitchOpenRef.current = true
              setSubChatQuickSwitchOpen(true)
              if (subChatWasShiftPressedRef.current) {
                setSubChatQuickSwitchSelectedIndex(
                  (frozenSubChatsRef.current?.length ?? 1) - 1,
                )
              } else {
                setSubChatQuickSwitchSelectedIndex(
                  (frozenSubChatsRef.current?.length ?? 1) > 1 ? 1 : 0,
                )
              }
            }
          }, 30)

          return
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // ESC to close dialog without navigating
      if (e.key === "Escape" && subChatQuickSwitchOpenRef.current) {
        e.preventDefault()
        subChatModifierKeysHeldRef.current = false

        if (subChatHoldTimerRef.current) {
          clearTimeout(subChatHoldTimerRef.current)
          subChatHoldTimerRef.current = null
        }

        setSubChatQuickSwitchOpen(false)
        setSubChatQuickSwitchSelectedIndex(0)
        return
      }

      // When modifier key is released
      // For agents mode (Ctrl+Tab): react to Control release
      // For workspaces mode (Opt+Ctrl+Tab): react to Alt or Control release
      const isRelevantKeyRelease =
        ctrlTabTarget === "agents"
          ? e.key === "Control"
          : e.key === "Alt" || e.key === "Control"

      if (isRelevantKeyRelease) {
        subChatModifierKeysHeldRef.current = false

        // If timer is still running (quick press - dialog not shown yet)
        if (subChatHoldTimerRef.current) {
          clearTimeout(subChatHoldTimerRef.current)
          subChatHoldTimerRef.current = null

          // Do quick switch without showing dialog (only between open tabs)
          const store = useAgentSubChatStore.getState()
          const currentOpenIds = store.openSubChatIds
          const currentActiveId = store.activeSubChatId

          if (currentOpenIds && currentOpenIds.length > 1) {
            if (!currentActiveId) {
              store.setActiveSubChat(currentOpenIds[0])
              return
            }

            const currentIndex = currentOpenIds.indexOf(currentActiveId)
            if (currentIndex === -1) {
              store.setActiveSubChat(currentOpenIds[0])
              return
            }

            let nextIndex: number
            if (subChatWasShiftPressedRef.current) {
              nextIndex = currentIndex - 1
              if (nextIndex < 0) nextIndex = currentOpenIds.length - 1
            } else {
              nextIndex = currentIndex + 1
              if (nextIndex >= currentOpenIds.length) nextIndex = 0
            }

            store.setActiveSubChat(currentOpenIds[nextIndex])
          }
          return
        }

        // If dialog is open, navigate to selected sub-chat and close
        if (subChatQuickSwitchOpenRef.current) {
          const selectedSubChat =
            frozenSubChatsRef.current?.[
              subChatQuickSwitchSelectedIndexRef.current
            ]

          if (selectedSubChat) {
            useAgentSubChatStore.getState().setActiveSubChat(selectedSubChat.id)
          }

          setSubChatQuickSwitchOpen(false)
          setSubChatQuickSwitchSelectedIndex(0)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      if (subChatHoldTimerRef.current) {
        clearTimeout(subChatHoldTimerRef.current)
      }
    }
  }, [setSubChatQuickSwitchOpen, setSubChatQuickSwitchSelectedIndex, ctrlTabTarget])

  // Note: Cmd+E archive hotkey is handled in AgentsSidebar to share undo stack

  const handleSignOut = async () => {
    // Check if running in Electron desktop app
    if (typeof window !== "undefined" && window.desktopApi) {
      // Use desktop logout which clears the token and shows login page
      await window.desktopApi.logout()
    } else {
      // Web: use Clerk sign out
      await signOut({ redirectUrl: window.location.pathname })
    }
  }

  // Check if chat has sandbox with port for preview
  const chatMeta = chatData?.meta as
    | {
        sandboxConfig?: { port?: number }
        isQuickSetup?: boolean
        repository?: string
      }
    | undefined
  const isQuickSetup = chatMeta?.isQuickSetup === true
  const canShowPreview = !!(
    chatData?.sandbox_id &&
    !isQuickSetup &&
    chatMeta?.sandboxConfig?.port
  )
  // Check if diff can be shown (sandbox exists)
  const canShowDiff = !!chatData?.sandbox_id

  // Get worktree path and determine default working directory for terminals
  const worktreePath = (chatData as any)?.worktreePath as string | undefined
  const originalProjectPath = (chatData as any)?.project?.path as string | undefined
  const terminalCwd = worktreePath || originalProjectPath || "~"
  const canShowTerminal = true // Terminals are always available with smart default directory

  // Mobile layout - completely different structure
  if (isMobile) {
    return (
      <div
        className="flex h-full bg-background"
        data-agents-page
        data-mobile-view
      >
        {/* Mobile View Modes */}
        {mobileViewMode === "chats" ? (
          // Chats List Mode (default) - uses AgentsSidebar in fullscreen
          <AgentsSidebar
            userId={userId}
            clerkUser={user}
            onSignOut={handleSignOut}
            onToggleSidebar={() => {}}
            isMobileFullscreen={true}
            onChatSelect={() => setMobileViewMode("chat")}
          />
        ) : mobileViewMode === "preview" && selectedChatId && canShowPreview ? (
          // Preview Mode
          <AgentPreview
            chatId={selectedChatId}
            sandboxId={chatData!.sandbox_id!}
            port={chatMeta?.sandboxConfig?.port!}
            isMobile={true}
            onClose={() => setMobileViewMode("chat")}
          />
        ) : mobileViewMode === "diff" && selectedChatId && canShowDiff ? (
          // Diff Mode - fullscreen diff view
          <AgentDiffView
            chatId={selectedChatId}
            sandboxId={chatData!.sandbox_id!}
            worktreePath={worktreePath}
            repository={chatMeta?.repository}
            showFooter={true}
            isMobile={true}
            onClose={() => setMobileViewMode("chat")}
          />
        ) : mobileViewMode === "terminal" && selectedChatId ? (
          // Terminal Mode - fullscreen terminal
          <TerminalSidebar
            chatId={selectedChatId}
            cwd={terminalCwd}
            workspaceId={selectedChatId}
            isMobileFullscreen={true}
            onClose={() => setMobileViewMode("chat")}
            initialCommands={mobileStartCommands.length > 0 ? mobileStartCommands : undefined}
          />
        ) : (
          // Chat Mode - shows either ChatView or NewChatForm
          <div
            className="h-full w-full flex flex-col overflow-hidden select-text"
            data-mobile-chat-mode
          >
            {selectedChatId ? (
              <ChatView
                chatId={selectedChatId}
                isSidebarOpen={false}
                onToggleSidebar={() => {}}
                selectedTeamName={selectedTeam?.name}
                selectedTeamImageUrl={selectedTeam?.image_url}
                isMobileFullscreen={true}
                onBackToChats={() => {
                  setMobileViewMode("chats")
                  setSelectedChatId(null)
                }}
                onOpenPreview={
                  canShowPreview
                    ? () => setMobileViewMode("preview")
                    : undefined
                }
                onOpenDiff={
                  canShowDiff ? () => setMobileViewMode("diff") : undefined
                }
                onOpenTerminal={() => {
                  setTerminalSidebarOpen(true)
                  setMobileViewMode("terminal")
                }}
              />
            ) : (
              // NewChatForm for creating new agent
              <div className="h-full flex flex-col relative overflow-hidden">
                <NewChatForm
                  isMobileFullscreen={true}
                  onBackToChats={() => setMobileViewMode("chats")}
                />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Desktop layout
  // Determine which view should be shown (for keep-alive pattern)
  const showClustersView = selectedClustersCategory === "clusters" || selectedSidebarTab === "clusters"
  const showGsdView = selectedGsdCategory === "gsd" || selectedSidebarTab === "gsd"
  const showMcpView = selectedMcpCategory === "mcp"
  const showWorkflowsView = !!selectedWorkflowCategory
  const showProjectDetail = !!selectedProjectDetailId
  const showGitHubView = selectedSidebarTab === "github"
  const showPromptsView = selectedSidebarTab === "prompts"
  const showErDiagramView = selectedSidebarTab === "er-diagram"
  const showClawsDetailView = selectedSidebarTab === "claws" && !!selectedClaw && !isEditingClaw
  const showClawsEditView = selectedSidebarTab === "claws" && !!selectedClaw && isEditingClaw
  const showClawsListView = selectedSidebarTab === "claws" && !selectedClaw
  const showSettingsView = selectedSidebarTab === "settings" && !!selectedSettingsCategory && !showWorkflowsView

  // Workspace GitHub flex view: 2-pane content+chat when a Source Repo item is selected
  // from the workspace sidebar (chats tab), with no active chat
  const showWorkspaceGitHubView =
    selectedSidebarTab === "chats" &&
    !!workspaceGithubSelection &&
    !selectedChatId &&
    !showProjectDetail

  // Derive the project for the 2-pane view from the selection's repoId
  const workspaceGitHubProject = showWorkspaceGitHubView && workspaceGithubSelection
    ? (projectsMap.get(workspaceGithubSelection.repoId) ??
       (selectedProject ? { id: selectedProject.id, path: selectedProject.path } : null))
    : null

  const showMainContent = !showClustersView && !showGsdView && !showMcpView && !showWorkflowsView && !showProjectDetail && !showGitHubView && !showPromptsView && !showErDiagramView && !showClawsDetailView && !showClawsEditView && !showClawsListView && !showSettingsView && !showWorkspaceGitHubView

  return (
    <>
      {/* ClustersContent - kept mounted to preserve terminal state */}
      <div className={showClustersView ? "h-full w-full" : "hidden"}>
        <ClustersContent />
      </div>

      {/* GSD view */}
      {showGsdView && <GsdContent />}

      {/* MCP servers view */}
      {showMcpView && <McpContent />}

      {/* Workflow browser */}
      {showWorkflowsView && <WorkflowsContent />}

      {/* Project detail page */}
      {showProjectDetail && (
        <div className="flex-1 h-full overflow-hidden">
          <ProjectDetailPage />
        </div>
      )}

      {/* GitHub view - kept mounted to preserve streaming state */}
      <div className={showGitHubView ? "flex-1 h-full overflow-hidden" : "hidden"}>
        <GitHubView
          projects={(projects ?? []).map((p) => ({ id: p.id, path: p.path, name: p.name }))}
        />
      </div>

      {/* Workspace GitHub flex view — 2-pane content+chat when Source Repo item selected */}
      {showWorkspaceGitHubView && workspaceGitHubProject && workspaceGithubSelection && (
        <WorkspaceGitHubView
          projectId={workspaceGitHubProject.id}
          projectPath={workspaceGitHubProject.path}
          selection={workspaceGithubSelection}
        />
      )}

      {/* Prompts view */}
      <div className={showPromptsView ? "flex-1 h-full overflow-hidden" : "hidden"}>
        <PromptsView />
      </div>

      {/* ER Diagram view */}
      <div className={showErDiagramView ? "flex-1 h-full overflow-hidden" : "hidden"}>
        <ErDiagramView />
      </div>

      {/* CC Settings view */}
      <div className={showSettingsView ? "flex-1 h-full overflow-hidden" : "hidden"}>
        <CcSettingsContent />
      </div>

      {/* Claws execution detail view */}
      {showClawsDetailView && selectedClaw && (
        <div className="flex-1 h-full overflow-hidden">
          <ExecutionHistoryViewer
            claw={selectedClaw}
            onBack={() => setSelectedClaw(null)}
            className="h-full"
          />
        </div>
      )}

      {/* Claws edit view */}
      {showClawsEditView && selectedClaw && (
        <div className="flex-1 h-full overflow-hidden">
          <ClawEditView className="h-full" />
        </div>
      )}

      {/* Claws list view - shown when no claw selected */}
      {showClawsListView && (
        <div className="flex-1 h-full overflow-hidden flex flex-col items-center justify-center p-8 text-center">
          <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Claws</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Select a claw from the sidebar to view its execution history, or create a new claw to automate tasks.
          </p>
        </div>
      )}

      {/* Main content - chats/terminal/other */}
      <div className={showMainContent ? "flex h-full" : "hidden"}>
        {/* Main content area */}
        <div
          className="flex-1 min-w-0 overflow-hidden"
          style={{ minWidth: "350px" }}
        >
          {/* Show appropriate content based on selected sidebar tab */}
          {selectedSidebarTab === "chats" ? (
            // Workspaces tab - show chat view with pinned tabs bar
            <div className="h-full flex flex-col relative overflow-hidden">
              {/* Pinned tabs bar */}
              <PinnedTabsBar />

              {/* Chat content */}
              {selectedChatId ? (
                <div className="flex-1 flex flex-col relative overflow-hidden">
                  <ChatView
                    chatId={selectedChatId}
                    isSidebarOpen={sidebarOpen}
                    onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
                    selectedTeamName={selectedTeam?.name}
                    selectedTeamImageUrl={selectedTeam?.image_url}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col relative overflow-hidden">
                  <NewChatForm key={`new-chat-${newChatFormKeyRef.current}`} />
                </div>
              )}
            </div>
          ) : selectedSidebarTab === "terminal" ? (
            // Terminal tab - show terminal main view
            <div className="h-full flex flex-col relative overflow-hidden">
              <TerminalMainView />
            </div>
          ) : selectedSidebarTab === "history" ? (
            // History tab - show read-only session flow view
            <div className="h-full flex flex-col relative overflow-hidden">
              <HistoryChatView />
            </div>
          ) : (
            // For other tabs, show a placeholder detail view
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">
                  Select an item from the {selectedSidebarTab} list to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick-switch dialog - Agents (Opt+Ctrl+Tab) */}
      <AgentsQuickSwitchDialog
        isOpen={quickSwitchOpen}
        chats={
          quickSwitchOpen ? (frozenRecentChatsRef.current ?? []) : recentChats
        }
        selectedIndex={quickSwitchSelectedIndex}
        projectsMap={projectsMap}
        onHover={setQuickSwitchSelectedIndex}
      />

      {/* Quick-switch dialog - Sub-chats (Ctrl+Tab) */}
      <SubChatsQuickSwitchDialog
        isOpen={subChatQuickSwitchOpen}
        subChats={
          subChatQuickSwitchOpen
            ? (frozenSubChatsRef.current ?? [])
            : recentSubChats
        }
        selectedIndex={subChatQuickSwitchSelectedIndex}
        onHover={setSubChatQuickSwitchSelectedIndex}
      />

      {/* Dev mode / Admin sandbox debugger */}
      {(process.env.NODE_ENV === "development" || isAdmin) &&
        chatData?.sandbox_id && (
          <a
            href={`https://codesandbox.io/p/devbox/${chatData.sandbox_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-4 right-4 z-50 bg-zinc-900 text-zinc-300 px-3 py-1.5 rounded-md text-xs font-mono opacity-70 hover:opacity-100 hover:bg-zinc-800 transition-all cursor-pointer"
          >
            sandbox: {chatData.sandbox_id}
          </a>
        )}
    </>
  )
}
