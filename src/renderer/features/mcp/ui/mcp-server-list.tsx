"use client"

import React from "react"
import { useAtom } from "jotai"
import { Search, Check, AlertTriangle, Minus, Loader2, Wrench, ChevronRight, ChevronDown, Folder, FolderOpen, FileJson, Home, Plus, Trash2, Sparkles } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedMcpServerAtom, mcpServerSearchAtom, mcpAddServerDialogOpenAtom, mcpAddServerTargetFileAtom } from "../atoms"
import type { McpAuthStatus, McpServerSource } from "../types"
import { Button } from "../../../components/ui/button"
import { toast } from "sonner"

function getStatusIcon(status: McpAuthStatus) {
  switch (status) {
    case "configured":
      return <Check className="h-3 w-3 text-green-500" />
    case "missing_credentials":
      return <AlertTriangle className="h-3 w-3 text-yellow-500" />
    case "no_auth_needed":
      return <Minus className="h-3 w-3 text-muted-foreground" />
  }
}

function getStatusText(status: McpAuthStatus) {
  switch (status) {
    case "configured":
      return "Configured"
    case "missing_credentials":
      return "Missing credentials"
    case "no_auth_needed":
      return "No auth needed"
  }
}

function getSourceIcon(source: McpServerSource | undefined) {
  if (!source) return <FileJson className="h-4 w-4 text-muted-foreground" />
  switch (source.type) {
    case "user":
      return <Home className="h-4 w-4 text-primary" />
    case "project":
      return <Folder className="h-4 w-4 text-blue-500" />
    case "custom":
      return <FileJson className="h-4 w-4 text-orange-500" />
  }
}

function getFileNameFromPath(filePath: string): string {
  return filePath.split("/").pop() || filePath
}

function getShortPath(filePath: string, sourceType: string): string {
  if (sourceType === "user") {
    return "~/.claude/mcp.json"
  }
  // For project and custom, show last 2-3 segments
  const parts = filePath.split("/")
  if (parts.length > 3) {
    return "..." + parts.slice(-3).join("/")
  }
  return filePath
}

interface FileGroup {
  filePath: string
  source: McpServerSource | undefined
  servers: Array<{
    id: string
    name: string
    config: {
      command?: string
      args?: string[]
      env?: Record<string, string>
      disabled?: boolean
      autoApprove?: string[]
      type?: "http" | "sse"
      url?: string
      headers?: Record<string, string>
    }
    authStatus: McpAuthStatus
    credentialEnvVars: string[]
    enabled: boolean
    source?: McpServerSource
  }>
  isExpanded: boolean
}

