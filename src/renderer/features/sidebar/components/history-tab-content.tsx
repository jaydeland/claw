"use client"

import React, { useMemo, useRef, useEffect, useState, useCallback, memo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import {
  selectedAgentChatIdAtom,
  selectedProjectAtom,
  selectedDraftIdAtom,
  viewingHistoryChatIdAtom,
} from "../../agents/atoms"
import { selectedWorkflowCategoryAtom } from "../../workflows/atoms"
import { selectedMcpCategoryAtom } from "../../mcp/atoms"
import { selectedClustersCategoryAtom } from "../../clusters/atoms"
import { showWorkspaceIconAtom } from "../../../lib/atoms"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import {
  SearchIcon,
  ArchiveIcon,
  IconTextUndo,
  GitHubLogo,
} from "../../../components/ui/icons"
import { cn } from "../../../lib/utils"
import { AssistantMessageItem } from "../../agents/main/assistant-message-item"
import { AgentUserMessageBubble } from "../../agents/ui/agent-user-message-bubble"

// Format relative time - moved outside component to avoid recreation
const formatTime = (dateInput: Date | string) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
  return `${Math.floor(diffDays / 365)}y`
}

// Memoized chat item component to prevent unnecessary re-renders
interface ArchiveChatItemProps {
  chat: {
    id: string
    name: string | null
    branch: string | null
    projectId: string
    updatedAt: Date | null
    archivedAt: Date | null
  }
  index: number
  isSelected: boolean
  isCurrentChat: boolean
  showIcon: boolean
  projectsMap: Map<string, { gitOwner: string | null; gitRepo: string | null; gitProvider: string | null; name: string }>
  stats?: { additions: number; deletions: number }
  onSelect: (id: string) => void
  onRestore: (id: string) => void
  setRef: (index: number, el: HTMLDivElement | null) => void
}

