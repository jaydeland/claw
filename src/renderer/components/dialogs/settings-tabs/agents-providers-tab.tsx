"use client"

import { useAtom } from "jotai"
import { useState, useEffect, useRef, useMemo } from "react"
import { trpc } from "../../../lib/trpc"
import {
  activeProviderAtom,
  type AIProvider,
  ollamaConfigAtom,
  type OllamaConfig,
  customApiConfigAtom,
  type CustomApiConfig,
  anthropicModelAtom,
  bedrockModelAtom,
} from "../../../lib/atoms"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { IconSpinner, ClaudeCodeLogoIcon } from "../../ui/icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Check, X, Server, Settings, Cloud, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import { AwsSsoSection } from "../../../features/agents/components/aws-sso-section"

// ============================================
// Provider Card Component
// ============================================

interface ProviderCardProps {
  id: AIProvider
  name: string
  description: string
  icon: React.ReactNode
  isActive: boolean
  isConnected: boolean
  onActivate: () => void
  children: React.ReactNode
}

function ProviderCard({
  id,
  name,
  description,
  icon,
  isActive,
  isConnected,
  onActivate,
  children,
}: ProviderCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden transition-all duration-200",
        isActive
          ? "border-primary/50 ring-1 ring-primary/20 bg-background"
          : "border-border bg-background/50 hover:bg-background hover:border-border/80"
      )}
    >
      {/* Card Header */}
      <div className="p-4 flex items-start gap-4">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground">{name}</h3>
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Check className="h-3 w-3" />
                Connected
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          variant={isActive ? "default" : "outline"}
          size="sm"
          onClick={onActivate}
        >
          {isActive ? "Active" : "Use This"}
        </Button>
      </div>

      {/* Card Content - only shown when active */}
      {isActive && <div className="border-t border-border p-4">{children}</div>}
    </div>
  )
}

// ============================================
// Claude Code Provider
// ============================================

