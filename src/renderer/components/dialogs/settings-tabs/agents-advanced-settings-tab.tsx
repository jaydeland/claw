"use client"

import { trpc } from "../../../lib/trpc"
import { useState, useEffect } from "react"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Badge } from "../../ui/badge"
import { IconSpinner } from "../../ui/icons"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog"
import {
  AlertTriangle,
  FileJson,
  FolderOpen,
  Eye,
  Plus,
  Trash2,
  Check,
  Info,
  ChevronDown,
  ChevronRight
} from "lucide-react"
import type { ConsolidatedConfig } from "../../../../main/lib/config/types"

// Types from config-management router
interface McpConfigFileWithMetadata {
  id: string
  type: "project" | "user" | "custom"
  path: string
  priority: number
  enabled: boolean
  serverCount: number
  exists: boolean
  error?: string
}

interface PluginDirectoryWithMetadata {
  id: string
  path: string
  priority: number
  enabled: boolean
  skillCount: number
  agentCount: number
  commandCount: number
  exists: boolean
  error?: string
}

// Helper to get priority badge
function PriorityBadge({ priority }: { priority: number }) {
  const label = priority <= 20 ? "High" : priority <= 50 ? "Medium" : "Low"
  const variant = priority <= 20 ? "default" : priority <= 50 ? "secondary" : "outline"

  return (
    <Badge variant={variant} className="text-xs">
      {label} ({priority})
    </Badge>
  )
}

// Helper to get type badge color
function TypeBadge({ type }: { type: string }) {
  const colors = {
    project: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    user: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    custom: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  }

  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-xs font-medium",
      colors[type as keyof typeof colors] || colors.custom
    )}>
      {type}
    </span>
  )
}

