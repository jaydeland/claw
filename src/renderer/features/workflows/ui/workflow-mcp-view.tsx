"use client"

import { useAtomValue } from "jotai"
import { selectedWorkflowNodeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import { Loader2, CheckCircle, XCircle, AlertTriangle, Plug } from "lucide-react"
import { cn } from "../../../lib/utils"

/**
 * MCP server detail view
 * Shows server configuration, status, and metadata
 */
export function WorkflowMcpView() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)

  // Fetch MCP servers list
  const { data: mcpData, isLoading } = trpc.mcp.listServers.useQuery()

  // Find the selected MCP server
  const mcpServer = mcpData?.servers.find(s => s.id === selectedNode?.id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!mcpServer) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <Plug className="h-8 w-8 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">MCP server not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Server Status */}
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">{mcpServer.name}</h2>

          <div className="flex items-center gap-4">
            {/* Enabled Status */}
            <div className="flex items-center gap-2">
              {mcpServer.enabled ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-green-600 dark:text-green-400">Enabled</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span className="text-sm text-red-600 dark:text-red-400">Disabled</span>
                </>
              )}
            </div>

            {/* Auth Status */}
            {mcpServer.authStatus === "configured" && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-blue-600 dark:text-blue-400">Authenticated</span>
              </div>
            )}
            {mcpServer.authStatus === "missing_credentials" && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-amber-600 dark:text-amber-400">Missing Credentials</span>
              </div>
            )}

            {/* Source Badge */}
            {mcpServer.source?.type && (
              <span className={cn(
                "text-xs px-2 py-1 rounded-md font-medium uppercase",
                mcpServer.source.type === "project" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                mcpServer.source.type === "user" && "bg-green-500/10 text-green-600 dark:text-green-400",
                mcpServer.source.type === "custom" && "bg-purple-500/10 text-purple-600 dark:text-purple-400"
              )}>
                {mcpServer.source.type}
              </span>
            )}
          </div>
        </div>

        {/* Configuration */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Configuration</h3>

          {/* Command */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Command</label>
            <div className="bg-muted/50 rounded-md p-3">
              <code className="text-sm font-mono">{mcpServer.config.command}</code>
            </div>
          </div>

          {/* Arguments */}
          {mcpServer.config.args && mcpServer.config.args.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Arguments</label>
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                {mcpServer.config.args.map((arg, index) => (
                  <div key={index} className="text-sm font-mono">
                    {arg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Environment Variables */}
          {mcpServer.config.env && Object.keys(mcpServer.config.env).length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Environment Variables</label>
              <div className="bg-muted/50 rounded-md p-3 space-y-2">
                {Object.entries(mcpServer.config.env).map(([key, value]) => (
                  <div key={key} className="space-y-0.5">
                    <div className="text-xs font-medium font-mono text-muted-foreground">{key}</div>
                    <div className="text-sm font-mono pl-4">
                      {mcpServer.credentialEnvVars.includes(key) ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {value.startsWith("$") || value.includes("YOUR_") ? value : "••••••••"}
                        </span>
                      ) : (
                        value
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-Approve */}
          {mcpServer.config.autoApprove && mcpServer.config.autoApprove.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auto-Approve Tools</label>
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                {mcpServer.config.autoApprove.map((tool, index) => (
                  <div key={index} className="text-sm font-mono">
                    {tool}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Required Credentials */}
        {mcpServer.credentialEnvVars.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Required Credentials</h3>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">This server requires the following credentials:</p>
                  <div className="space-y-1">
                    {mcpServer.credentialEnvVars.map((envVar) => (
                      <div key={envVar} className="text-sm font-mono bg-background/50 px-2 py-1 rounded">
                        {envVar}
                      </div>
                    ))}
                  </div>
                  {mcpServer.authStatus === "missing_credentials" && (
                    <p className="text-xs text-muted-foreground">
                      Configure these in Settings → MCP Servers to enable this server.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Source Information */}
        {mcpServer.source && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Source</h3>
            <div className="bg-muted/50 rounded-md p-4 space-y-2">
              <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
                <div className="text-muted-foreground">Type:</div>
                <div className="font-medium capitalize">{mcpServer.source.type}</div>

                <div className="text-muted-foreground">Config Path:</div>
                <div className="font-mono text-xs break-all">{mcpServer.source.path}</div>
              </div>
            </div>
          </div>
        )}

        {/* Available Tools */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Available Tools</h3>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-4">
            <div className="flex items-start gap-2">
              <Plug className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium">Tools are available when the server is running</p>
                <p className="text-xs text-muted-foreground">
                  MCP servers dynamically expose their tools when connected to Claude. The available tools will vary based on the server implementation and may include file operations, API integrations, data processing, and more.
                </p>
                <p className="text-xs text-muted-foreground">
                  To see this server's tools in action, start a chat session and check the Session Flow panel.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Server ID */}
        <div className="pt-4 border-t border-border/50">
          <div className="text-xs text-muted-foreground">
            Server ID: <span className="font-mono">{mcpServer.id}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
