"use client"

import { useAtom, useAtomValue } from "jotai"
import { X, MessageSquare, House } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { useMemo } from "react"
import {
  selectedAgentChatIdAtom,
  selectedProjectAtom,
} from "../atoms"

interface PinnedTabsBarProps {
  className?: string
}

export function PinnedTabsBar({ className }: PinnedTabsBarProps) {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  const { data: allChats } = trpc.chats.list.useQuery({})
  const utils = trpc.useUtils()

  // Get pinned chat IDs for current project
  const pinnedChatIds = useMemo(() => {
    if (!selectedProject?.id) return new Set<string>()
    try {
      const stored = localStorage.getItem(`agent-pinned-chats-${selectedProject.id}`)
      return new Set(stored ? JSON.parse(stored) : [])
    } catch {
      return new Set<string>()
    }
  }, [selectedProject?.id, allChats]) // Re-compute when chats change (for invalidation)

  // Filter to get pinned chats for current project
  const pinnedChats = useMemo(() => {
    if (!selectedProject?.id || !allChats) return []
    return allChats
      .filter(chat =>
        chat.projectId === selectedProject.id &&
        pinnedChatIds.has(chat.id)
      )
      .sort((a, b) => {
        // Sort by creation date, newest first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [allChats, selectedProject?.id, pinnedChatIds])

  // Handle tab click
  const handleTabClick = (chatId: string) => {
    setSelectedChatId(chatId)
  }

  // Handle unpin
  const handleUnpin = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedProject?.id) return

    const pinnedIds = new Set(pinnedChatIds)
    pinnedIds.delete(chatId)
    localStorage.setItem(
      `agent-pinned-chats-${selectedProject.id}`,
      JSON.stringify(Array.from(pinnedIds))
    )

    // Invalidate to trigger re-render
    utils.chats.list.invalidate()
  }

  // Don't show bar if no pinned chats
  if (pinnedChats.length === 0) return null

  return (
    <div className={cn(
      "flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30 overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent",
      className
    )}>
      {pinnedChats.map((chat) => {
        const isActive = selectedChatId === chat.id

        return (
          <button
            key={chat.id}
            type="button"
            onClick={() => handleTabClick(chat.id)}
            className={cn(
              "group flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors flex-shrink-0 max-w-[200px]",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "bg-transparent text-muted-foreground hover:bg-background/50 hover:text-foreground"
            )}
          >
            {chat.branch ? (
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <House className="h-3.5 w-3.5 flex-shrink-0" />
            )}
            <span className="truncate text-xs font-medium">
              {chat.name || "Untitled"}
            </span>
            <button
              type="button"
              onClick={(e) => handleUnpin(chat.id, e)}
              className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded hover:bg-muted-foreground/20 transition-opacity"
              title="Unpin"
            >
              <X className="h-3 w-3" />
            </button>
          </button>
        )
      })}
    </div>
  )
}
