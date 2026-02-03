"use client"

import React from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Check,
  AlertTriangle,
  Minus,
  Loader2,
  Key,
  Terminal,
  Settings,
  Power,
  PowerOff,
  Wrench,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  selectedMcpServerAtom,
  mcpAuthModalOpenAtom,
  mcpAuthModalServerIdAtom,
  selectedMcpToolAtom,
} from "../atoms"
import { selectedProjectAtom } from "../../agents/atoms"
import { Button } from "../../../components/ui/button"
import { Switch } from "../../../components/ui/switch"
import { JsonSchemaViewer } from "./json-schema-viewer"
import type { McpAuthStatus } from "../types"
import type { McpTool } from "../../../../main/lib/mcp/tool-query"

function getStatusBadge(status: McpAuthStatus) {
  switch (status) {
    case "configured":
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-600 rounded-full text-xs font-medium">
          <Check className="h-3 w-3" />
          Configured
        </div>
      )
    case "missing_credentials":
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-500/10 text-yellow-600 rounded-full text-xs font-medium">
          <AlertTriangle className="h-3 w-3" />
          Missing credentials
        </div>
      )
    case "no_auth_needed":
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs font-medium">
          <Minus className="h-3 w-3" />
          No auth needed
        </div>
      )
  }
}

export function McpServerDetail() {
  const selectedServerId = useAtomValue(selectedMcpServerAtom)
  const setAuthModalOpen = useSetAtom(mcpAuthModalOpenAtom)
  const setAuthModalServerId = useSetAtom(mcpAuthModalServerIdAtom)

  const utils = trpc.useUtils()

  const { data: server, isLoading } = trpc.mcp.getServer.useQuery(
    { serverId: selectedServerId! },
    { enabled: !!selectedServerId }
  )

  const toggleMutation = trpc.mcp.toggleServer.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      utils.mcp.getServer.invalidate({ serverId: selectedServerId! })
    },
  })

  const handleConfigureAuth = () => {
    if (selectedServerId) {
      setAuthModalServerId(selectedServerId)
      setAuthModalOpen(true)
    }
  }

  const handleToggleEnabled = (enabled: boolean) => {
    if (selectedServerId) {
      toggleMutation.mutate({ serverId: selectedServerId, enabled })
    }
  }

  if (!selectedServerId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Settings className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a server to view details</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Server not found</p>
      </div>
    )
  }

  const envVars = server.config.env || {}
  const hasCredentialVars = server.credentialEnvVars.length > 0

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold select-text cursor-text">{server.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5 select-text cursor-text">{server.id}</p>
          </div>
          {getStatusBadge(server.authStatus)}
        </div>

        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            {server.enabled ? (
              <Power className="h-4 w-4 text-green-500" />
            ) : (
              <PowerOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {server.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <Switch
            checked={server.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={toggleMutation.isPending}
          />
        </div>
      </div>

      {/* Command */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="h-4 w-4" />
          Command
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <code className="text-xs break-all select-text cursor-text">
            {server.config.command}
            {server.config.args?.map((arg, i) => (
              <span key={i}> {arg}</span>
            ))}
          </code>
        </div>
      </div>

      {/* Environment Variables */}
      {Object.keys(envVars).length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Key className="h-4 w-4" />
            Environment Variables
          </div>
          <div className="bg-muted/50 rounded-lg divide-y divide-border">
            {Object.entries(envVars).map(([key, value]) => {
              const isCredential = server.credentialEnvVars.includes(key)
              return (
                <div key={key} className="p-3">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-medium select-text cursor-text">{key}</code>
                    {isCredential && (
                      <span className="text-xs text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                        credential
                      </span>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground mt-1 block break-all select-text cursor-text">
                    {isCredential ? "••••••••" : value || "(empty)"}
                  </code>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Auth Actions */}
      {hasCredentialVars && (
        <div className="pt-2">
          <Button
            onClick={handleConfigureAuth}
            variant={server.authStatus === "missing_credentials" ? "default" : "outline"}
            className="w-full"
          >
            <Key className="h-4 w-4 mr-2" />
            {server.authStatus === "missing_credentials"
              ? "Configure Credentials"
              : "Update Credentials"}
          </Button>
        </div>
      )}

      {/* Available Tools */}
      <ToolsSection serverId={server.id} enabled={server.enabled} />
    </div>
  )
}

/**
 * Tool schema panel - shows detailed schema for selected tool
 */
function ToolSchemaPanel({
  tool,
  onClose,
}: {
  tool: McpTool
  onClose: () => void
}) {
  const paramCount = tool.inputSchema?.properties
    ? Object.keys(tool.inputSchema.properties).length
    : 0

  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <code className="text-sm font-semibold select-text cursor-text">{tool.name}</code>
          {paramCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({paramCount} {paramCount === 1 ? "param" : "params"})
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Description */}
        {tool.description && (
          <p className="text-sm text-muted-foreground leading-relaxed select-text cursor-text">
            {tool.description}
          </p>
        )}

        {/* Parameters */}
        {tool.inputSchema?.properties &&
        Object.keys(tool.inputSchema.properties).length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
              Parameters
            </h4>
            <div className="bg-muted/30 rounded-lg p-3">
              <JsonSchemaViewer schema={tool.inputSchema} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            This tool accepts no parameters.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Tools section that queries and displays MCP server tools
 * Uses session-cached tools first (from Claude SDK init), falls back to spawning process
 */
function ToolsSection({ serverId, enabled }: { serverId: string; enabled: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(true)
  const [selectedTool, setSelectedTool] = useAtom(selectedMcpToolAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Try session-cached tools first (from Claude SDK init message)
  const {
    data: sessionToolsData,
    isLoading: sessionLoading,
  } = trpc.mcp.getSessionTools.useQuery(
    { projectPath: selectedProject?.path || "", serverId },
    {
      enabled: enabled && !!selectedProject?.path,
      staleTime: 60000, // Cache for 1 minute (session tools are stable)
    }
  )

  // Fall back to direct query if session cache is empty
  const shouldFallback = !sessionLoading && !sessionToolsData?.fromCache
  const {
    data: directToolsData,
    isLoading: directLoading,
    error: directError,
  } = trpc.mcp.getServerTools.useQuery(
    { serverId, projectPath: selectedProject?.path },
    {
      enabled: enabled && shouldFallback,
      retry: false, // Don't retry on error (server might be misconfigured)
      staleTime: 30000, // Cache for 30 seconds
    }
  )

  // Use session tools if available, otherwise use direct query
  const isLoading = sessionLoading || (shouldFallback && directLoading)
  const toolsData = sessionToolsData?.fromCache ? sessionToolsData : directToolsData
  const error = shouldFallback ? directError : null
  const fromCache = sessionToolsData?.fromCache || false

  // Get currently selected tool (if any from this server)
  const currentToolKey = selectedTool?.startsWith(`${serverId}:`)
    ? selectedTool.split(":").slice(1).join(":") // Handle tool names with colons
    : null
  const tools = toolsData?.tools || []
  const toolDetail = tools.find((t) => t.name === currentToolKey)

  // Clear tool selection when server changes
  React.useEffect(() => {
    if (selectedTool && !selectedTool.startsWith(`${serverId}:`)) {
      // Don't clear - it's for a different server
    }
  }, [serverId, selectedTool])

  const handleToolSelect = (toolName: string) => {
    const toolKey = `${serverId}:${toolName}`
    if (selectedTool === toolKey) {
      setSelectedTool(null) // Toggle off if already selected
    } else {
      setSelectedTool(toolKey)
    }
  }

  if (!enabled) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="h-4 w-4" />
          Available Tools
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            Enable the server to query available tools.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="h-4 w-4" />
          Available Tools
        </div>
        <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {shouldFallback ? "Querying server..." : "Loading from session..."}
          </p>
        </div>
      </div>
    )
  }

  // Handle tRPC query error (only show for direct queries)
  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="h-4 w-4" />
          Available Tools
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-600">Failed to query tools</p>
              <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Handle error returned in the response (from direct query)
  if (toolsData?.error && !fromCache) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="h-4 w-4" />
          Available Tools
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-yellow-700 dark:text-yellow-500">
                Could not load tools
              </p>
              <p className="text-xs text-muted-foreground mt-1">{toolsData.error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium w-full hover:text-foreground/80"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Wrench className="h-4 w-4" />
        <span>Available Tools</span>
        <span className="text-xs text-muted-foreground font-normal">({tools.length})</span>
        {fromCache && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium bg-green-500/10 text-green-600" title="Loaded from Claude session cache">
            cached
          </span>
        )}
      </button>

      {isExpanded && (
        <>
          <div className="bg-muted/50 rounded-lg divide-y divide-border max-h-[300px] overflow-y-auto">
            {tools.length === 0 ? (
              <div className="p-3">
                <p className="text-xs text-muted-foreground">
                  This server does not provide any tools.
                </p>
              </div>
            ) : (
              tools.map((tool) => {
                const paramCount = tool.inputSchema?.properties
                  ? Object.keys(tool.inputSchema.properties).length
                  : 0
                const isSelected = currentToolKey === tool.name

                return (
                  <div
                    key={tool.name}
                    onClick={() => handleToolSelect(tool.name)}
                    className={cn(
                      "w-full p-3 text-left transition-colors hover:bg-muted/80 cursor-pointer",
                      isSelected && "bg-accent"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-medium select-text cursor-text">{tool.name}</code>
                      {paramCount > 0 && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {paramCount} {paramCount === 1 ? "param" : "params"}
                        </span>
                      )}
                    </div>
                    {tool.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 select-text cursor-text">
                        {tool.description}
                      </p>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Schema panel for selected tool */}
          {toolDetail && (
            <ToolSchemaPanel
              tool={toolDetail}
              onClose={() => setSelectedTool(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
