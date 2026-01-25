"use client"

import React, { useMemo, useState } from "react"
import { Plug, ChevronRight, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { useAtomValue, useSetAtom } from "jotai"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "../../../../main/lib/trpc/routers"

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
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)

  // Fetch MCP servers using tRPC
  const { data: mcpServers, isLoading } = trpc.mcp.listServers.useQuery({
    projectPath: selectedProject?.path,
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
      {/* Search input */}
      <div className="px-2 pb-2 flex-shrink-0">
        <Input
          placeholder="Search MCPs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
            isMobileFullscreen ? "h-10" : "h-7",
          )}
        />
      </div>

      {/* MCP servers list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading MCPs...</span>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <Plug className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {searchQuery ? "No MCPs found" : "No MCPs configured"}
            </span>
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
                  "group flex items-start gap-2 px-2 py-1 rounded-md hover:bg-foreground/5 cursor-pointer w-full text-left",
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
    </div>
  )
}
