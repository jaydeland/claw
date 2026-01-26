import { useAtom, useSetAtom } from "jotai"
import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Download, Check, Trash2, RefreshCw, Loader2 } from "lucide-react"
import {
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  customClaudeConfigAtom,
  openaiApiKeyAtom,
  type CustomClaudeConfig,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Progress } from "../../ui/progress"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

const EMPTY_CONFIG: CustomClaudeConfig = {
  model: "",
  token: "",
  baseUrl: "",
}

// Format relative time (e.g., "2 days ago", "3 hours ago")
function formatRelativeTime(date: Date | null): string {
  if (!date) return ""
  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return "just now"
}

// Format file size
function formatSize(bytes: number | null): string {
  if (!bytes) return ""
  const mb = bytes / 1024 / 1024
  return `${mb.toFixed(1)} MB`
}

/**
 * Claude Code Version Management Section
 */
function ClaudeVersionSection() {
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)

  const utils = trpc.useUtils()

  // Queries
  const { data: currentVersion, isLoading: isLoadingCurrent } =
    trpc.claudeVersions.getCurrentVersion.useQuery()
  const { data: versions, isLoading: isLoadingVersions } =
    trpc.claudeVersions.listVersions.useQuery()

  // Mutations
  const activateVersion = trpc.claudeVersions.activateVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`Activated version ${data.version}`)
      utils.claudeVersions.getCurrentVersion.invalidate()
      utils.claudeVersions.listVersions.invalidate()
      utils.claude.getVersionInfo.invalidate()
    },
    onError: (error) => {
      toast.error(`Failed to activate: ${error.message}`)
    },
  })

  const deleteVersion = trpc.claudeVersions.deleteVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted version ${data.version}`)
      utils.claudeVersions.listVersions.invalidate()
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`)
    },
  })

  const resetToBundled = trpc.claudeVersions.resetToBundled.useMutation({
    onSuccess: (data) => {
      toast.success(`Reset to bundled version ${data.version}`)
      utils.claudeVersions.getCurrentVersion.invalidate()
      utils.claudeVersions.listVersions.invalidate()
      utils.claude.getVersionInfo.invalidate()
    },
    onError: (error) => {
      toast.error(`Failed to reset: ${error.message}`)
    },
  })

  const clearCache = trpc.claudeVersions.clearCache.useMutation()

  // Check for updates
  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true)
    try {
      await clearCache.mutateAsync()
      await utils.claudeVersions.listVersions.invalidate()
      toast.success("Version list refreshed")
    } catch (error: any) {
      toast.error(`Failed to check updates: ${error.message}`)
    } finally {
      setIsCheckingUpdates(false)
    }
  }, [clearCache, utils])

  // Download handler with subscription
  const handleDownload = useCallback((version: string) => {
    setDownloadingVersion(version)
    setDownloadProgress(0)

    // Use tRPC subscription for download progress
    const unsubscribe = trpc.claudeVersions.downloadVersion.subscribe(
      { version },
      {
        onData: (progress) => {
          if (progress.type === "progress" && progress.percent !== undefined) {
            setDownloadProgress(progress.percent)
          } else if (progress.type === "verifying") {
            setDownloadProgress(100)
          } else if (progress.type === "complete") {
            setDownloadingVersion(null)
            setDownloadProgress(0)
            toast.success(`Downloaded version ${version}`)
            utils.claudeVersions.listVersions.invalidate()
          } else if (progress.type === "error") {
            setDownloadingVersion(null)
            setDownloadProgress(0)
            toast.error(`Download failed: ${progress.message}`)
          }
        },
        onError: (error) => {
          setDownloadingVersion(null)
          setDownloadProgress(0)
          toast.error(`Download failed: ${error.message}`)
        },
      }
    )

    // Return cleanup function (not used in this context but good practice)
    return () => unsubscribe.unsubscribe()
  }, [utils])

  const isLoading = isLoadingCurrent || isLoadingVersions

  return (
    <div className="space-y-2">
      <div className="pb-2 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">Claude Code Versions</h4>
          <p className="text-xs text-muted-foreground">
            Manage Claude Code binary versions
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkForUpdates}
          disabled={isCheckingUpdates || isLoading}
        >
          {isCheckingUpdates ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-2">Check Updates</span>
        </Button>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        {/* Current Version */}
        {currentVersion && (
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-foreground">
                  Active: v{currentVersion.id}
                </span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
                  {currentVersion.isBundled ? "Bundled" : "Downloaded"}
                </span>
              </div>
              {!currentVersion.isBundled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetToBundled.mutate()}
                  disabled={resetToBundled.isPending}
                >
                  Reset to Bundled
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Version List */}
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-3">Available Versions</p>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions && versions.length > 0 ? (
            <div className="space-y-2">
              {versions.slice(0, 10).map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-foreground">
                      v{version.id}
                    </span>
                    {version.isActive && (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                    {version.isBundled && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        bundled
                      </span>
                    )}
                    {version.isDownloaded && !version.isBundled && (
                      <span className="text-xs text-muted-foreground">
                        {formatSize(version.size)} • {formatRelativeTime(version.downloadedAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Download Progress */}
                    {downloadingVersion === version.id && (
                      <div className="w-24">
                        <Progress value={downloadProgress} className="h-2" />
                      </div>
                    )}

                    {/* Download Button */}
                    {!version.isDownloaded && version.isAvailable && downloadingVersion !== version.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(version.id)}
                        disabled={!!downloadingVersion}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}

                    {/* Activate Button */}
                    {version.isDownloaded && !version.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => activateVersion.mutate({ version: version.id })}
                        disabled={activateVersion.isPending}
                      >
                        Activate
                      </Button>
                    )}

                    {/* Delete Button */}
                    {version.isDownloaded && !version.isBundled && !version.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteVersion.mutate({ version: version.id })}
                        disabled={deleteVersion.isPending}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No versions available. Click "Check Updates" to refresh.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function AgentsModelsTab() {
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const disconnectClaudeCode = trpc.claudeCode.disconnect.useMutation()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected

  // Get SDK version info
  const { data: versionInfo } = trpc.claude.getVersionInfo.useQuery()

  // OpenAI API key state
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const trpcUtils = trpc.useUtils()

  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
  }, [storedConfig.model, storedConfig.baseUrl, storedConfig.token])

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  const trimmedModel = model.trim()
  const trimmedBaseUrl = baseUrl.trim()
  const trimmedToken = token.trim()
  const canSave = Boolean(trimmedModel && trimmedBaseUrl && trimmedToken)
  const canReset = Boolean(trimmedModel || trimmedBaseUrl || trimmedToken)

  const handleSave = () => {
    if (!canSave) {
      toast.error("Fill model, token, and base URL to save")
      return
    }
    const nextConfig: CustomClaudeConfig = {
      model: trimmedModel,
      token: trimmedToken,
      baseUrl: trimmedBaseUrl,
    }

    setStoredConfig(nextConfig)
    toast.success("Model settings saved")
  }

  const handleReset = () => {
    setStoredConfig(EMPTY_CONFIG)
    setModel("")
    setBaseUrl("")
    setToken("")
    toast.success("Model settings reset")
  }

  const handleClaudeCodeSetup = () => {
    if (isClaudeCodeConnected) {
      // Already connected - disconnect
      disconnectClaudeCode.mutate()
      setAnthropicOnboardingCompleted(false)
    } else {
      // Not connected - trigger OAuth flow
      setSettingsOpen(false)
      setAnthropicOnboardingCompleted(false)
    }
  }

  // Determine current model being used
  const currentModel = storedConfig.model || "claude-sonnet-4-5-20250929"

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canSaveOpenAI = trimmedOpenAIKey !== storedOpenAIKey
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error("Invalid OpenAI API key format. Key should start with 'sk-'")
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key saved")
    } catch (err) {
      toast.error("Failed to save OpenAI API key")
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key removed")
    } catch (err) {
      toast.error("Failed to remove OpenAI API key")
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
          <p className="text-xs text-muted-foreground">
            Configure model overrides and Claude Code authentication
          </p>
        </div>
      )}

      {/* SDK Version and Models */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Version Information</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            {/* SDK Version */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Claude Agent SDK</span>
              <span className="text-sm font-mono text-foreground">
                {versionInfo?.sdkVersion || "Loading..."}
              </span>
            </div>

            {/* Binary Version */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Claude Binary</span>
              <span className="text-sm font-mono text-foreground">
                {versionInfo?.binaryVersion || "Loading..."}
              </span>
            </div>

            {/* Current Model */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Model</span>
              <span className="text-sm font-mono text-foreground">
                {currentModel}
              </span>
            </div>

            {/* Available Models */}
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-3">Available Models</p>
              <div className="space-y-3">
                {versionInfo?.availableModels.map((model) => (
                  <div key={model.id} className="flex flex-col space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {model.name}
                      </span>
                      {model.contextWindow && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {model.contextWindow} context
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{model.description}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {model.modelId}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Claude Code Version Management */}
      <ClaudeVersionSection />

      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Claude Code</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                Claude Code Connection
              </span>
              {isClaudeCodeLoading ? (
                <span className="text-xs text-muted-foreground">
                  Checking...
                </span>
              ) : isClaudeCodeConnected ? (
                claudeCodeIntegration?.connectedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Connected on{" "}
                    {new Date(
                      claudeCodeIntegration.connectedAt,
                    ).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Connected
                  </span>
                )
              ) : (
                <span className="text-xs text-muted-foreground">
                  Not connected yet
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleClaudeCodeSetup}
              disabled={disconnectClaudeCode.isPending || isClaudeCodeLoading}
            >
              {isClaudeCodeConnected ? "Reconnect" : "Connect"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">
            Override Model
          </h4>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">Model name</Label>
              <p className="text-xs text-muted-foreground">
                Model identifier to use for requests
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full"
                placeholder="claude-3-7-sonnet-20250219"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">API token</Label>
              <p className="text-xs text-muted-foreground">
                ANTHROPIC_AUTH_TOKEN env
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                type="password"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                }}
                className="w-full"
                placeholder="sk-ant-..."
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">Base URL</Label>
              <p className="text-xs text-muted-foreground">
                ANTHROPIC_BASE_URL env
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full"
                placeholder="https://api.anthropic.com"
              />
            </div>
          </div>
        </div>

        <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={!canReset} className="hover:bg-red-500/10 hover:text-red-600">
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </div>
        </div>
      </div>

      {/* OpenAI API Key for Voice Input */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Voice Input</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">OpenAI API Key</Label>
                <p className="text-xs text-muted-foreground">
                  Required for voice transcription (Whisper API). Free users need their own key.
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetOpenAI}
              disabled={!canResetOpenAI || setOpenAIKeyMutation.isPending}
              className="hover:bg-red-500/10 hover:text-red-600"
            >
              Remove
            </Button>
            <Button
              size="sm"
              onClick={handleSaveOpenAI}
              disabled={!canSaveOpenAI || setOpenAIKeyMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
