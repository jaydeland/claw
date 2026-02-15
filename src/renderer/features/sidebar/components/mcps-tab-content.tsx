"use client"

import React, { useMemo, useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Plug, ChevronRight, ChevronDown, CheckCircle, XCircle, Clock, AlertTriangle, Plus, Folder, Home, FileJson, Sparkles, FolderOpen, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import { selectedProjectAtom } from "../../agents/atoms"
import { useAtomValue, useSetAtom } from "jotai"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "../../../../main/lib/trpc/routers"
import { McpConfigChat } from "../../mcp/ui/mcp-config-chat"

type RouterOutput = inferRouterOutputs<AppRouter>
type McpServerType = RouterOutput["mcp"]["listServers"]["servers"][number]
type McpServerSource = RouterOutput["mcp"]["listServers"]["servers"][number]["source"]

interface McpsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

type McpAuthStatus = "no_auth_needed" | "configured" | "missing_credentials"

interface FileGroup {
  filePath: string
  source: McpServerSource | undefined
  servers: McpServerType[]
  isExpanded: boolean
}

/**
 * Get icon for config source type
 */
function getSourceIcon(source: McpServerSource | undefined) {
  if (!source) return <FileJson className="h-3.5 w-3.5 text-muted-foreground" />
  switch (source.type) {
    case "user":
      return <Home className="h-3.5 w-3.5 text-primary" />
    case "project":
      return <Folder className="h-3.5 w-3.5 text-blue-500" />
    case "custom":
      return <FileJson className="h-3.5 w-3.5 text-orange-500" />
  }
}

/**
 * Get file name from path
 */
function getFileNameFromPath(filePath: string): string {
  return filePath.split("/").pop() || filePath
}

/**
 * Get short path for display
 */
function getShortPath(filePath: string, sourceType: string): string {
  if (sourceType === "user") {
    return "~/.claude/mcp.json"
  }
  const parts = filePath.split("/")
  if (parts.length > 3) {
    return "..." + parts.slice(-3).join("/")
  }
  return filePath
}


/**
 * Status indicator for MCP server auth status
 */
function AuthStatusIndicator({ status }: { status: McpAuthStatus }) {
  switch (status) {
    case "configured":
      return (
        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          <span className="text-[10px]">Configured</span>
        </div>
      )
    case "missing_credentials":
      return (
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          <span className="text-[10px]">Needs Auth</span>
        </div>
      )
    case "no_auth_needed":
    default:
      return (
        <div className="flex items-center gap-1 text-muted-foreground/70">
          <CheckCircle className="h-3 w-3" />
          <span className="text-[10px]">Ready</span>
        </div>
      )
  }
}

export function McpsTabContent({ className, isMobileFullscreen }: McpsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [addFileDialogOpen, setAddFileDialogOpen] = useState(false)
  const [addServerDialogOpen, setAddServerDialogOpen] = useState(false)
  const [targetFilePath, setTargetFilePath] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)

  // Fetch MCP servers using tRPC
  const { data: mcpServers, isLoading } = trpc.mcp.listServers.useQuery({
    projectPath: selectedProject?.path,
  })

  const utils = trpc.useUtils()

  // Group servers by config file
  const fileGroups = useMemo((): FileGroup[] => {
    if (!mcpServers?.servers) return []

    const groups = new Map<string, FileGroup>()

    for (const server of mcpServers.servers) {
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

    // Sort groups: user configs first, then project, then custom, then unknown
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const typeOrder = { user: 0, project: 1, custom: 2, unknown: 3 }
      const aType = a.source?.type ?? "unknown"
      const bType = b.source?.type ?? "unknown"

      if (typeOrder[aType] !== typeOrder[bType]) {
        return typeOrder[aType] - typeOrder[bType]
      }

      return a.filePath.localeCompare(b.filePath)
    })

    return sortedGroups
  }, [mcpServers, expandedGroups])

  // Filter servers within groups
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return fileGroups

    const query = searchQuery.toLowerCase()
    return fileGroups
      .map((group) => ({
        ...group,
        servers: group.servers.filter(
          (server) =>
            server.name.toLowerCase().includes(query) ||
            server.id.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.servers.length > 0)
  }, [fileGroups, searchQuery])

  const toggleGroup = (filePath: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [filePath]: !(prev[filePath] ?? true),
    }))
  }

  const handleAddFile = async () => {
    // Use Electron's dialog API to show file picker
    const result = await window.desktopApi?.showOpenDialog({
      title: "Select or Create MCP Config File",
      defaultPath: "~/.claude",
      filters: [{ name: "JSON Files", extensions: ["json"] }],
      properties: ["openFile", "createDirectory"],
    })

    if (result && !result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0]
      setTargetFilePath(filePath)
      setAddServerDialogOpen(true)
    }
  }

  const handleAddServerToGroup = (filePath: string) => {
    setTargetFilePath(filePath)
    setAddServerDialogOpen(true)
  }

  const handleConfigGenerated = () => {
    setAddServerDialogOpen(false)
    utils.mcp.listServers.invalidate()
  }

  // Handle Escape key for add server dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        setAddServerDialogOpen(false)
      }
    },
    []
  )

  useEffect(() => {
    if (addServerDialogOpen) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [addServerDialogOpen, handleKeyDown])

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search input and Add button */}
      <div className="px-2 pb-2 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search MCPs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "flex-1 rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
              isMobileFullscreen ? "h-10" : "h-8",
            )}
          />
          <button
            onClick={handleAddFile}
            className="flex-shrink-0 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Add MCP Config File"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* MCP servers list - Tree view by config file */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading MCPs...</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3 px-4">
            <Plug className="h-8 w-8 text-muted-foreground/30" />
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground font-medium">
                {searchQuery ? "No MCPs found" : "No MCPs configured"}
              </p>
              {!searchQuery && (
                <p className="text-xs text-muted-foreground/70 max-w-[200px]">
                  MCP servers are loaded from ~/.claude/mcp.json or project .claude/mcp.json files
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredGroups.map((group) => {
              const isExpanded = expandedGroups[group.filePath] ?? true
              const isUserConfig = group.source?.type === "user"

              return (
                <div key={group.filePath} className="mb-1">
                  {/* Config file header */}
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-1.5 py-1 rounded-md",
                      "bg-muted/30 hover:bg-muted/50 transition-colors"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.filePath)}
                      className="flex items-center gap-1.5 flex-1 text-left min-w-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      {getSourceIcon(group.source)}
                      <span className="text-[11px] font-medium text-foreground truncate">
                        {getFileNameFromPath(group.filePath)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        ({group.servers.length})
                      </span>
                    </button>

                    {/* Add server button (AI assistant) */}
                    <button
                      type="button"
                      onClick={() => handleAddServerToGroup(group.filePath)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title={`Add server to ${getFileNameFromPath(group.filePath)}`}
                    >
                      <Sparkles className="h-3 w-3 text-primary" />
                    </button>
                  </div>

                  {/* Servers in this file */}
                  {isExpanded && (
                    <div className="ml-2 mt-0.5 space-y-0.5">
                      {group.servers.map((server) => (
                        <button
                          key={server.id}
                          onClick={() => {
                            selectWorkflowItem({
                              node: {
                                id: server.id,
                                name: server.name,
                                type: "mcpServer",
                                sourcePath: server.id,
                              },
                              category: "mcps",
                            })
                          }}
                          className={cn(
                            "group flex items-start gap-2 px-2 py-1 rounded-md hover:bg-foreground/10 cursor-pointer w-full text-left",
                            !server.enabled && "opacity-50",
                          )}
                        >
                          <Plug className="h-3 w-3 flex-shrink-0 mt-0.5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground truncate flex-1">
                                {server.name}
                              </span>
                              {!server.enabled && (
                                <span className="text-[9px] px-1 py-0.5 rounded-sm font-medium bg-gray-500/10 text-gray-500">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5">
                              <AuthStatusIndicator status={server.authStatus} />
                            </div>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add MCP Server Dialog (AI Assistant) */}
      <AnimatePresence>
        {addServerDialogOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setAddServerDialogOpen(false)}
            />

            {/* Dialog */}
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="fixed z-50 flex flex-col bg-background border border-border/50 overflow-hidden"
              style={{
                top: "72px",
                left: "72px",
                right: "72px",
                height: "calc(100% - 144px)",
                maxWidth: "1200px",
                marginInline: "auto",
                borderRadius: "12px",
                boxShadow:
                  "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">Add MCP Server</h2>
                  <p className="text-sm text-muted-foreground">
                    {targetFilePath
                      ? `Add a server to ${getFileNameFromPath(targetFilePath)}`
                      : "Configure a new MCP server"}
                  </p>
                </div>
                <button
                  onClick={() => setAddServerDialogOpen(false)}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                <McpConfigChat
                  onConfigGenerated={handleConfigGenerated}
                  onCancel={() => setAddServerDialogOpen(false)}
                  targetConfigPath={targetFilePath || undefined}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
