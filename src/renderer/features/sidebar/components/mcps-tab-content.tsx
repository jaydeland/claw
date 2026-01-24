"use client"

import React, { useMemo, useState } from "react"
import { Plug, ChevronRight, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { useAtomValue } from "jotai"

interface McpsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

type McpAuthStatus = "no_auth_needed" | "configured" | "missing_credentials"

/**
 * Badge component to show the source of an MCP server
 */
function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    project: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    user: "bg-green-500/10 text-green-600 dark:text-green-400",
    custom: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    devyard: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  }

  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-sm font-medium uppercase tracking-wide",
        colors[source] || "bg-gray-500/10 text-gray-600 dark:text-gray-400",
      )}
    >
      {source}
    </span>
  )
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
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch MCP servers using tRPC
  const { data: mcpServers, isLoading } = trpc.mcp.listServers.useQuery({
    projectPath: selectedProject?.path,
  })

  // Filter MCP servers by search query
  const filteredServers = useMemo(() => {
    if (!mcpServers) return []
    if (!searchQuery.trim()) return mcpServers

    const query = searchQuery.toLowerCase()
    return mcpServers.filter(
      (server) =>
        server.name.toLowerCase().includes(query) ||
        server.id.toLowerCase().includes(query),
    )
  }, [mcpServers, searchQuery])

  // Group servers by source
  const groupedServers = useMemo(() => {
    const groups: Record<string, typeof filteredServers> = {}

    for (const server of filteredServers) {
      const source = server.source?.type || "user"
      if (!groups[source]) {
        groups[source] = []
      }
      groups[source].push(server)
    }

    return groups
  }, [filteredServers])

  const sourceLabels: Record<string, string> = {
    project: "Project MCPs",
    user: "User MCPs",
    devyard: "Devyard MCPs",
    custom: "Custom MCPs",
  }

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
          Object.entries(groupedServers)
            .filter(([_, serverList]) => serverList.length > 0)
            .map(([source, serverList]) => (
              <div key={source} className="mb-3">
                <div className="flex items-center h-4 mb-1 px-1">
                  <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {sourceLabels[source] || `${source} MCPs`}
                  </h3>
                </div>
                <div className="space-y-0.5">
                  {serverList.map((server) => (
                    <div
                      key={server.id}
                      className={cn(
                        "group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/5 cursor-default",
                        !server.enabled && "opacity-50",
                      )}
                    >
                      <Plug className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {server.name}
                          </span>
                          {server.source?.type && (
                            <SourceBadge source={server.source.type} />
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
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