function ClaudeCodeProvider() {
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualToken, setManualToken] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  const [anthropicModel, setAnthropicModel] = useAtom(anthropicModelAtom)
  const [anthropicBackgroundModel, setAnthropicBackgroundModel] = useState("haiku")

  const utils = trpc.useUtils()

  const { data: integration, isLoading, refetch } = trpc.claudeCode.getIntegration.useQuery()
  const { data: claudeSettings } = trpc.claudeSettings.getSettings.useQuery()

  useEffect(() => {
    if (claudeSettings?.anthropicBackgroundModel) {
      setAnthropicBackgroundModel(claudeSettings.anthropicBackgroundModel)
    }
  }, [claudeSettings])

  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Background model updated")
    },
  })

  const importSystemToken = trpc.claudeCode.importSystemToken.useMutation({
    onSuccess: () => {
      toast.success("Claude Code connected successfully!")
      setImportError(null)
      refetch()
      utils.claudeCode.getIntegration.invalidate()
    },
    onError: (error) => {
      setImportError(error.message || "No Claude Code CLI token found")
      setShowManualInput(true)
    },
  })

  const importToken = trpc.claudeCode.importToken.useMutation({
    onSuccess: () => {
      toast.success("Claude Code connected successfully!")
      setImportError(null)
      setShowManualInput(false)
      setManualToken("")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
    },
    onError: (error) => {
      setImportError(error.message || "Failed to import token")
    },
  })

  const disconnect = trpc.claudeCode.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Claude Code disconnected")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect")
    },
  })

  const isConnected = integration?.isConnected
  const isImporting = importSystemToken.isPending || importToken.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Connected State */}
      {isConnected && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Connected to Claude</p>
              {integration?.connectedAt && (
                <p className="text-xs text-muted-foreground">
                  Since {new Date(integration.connectedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Model</Label>
            <Select value={anthropicModel} onValueChange={setAnthropicModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">
                  <div className="flex flex-col">
                    <span className="font-medium">Claude Opus</span>
                    <span className="text-xs text-muted-foreground">Most capable model</span>
                  </div>
                </SelectItem>
                <SelectItem value="sonnet">
                  <div className="flex flex-col">
                    <span className="font-medium">Claude Sonnet</span>
                    <span className="text-xs text-muted-foreground">Balanced performance</span>
                  </div>
                </SelectItem>
                <SelectItem value="haiku">
                  <div className="flex flex-col">
                    <span className="font-medium">Claude Haiku</span>
                    <span className="text-xs text-muted-foreground">Fast and efficient</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This model will be used for all Anthropic OAuth conversations.
            </p>
          </div>

          {/* Background Model Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Background Model</Label>
            <Select
              value={anthropicBackgroundModel}
              onValueChange={(value) => {
                setAnthropicBackgroundModel(value)
                updateSettings.mutate({ anthropicBackgroundModel: value })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">
                  <div className="flex flex-col">
                    <span className="font-medium">Claude Opus</span>
                    <span className="text-xs text-muted-foreground">Most capable, higher cost</span>
                  </div>
                </SelectItem>
                <SelectItem value="sonnet">
                  <div className="flex flex-col">
                    <span className="font-medium">Claude Sonnet</span>
                    <span className="text-xs text-muted-foreground">Balanced performance</span>
                  </div>
                </SelectItem>
                <SelectItem value="haiku">
                  <div className="flex flex-col">
                    <span className="font-medium">Claude Haiku</span>
                    <span className="text-xs text-muted-foreground">Fast and cost-effective (recommended)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for utility tasks like MCP queries and title generation.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="text-destructive hover:text-destructive"
          >
            {disconnect.isPending && <IconSpinner className="h-4 w-4 mr-2" />}
            Disconnect
          </Button>
        </div>
      )}

      {/* Not Connected */}
      {!isConnected && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center">
              <X className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Not connected</p>
          </div>

          {/* Error */}
          {importError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{importError}</p>
            </div>
          )}

          {/* Manual token input */}
          {showManualInput ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Paste your Claude OAuth token below. You can find it in{" "}
                <span className="font-mono">~/.claude/.credentials.json</span>
              </p>
              <Input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  manualToken.trim() &&
                  importToken.mutate({ token: manualToken.trim() })
                }
                placeholder="Paste token here..."
                className="font-mono text-xs"
                autoFocus
                disabled={isImporting}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowManualInput(false)
                    setImportError(null)
                    setManualToken("")
                  }}
                  disabled={isImporting}
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => importToken.mutate({ token: manualToken.trim() })}
                  disabled={!manualToken.trim() || isImporting}
                >
                  {isImporting ? <IconSpinner className="h-4 w-4" /> : "Import"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                onClick={() => importSystemToken.mutate()}
                disabled={isImporting}
                className="w-full"
              >
                {isImporting ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  "Import from Claude Code CLI"
                )}
              </Button>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground w-full text-center"
              >
                Enter token manually
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// AWS Bedrock Provider
// ============================================

function AWSBedrockProvider() {
  const [bedrockRegion, setBedrockRegion] = useState("us-east-1")
  const [vpnCheckEnabled, setVpnCheckEnabled] = useState(false)
  const [vpnCheckUrl, setVpnCheckUrl] = useState("")
  const [connectionMethod, setConnectionMethod] = useState<"sso" | "profile">("sso")
  const [awsProfileName, setAwsProfileName] = useState("")
  const [maxMcpOutputTokens, setMaxMcpOutputTokens] = useState(48000)
  const [maxThinkingTokens, setMaxThinkingTokens] = useState(15000)
  const [bedrockModel, setBedrockModel] = useAtom(bedrockModelAtom)

  // Separate model selections for each tier
  const [opusModelId, setOpusModelId] = useState("")
  const [sonnetModelId, setSonnetModelId] = useState("")
  const [haikuModelId, setHaikuModelId] = useState("")
  const [bedrockBackgroundModel, setBedrockBackgroundModel] = useState("")

  const { data: claudeSettings, refetch: refetchSettings } = trpc.claudeSettings.getSettings.useQuery()

  // Fetch available Bedrock models
  const { data: availableModels, isLoading: isLoadingModels, refetch: refetchModels } =
    trpc.awsSso.listAvailableModels.useQuery(undefined, {
      enabled: claudeSettings?.authMode === "aws", // Only fetch when AWS is configured
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    })

  // Clear cache mutation
  const clearCache = trpc.awsSso.clearModelsCache.useMutation({
    onSuccess: () => {
      refetchModels()
    },
  })

  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("AWS Bedrock settings saved")
      refetchSettings()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save settings")
    },
  })

  // Sync from settings
  useEffect(() => {
    if (claudeSettings) {
      setBedrockRegion(claudeSettings.bedrockRegion || "us-east-1")
      setVpnCheckEnabled(claudeSettings.vpnCheckEnabled || false)
      setVpnCheckUrl(claudeSettings.vpnCheckUrl || "")
      setConnectionMethod(claudeSettings.bedrockConnectionMethod || "sso")
      setAwsProfileName(claudeSettings.awsProfileName || "")
      setMaxMcpOutputTokens(claudeSettings.maxMcpOutputTokens || 48000)
      setMaxThinkingTokens(claudeSettings.maxThinkingTokens || 15000)
      setOpusModelId(claudeSettings.bedrockOpusModel || "")
      setSonnetModelId(claudeSettings.bedrockSonnetModel || "")
      setHaikuModelId(claudeSettings.bedrockHaikuModel || "")
      setBedrockBackgroundModel(claudeSettings.bedrockBackgroundModel || "")
    }
  }, [claudeSettings])

  // Filter models by tier
  const opusModels = useMemo(() => {
    return availableModels?.models.filter(m =>
      m.name.toLowerCase().includes("opus") || m.modelId.toLowerCase().includes("opus")
    ) || []
  }, [availableModels])

  const sonnetModels = useMemo(() => {
    return availableModels?.models.filter(m =>
      m.name.toLowerCase().includes("sonnet") || m.modelId.toLowerCase().includes("sonnet")
    ) || []
  }, [availableModels])

  const haikuModels = useMemo(() => {
    return availableModels?.models.filter(m =>
      m.name.toLowerCase().includes("haiku") || m.modelId.toLowerCase().includes("haiku")
    ) || []
  }, [availableModels])

  const isConfigured = Boolean(
    claudeSettings?.authMode === "aws" &&
      (connectionMethod === "profile" || claudeSettings?.bedrockRegion)
  )

  return (
    <div className="space-y-4">
      {/* Model Selection Header */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Model Configuration</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (availableModels?.models.length) {
              refetchModels()
            } else {
              clearCache.mutate()
            }
          }}
          disabled={isLoadingModels}
          className="h-6 px-2 text-xs"
        >
          {isLoadingModels ? (
            <IconSpinner className="h-3 w-3 mr-1" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          Refresh Models
        </Button>
      </div>

      {/* Opus Model Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Opus Model</Label>
        <Select
          value={opusModelId}
          onValueChange={setOpusModelId}
          disabled={!availableModels?.models.length && !isLoadingModels}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoadingModels
                  ? "Loading models..."
                  : availableModels?.error
                    ? "Failed to load models"
                    : opusModels.length
                      ? "Select Opus model"
                      : "No Opus models available"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {opusModels.map((model) => (
              <SelectItem key={model.modelId} value={model.modelId}>
                <div className="flex flex-col">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{model.modelId}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sonnet Model Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Sonnet Model</Label>
        <Select
          value={sonnetModelId}
          onValueChange={setSonnetModelId}
          disabled={!availableModels?.models.length && !isLoadingModels}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoadingModels
                  ? "Loading models..."
                  : availableModels?.error
                    ? "Failed to load models"
                    : sonnetModels.length
                      ? "Select Sonnet model"
                      : "No Sonnet models available"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {sonnetModels.map((model) => (
              <SelectItem key={model.modelId} value={model.modelId}>
                <div className="flex flex-col">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{model.modelId}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Haiku Model Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Haiku Model</Label>
        <Select
          value={haikuModelId}
          onValueChange={setHaikuModelId}
          disabled={!availableModels?.models.length && !isLoadingModels}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoadingModels
                  ? "Loading models..."
                  : availableModels?.error
                    ? "Failed to load models"
                    : haikuModels.length
                      ? "Select Haiku model"
                      : "No Haiku models available"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {haikuModels.map((model) => (
              <SelectItem key={model.modelId} value={model.modelId}>
                <div className="flex flex-col">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{model.modelId}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status Messages */}
      {availableModels?.models.length === 0 && !isLoadingModels && !availableModels?.error && (
        <p className="text-xs text-muted-foreground">
          Configure AWS credentials below, then click "Refresh Models" to fetch available Bedrock models.
        </p>
      )}
      {availableModels?.error && (
        <p className="text-xs text-destructive">{availableModels.error}</p>
      )}
      {availableModels?.models.length && (
        <p className="text-xs text-muted-foreground">
          {availableModels.models.length} models available in {bedrockRegion} ({opusModels.length} Opus, {sonnetModels.length} Sonnet, {haikuModels.length} Haiku)
        </p>
      )}

      {/* Background Model Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Background Model</Label>
        <Select
          value={bedrockBackgroundModel}
          onValueChange={(value) => {
            setBedrockBackgroundModel(value)
            updateSettings.mutate({ bedrockBackgroundModel: value || null })
          }}
          disabled={!availableModels?.models.length && !isLoadingModels}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoadingModels
                  ? "Loading models..."
                  : availableModels?.models.length
                    ? "Select background model"
                    : "Configure models above first"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {availableModels?.models.map((model) => (
              <SelectItem key={model.modelId} value={model.modelId}>
                <div className="flex flex-col">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{model.modelId}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Used for utility tasks like MCP queries and title generation. Recommended: Use a Haiku model for cost efficiency.
        </p>
      </div>

      <AwsSsoSection
        bedrockRegion={bedrockRegion}
        onBedrockRegionChange={setBedrockRegion}
        onSave={() => {
          updateSettings.mutate({
            authMode: "aws",
            bedrockRegion,
            vpnCheckEnabled,
            vpnCheckUrl,
            bedrockConnectionMethod: connectionMethod,
            awsProfileName: connectionMethod === "profile" ? awsProfileName : null,
            maxMcpOutputTokens,
            maxThinkingTokens,
            bedrockOpusModel: opusModelId || null,
            bedrockSonnetModel: sonnetModelId || null,
            bedrockHaikuModel: haikuModelId || null,
          })
        }}
        isSaving={updateSettings.isPending}
        vpnCheckEnabled={vpnCheckEnabled}
        onVpnCheckEnabledChange={setVpnCheckEnabled}
        vpnCheckUrl={vpnCheckUrl}
        onVpnCheckUrlChange={setVpnCheckUrl}
        connectionMethod={connectionMethod}
        onConnectionMethodChange={setConnectionMethod}
        awsProfileName={awsProfileName}
        onAwsProfileNameChange={setAwsProfileName}
        maxMcpOutputTokens={maxMcpOutputTokens}
        onMaxMcpOutputTokensChange={setMaxMcpOutputTokens}
        maxThinkingTokens={maxThinkingTokens}
        onMaxThinkingTokensChange={setMaxThinkingTokens}
      />
    </div>
  )
}

// ============================================
// Ollama Provider
// ============================================

// Fallback models if API fetch fails
const OLLAMA_FALLBACK_MODELS = [
  { id: "glm-5", name: "GLM 5", description: "Latest GLM model", contextWindow: 189000 },
  { id: "kimi-k2.5:cloud", name: "Kimi K2.5 Cloud", description: "Cloud-based Kimi model", contextWindow: 128000 },
  { id: "qwen3-coder", name: "Qwen 3 Coder", description: "Strong coding performance", contextWindow: 128000 },
  { id: "glm-4.7", name: "GLM 4.7", description: "General purpose", contextWindow: 128000 },
  { id: "gpt-oss:20b", name: "GPT-OSS 20B", description: "20B parameter model", contextWindow: 32768 },
  { id: "gpt-oss:120b", name: "GPT-OSS 120B", description: "120B parameter model", contextWindow: 32768 },
]

type OllamaMode = "local" | "cloud" | null

function OllamaProvider() {
  const [storedConfig, setStoredConfig] = useAtom(ollamaConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const [ollamaApiKey, setOllamaApiKey] = useState(storedConfig.ollamaApiKey || "")
  const [contextWindow, setContextWindow] = useState(storedConfig.contextWindow || 189000)
  const [ollamaMode, setOllamaMode] = useState<OllamaMode>(null)
  const [ollamaBackgroundModel, setOllamaBackgroundModel] = useState("")
  const hasCorrectedUrl = useRef(false)

  const { data: claudeSettings } = trpc.claudeSettings.getSettings.useQuery()

  // Clear Ollama cache mutation
  const clearOllamaCache = trpc.claude.clearOllamaModelsCache.useMutation({
    onSuccess: () => {
      refetchOllamaModels()
    },
  })

  // Sync background model from settings
  useEffect(() => {
    if (claudeSettings?.ollamaBackgroundModel) {
      setOllamaBackgroundModel(claudeSettings.ollamaBackgroundModel)
    }
  }, [claudeSettings])

  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Background model updated")
    },
  })

  useEffect(() => {
    // Auto-correct old Ollama cloud URL to new one (only once)
    let correctedBaseUrl = storedConfig.baseUrl
    if (!hasCorrectedUrl.current && storedConfig.baseUrl === "https://api.ollama.com") {
      correctedBaseUrl = "https://ollama.com"
      hasCorrectedUrl.current = true
      // Update stored config with corrected URL
      setStoredConfig({
        ...storedConfig,
        baseUrl: correctedBaseUrl,
      })
    }

    // Infer mode from stored config
    if (correctedBaseUrl.includes("localhost")) {
      setOllamaMode("local")
    } else if (correctedBaseUrl === "https://ollama.com" || correctedBaseUrl.includes("api.ollama.com")) {
      // Handle both old (api.ollama.com) and new (ollama.com) URLs for backwards compatibility
      setOllamaMode("cloud")
    }
    setModel(storedConfig.model)
    setBaseUrl(correctedBaseUrl)
    setToken(storedConfig.token)
    setOllamaApiKey(storedConfig.ollamaApiKey || "")
    setContextWindow(storedConfig.contextWindow || 189000)
  }, [storedConfig])

  // Fetch Ollama models dynamically
  // For local mode, filter to show only remote/cloud models
  // For cloud mode, all models are already remote so no filtering needed
  const { data: ollamaModelsData, isLoading: isLoadingModels, refetch: refetchOllamaModels } = trpc.claude.getOllamaModels.useQuery(
    {
      baseUrl: baseUrl || "http://localhost:11434",
      apiKey: ollamaApiKey,
      filterRemote: ollamaMode === "local", // Filter for local mode only
    },
    {
      enabled: ollamaMode !== null, // Only fetch when mode is selected
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  )

  // Get model options from API or use fallback
  const modelOptions = useMemo(() => {
    if (ollamaModelsData?.success && ollamaModelsData.models.length > 0) {
      return ollamaModelsData.models.map((m) => ({
        id: m.id,
        name: m.displayName || m.name,
        description: m.description || 'Ollama model',
        contextWindow: m.contextWindow, // Pass through for auto-population
      }))
    }
    // Fallback to hardcoded list if API fails
    return OLLAMA_FALLBACK_MODELS
  }, [ollamaModelsData])

  const applyOllamaPreset = (mode: OllamaMode) => {
    setOllamaMode(mode)
    if (mode === "local") {
      setToken("ollama")
      setBaseUrl("http://localhost:11434")
      setOllamaApiKey("")
    } else if (mode === "cloud") {
      setToken("ollama")
      setBaseUrl("https://ollama.com")
    }
  }

  // Sync mutation for Ollama config
  const syncCustomConfig = trpc.claudeSettings.syncCustomConfig.useMutation({
    onError: (error) => {
      console.error("[ollama] Failed to sync config to backend:", error)
    },
  })

  const handleSave = () => {
    if (!model.trim() || !baseUrl.trim() || !token.trim()) {
      toast.error("Please fill in all required fields")
      return
    }
    const config: OllamaConfig = {
      model: model.trim(),
      token: token.trim(),
      baseUrl: baseUrl.trim(),
      ollamaApiKey: ollamaApiKey.trim() || undefined,
      contextWindow: contextWindow || 189000,
    }
    setStoredConfig(config)
    // Sync to backend for background session (uses legacy format for compatibility)
    syncCustomConfig.mutate({
      model: config.model,
      token: config.token,
      baseUrl: config.baseUrl,
      ollamaApiKey: config.ollamaApiKey,
      contextWindow: config.contextWindow,
    })
    toast.success("Ollama configuration saved")
  }

  const isConfigured = Boolean(storedConfig.model && storedConfig.baseUrl && storedConfig.token)

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Connection Mode</Label>
        <div className="flex gap-2">
          <Button
            variant={ollamaMode === "local" ? "default" : "outline"}
            size="sm"
            onClick={() => applyOllamaPreset("local")}
            className="flex-1"
          >
            <Server className="h-4 w-4 mr-2" />
            Local
          </Button>
          <Button
            variant={ollamaMode === "cloud" ? "default" : "outline"}
            size="sm"
            onClick={() => applyOllamaPreset("cloud")}
            className="flex-1"
          >
            <Cloud className="h-4 w-4 mr-2" />
            Cloud
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Local uses localhost:11434, Cloud uses ollama.com
        </p>
      </div>

      {ollamaMode && (
        <>
          {/* Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Model</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (ollamaModelsData?.models?.length) {
                    refetchOllamaModels()
                  } else {
                    clearOllamaCache.mutate()
                  }
                }}
                disabled={isLoadingModels}
                className="h-6 px-2 text-xs"
              >
                {isLoadingModels ? (
                  <IconSpinner className="h-3 w-3 mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Refresh
              </Button>
            </div>
            <Select
              value={model}
              onValueChange={(value) => {
                setModel(value)
                // Auto-populate context window from model metadata
                const selectedModel = modelOptions.find(m => m.id === value)
                if (selectedModel?.contextWindow) {
                  setContextWindow(selectedModel.contextWindow)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingModels ? "Loading models..." : "Select a model..."} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingModels ? (
                  <SelectItem value="_loading" disabled>
                    Loading models...
                  </SelectItem>
                ) : (
                  modelOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.description}
                          {m.contextWindow && ` - ${Math.round(m.contextWindow / 1000)}k ctx`}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Cloud API Key */}
          {ollamaMode === "cloud" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">API Key</Label>
              <Input
                type="password"
                value={ollamaApiKey}
                onChange={(e) => setOllamaApiKey(e.target.value)}
                placeholder="oll-..."
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Get your key at{" "}
                <a
                  href="https://ollama.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  ollama.com/settings/keys
                </a>
              </p>
            </div>
          )}

          {/* Base URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={ollamaMode === "local" ? "http://localhost:11434" : "https://ollama.com"}
              className="font-mono"
            />
          </div>

          {/* Token */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Auth Token</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ollama"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Usually set to &quot;ollama&quot;</p>
          </div>

          {/* Context Window */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Context Window (tokens)</Label>
            <Input
              type="number"
              value={contextWindow}
              onChange={(e) => setContextWindow(parseInt(e.target.value) || 189000)}
              placeholder="189000"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Maximum context window size for the model. glm-5 supports 189k tokens. Increase this if you get context length errors.
            </p>
          </div>

          {/* Background Model Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Background Model</Label>
            <Select
              value={ollamaBackgroundModel}
              onValueChange={(value) => {
                setOllamaBackgroundModel(value)
                updateSettings.mutate({ ollamaBackgroundModel: value })
              }}
              disabled={!modelOptions.length}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isLoadingModels
                      ? "Loading models..."
                      : modelOptions.length
                        ? "Select background model"
                        : "No models available"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for utility tasks like MCP queries and title generation.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOllamaMode(null)
                setModel("")
                setBaseUrl("http://localhost:11434")
                setToken("ollama")
                setOllamaApiKey("")
              }}
            >
              Clear
            </Button>
            <Button onClick={handleSave} disabled={!model.trim() || !baseUrl.trim() || !token.trim()}>
              Save Configuration
            </Button>
          </div>
        </>
      )}

      {isConfigured && !ollamaMode && (
        <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Ollama configured</p>
            <p className="text-xs text-muted-foreground font-mono">{storedConfig.model}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Custom API Provider
// ============================================

function CustomApiProvider() {
  const [storedConfig, setStoredConfig] = useAtom(customApiConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const [apiKey, setApiKey] = useState(storedConfig.apiKey || "")
  const [contextWindow, setContextWindow] = useState(storedConfig.contextWindow || 200000)
  const [customApiBackgroundModel, setCustomApiBackgroundModel] = useState("")

  const { data: claudeSettings } = trpc.claudeSettings.getSettings.useQuery()

  // Sync background model from settings
  useEffect(() => {
    if (claudeSettings?.customApiBackgroundModel) {
      setCustomApiBackgroundModel(claudeSettings.customApiBackgroundModel)
    }
  }, [claudeSettings])

  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Background model updated")
    },
  })

  // Sync mutation for Custom API config
  const syncCustomConfig = trpc.claudeSettings.syncCustomConfig.useMutation({
    onError: (error) => {
      console.error("[custom-api] Failed to sync config to backend:", error)
    },
  })
  const clearCustomConfig = trpc.claudeSettings.clearCustomConfig.useMutation()

  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
    setApiKey(storedConfig.apiKey || "")
    setContextWindow(storedConfig.contextWindow || 200000)
  }, [storedConfig])

  const handleSave = () => {
    if (!model.trim() || !baseUrl.trim() || !token.trim()) {
      toast.error("Please fill in model, token, and base URL")
      return
    }
    const config: CustomApiConfig = {
      model: model.trim(),
      token: token.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      contextWindow: contextWindow || 200000,
    }
    setStoredConfig(config)
    // Sync to backend for background session (uses legacy format for compatibility)
    syncCustomConfig.mutate({
      model: config.model,
      token: config.token,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      contextWindow: config.contextWindow,
    })
    toast.success("Custom API configuration saved")
  }

  const handleReset = () => {
    setStoredConfig({ model: "", token: "", baseUrl: "", apiKey: "" })
    setModel("")
    setBaseUrl("")
    setToken("")
    setApiKey("")
    // Clear from backend as well
    clearCustomConfig.mutate()
  }

  const isConfigured = Boolean(storedConfig.model && storedConfig.baseUrl && storedConfig.token)
  const canSave = Boolean(model.trim() && baseUrl.trim() && token.trim())

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Model Name</Label>
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="claude-3-7-sonnet-20250219"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">The model identifier for API requests</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Base URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">The API endpoint base URL</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Auth Token</Label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="sk-..."
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">Authentication token for API requests</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">API Key (optional)</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-api03-..."
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">Optional additional API key</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Context Window (tokens)</Label>
        <Input
          type="number"
          value={contextWindow}
          onChange={(e) => setContextWindow(parseInt(e.target.value) || 200000)}
          placeholder="200000"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Maximum context window size for the model. Default is 200k tokens. Adjust based on your model&apos;s capabilities.
        </p>
        {contextWindow < 4096 && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            Warning: Context window is very small. Consider increasing for better results.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Background Model (optional)</Label>
        <Input
          value={customApiBackgroundModel}
          onChange={(e) => setCustomApiBackgroundModel(e.target.value)}
          onBlur={(e) => {
            const trimmed = e.target.value.trim()
            updateSettings.mutate({ customApiBackgroundModel: trimmed || null })
          }}
          placeholder="model-name (leave empty to use main model)"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Model for utility tasks like MCP queries and title generation. Leave empty to use the main model configured above.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={!isConfigured}
          className="hover:bg-red-500/10 hover:text-red-600"
        >
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!canSave}>
          Save Configuration
        </Button>
      </div>
    </div>
  )
}

// ============================================
// Main AI Providers Tab
// ============================================

export function AgentsProvidersTab() {
  const [activeProvider, setActiveProvider] = useAtom(activeProviderAtom)
  const [ollamaConfig] = useAtom(ollamaConfigAtom)
  const [customApiConfig] = useAtom(customApiConfigAtom)

  // Backend sync mutation
  const syncMutation = trpc.claudeSettings.syncProviderToBackend.useMutation()

  // Check connection status for each provider
  const { data: claudeIntegration } = trpc.claudeCode.getIntegration.useQuery()
  const { data: awsStatus } = trpc.awsSso.getStatus.useQuery()

  const isClaudeConnected = claudeIntegration?.isConnected ?? false
  const isAWSConnected = awsStatus?.authenticated ?? false
  const isOllamaConfigured = Boolean(
    ollamaConfig.model && ollamaConfig.baseUrl && ollamaConfig.token
  )
  const isCustomApiConfigured = Boolean(
    customApiConfig.model && customApiConfig.baseUrl && customApiConfig.token
  )

  const providers: { id: AIProvider; name: string; description: string; icon: React.ReactNode; isConnected: boolean }[] = [
    {
      id: "anthropic-oauth",
      name: "Anthropic Claude",
      description: "Official Claude via OAuth authentication",
      icon: <ClaudeCodeLogoIcon className="h-5 w-5" />,
      isConnected: isClaudeConnected,
    },
    {
      id: "aws-bedrock",
      name: "AWS Bedrock",
      description: "Claude models via AWS Bedrock API",
      icon: <Server className="h-5 w-5" />,
      isConnected: isAWSConnected,
    },
    {
      id: "ollama",
      name: "Ollama",
      description: "Local or cloud Ollama models",
      icon: <Cloud className="h-5 w-5" />,
      isConnected: isOllamaConfigured,
    },
    {
      id: "custom-api",
      name: "Custom API",
      description: "Custom API endpoint configuration",
      icon: <Settings className="h-5 w-5" />,
      isConnected: isCustomApiConfigured,
    },
  ]

  // Handler to activate provider and sync to backend
  const handleActivateProvider = (providerId: AIProvider) => {
    setActiveProvider(providerId)
    // Sync to backend so authMode is updated
    if (providerId) {
      syncMutation.mutate({ provider: providerId })
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">AI Providers</h3>
        <p className="text-xs text-muted-foreground">
          Choose which AI service provides your coding assistance. Each provider offers different models and capabilities.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="space-y-3">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            id={provider.id}
            name={provider.name}
            description={provider.description}
            icon={provider.icon}
            isActive={activeProvider === provider.id}
            isConnected={provider.isConnected}
            onActivate={() => handleActivateProvider(provider.id)}
          >
            {provider.id === "anthropic-oauth" && <ClaudeCodeProvider />}
            {provider.id === "aws-bedrock" && <AWSBedrockProvider />}
            {provider.id === "ollama" && <OllamaProvider />}
            {provider.id === "custom-api" && <CustomApiProvider />}
          </ProviderCard>
        ))}
      </div>

      {/* Help Text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Tip:</strong> The model selected above is used for all conversations with this provider.
          Switching providers preserves your chat history and projects.
        </p>
      </div>
    </div>
  )
}
