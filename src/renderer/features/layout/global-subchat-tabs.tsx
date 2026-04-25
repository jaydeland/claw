"use client"

import { useMemo, useCallback, useRef, useState, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useShallow } from "zustand/react/shallow"
import { keepPreviousData } from "@tanstack/react-query"
import { cn } from "../../lib/utils"
import { trpc } from "../../lib/trpc"
import { selectedAgentChatIdAtom, agentsSubChatUnseenChangesAtom } from "../agents/atoms"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../agents/stores/sub-chat-store"
import { PlanIcon, AgentIcon } from "../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { ChevronLeft, ChevronRight, PinIcon } from "lucide-react"
import { Button } from "../../components/ui/button"

interface PinnedSubChat {
  id: string
  name: string
  parentChatId: string
  parentChatName?: string
  mode?: "plan" | "agent" | "swarm"
  updated_at?: string
}

export function GlobalSubChatTabs() {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const setSubChatUnseenChanges = useSetAtom(agentsSubChatUnseenChangesAtom)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showLeftScroll, setShowLeftScroll] = useState(false)
  const [showRightScroll, setShowRightScroll] = useState(false)

  // Get global pins from store
  const { pinnedSubChatIds, activeSubChatId, setActiveSubChat } =
    useAgentSubChatStore(
      useShallow((state) => ({
        pinnedSubChatIds: state.pinnedSubChatIds,
        activeSubChatId: state.activeSubChatId,
        setActiveSubChat: state.setActiveSubChat,
      })),
    )

  // Fetch metadata for all pinned sub-chats
  const { data: pinnedSubChatsData } = trpc.chats.getSubChatsByIds.useQuery(
    { ids: pinnedSubChatIds },
    { enabled: pinnedSubChatIds.length > 0, placeholderData: keepPreviousData },
  )

  // Fetch parent chat info for cross-workspace pins
  const parentChatIds = useMemo(() => {
    if (!pinnedSubChatsData) return []
    return [...new Set(pinnedSubChatsData.map((sc) => sc.chatId))]
  }, [pinnedSubChatsData])

  const { data: parentChatsData } = trpc.chats.list.useQuery(
    {},
    { enabled: parentChatIds.length > 0 },
  )

  // Build parent chat name map
  const parentChatNames = useMemo(() => {
    const map = new Map<string, string>()
    if (parentChatsData) {
      for (const chat of parentChatsData) {
        map.set(chat.id, chat.name)
      }
    }
    return map
  }, [parentChatsData])

  // Build pinned sub-chats list with parent info
  const pinnedSubChats: PinnedSubChat[] = useMemo(() => {
    if (!pinnedSubChatsData) return []
    return pinnedSubChatsData.map((sc) => ({
      id: sc.id,
      name: sc.name || "New Chat",
      parentChatId: sc.chatId,
      parentChatName: parentChatNames.get(sc.chatId),
      mode: sc.mode as "plan" | "agent" | "swarm" | undefined,
      updated_at: sc.updatedAt?.toISOString(),
    }))
  }, [pinnedSubChatsData, parentChatNames])

  // Check scroll overflow
  const checkScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    setShowLeftScroll(container.scrollLeft > 0)
    setShowRightScroll(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1,
    )
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
  }, [checkScroll, pinnedSubChats])

  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" })
  }

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" })
  }

  const handleSubChatClick = (subChat: PinnedSubChat) => {
    // Check if this is the current workspace
    if (subChat.parentChatId !== selectedChatId) {
      // Switch to the parent workspace first
      setSelectedChatId(subChat.parentChatId)
      // Store pending sub-chat to activate after workspace switch
      localStorage.setItem("pendingActiveSubChatId", subChat.id)
    } else {
      // Same workspace - just activate the sub-chat
      setActiveSubChat(subChat.id)
      // Clear unseen indicator
      setSubChatUnseenChanges((prev: Set<string>) => {
        if (prev.has(subChat.id)) {
          const next = new Set(prev)
          next.delete(subChat.id)
          return next
        }
        return prev
      })
    }
  }

  if (pinnedSubChats.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0 mx-2">
      {/* Scroll left button */}
      {showLeftScroll && (
        <Button
          variant="ghost"
          size="icon"
          onClick={scrollLeft}
          className="h-6 w-6 flex-shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Pinned tabs container */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0"
      >
        {pinnedSubChats.map((subChat) => {
          const isActive =
            subChat.parentChatId === selectedChatId &&
            subChat.id === activeSubChatId
          const isDifferentWorkspace = subChat.parentChatId !== selectedChatId
          const mode = subChat.mode || "agent"

          return (
            <Tooltip key={subChat.id} delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleSubChatClick(subChat)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 h-7 rounded-md text-sm whitespace-nowrap",
                    "transition-colors duration-75 hover:bg-foreground/10",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                    isActive
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground",
                    isDifferentWorkspace && "opacity-70",
                  )}
                >
                  {/* Mode icon */}
                  {mode === "plan" ? (
                    <PlanIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <AgentIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  )}

                  {/* Sub-chat name */}
                  <span className="truncate max-w-[120px]">
                    {subChat.name}
                  </span>

                  {/* Different workspace indicator */}
                  {isDifferentWorkspace && subChat.parentChatName && (
                    <span className="text-xs opacity-60 truncate max-w-[80px]">
                      · {subChat.parentChatName}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{subChat.name}</span>
                  {isDifferentWorkspace && subChat.parentChatName && (
                    <span className="text-xs text-muted-foreground">
                      {subChat.parentChatName}
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Scroll right button */}
      {showRightScroll && (
        <Button
          variant="ghost"
          size="icon"
          onClick={scrollRight}
          className="h-6 w-6 flex-shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