export function McpServerList() {
  const [selectedServer, setSelectedServer] = useAtom(selectedMcpServerAtom)
  const [search, setSearch] = useAtom(mcpServerSearchAtom)
  const [, setAddServerDialogOpen] = useAtom(mcpAddServerDialogOpenAtom)
  const [, setAddServerTargetFile] = useAtom(mcpAddServerTargetFileAtom)
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({})

  const { data, isLoading, error } = trpc.mcp.listServers.useQuery()
  const utils = trpc.useUtils()

  const deleteConfigFileMutation = trpc.mcp.deleteConfigFile.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      toast.success("Config file deleted")
    },
    onError: (error) => {
      toast.error("Failed to delete config file", { description: error.message })
    },
  })

  // Query cached tool counts for all servers
  const serverIds = React.useMemo(
    () => data?.servers?.map((s) => s.id) || [],
    [data?.servers]
  )
  const { data: toolCounts } = trpc.mcp.getToolCounts.useQuery(
    { serverIds },
    { enabled: serverIds.length > 0 }
  )

  // Group servers by their specific config file path
  const fileGroups = React.useMemo(() => {
    if (!data?.servers) return []

    const groups = new Map<string, FileGroup>()

    for (const server of data.servers) {
      // Use the actual file path as the key
      const filePath = server.source?.path || "unknown"

      if (!groups.has(filePath)) {
        groups.set(filePath, {
          filePath,
          source: server.source,
          servers: [],
          isExpanded: expandedGroups[filePath] ?? true,
        })
      }

      groups.get(filePath)!.servers.push(server)
    }

    // Sort groups: user configs first, then project, then custom
    // Within each type, sort by path
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const typeOrder = { user: 0, project: 1, custom: 2, unknown: 3 }
      const aType = a.source?.type ?? "unknown"
      const bType = b.source?.type ?? "unknown"

      if (typeOrder[aType] !== typeOrder[bType]) {
        return typeOrder[aType] - typeOrder[bType]
      }

      // Within same type, sort by path
      return a.filePath.localeCompare(b.filePath)
    })

    return sortedGroups
  }, [data?.servers, expandedGroups])

  // Filter servers within groups
  const filteredGroups = React.useMemo(() => {
    if (!search.trim()) return fileGroups

    const query = search.toLowerCase()
    return fileGroups
      .map((group) => ({
        ...group,
        servers: group.servers.filter(
          (server) =>
            server.id.toLowerCase().includes(query) ||
            server.name.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.servers.length > 0)
  }, [fileGroups, search])

  const toggleGroup = (filePath: string) => {
    setExpandedGroups((prev) => ({ ...prev, [filePath]: !prev[filePath] }))
  }

  const handleAddServer = (filePath: string) => {
    setAddServerTargetFile(filePath)
    setAddServerDialogOpen(true)
  }

  const handleDeleteFile = (filePath: string, sourceType: string) => {
    if (sourceType === "user") {
      toast.error("Cannot delete the default user config file")
      return
    }

    if (confirm(`Are you sure you want to delete this config file?\n\n${filePath}\n\nAll servers in this file will be removed.`)) {
      deleteConfigFileMutation.mutate({ filePath })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load MCP servers: {error.message}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Server list - Tree view by config file */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            {data?.servers?.length === 0
              ? "No MCP servers configured"
              : "No servers match your search"}
          </div>
        ) : (
          <div className="py-1">
            {filteredGroups.map((group) => {
              const isExpanded = expandedGroups[group.filePath] ?? true
              const isUserConfig = group.source?.type === "user"

              return (
                <div key={group.filePath} className="mb-1">
                  {/* Config file header */}
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2 py-2",
                      "bg-muted/30 border-b border-border",
                      "hover:bg-muted/50 transition-colors group"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.filePath)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      {getSourceIcon(group.source)}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-foreground block truncate">
                          {getFileNameFromPath(group.filePath)}
                        </span>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          {getShortPath(group.filePath, group.source?.type || "unknown")}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground/60">
                        {group.servers.length}
                      </span>
                    </button>

                    {/* Add server button (AI assistant) */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleAddServer(group.filePath)}
                      title={`Add server to ${getFileNameFromPath(group.filePath)}`}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </Button>

                    {/* Delete file button (not for user config) */}
                    {!isUserConfig && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteFile(group.filePath, group.source?.type || "unknown")}
                        disabled={deleteConfigFileMutation.isPending}
                        title="Delete config file"
                      >
                        {deleteConfigFileMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Servers in this file */}
                  {isExpanded && (
                    <div className="ml-2 border-l border-border/50">
                      {group.servers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground italic">
                          No servers in this file
                        </div>
                      ) : (
                        group.servers.map((server) => {
                          const toolCount = toolCounts?.[server.id]
                          return (
                            <button
                              key={server.id}
                              type="button"
                              onClick={() => setSelectedServer(server.id)}
                              className={cn(
                                "w-full px-3 py-2 text-left transition-colors",
                                "hover:bg-muted/50",
                                selectedServer === server.id && "bg-accent"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "flex-1 text-sm font-medium truncate",
                                    !server.enabled && "text-muted-foreground"
                                  )}
                                >
                                  {server.name}
                                </span>
                                {/* Tool count badge */}
                                {server.enabled && toolCount && (
                                  <span
                                    className={cn(
                                      "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full",
                                      toolCount.stale
                                        ? "bg-muted text-muted-foreground"
                                        : "bg-primary/10 text-primary"
                                    )}
                                  >
                                    <Wrench className="h-3 w-3" />
                                    {toolCount.count}
                                  </span>
                                )}
                                {!server.enabled && (
                                  <span className="text-xs text-muted-foreground">(disabled)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {getStatusIcon(server.authStatus)}
                                <span className="text-xs text-muted-foreground">
                                  {getStatusText(server.authStatus)}
                                </span>
                              </div>
                            </button>
                          )
                        })
                      )}
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