const ArchiveChatItem = memo(function ArchiveChatItem({
  chat,
  index,
  isSelected,
  isCurrentChat,
  showIcon,
  projectsMap,
  stats,
  onSelect,
  onRestore,
  setRef,
}: ArchiveChatItemProps) {
  const branch = chat.branch
  const project = projectsMap.get(chat.projectId)
  const gitOwner = project?.gitOwner
  const gitRepo = project?.gitRepo
  const gitProvider = project?.gitProvider
  const isGitHubRepo = gitProvider === "github" && !!gitOwner
  const avatarUrl = isGitHubRepo
    ? `https://github.com/${gitOwner}.png?size=64`
    : null

  const repoName = gitRepo || project?.name
  const displayText = branch
    ? repoName
      ? `${repoName} • ${branch}`
      : branch
    : repoName || "Local project"

  const handleClick = useCallback(() => {
    onSelect(chat.id)
  }, [onSelect, chat.id])

  const handleRestore = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRestore(chat.id)
  }, [onRestore, chat.id])

  const handleRef = useCallback((el: HTMLDivElement | null) => {
    setRef(index, el)
  }, [setRef, index])

  return (
    <div
      ref={handleRef}
      onClick={handleClick}
      className={cn(
        "w-[calc(100%-8px)] mx-1 text-left min-h-[32px] py-[5px] px-1.5 rounded-md transition-colors duration-75 cursor-pointer group relative",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isSelected || isCurrentChat
          ? "dark:bg-neutral-800 bg-accent text-foreground"
          : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
      )}
    >
      <div className="flex items-start gap-2.5">
        {showIcon && (
          <div className="pt-0.5">
            {isGitHubRepo ? (
              avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={gitOwner || "GitHub"}
                  className="h-4 w-4 rounded-sm flex-shrink-0"
                />
              ) : (
                <GitHubLogo
                  className={cn(
                    "h-4 w-4 flex-shrink-0 transition-colors duration-75",
                    isSelected
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                />
              )
            ) : (
              <GitHubLogo
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-colors duration-75",
                  isSelected
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="truncate block text-sm leading-tight flex-1">
              {chat.name || (
                <span className="text-muted-foreground/50">
                  New workspace
                </span>
              )}
            </span>
            <button
              onClick={handleRestore}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
              aria-label="Restore chat"
            >
              <IconTextUndo className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground/60 truncate">
              {displayText}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0 text-[11px]">
              {stats && (stats.additions > 0 || stats.deletions > 0) && (
                <>
                  <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
                  <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
                </>
              )}
              <span className="text-muted-foreground/60">
                {formatTime(
                  chat.archivedAt?.toISOString() ??
                    chat.updatedAt?.toISOString() ??
                    new Date().toISOString(),
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

interface HistoryTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

export function HistoryTabContent({ className }: HistoryTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [viewingChatId, setViewingChatId] = useAtom(viewingHistoryChatIdAtom)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const chatItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setSelectedWorkflowCategory = useSetAtom(selectedWorkflowCategoryAtom)
  const setSelectedMcpCategory = useSetAtom(selectedMcpCategoryAtom)
  const setSelectedClustersCategory = useSetAtom(selectedClustersCategoryAtom)
  const showWorkspaceIcon = useAtomValue(showWorkspaceIconAtom)

  // Get utils outside of callbacks - hooks must be called at top level
  const utils = trpc.useUtils()

  const { data: archivedChats, isLoading } = trpc.chats.listArchived.useQuery({})

  // Fetch all projects for git info
  const { data: projects } = trpc.projects.list.useQuery()

  // Fetch the viewing chat data (with sub-chats)
  const { data: viewingChatData } = trpc.chats.get.useQuery(
    { id: viewingChatId! },
    { enabled: !!viewingChatId }
  )

  // Collect chat IDs for file stats query
  const archivedChatIds = useMemo(() => {
    if (!archivedChats) return []
    return archivedChats.map((chat) => chat.id)
  }, [archivedChats])

  // Fetch file stats for archived chats
  const { data: fileStatsData } = trpc.chats.getFileStats.useQuery(
    { chatIds: archivedChatIds },
    { enabled: archivedChatIds.length > 0 },
  )

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  // Create map for quick file stats lookup by chat id
  const fileStatsMap = useMemo(() => {
    if (!fileStatsData) return new Map<string, { additions: number; deletions: number }>()
    return new Map(fileStatsData.map((s) => [s.chatId, { additions: s.additions, deletions: s.deletions }]))
  }, [fileStatsData])

  const restoreMutation = trpc.chats.restore.useMutation({
    onSuccess: (restoredChat) => {
      // Optimistically add restored chat to the main list cache
      if (restoredChat) {
        utils.chats.list.setData({}, (oldData) => {
          if (!oldData) return [restoredChat]
          // Add to beginning if not already present
          if (oldData.some((c) => c.id === restoredChat.id)) return oldData
          return [restoredChat, ...oldData]
        })
      }
      // Invalidate both lists to refresh
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
    },
  })

  // Filter and sort archived chats (always newest first)
  const filteredChats = useMemo(() => {
    if (!archivedChats) return []

    return archivedChats
      .filter((chat) => {
        // Search filter by name only
        if (
          searchQuery.trim() &&
          !(chat.name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false
        }
        return true
      })
      .sort(
        (a, b) =>
          new Date(b.archivedAt!).getTime() - new Date(a.archivedAt!).getTime(),
      )
  }, [archivedChats, searchQuery])

  // Sync selected index with filtered chats
  useEffect(() => {
    if (filteredChats.length > 0) {
      // Find index of currently selected chat, default to 0 if not found
      const currentIndex = filteredChats.findIndex(
        (chat) => chat.id === selectedChatId,
      )
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
    }
  }, [filteredChats, selectedChatId])

  // Memoized callbacks for chat items - MUST be defined before handleKeyDown
  const handleSelectChat = useCallback((id: string) => {
    // Set the viewing chat ID to display it in the right panel
    setViewingChatId(id)
  }, [])

  // Keyboard navigation - memoized to prevent recreation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (filteredChats.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filteredChats.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(
        (prev) => (prev - 1 + filteredChats.length) % filteredChats.length,
      )
    } else if (e.key === "Enter") {
      e.preventDefault()
      const chat = filteredChats[selectedIndex]
      if (chat) {
        // Restore the chat first, then load it into view
        restoreMutation.mutate({ id: chat.id })
        handleSelectChat(chat.id)
      }
    }
  }, [filteredChats, selectedIndex, restoreMutation, handleSelectChat])

  // Reset selected index and clear refs when search changes
  useEffect(() => {
    setSelectedIndex(0)
    chatItemRefs.current = []
  }, [searchQuery])

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = chatItemRefs.current[selectedIndex]
    if (selectedElement) {
      selectedElement.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      })
    }
  }, [selectedIndex])

  const handleRestoreChat = useCallback((id: string) => {
    restoreMutation.mutate({ id })
    // Clear viewing state since chat is being restored
    setViewingChatId(null)
  }, [restoreMutation])

  const handleSetRef = useCallback((index: number, el: HTMLDivElement | null) => {
    chatItemRefs.current[index] = el
  }, [])

  // Memoized search input handler
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  return (
    <div className={cn("flex h-full", className)} onKeyDown={handleKeyDown}>
      {/* Left Panel: Archived Chats List */}
      <div className={cn(
        "flex flex-col border-r border-border/50 bg-background flex-shrink-0",
        viewingChatId ? "w-64" : "flex-1"
      )}>
        {/* Search */}
        <div className="p-2 border-b flex-shrink-0">
          <div className="relative flex items-center gap-1.5 h-8 px-2 rounded-md bg-muted/50">
            <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              ref={searchInputRef}
              placeholder="Search archived chats..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="h-auto p-0 border-0 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* Archived Chats List */}
        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ArchiveIcon className="h-8 w-8 mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {searchQuery.trim() ? "No matching archived chats" : "No archived chats"}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {searchQuery.trim() ? "Try a different search term" : "Archive chats to see them here"}
              </p>
            </div>
          ) : (
            filteredChats.map((chat, index) => (
              <ArchiveChatItem
                key={chat.id}
                chat={chat}
                index={index}
                isSelected={index === selectedIndex || chat.id === viewingChatId}
                isCurrentChat={selectedChatId === chat.id}
                showIcon={showWorkspaceIcon}
                projectsMap={projectsMap}
                stats={fileStatsMap.get(chat.id)}
                onSelect={handleSelectChat}
                onRestore={handleRestoreChat}
                setRef={handleSetRef}
              />
            ))
          )}
        </div>
      </div>

      {/* Right Panel: Chat Content Viewer */}
      {viewingChatId && (
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border/50">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {viewingChatData?.name || "Untitled"}
              </h3>
              {viewingChatData?.branch && (
                <p className="text-xs text-muted-foreground truncate font-mono">
                  {viewingChatData.branch}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRestoreChat(viewingChatId)}
              className="flex-shrink-0 ml-2"
            >
              <IconTextUndo className="h-3.5 w-3.5 mr-1.5" />
              Restore
            </Button>
          </div>

          {/* Chat Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {!viewingChatData ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading chat...
              </div>
            ) : viewingChatData.subChats && viewingChatData.subChats.length > 0 ? (
              <div className="space-y-6">
                {viewingChatData.subChats.map((subChat) => {
                  const messages = JSON.parse(subChat.messages || "[]")
                  return (
                    <div key={subChat.id} className="space-y-2">
                      {subChat.name && (
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {subChat.name}
                        </div>
                      )}
                      {messages.length === 0 ? (
                        <div className="text-sm text-muted-foreground/70 italic">
                          No messages in this sub-chat
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {messages.map((msg: any, idx: number) => {
                            if (msg.role === "user") {
                              // Extract text content from parts
                              const textContent = msg.parts
                                ?.filter((p: any) => p.type === "text")
                                .map((p: any) => p.text)
                                .join("\n") || ""
                              // Extract image parts
                              const imageParts = msg.parts?.filter(
                                (p: any) => p.type === "data-image"
                              ) || []
                              return (
                                <AgentUserMessageBubble
                                  key={msg.id || idx}
                                  messageId={msg.id || `user-${idx}`}
                                  textContent={textContent}
                                  imageParts={imageParts}
                                />
                              )
                            } else {
                              // Assistant message - use full renderer
                              return (
                                <AssistantMessageItem
                                  key={msg.id || idx}
                                  message={msg}
                                  isLastMessage={false}
                                  isStreaming={false}
                                  status="ready"
                                  subChatId={subChat.id}
                                  isMobile={false}
                                />
                              )
                            }
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No messages in this chat
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
