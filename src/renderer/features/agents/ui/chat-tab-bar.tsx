"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  selectedAgentChatIdAtom,
  previousAgentChatIdAtom,
  loadingSubChatsAtom,
  agentsUnseenChangesAtom,
  pendingUserQuestionsAtom,
  undoStackAtom,
} from "../atoms"
import {
  agentsSettingsDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
} from "../../../lib/atoms"
import { useAgentSubChatStore, OPEN_SUB_CHATS_CHANGE_EVENT } from "../stores/sub-chat-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { Button } from "../../../components/ui/button"
import {
  ArchiveIcon,
  LoadingDot,
  PlusIcon,
  QuestionIcon,
  SettingsIcon,
} from "../../../components/ui/icons"
import { ChevronDown, MoreHorizontal, X } from "lucide-react"

// Tab item component
interface TabItemProps {
  chatId: string
  chatName: string | null
  isSelected: boolean
  isLoading: boolean
  hasUnseenChanges: boolean
  hasPendingQuestion: boolean
  onSelect: (chatId: string) => void
  onClose: (chatId: string) => void
}

const TabItem = memo(function TabItem({
  chatId,
  chatName,
  isSelected,
  isLoading,
  hasUnseenChanges,
  hasPendingQuestion,
  onSelect,
  onClose,
}: TabItemProps) {
  return (
    <div
      role="tab"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={() => onSelect(chatId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(chatId)
        }
      }}
      className={cn(
        "group relative flex items-center gap-1.5 px-3 h-8 min-w-[100px] max-w-[180px] rounded-md cursor-pointer",
        "transition-colors duration-75",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isSelected
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      {/* Status indicator */}
      {(hasPendingQuestion || isLoading || hasUnseenChanges) && (
        <div className="flex-shrink-0 w-2 h-2 flex items-center justify-center">
          {hasPendingQuestion ? (
            <QuestionIcon className="w-2 h-2 text-blue-500" />
          ) : isLoading ? (
            <LoadingDot isLoading={true} className="w-2 h-2 text-muted-foreground" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          )}
        </div>
      )}

      {/* Tab name */}
      <span className="truncate text-sm flex-1">
        {chatName || "New workspace"}
      </span>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose(chatId)
        }}
        tabIndex={-1}
        className={cn(
          "flex-shrink-0 p-0.5 rounded-sm",
          "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
          "transition-[opacity,color] duration-100",
          "opacity-0 group-hover:opacity-100",
          isSelected && "opacity-60 group-hover:opacity-100"
        )}
        aria-label="Close tab"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
})

export interface ChatTabBarProps {
  onNewChat: () => void
  onOpenSettings?: () => void
}

