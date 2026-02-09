"use client"

import { useAtom } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  activeProviderAtom,
  customClaudeConfigAtom,
  type AIProvider,
  type OllamaModelConfig,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Brain, Server, Cloud, Settings, Check, Trash2 } from "lucide-react"
import { cn } from "../../../lib/utils"

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

// Model options for each provider
const CLAUDE_MODELS = [
  { id: "opus", name: "Claude Opus", description: "Most capable model" },
  { id: "sonnet", name: "Claude Sonnet", description: "Balanced performance" },
  { id: "haiku", name: "Claude Haiku", description: "Fast and efficient" },
]

// Fallback models if API fetch fails
const OLLAMA_FALLBACK_MODELS = [
  { id: "kimi-k2.5", name: "Kimi K2.5", description: "Strong reasoning and coding" },
  { id: "deepseek-v3.2", name: "DeepSeek V3.2", description: "General purpose" },
  { id: "glm-4.7", name: "GLM 4.7", description: "General purpose" },
  { id: "gpt-oss:120b", name: "GPT-OSS 120B", description: "120B parameter model" },
  { id: "qwen3-coder", name: "Qwen 3 Coder", description: "Strong coding performance" },
]

const BEDROCK_MODELS = [
  { id: "opus", name: "Claude Opus", description: "Via Bedrock" },
  { id: "sonnet", name: "Claude Sonnet", description: "Via Bedrock" },
  { id: "haiku", name: "Claude Haiku", description: "Via Bedrock" },
]

interface ProviderInfo {
  id: AIProvider
  name: string
  icon: React.ReactNode
  description: string
}

function getProviderInfo(provider: AIProvider): ProviderInfo {
  switch (provider) {
    case "anthropic-oauth":
      return {
        id: "anthropic-oauth",
        name: "Anthropic Claude",
        icon: <Brain className="h-4 w-4" />,
        description: "Official Claude via OAuth",
      }
    case "aws-bedrock":
      return {
        id: "aws-bedrock",
        name: "AWS Bedrock",
        icon: <Server className="h-4 w-4" />,
        description: "Claude via AWS Bedrock",
      }
    case "ollama":
      return {
        id: "ollama",
        name: "Ollama",
        icon: <Cloud className="h-4 w-4" />,
        description: "Local or cloud Ollama",
      }
    case "custom-api":
      return {
        id: "custom-api",
        name: "Custom API",
        icon: <Settings className="h-4 w-4" />,
        description: "Custom API endpoint",
      }
    default:
      return {
        id: "anthropic-oauth",
        name: "Anthropic Claude",
        icon: <Brain className="h-4 w-4" />,
        description: "Official Claude via OAuth",
      }
  }
}

function getModelsForProvider(provider: AIProvider, ollamaModels?: typeof OLLAMA_FALLBACK_MODELS) {
  switch (provider) {
    case "anthropic-oauth":
      return CLAUDE_MODELS
    case "aws-bedrock":
      return BEDROCK_MODELS
    case "ollama":
      // Use fetched models if available, otherwise fall back to default list
      return ollamaModels && ollamaModels.length > 0 ? ollamaModels : OLLAMA_FALLBACK_MODELS
    case "custom-api":
      return [] // Custom API uses whatever model is configured
    default:
      return CLAUDE_MODELS
  }
}

