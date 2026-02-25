"use client"

import { useState } from "react"
import { useSetAtom } from "jotai"
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedSidebarTabAtom, pendingPromptNavigationAtom } from "../../agents/atoms"
import type { SourceView } from "../../shared/hooks/use-contextual-chat"

const SOURCE_VIEW_LABELS: Record<SourceView, string> = {
  github: "GitHub Chats",
  prompts: "Prompts Chats",
  skills: "Skills Chats",
  commands: "Commands Chats",
}

const SOURCE_VIEW_TABS: Record<SourceView, string> = {
  github: "github",
  prompts: "prompts",
  skills: "skills",
  commands: "skills", // commands are in the skills/workflows tab
}

interface ContextualChatsSectionProps {
  sourceView: SourceView
  projectId: string
}

export function ContextualChatsSection({ sourceView, projectId }: ContextualChatsSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const setSelectedTab = useSetAtom(selectedSidebarTabAtom)
  const setPendingPromptNavigation = useSetAtom(pendingPromptNavigationAtom)

  const { data: chats } = trpc.chats.list.useQuery(
    { projectId, sourceView },
    { enabled: !!projectId },
  )

  if (!chats || chats.length === 0) return null

  const label = SOURCE_VIEW_LABELS[sourceView]
  const targetTab = SOURCE_VIEW_TABS[sourceView]

  const handleChatClick = (chat: (typeof chats)[0]) => {
    setSelectedTab(targetTab as any)
    if (sourceView === "prompts" && chat.sourceContext) {
      try {
        const ctx = JSON.parse(chat.sourceContext)
        if (ctx.promptId) setPendingPromptNavigation(ctx.promptId)
      } catch {}
    }
  }

  return (
    <div className="space-y-0.5">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-md text-left hover:bg-foreground/5 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-medium text-muted-foreground flex-1 truncate">{label}</span>
        <span className="text-[10px] text-muted-foreground">{chats.length}</span>
      </button>

      {/* Chat items */}
      {isOpen && (
        <div className="ml-[18px] pl-3 space-y-0.5 relative">
          {chats.map((chat, idx) => {
            const isLast = idx === chats.length - 1
            return (
              <div key={chat.id} className="relative">
                {/* Tree lines */}
                <div
                  className={cn(
                    "absolute -left-3 w-px bg-muted-foreground/20",
                    isLast ? "top-0 h-1/2" : "top-0 bottom-0"
                  )}
                />
                <div className="absolute -left-3 top-1/2 w-2.5 h-px bg-muted-foreground/20" />

                <button
                  type="button"
                  onClick={() => handleChatClick(chat)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-foreground/10 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{chat.name || "Untitled"}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
