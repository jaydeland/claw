"use client"

import React, { useMemo, useState } from "react"
import { Plug, ChevronRight, CheckCircle, XCircle, Clock, AlertTriangle, Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { useAtomValue, useSetAtom } from "jotai"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "../../../../main/lib/trpc/routers"
import { McpServerDialog } from "../../mcp/ui/mcp-server-dialog"

type RouterOutput = inferRouterOutputs<AppRouter>
type McpServerType = RouterOutput["mcp"]["listServers"]["servers"][number]

interface McpsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

type McpAuthStatus = "no_auth_needed" | "configured" | "missing_credentials"


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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)

  // Fetch MCP servers using tRPC
  const { data: mcpServers, isLoading } = trpc.mcp.listServers.useQuery({
    projectPath: selectedProject?.path,
  })

  const utils = trpc.useUtils()

  // Mutation to create default MCP config
  const createDefaultConfig = trpc.mcp.createDefaultConfig.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Created MCP config", {
          description: `Edit ${result.path} to configure your MCP servers.`,
        })
        // Refresh the list
        utils.mcp.listServers.invalidate()
      } else {
        toast.error("Failed to create config", {
          description: result.error,
        })
      }
    },
    onError: (error) => {
      toast.error("Error creating config", {
        description: error.message,
      })
    },
  })

  // Debug logging for merged list
  React.useEffect(() => {
    if (mcpServers) {
      console.log("[mcps-tab] Merged MCP servers:", mcpServers.servers.length, "servers")
      console.log("[mcps-tab] Server details:", mcpServers.servers.map(s => ({
        id: s.id,
        name: s.name,
        source: s.source?.type,
        enabled: s.enabled
      })))
      if (mcpServers.conflicts) {
        console.log("[mcps-tab] Conflicts detected:", mcpServers.conflicts)
      }
    }
  }, [mcpServers])

  // Filter MCP servers by search query
  const filteredServers = useMemo((): McpServerType[] => {
    if (!mcpServers?.servers) return []
    if (!searchQuery.trim()) return mcpServers.servers

    const query = searchQuery.toLowerCase()
    return mcpServers.servers.filter(
      (server) =>
        server.name.toLowerCase().includes(query) ||
        server.id.toLowerCase().includes(query),
    )
  }, [mcpServers, searchQuery])

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
            onClick={() => setAddDialogOpen(true)}
            className="flex-shrink-0 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Add MCP Server"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* MCP servers list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading MCPs...</span>
          </div>
        ) : filteredServers.length === 0 ? (
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
            {!searchQuery && (
              <button
                onClick={() => createDefaultConfig.mutate()}
                disabled={createDefaultConfig.isPending}
                className="mt-2 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {createDefaultConfig.isPending ? "Creating..." : "Create Default Config"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredServers.map((server) => (
              <button
                key={server.id}
                onClick={() => {
                  // Use combined action to set both category and node atomically
                  selectWorkflowItem({
                    node: {
                      id: server.id,
                      name: server.name,
                      type: "mcpServer",
                      sourcePath: server.id, // Use server.id as sourcePath for MCPs
                    },
                    category: "mcps",
                  })
                }}
                className={cn(
                  "group flex items-start gap-2 px-2 py-1 rounded-md hover:bg-foreground/10 cursor-pointer w-full text-left",
                  !server.enabled && "opacity-50",
                )}
              >
                <Plug className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground truncate flex-1">
                      {server.name}
                    </span>
                    {server.source?.type === "project" && (
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
                    )}
                    {!server.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium bg-gray-500/10 text-gray-500">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5">
                    <AuthStatusIndicator status={server.authStatus} />
                  </div>
                  {server.credentialEnvVars.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                      Requires: {server.credentialEnvVars.join(", ")}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add MCP Server Dialog */}
      <McpServerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        mode="add"
      />
    </div>
  )
}