export function AgentsModelsTab() {
  const [activeProvider] = useAtom(activeProviderAtom)
  const [customConfig, setCustomConfig] = useAtom(customClaudeConfigAtom)
  const isNarrowScreen = useIsNarrowScreen()

  // Get version info
  const { data: versionInfo } = trpc.claude.getVersionInfo.useQuery()

  // Fetch Ollama models when Ollama is the active provider
  const { data: ollamaModelsData, isLoading: isLoadingOllamaModels } = trpc.claude.getOllamaModels.useQuery(
    {
      baseUrl: customConfig.baseUrl || "http://localhost:11434",
      apiKey: customConfig.ollamaApiKey,
    },
    {
      enabled: activeProvider === "ollama" && !!customConfig.baseUrl,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  )

  // Get settings for Bedrock model overrides
  const { data: claudeSettings, refetch: refetchSettings } = trpc.claudeSettings.getSettings.useQuery()
  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Model settings saved")
      refetchSettings()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save settings")
    },
  })


  // Bedrock model overrides (for advanced section)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [bedrockOpusModel, setBedrockOpusModel] = useState("")
  const [bedrockSonnetModel, setBedrockSonnetModel] = useState("")
  const [bedrockHaikuModel, setBedrockHaikuModel] = useState("")
  const [maxMcpOutputTokens, setMaxMcpOutputTokens] = useState("")
  const [maxThinkingTokens, setMaxThinkingTokens] = useState("")

  // Track which model is being added
  const [addingModelId, setAddingModelId] = useState<string | null>(null)

  // Sync Bedrock settings from database
  useEffect(() => {
    if (claudeSettings) {
      setBedrockOpusModel(claudeSettings.bedrockOpusModel || "")
      setBedrockSonnetModel(claudeSettings.bedrockSonnetModel || "")
      setBedrockHaikuModel(claudeSettings.bedrockHaikuModel || "")
      setMaxMcpOutputTokens(String(claudeSettings.maxMcpOutputTokens || ""))
      setMaxThinkingTokens(String(claudeSettings.maxThinkingTokens || ""))
    }
  }, [claudeSettings])

  // Determine current model being used
  const currentModel = customConfig.model || "claude-sonnet-4-5-20250929"

  const providerInfo = getProviderInfo(activeProvider)

  // Determine Ollama mode from base URL
  const isOllamaCloud = customConfig.baseUrl === "https://ollama.com" ||
    customConfig.baseUrl?.includes("api.ollama.com") ||
    customConfig.baseUrl?.includes("ollama.com")

  // Get user's selected Ollama models from config
  const userOllamaModels = customConfig.ollamaModels || []

  // Get available cloud models (fetched models not already in user's list)
  const availableCloudModels = ollamaModelsData?.success && ollamaModelsData.models
    ? ollamaModelsData.models.filter(
        (m: { id: string }) => !userOllamaModels.some((um) => um.id === m.id)
      )
    : []

  // Add a new Ollama model from the cloud models list
  const handleAddModel = async (modelToAdd: { id: string; name: string; description?: string; size?: string }) => {
    // Check if model already exists in user's list
    if (userOllamaModels.some((m) => m.id === modelToAdd.id)) {
      toast.error(`Model "${modelToAdd.name}" is already in your list`)
      return
    }

    setAddingModelId(modelToAdd.id)

    // Add to user's model list
    const newModel: OllamaModelConfig = {
      id: modelToAdd.id,
      name: modelToAdd.name,
      description: modelToAdd.description || "From Ollama Cloud",
      size: modelToAdd.size,
      isPulled: true,
    }

    setCustomConfig({
      ...customConfig,
      ollamaModels: [...(customConfig.ollamaModels || []), newModel],
    })

    setAddingModelId(null)
    toast.success(`Model "${modelToAdd.name}" added to your list`)
  }

  // Remove an Ollama model from user's list
  const handleRemoveModel = (modelId: string) => {
    const updatedModels = userOllamaModels.filter((m) => m.id !== modelId)
    setCustomConfig({
      ...customConfig,
      ollamaModels: updatedModels,
      // If the removed model was the default, clear it
      model: customConfig.model === modelId ? "" : customConfig.model,
    })
    toast.success(`Model "${modelId}" removed from your list`)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
          <p className="text-xs text-muted-foreground">
            Model preferences and default selections
          </p>
        </div>
      )}

      {/* Active Provider Card */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Active Provider</h4>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {providerInfo.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{providerInfo.name}</p>
                <Check className="h-3.5 w-3.5 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">{providerInfo.description}</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Provider configuration can be changed in the{" "}
          <span className="text-foreground font-medium">AI Providers</span> tab.
        </p>
      </div>

      {/* Version Information */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Version Information</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Claude Agent SDK</span>
              <span className="text-sm font-mono text-foreground">
                {versionInfo?.sdkVersion || "Loading..."}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Claude Binary</span>
              <span className="text-sm font-mono text-foreground">
                {versionInfo?.binaryVersion || "Loading..."}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Current Model</span>
              <span className="text-sm font-mono text-foreground">{currentModel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ollama Model Management - Only for Ollama provider */}
      {activeProvider === "ollama" && (
        <div className="space-y-4">
          {/* Add Model Dropdown */}
          <div className="space-y-2">
            <div className="pb-2">
              <h4 className="text-sm font-medium text-foreground">Available Cloud Models</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Select a model from Ollama Cloud to add to your list
              </p>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4">
                {isLoadingOllamaModels ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Cloud className="h-4 w-4 animate-pulse" />
                    <span className="text-sm">Loading available models...</span>
                  </div>
                ) : availableCloudModels.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {isOllamaCloud
                      ? "All available cloud models have been added to your list"
                      : "Connect to Ollama Cloud to see available models"}
                  </div>
                ) : (
                  <Select
                    onValueChange={(value) => {
                      const model = availableCloudModels.find((m) => m.id === value)
                      if (model) {
                        handleAddModel({
                          id: model.id,
                          name: model.name,
                          description: model.description,
                          size: model.size,
                        })
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a model to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCloudModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{model.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {model.description}
                              {model.size && ` • ${model.size}`}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {/* My Models List */}
          <div className="space-y-2">
            <div className="pb-2">
              <h4 className="text-sm font-medium text-foreground">My Models</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Models available in the input field dropdown
              </p>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              {userOllamaModels.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Cloud className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No models in your list</p>
                  <p className="text-xs mt-1">
                    Select a model from the dropdown above to add it
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {userOllamaModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {model.name}
                          </span>
                          {model.size && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {model.size}
                            </span>
                          )}
                        </div>
                        {model.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {model.description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveModel(model.id)}
                        disabled={addingModelId === model.id}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advanced Settings - Collapsible */}
      <div className="space-y-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full py-2 text-sm font-medium text-foreground hover:text-foreground/80"
        >
          <span>Advanced Model Configuration</span>
          <span className="text-xs text-muted-foreground">
            {showAdvanced ? "Hide" : "Show"}
          </span>
        </button>

        {showAdvanced && activeProvider === "aws-bedrock" && (
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Advanced settings for AWS Bedrock model IDs and token limits.
              </p>

              <div className="space-y-2">
                <label className="text-sm font-medium">Opus Model ID</label>
                <input
                  type="text"
                  value={bedrockOpusModel}
                  onChange={(e) => setBedrockOpusModel(e.target.value)}
                  placeholder="global.anthropic.claude-opus-4-6-v1:0"
                  className="w-full px-3 py-2 text-sm font-mono border rounded-md bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Sonnet Model ID</label>
                <input
                  type="text"
                  value={bedrockSonnetModel}
                  onChange={(e) => setBedrockSonnetModel(e.target.value)}
                  placeholder="us.anthropic.claude-sonnet-4-5-20250929-v1:0"
                  className="w-full px-3 py-2 text-sm font-mono border rounded-md bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Haiku Model ID</label>
                <input
                  type="text"
                  value={bedrockHaikuModel}
                  onChange={(e) => setBedrockHaikuModel(e.target.value)}
                  placeholder="us.anthropic.claude-haiku-4-5-20251001-v1:0"
                  className="w-full px-3 py-2 text-sm font-mono border rounded-md bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Max MCP Output Tokens</label>
                <input
                  type="number"
                  value={maxMcpOutputTokens}
                  onChange={(e) => setMaxMcpOutputTokens(e.target.value)}
                  placeholder="200000"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Max Thinking Tokens</label>
                <input
                  type="number"
                  value={maxThinkingTokens}
                  onChange={(e) => setMaxThinkingTokens(e.target.value)}
                  placeholder="1000000"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    updateSettings.mutate({
                      bedrockOpusModel: bedrockOpusModel || undefined,
                      bedrockSonnetModel: bedrockSonnetModel || undefined,
                      bedrockHaikuModel: bedrockHaikuModel || undefined,
                      maxMcpOutputTokens: maxMcpOutputTokens ? parseInt(maxMcpOutputTokens, 10) : undefined,
                      maxThinkingTokens: maxThinkingTokens ? parseInt(maxThinkingTokens, 10) : undefined,
                    })
                  }}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <span className="mr-2">...</span>}
                  Save Advanced Settings
                </Button>
              </div>
            </div>
          </div>
        )}

        {showAdvanced && activeProvider !== "aws-bedrock" && (
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              Advanced model configuration is only available for AWS Bedrock provider.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