export function AgentsAdvancedSettingsTab() {
  // Advanced settings state
  const [customBinaryPath, setCustomBinaryPath] = useState("")
  const [envVarsText, setEnvVarsText] = useState("")
  const [customConfigDir, setCustomConfigDir] = useState("")
  const [customWorktreeLocation, setCustomWorktreeLocation] = useState("")
  const [worktreeLocationError, setWorktreeLocationError] = useState<string | null>(null)

  // View modal state
  const [viewMcpConfigId, setViewMcpConfigId] = useState<string | null>(null)
  const [viewMcpConfigPath, setViewMcpConfigPath] = useState<string>("")
  const [viewPluginDirId, setViewPluginDirId] = useState<string | null>(null)
  const [showConsolidatedView, setShowConsolidatedView] = useState(false)

  // Section collapse state
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    sources: false,
    mcpConfigs: false,
    pluginDirs: false,
    resolution: false,
    advanced: false,
  })

  // Fetch Claude Code settings
  const { data: claudeSettings } = trpc.claudeSettings.getSettings.useQuery()

  // Fetch MCP config files
  const { data: mcpConfigs, refetch: refetchMcpConfigs } = trpc.configManagement.listMcpConfigFiles.useQuery({})

  // Fetch plugin directories
  const { data: pluginDirs, refetch: refetchPluginDirs } = trpc.configManagement.listPluginDirectories.useQuery()

  // Fetch consolidated config
  const { data: consolidatedConfig, refetch: refetchConsolidated } = trpc.configManagement.getConsolidatedConfig.useQuery({})

  // Update settings mutation
  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully")
    },
    onError: (error) => {
      toast.error(`Failed to save settings: ${error.message}`)
    },
  })

  // Add MCP config mutation
  const addMcpConfig = trpc.configManagement.addMcpConfigPath.useMutation({
    onSuccess: () => {
      refetchMcpConfigs()
      refetchConsolidated()
      toast.success("MCP config added successfully")
    },
    onError: (error) => {
      toast.error(`Failed to add MCP config: ${error.message}`)
    },
  })

  // Remove MCP config mutation
  const removeMcpConfig = trpc.configManagement.removeMcpConfigPath.useMutation({
    onSuccess: () => {
      refetchMcpConfigs()
      refetchConsolidated()
      toast.success("MCP config removed successfully")
    },
    onError: (error) => {
      toast.error(`Failed to remove MCP config: ${error.message}`)
    },
  })

  // Add plugin directory mutation
  const addPluginDir = trpc.configManagement.addPluginDirectory.useMutation({
    onSuccess: () => {
      refetchPluginDirs()
      toast.success("Plugin directory added successfully")
    },
    onError: (error) => {
      toast.error(`Failed to add plugin directory: ${error.message}`)
    },
  })

  // Remove plugin directory mutation
  const removePluginDir = trpc.configManagement.removePluginDirectory.useMutation({
    onSuccess: () => {
      refetchPluginDirs()
      toast.success("Plugin directory removed successfully")
    },
    onError: (error) => {
      toast.error(`Failed to remove plugin directory: ${error.message}`)
    },
  })

  // Validation function for worktree path
  const validateWorktreePath = (path: string): string | null => {
    if (!path.trim()) return null // Empty is valid (uses default)

    // Check if path is absolute or starts with ~ or $
    if (path.startsWith('/') || path.startsWith('~') || path.startsWith('$')) {
      return null // Valid
    }

    return "Path must be absolute or start with ~ or $ (e.g., ~/worktrees, $HOME/.worktrees)"
  }

  // Sync form with settings
  useEffect(() => {
    if (claudeSettings) {
      setCustomBinaryPath(claudeSettings.customBinaryPath || "")
      setCustomConfigDir(claudeSettings.customConfigDir || "")
      setCustomWorktreeLocation(claudeSettings.customWorktreeLocation || "")
      setEnvVarsText(
        Object.entries(claudeSettings.customEnvVars)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n") || ""
      )
    }
  }, [claudeSettings])

  // Parse env vars from text format (KEY=VALUE, one per line)
  const parseEnvVars = (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIndex = trimmed.indexOf("=")
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        if (key) result[key] = value
      }
    }
    return result
  }

  // Handle adding MCP config
  const handleAddMcpConfig = async () => {
    const result = await window.desktopApi.showOpenDialog({
      title: "Select MCP config file",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    })

    if (result && result.length > 0) {
      const filePath = result[0]
      addMcpConfig.mutate({ path: filePath })
    }
  }

  // Handle adding plugin directory
  const handleAddPluginDir = async () => {
    const result = await window.desktopApi.showOpenDialog({
      title: "Select plugin directory",
      properties: ["openDirectory"],
    })

    if (result && result.length > 0) {
      const dirPath = result[0]
      addPluginDir.mutate({ path: dirPath })
    }
  }

  // Handle viewing MCP config file
  const handleViewMcpConfig = (id: string, path: string) => {
    setViewMcpConfigId(id)
    setViewMcpConfigPath(path)
  }

  // Toggle section collapse
  const toggleSection = (section: keyof typeof sectionsCollapsed) => {
    setSectionsCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <div className="space-y-6 p-6 max-h-[70vh] overflow-y-auto">
      {/* Configuration Sources Section */}
      <div className="space-y-3">
        <button
          onClick={() => toggleSection('sources')}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            {sectionsCollapsed.sources ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <h3 className="text-sm font-semibold text-foreground">Configuration Sources</h3>
          </div>
        </button>

        {!sectionsCollapsed.sources && (
          <div className="pl-6 space-y-2">
            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border border-border">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Configuration is stored in the database and consolidated from multiple sources.
                  This allows you to add custom MCP configs and plugin directories that persist across sessions.
                </p>
                <p className="font-medium text-foreground">
                  Priority order: Project (10) → User (100) → Custom (by priority)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MCP Configuration Files Section */}
      <div className="space-y-3">
        <div className="w-full flex items-center justify-between">
          <button
            onClick={() => toggleSection('mcpConfigs')}
            className="flex items-center gap-2 text-left flex-1"
          >
            {sectionsCollapsed.mcpConfigs ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <h3 className="text-sm font-semibold text-foreground">MCP Configuration Files</h3>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddMcpConfig}
            className="h-7 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add mcp.json
          </Button>
        </div>

        {!sectionsCollapsed.mcpConfigs && (
          <div className="pl-6 space-y-2">
            {mcpConfigs?.configs && mcpConfigs.configs.length > 0 ? (
              <div className="space-y-2">
                {mcpConfigs.configs.map((config) => (
                  <div
                    key={config.id}
                    className={cn(
                      "p-3 rounded-lg border transition-colors",
                      config.exists ? "border-border bg-background" : "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileJson className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <TypeBadge type={config.type} />
                          <PriorityBadge priority={config.priority} />
                          {config.exists && (
                            <span className="text-xs text-muted-foreground">
                              {config.serverCount} server{config.serverCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {config.path}
                        </p>
                        {config.error && (
                          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{config.error}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {config.exists && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewMcpConfig(config.id, config.path)}
                            className="h-7 px-2"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                        {config.type === "custom" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMcpConfig.mutate({ id: config.id })}
                            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No MCP config files found. Click "Add mcp.json" to add a custom configuration.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Plugin Directories Section */}
      <div className="space-y-3">
        <div className="w-full flex items-center justify-between">
          <button
            onClick={() => toggleSection('pluginDirs')}
            className="flex items-center gap-2 text-left flex-1"
          >
            {sectionsCollapsed.pluginDirs ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <h3 className="text-sm font-semibold text-foreground">Plugin Directories</h3>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddPluginDir}
            className="h-7 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Directory
          </Button>
        </div>

        {!sectionsCollapsed.pluginDirs && (
          <div className="pl-6 space-y-2">
            {pluginDirs?.directories && pluginDirs.directories.length > 0 ? (
              <div className="space-y-2">
                {pluginDirs.directories.map((dir) => (
                  <div
                    key={dir.id}
                    className={cn(
                      "p-3 rounded-lg border transition-colors",
                      dir.exists ? "border-border bg-background" : "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <PriorityBadge priority={dir.priority} />
                          {dir.exists && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{dir.skillCount} skills</span>
                              <span>•</span>
                              <span>{dir.agentCount} agents</span>
                              <span>•</span>
                              <span>{dir.commandCount} commands</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {dir.path}
                        </p>
                        {dir.error && (
                          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{dir.error}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePluginDir.mutate({ id: dir.id })}
                        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No plugin directories configured. Click "Add Directory" to add a custom plugin directory.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Config Resolution Section */}
      <div className="space-y-3">
        <button
          onClick={() => toggleSection('resolution')}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            {sectionsCollapsed.resolution ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <h3 className="text-sm font-semibold text-foreground">Config Resolution</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setShowConsolidatedView(true)
            }}
            className="h-7 px-2 text-xs"
          >
            <Eye className="h-3 w-3 mr-1" />
            View Merged Config
          </Button>
        </button>

        {!sectionsCollapsed.resolution && (
          <div className="pl-6 space-y-3">
            <div className="p-3 bg-muted/50 rounded-lg border border-border space-y-3">
              <div>
                <h4 className="text-xs font-medium text-foreground mb-2">Priority Order</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs">1</Badge>
                    <span>Project configs (.1code/mcp.json)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">2</Badge>
                    <span>User configs (~/.claude/mcp.json)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">3</Badge>
                    <span>Custom configs (by priority)</span>
                  </div>
                </div>
              </div>

              {consolidatedConfig && (
                <div>
                  <h4 className="text-xs font-medium text-foreground mb-2">Merged Totals</h4>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      <span>{Object.keys(consolidatedConfig.mergedServers || {}).length} MCP servers</span>
                    </div>
                    {consolidatedConfig.conflicts && consolidatedConfig.conflicts.length > 0 && (
                      <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{consolidatedConfig.conflicts.length} conflicts</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {consolidatedConfig?.conflicts && consolidatedConfig.conflicts.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-foreground mb-2">Conflicts Detected</h4>
                  <div className="space-y-2">
                    {consolidatedConfig.conflicts.map((conflict, idx) => (
                      <div key={idx} className="text-xs bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/50 rounded p-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 text-orange-600 dark:text-orange-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-foreground">
                              Server "{conflict.serverName}"
                            </p>
                            <p className="text-muted-foreground mt-1">
                              Using: <span className="font-medium">{conflict.winningSource.type}</span>
                            </p>
                            <p className="text-muted-foreground">
                              Ignoring: {conflict.ignoredSources.map(s => s.type).join(", ")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Advanced Options Section */}
      <div className="space-y-3">
        <button
          onClick={() => toggleSection('advanced')}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            {sectionsCollapsed.advanced ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <h3 className="text-sm font-semibold text-foreground">Advanced Options</h3>
          </div>
        </button>

        {!sectionsCollapsed.advanced && (
          <div className="pl-6 space-y-4">
            {/* Custom Binary Path */}
            <div className="space-y-2">
              <Label className="text-sm">Custom Claude Binary Path</Label>
              <Input
                value={customBinaryPath}
                onChange={(e) => setCustomBinaryPath(e.target.value)}
                placeholder="/usr/local/bin/claude or leave empty for bundled"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the bundled Claude binary. Specify an absolute path to use your own build.
              </p>
            </div>

            {/* Custom Environment Variables */}
            <div className="space-y-2">
              <Label className="text-sm">Custom Environment Variables</Label>
              <textarea
                value={envVarsText}
                onChange={(e) => setEnvVarsText(e.target.value)}
                placeholder="ANTHROPIC_MODEL=claude-sonnet-4-5-20250514&#10;CLAUDE_DEFAULT_MODEL=claude-sonnet-4-5-20250514"
                className="w-full min-h-[100px] p-2 text-sm font-mono bg-muted rounded-md border border-border resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                One variable per line in KEY=VALUE format. These affect Claude's settings.json behavior.
              </p>
            </div>

            {/* Custom Config Directory */}
            <div className="space-y-2">
              <Label className="text-sm">Claude Config Directory</Label>
              <Input
                value={customConfigDir}
                onChange={(e) => setCustomConfigDir(e.target.value)}
                placeholder="Leave empty for per-chat isolation (default)"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Controls where Claude stores skills, agents, and settings.
                Leave empty for isolated per-chat storage (default).
                Use ~/.claude to share with your terminal Claude.
              </p>
            </div>

            {/* Custom Worktree Location */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Worktree Location</Label>
              <Input
                value={customWorktreeLocation}
                onChange={(e) => {
                  const newValue = e.target.value
                  setCustomWorktreeLocation(newValue)
                  setWorktreeLocationError(validateWorktreePath(newValue))
                }}
                placeholder="~/.claw/worktrees (default)"
                className={cn(
                  "font-mono text-xs",
                  worktreeLocationError && "border-red-500"
                )}
              />
              {worktreeLocationError && (
                <p className="text-xs text-red-500">{worktreeLocationError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Custom location for git worktrees. Supports environment variables like $HOME, $VIDYARD_PATH, or ~.
                Leave empty to use default location (~/.claw/worktrees).
              </p>
              <p className="text-xs text-muted-foreground">
                Examples: <code className="text-xs">~/my-worktrees</code>, <code className="text-xs">$VIDYARD_PATH/.worktrees</code>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-border">
        <Button
          onClick={() => {
            if (worktreeLocationError) {
              toast.error("Please fix validation errors before saving")
              return
            }

            updateSettings.mutate({
              customBinaryPath: customBinaryPath || null,
              customEnvVars: parseEnvVars(envVarsText),
              customConfigDir: customConfigDir || null,
              customWorktreeLocation: customWorktreeLocation || null,
            })
          }}
          disabled={updateSettings.isPending || !!worktreeLocationError}
        >
          {updateSettings.isPending && (
            <IconSpinner className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>

      {/* View MCP Config Modal */}
      <Dialog open={!!viewMcpConfigId} onOpenChange={() => setViewMcpConfigId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>MCP Configuration</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {viewMcpConfigPath}
            </DialogDescription>
          </DialogHeader>
          <ViewMcpConfigContent path={viewMcpConfigPath} />
        </DialogContent>
      </Dialog>

      {/* View Consolidated Config Modal */}
      <Dialog open={showConsolidatedView} onOpenChange={setShowConsolidatedView}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Merged Configuration</DialogTitle>
            <DialogDescription>
              Consolidated view of all MCP servers from all sources
            </DialogDescription>
          </DialogHeader>
          <ConsolidatedConfigView config={consolidatedConfig} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Component to view MCP config file contents
function ViewMcpConfigContent({ path }: { path: string }) {
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadFile() {
      try {
        setLoading(true)
        const data = await window.desktopApi.readTextFile(path)
        setContent(data)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }

    if (path) {
      loadFile()
    }
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="text-sm text-red-600 dark:text-red-400">
            <p className="font-medium">Failed to load file</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <pre className="p-4 bg-muted rounded-lg border border-border text-xs font-mono overflow-x-auto">
      {content}
    </pre>
  )
}

// Component to view consolidated config
function ConsolidatedConfigView({ config }: { config?: ConsolidatedConfig }) {
  if (!config) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  const serversArray = Object.entries(config.mergedServers || {})

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-4 bg-muted/50 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            Total MCP Servers
          </span>
          <Badge variant="default">{serversArray.length}</Badge>
        </div>
        {config.conflicts && config.conflicts.length > 0 && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
              Conflicts
            </span>
            <Badge variant="destructive">{config.conflicts.length}</Badge>
          </div>
        )}
      </div>

      {/* Servers List */}
      {serversArray.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Merged Servers</h4>
          <div className="space-y-2">
            {serversArray.map(([name, serverConfig]) => {
              const source = config.serverSources[name]
              const isConflicted = config.conflicts?.some(c => c.serverName === name)

              return (
                <div
                  key={name}
                  className={cn(
                    "p-3 rounded-lg border",
                    isConflicted
                      ? "border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10"
                      : "border-border bg-background"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{name}</span>
                        {source && <TypeBadge type={source.type} />}
                        {serverConfig.disabled && (
                          <Badge variant="outline" className="text-xs">Disabled</Badge>
                        )}
                        {isConflicted && (
                          <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Conflict</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">
                        {serverConfig.command}
                      </p>
                      {source && (
                        <p className="text-xs text-muted-foreground">
                          From: {source.path}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic text-center py-8">
          No MCP servers configured
        </p>
      )}

      {/* JSON View */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">JSON Configuration</h4>
        <pre className="p-4 bg-muted rounded-lg border border-border text-xs font-mono overflow-x-auto max-h-96">
          {JSON.stringify({ mcpServers: config.mergedServers }, null, 2)}
        </pre>
      </div>
    </div>
  )
}
