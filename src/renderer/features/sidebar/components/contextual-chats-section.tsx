"use client"

import React, { useState } from "react"
import { useAtom } from "jotai"
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  MoreHorizontal,
  Archive,
  Trash2,
  GitBranch,
  ScrollText,
  Sparkles,
  Terminal,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedAgentChatIdAtom, cleanupChatLocalStorage } from "../../agents/atoms"
import type { SourceView } from "../../shared/hooks/use-contextual-chat"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"

const SOURCE_VIEW_LABELS: Record<SourceView, string> = {
  github: "GitHub Chats",
  prompts: "Prompts Chats",
  skills: "Skills Chats",
  commands: "Commands Chats",
}

const SOURCE_VIEW_ICONS: Record<SourceView, React.ComponentType<{ className?: string }>> = {
  github: GitBranch,
  prompts: ScrollText,
  skills: Sparkles,
  commands: Terminal,
}

const SOURCE_VIEW_COLORS: Record<
  SourceView,
  { icon: string; text: string; border: string; bg: string }
> = {
  github: {
    icon: "text-green-600 dark:text-green-400",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-500/30",
    bg: "bg-green-500/5",
  },
  prompts: {
    icon: "text-blue-600 dark:text-blue-400",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
  },
  skills: {
    icon: "text-purple-600 dark:text-purple-400",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-500/30",
    bg: "bg-purple-500/5",
  },
  commands: {
    icon: "text-orange-600 dark:text-orange-400",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-500/30",
    bg: "bg-orange-500/5",
  },
}

interface ContextualChatsSectionProps {
  sourceView: SourceView
  projectId: string
  onChatClick?: (chatId: string) => void
}

export function ContextualChatsSection({ sourceView, projectId, onChatClick }: ContextualChatsSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)

  const utils = trpc.useUtils()

  const { data: chats } = trpc.chats.list.useQuery(
    { projectId, sourceView },
    { enabled: !!projectId },
  )

  const archiveMutation = trpc.chats.archive.useMutation({
    onSuccess: (_data, variables) => {
      utils.chats.list.invalidate()
      if (selectedChatId === variables.id) setSelectedChatId(null)
      cleanupChatLocalStorage(variables.id)
    },
  })

  const deleteMutation = trpc.chats.delete.useMutation({
    onSuccess: (_data, variables) => {
      utils.chats.list.invalidate()
      if (selectedChatId === variables.id) setSelectedChatId(null)
      cleanupChatLocalStorage(variables.id)
    },
  })

  if (!chats || chats.length === 0) return null

  const label = SOURCE_VIEW_LABELS[sourceView]
  const colors = SOURCE_VIEW_COLORS[sourceView]
  const Icon = SOURCE_VIEW_ICONS[sourceView]

  const handleChatClick = (chatId: string) => {
    if (onChatClick) {
      onChatClick(chatId)
    }
  }

  return (
    <div className={cn("rounded-md border", colors.border, isOpen && colors.bg)}>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left hover:bg-foreground/5 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className={cn("h-4 w-4", colors.icon)} />
        ) : (
          <ChevronRight className={cn("h-4 w-4", colors.icon)} />
        )}
        <Icon className={cn("h-4 w-4", colors.icon)} />
        <span className={cn("text-xs font-medium flex-1 truncate", colors.text)}>{label}</span>
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {chats.length}
        </span>
      </button>

      {/* Chat items */}
      {isOpen && (
        <div className="px-2 pb-1 space-y-0.5">
          {chats.map((chat) => {
            const isActive = selectedChatId === chat.id
            return (
              <div key={chat.id} className="group relative">
                <button
                  type="button"
                  onClick={() => handleChatClick(chat.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors pr-8",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-foreground/10 text-foreground",
                  )}
                >
                  <MessageSquare className={cn("h-3.5 w-3.5 flex-shrink-0", colors.icon)} />
                  <span className="text-sm truncate flex-1">{chat.name || "Untitled"}</span>
                </button>

                {/* Context menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-foreground/10 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className="text-xs"
                      onClick={() => archiveMutation.mutate({ id: chat.id })}
                    >
                      <Archive className="h-3.5 w-3.5 mr-2" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${chat.name}"? This cannot be undone.`)) {
                          deleteMutation.mutate({ id: chat.id })
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
