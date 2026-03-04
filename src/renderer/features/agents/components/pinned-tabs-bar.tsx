"use client"

import { useAtom, useAtomValue } from "jotai"
import { X, MessageSquare, House } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { useMemo, useState, useEffect } from "react"
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

  // Local state to track pinned IDs and trigger re-renders
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(new Set())

  // Load pinned IDs from localStorage when project changes
  useEffect(() => {
    if (!selectedProject?.id) {
      setPinnedChatIds(new Set())
      return
    }

    const loadPinnedIds = () => {
      try {
        const stored = localStorage.getItem(`agent-pinned-chats-${selectedProject.id}`)
        setPinnedChatIds(new Set(stored ? JSON.parse(stored) : []))
      } catch {
        setPinnedChatIds(new Set())
      }
    }

    // Initial load
    loadPinnedIds()

    // Listen for pin changes from sidebar
    const handlePinChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ projectId: string }>
      if (customEvent.detail?.projectId === selectedProject.id) {
        loadPinnedIds()
      }
    }

    window.addEventListener('pinned-chats-changed', handlePinChange)
    return () => window.removeEventListener('pinned-chats-changed', handlePinChange)
  }, [selectedProject?.id])

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

    const newPinnedIds = new Set(pinnedChatIds)
    newPinnedIds.delete(chatId)

    // Update localStorage
    localStorage.setItem(
      `agent-pinned-chats-${selectedProject.id}`,
      JSON.stringify(Array.from(newPinnedIds))
    )

    // Update local state to trigger re-render
    setPinnedChatIds(newPinnedIds)
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
