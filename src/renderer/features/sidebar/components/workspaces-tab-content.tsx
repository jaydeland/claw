"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  FolderOpen,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Plus,
  Pin,
  Search,
  MoreHorizontal,
  Archive,
  Trash2,
  FolderPlus,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import {
  selectedProjectAtom,
  selectedAgentChatIdAtom,
  expandedWorkspaceIdsAtom,
  selectedDraftIdAtom,
} from "../../agents/atoms"
import { ChatStatusBadge } from "./chat-status-badge"
import { useChatStatuses } from "../hooks/use-chat-status"
import { selectedWorkflowCategoryAtom } from "../../workflows/atoms"
import { selectedMcpCategoryAtom } from "../../mcp/atoms"
import { selectedClustersCategoryAtom } from "../../clusters/atoms"
import { selectedGsdCategoryAtom } from "../../gsd/atoms"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"

interface WorkspacesTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

export function WorkspacesTabContent({ className, isMobileFullscreen }: WorkspacesTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useAtom(expandedWorkspaceIdsAtom)
  const setSelectedWorkflowCategory = useSetAtom(selectedWorkflowCategoryAtom)
  const setSelectedMcpCategory = useSetAtom(selectedMcpCategoryAtom)
  const setSelectedClustersCategory = useSetAtom(selectedClustersCategoryAtom)
  const setSelectedGsdCategory = useSetAtom(selectedGsdCategoryAtom)

  // Fetch all projects
  const { data: projects, isLoading: isLoadingProjects } = trpc.projects.list.useQuery()

  // Fetch all chats (we'll group them by project client-side)
  const { data: allChats, isLoading: isLoadingChats} = trpc.chats.list.useQuery({})

  const utils = trpc.useUtils()

  // Open folder mutation for "New Workspace" button
  const openFolderMutation = trpc.projects.openFolder.useMutation({
    onSuccess: (project) => {
      console.log('[WorkspacesTab] openFolder success:', project)
      if (project) {
        // Optimistically update the projects list cache
        utils.projects.list.setData(undefined, (oldData) => {
          if (!oldData) return [project]
          const exists = oldData.some((p) => p.id === project.id)
          if (exists) {
            return oldData.map((p) =>
              p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p,
            )
          }
          return [project, ...oldData]
        })

        // Select the new project
        setSelectedProject({
          id: project.id,
          name: project.name,
          path: project.path,
          gitRemoteUrl: project.gitRemoteUrl,
          gitProvider: project.gitProvider as "github" | "gitlab" | "bitbucket" | null,
          gitOwner: project.gitOwner,
          gitRepo: project.gitRepo,
        })

        // Expand the new project in the tree
        setExpandedWorkspaceIds((prev) => new Set([...prev, project.id]))
      }
    },
    onError: (error) => {
      console.error('[WorkspacesTab] openFolder error:', error)
    },
  })

  // Archive mutation
  const archiveMutation = trpc.chats.archive.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate()
      setSelectedChatId(null)
    },
  })

  // Delete mutation
  const deleteMutation = trpc.chats.delete.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate()
      setSelectedChatId(null)
    },
  })

  // Archive all chats for a project
  const archiveAllForProject = useCallback(async (projectId: string, chatIds: string[]) => {
    if (chatIds.length === 0) return
    if (!confirm(`Archive all ${chatIds.length} chat(s) in this workspace? They can be restored later.`)) return

    // Archive each chat
    await Promise.all(chatIds.map(id => archiveMutation.mutateAsync({ id })))
  }, [archiveMutation])

  // Delete all chats for a project
  const deleteAllForProject = useCallback(async (projectId: string, chatIds: string[]) => {
    if (chatIds.length === 0) return
    if (!confirm(`Delete all ${chatIds.length} chat(s) in this workspace? This cannot be undone.`)) return

    // Delete each chat
    await Promise.all(chatIds.map(id => deleteMutation.mutateAsync({ id })))
  }, [deleteMutation])

  // Get pinned chat IDs for current project
  const getPinnedChatIds = useCallback((projectId: string): Set<string> => {
    try {
      const stored = localStorage.getItem(`agent-pinned-chats-${projectId}`)
      return new Set(stored ? JSON.parse(stored) : [])
    } catch {
      return new Set()
    }
  }, [])

  // Toggle pin for a chat
  const togglePinChat = useCallback((projectId: string, chatId: string) => {
    const pinnedIds = getPinnedChatIds(projectId)
    if (pinnedIds.has(chatId)) {
      pinnedIds.delete(chatId)
    } else {
      pinnedIds.add(chatId)
    }
    localStorage.setItem(`agent-pinned-chats-${projectId}`, JSON.stringify(Array.from(pinnedIds)))
    // Trigger re-render by invalidating chats list
    utils.chats.list.invalidate()
  }, [getPinnedChatIds, utils.chats.list])

  // Toggle workspace expansion
  const toggleWorkspaceExpanded = useCallback((workspaceId: string) => {
    const newExpanded = new Set(expandedWorkspaceIds)
    if (newExpanded.has(workspaceId)) {
      newExpanded.delete(workspaceId)
    } else {
      newExpanded.add(workspaceId)
    }
    setExpandedWorkspaceIds(newExpanded)
  }, [expandedWorkspaceIds, setExpandedWorkspaceIds])

  // Handle chat click
  const handleChatClick = useCallback((chat: any, projectId: string) => {
    // Set the project and chat
    const project = projects?.find(p => p.id === projectId)
    if (project) {
      setSelectedProject({
        id: project.id,
        name: project.name,
        path: project.path,
        gitRemoteUrl: project.gitRemoteUrl,
        gitProvider: project.gitProvider as "github" | "gitlab" | "bitbucket" | null,
        gitOwner: project.gitOwner,
        gitRepo: project.gitRepo,
      })
    }
    setSelectedChatId(chat.id)
    setSelectedDraftId(null)

    // Clear workflow view to show chat
    setSelectedWorkflowCategory(null)
    // Clear MCP category when chat is selected
    setSelectedMcpCategory(null)
    // Clear clusters category when chat is selected
    setSelectedClustersCategory(null)
    // Clear GSD category when chat is selected
    setSelectedGsdCategory(null)
  }, [projects, setSelectedProject, setSelectedChatId, setSelectedDraftId, setSelectedWorkflowCategory, setSelectedMcpCategory, setSelectedClustersCategory, setSelectedGsdCategory])

  // Handle workspace click
  const handleWorkspaceClick = useCallback((workspace: any) => {
    toggleWorkspaceExpanded(workspace.id)
    // Also set as selected project
    setSelectedProject({
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      gitRemoteUrl: workspace.gitRemoteUrl,
      gitProvider: workspace.gitProvider as "github" | "gitlab" | "bitbucket" | null,
      gitOwner: workspace.gitOwner,
      gitRepo: workspace.gitRepo,
    })
  }, [toggleWorkspaceExpanded, setSelectedProject])

  // Handle new chat
  const handleNewChat = useCallback((workspaceId: string) => {
    const project = projects?.find(p => p.id === workspaceId)
    if (project) {
      setSelectedProject({
        id: project.id,
        name: project.name,
        path: project.path,
        gitRemoteUrl: project.gitRemoteUrl,
        gitProvider: project.gitProvider as "github" | "gitlab" | "bitbucket" | null,
        gitOwner: project.gitOwner,
        gitRepo: project.gitRepo,
      })
    }
    setSelectedChatId(null)
    setSelectedDraftId(null)

    // Clear workflow view to show new chat form
    setSelectedWorkflowCategory(null)
    // Clear MCP category when creating new chat
    setSelectedMcpCategory(null)
    // Clear clusters category when creating new chat
    setSelectedClustersCategory(null)
    // Clear GSD category when creating new chat
    setSelectedGsdCategory(null)
  }, [projects, setSelectedProject, setSelectedChatId, setSelectedDraftId, setSelectedWorkflowCategory, setSelectedMcpCategory, setSelectedClustersCategory, setSelectedGsdCategory])

  // Group chats by project and filter by search
  const workspacesWithChats = useMemo(() => {
    if (!projects) return []

    const searchLower = searchQuery.toLowerCase()

    return projects
      .map((project) => {
        // Get chats for this project
        const projectChats = (allChats || []).filter((chat) => chat.projectId === project.id)

        // Get pinned IDs for this project
        const pinnedIds = getPinnedChatIds(project.id)

        // Filter chats by search
        const filteredChats = searchLower
          ? projectChats.filter((chat) =>
              chat.name?.toLowerCase().includes(searchLower) ||
              chat.branch?.toLowerCase().includes(searchLower)
            )
          : projectChats

        // Separate pinned and unpinned
        const pinned = filteredChats.filter((chat) => pinnedIds.has(chat.id))
        const unpinned = filteredChats.filter((chat) => !pinnedIds.has(chat.id))

        // Combine with pinned first
        const sortedChats = [...pinned, ...unpinned]

        // Check if workspace name matches search
        const workspaceMatches = searchLower
          ? project.name.toLowerCase().includes(searchLower) ||
            project.gitOwner?.toLowerCase().includes(searchLower) ||
            project.gitRepo?.toLowerCase().includes(searchLower)
          : true

        return {
          project,
          chats: sortedChats,
          hasMatchingChats: filteredChats.length > 0,
          workspaceMatches,
          pinnedIds,
        }
      })
      .filter((w) => w.workspaceMatches || w.hasMatchingChats) // Show if workspace or chats match
  }, [projects, allChats, searchQuery, getPinnedChatIds])

  // Auto-expand workspace containing selected chat
  useMemo(() => {
    if (selectedChatId && allChats && projects) {
      const chat = allChats.find((c) => c.id === selectedChatId)
      if (chat?.projectId && !expandedWorkspaceIds.has(chat.projectId)) {
        const newExpanded = new Set(expandedWorkspaceIds)
        newExpanded.add(chat.projectId)
        setExpandedWorkspaceIds(newExpanded)
      }
    }
  }, [selectedChatId, allChats, projects, expandedWorkspaceIds, setExpandedWorkspaceIds])

  // Collect all chat IDs for status tracking
  const allChatIds = useMemo(() => {
    return workspacesWithChats.flatMap((w) => w.chats.map((c) => c.id))
  }, [workspacesWithChats])

  // Get status indicators for all chats
  const chatStatuses = useChatStatuses(allChatIds)

  const isLoading = isLoadingProjects || isLoadingChats

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search input */}
      <div className="px-2 pb-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40 pl-7",
              isMobileFullscreen ? "h-10" : "h-7",
            )}
          />
        </div>
      </div>

      {/* New Workspace button */}
      <div className="px-2 pb-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-8 text-xs"
          onClick={async () => {
            console.log('[WorkspacesTab] New Workspace clicked')
            try {
              const result = await openFolderMutation.mutateAsync()
              console.log('[WorkspacesTab] New Workspace result:', result)
            } catch (error) {
              console.error('[WorkspacesTab] New Workspace error:', error)
            }
          }}
          disabled={openFolderMutation.isPending}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {openFolderMutation.isPending ? "Adding..." : "New Workspace"}
        </Button>
      </div>

      {/* Workspaces tree */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : workspacesWithChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <FolderOpen className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground text-center">
              {searchQuery ? "No workspaces found" : "No workspaces"}
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {workspacesWithChats.map(({ project, chats, pinnedIds }) => {
              const isExpanded = expandedWorkspaceIds.has(project.id)
              const isSelected = selectedProject?.id === project.id

              return (
                <div key={project.id} className="space-y-0.5">
                  {/* Workspace header */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => handleWorkspaceClick(project)}
                      className={cn(
                        "w-full flex items-center gap-1.5 pl-2 pr-7 py-1.5 rounded-md text-left transition-colors",
                        isSelected
                          ? "bg-foreground/10 text-foreground"
                          : "hover:bg-foreground/5 text-foreground",
                      )}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      )}
                      <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {project.name}
                        </div>
                        {project.gitOwner && project.gitRepo && (
                          <div className="text-[10px] text-muted-foreground truncate font-mono">
                            {project.gitOwner}/{project.gitRepo}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {chats.length}
                      </span>
                    </button>

                    {/* Workspace context menu - always visible after count */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          className="text-xs"
                          onClick={() => handleNewChat(project.id)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-2" />
                          New Chat
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-xs"
                          onClick={() => archiveAllForProject(project.id, chats.map(c => c.id))}
                          disabled={chats.length === 0}
                        >
                          <Archive className="h-3.5 w-3.5 mr-2" />
                          Archive All ({chats.length})
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-xs text-destructive"
                          onClick={() => deleteAllForProject(project.id, chats.map(c => c.id))}
                          disabled={chats.length === 0}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete All ({chats.length})
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-xs text-muted-foreground">
                          <FolderOpen className="h-3.5 w-3.5 mr-2" />
                          Open Folder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Nested chats */}
                  {isExpanded && chats.length > 0 && (
                    <div className="pl-6 space-y-0.5">
                      {chats.map((chat) => {
                        const isPinned = pinnedIds.has(chat.id)
                        const isActive = selectedChatId === chat.id
                        const chatStatus = chatStatuses.get(chat.id) ?? null

                        return (
                          <div key={chat.id} className="group relative">
                            <button
                              type="button"
                              onClick={() => handleChatClick(chat, project.id)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                                isActive
                                  ? "bg-primary/10 text-foreground"
                                  : "hover:bg-foreground/5 text-foreground",
                              )}
                            >
                              {isPinned && (
                                <Pin className="h-3 w-3 flex-shrink-0 text-primary" />
                              )}
                              <div className="relative flex-shrink-0">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                <ChatStatusBadge status={chatStatus} isActive={isActive} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">
                                  {chat.name || "Untitled"}
                                </div>
                                {chat.branch && (
                                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                                    {chat.branch}
                                  </div>
                                )}
                              </div>
                            </button>

                            {/* Chat context menu */}
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
                                  onClick={() => togglePinChat(project.id, chat.id)}
                                >
                                  <Pin className="h-3.5 w-3.5 mr-2" />
                                  {isPinned ? "Unpin" : "Pin"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-xs"
                                  onClick={() => archiveMutation.mutate({ id: chat.id })}
                                >
                                  <Archive className="h-3.5 w-3.5 mr-2" />
                                  Archive
                                </DropdownMenuItem>
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

                  {/* Empty state when workspace is expanded but has no chats */}
                  {isExpanded && chats.length === 0 && (
                    <div className="pl-6 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 h-7 text-xs text-muted-foreground"
                        onClick={() => handleNewChat(project.id)}
                      >
                        <Plus className="h-3 w-3" />
                        New Chat
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