export function ChatTabBar({ onNewChat, onOpenSettings }: ChatTabBarProps) {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const previousChatId = useAtomValue(previousAgentChatIdAtom)
  const [loadingSubChats] = useAtom(loadingSubChatsAtom)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  const [, setUndoStack] = useAtom(undoStackAtom)
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showLeftScroll, setShowLeftScroll] = useState(false)
  const [showRightScroll, setShowRightScroll] = useState(false)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)

  // Fetch all chats
  const { data: agentChats } = trpc.chats.list.useQuery({})
  const utils = trpc.useUtils()

  // Fetch archived count for dropdown menu
  const { data: archivedChats } = trpc.chats.listArchived.useQuery({})

  // Archive mutation
  const archiveChatMutation = trpc.chats.archive.useMutation({
    onSuccess: (_, variables) => {
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()

      // If archiving the currently selected chat, navigate to previous or new workspace
      if (selectedChatId === variables.id) {
        const isPreviousAvailable = previousChatId &&
          agentChats?.some((c) => c.id === previousChatId && c.id !== variables.id)

        if (isPreviousAvailable) {
          setSelectedChatId(previousChatId)
        } else {
          setSelectedChatId(null)
        }
      }

      // Add to undo stack
      const timeoutId = setTimeout(() => {
        setUndoStack((prev) => {
          const index = prev.findIndex((item) => item.type === "workspace" && item.chatId === variables.id)
          if (index !== -1) {
            return [...prev.slice(0, index), ...prev.slice(index + 1)]
          }
          return prev
        })
      }, 10000)

      setUndoStack((prev) => [...prev, {
        type: "workspace",
        chatId: variables.id,
        timeoutId,
      }])
    },
  })

  // Track open sub-chat changes for loading state
  const [openSubChatsVersion, setOpenSubChatsVersion] = useState(0)
  useEffect(() => {
    const handleChange = () => setOpenSubChatsVersion((v) => v + 1)
    window.addEventListener(OPEN_SUB_CHATS_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(OPEN_SUB_CHATS_CHANGE_EVENT, handleChange)
  }, [])

  // Compute which chats have loading sub-chats
  const loadingChatIds = useMemo(() => {
    void openSubChatsVersion
    const ids = new Set<string>()
    loadingSubChats.forEach((parentChatId) => {
      ids.add(parentChatId)
    })
    return ids
  }, [loadingSubChats, openSubChatsVersion])

  // Compute which workspaces have pending questions
  const workspacePendingQuestions = useMemo(() => {
    const workspaceIds = new Set<string>()
    pendingQuestions.forEach((question) => {
      workspaceIds.add(question.parentChatId)
    })
    return workspaceIds
  }, [pendingQuestions])

  // Sort chats by updated_at descending
  const sortedChats = useMemo(() => {
    if (!agentChats) return []
    return [...agentChats].sort(
      (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    )
  }, [agentChats])

  // Check scroll overflow
  const checkScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    setShowLeftScroll(container.scrollLeft > 0)
    setShowRightScroll(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    )
    setShowOverflowMenu(container.scrollWidth > container.clientWidth)
  }, [])

  useEffect(() => {
    checkScroll()
    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("scroll", checkScroll)
      const resizeObserver = new ResizeObserver(checkScroll)
      resizeObserver.observe(container)
      return () => {
        container.removeEventListener("scroll", checkScroll)
        resizeObserver.disconnect()
      }
    }
  }, [checkScroll, sortedChats])

  // Scroll to selected tab
  useEffect(() => {
    if (!selectedChatId || !scrollContainerRef.current) return
    const selectedTab = scrollContainerRef.current.querySelector(
      `[data-chat-id="${selectedChatId}"]`
    )
    if (selectedTab) {
      selectedTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
    }
  }, [selectedChatId])

  const handleSelectChat = useCallback((chatId: string) => {
    setSelectedChatId(chatId)
  }, [setSelectedChatId])

  const handleCloseChat = useCallback((chatId: string) => {
    archiveChatMutation.mutate({ id: chatId })
  }, [archiveChatMutation])

  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" })
  }

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" })
  }

  const handleOpenSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      setSettingsActiveTab("profile")
      setSettingsDialogOpen(true)
    }
  }, [onOpenSettings, setSettingsActiveTab, setSettingsDialogOpen])

  return (
    <div className="flex items-center gap-1 px-2 h-10 bg-background flex-shrink-0">
      {/* Scroll left button */}
      <AnimatePresence>
        {showLeftScroll && (
          <motion.button
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 24 }}
            exit={{ opacity: 0, width: 0 }}
            onClick={scrollLeft}
            className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Tabs container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none"
        role="tablist"
      >
        {sortedChats.map((chat) => (
          <div key={chat.id} data-chat-id={chat.id}>
            <TabItem
              chatId={chat.id}
              chatName={chat.name}
              isSelected={selectedChatId === chat.id}
              isLoading={loadingChatIds.has(chat.id)}
              hasUnseenChanges={unseenChanges.has(chat.id)}
              hasPendingQuestion={workspacePendingQuestions.has(chat.id)}
              onSelect={handleSelectChat}
              onClose={handleCloseChat}
            />
          </div>
        ))}

        {/* New workspace "tab" - always visible at the end */}
        <div
          role="tab"
          aria-selected={selectedChatId === null}
          tabIndex={0}
          onClick={onNewChat}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onNewChat()
            }
          }}
          className={cn(
            "flex items-center gap-1.5 px-2 h-8 rounded-md cursor-pointer flex-shrink-0",
            "transition-colors duration-75",
            "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            selectedChatId === null
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          )}
        >
          <PlusIcon className="h-4 w-4" />
          <span className="text-sm">New</span>
        </div>
      </div>

      {/* Scroll right button */}
      <AnimatePresence>
        {showRightScroll && (
          <motion.button
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 24 }}
            exit={{ opacity: 0, width: 0 }}
            onClick={scrollRight}
            className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Overflow menu for additional chats */}
      {showOverflowMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-[300px] overflow-y-auto">
            {sortedChats.map((chat) => (
              <DropdownMenuItem
                key={chat.id}
                onClick={() => handleSelectChat(chat.id)}
                className={cn(
                  "flex items-center justify-between gap-2",
                  selectedChatId === chat.id && "bg-accent"
                )}
              >
                <span className="truncate">{chat.name || "New workspace"}</span>
                {loadingChatIds.has(chat.id) && (
                  <LoadingDot isLoading={true} className="w-2.5 h-2.5 flex-shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            {archivedChats && archivedChats.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    // Could open archive view - for now just a placeholder
                    console.log("Open archive")
                  }}
                  className="text-muted-foreground"
                >
                  <ArchiveIcon className="h-4 w-4 mr-2" />
                  Archived ({archivedChats.length})
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Settings button */}
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenSettings}
            className="h-7 w-7 flex-shrink-0"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
    </div>
  )
}
