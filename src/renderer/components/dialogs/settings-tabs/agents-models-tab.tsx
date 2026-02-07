"use client"

import { useAtom } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  activeProviderAtom,
  customClaudeConfigAtom,
  type AIProvider,
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
import { Brain, Server, Cloud, Settings, Check } from "lucide-react"
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
  { id: "claude-opus-4-6-team", name: "Claude Opus 4.6 Team", description: "Team mode with parallel agents" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", description: "Latest and most capable" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", description: "Balanced performance" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "Fast and efficient" },
]

const OLLAMA_MODELS = [
  { id: "qwen3-coder", name: "Qwen 3 Coder", description: "Strong coding performance" },
  { id: "glm-4.7", name: "GLM 4.7", description: "General purpose" },
  { id: "gpt-oss:20b", name: "GPT-OSS 20B", description: "20B parameter model" },
  { id: "gpt-oss:120b", name: "GPT-OSS 120B", description: "120B parameter model" },
]

const BEDROCK_MODELS = [
  { id: "global.anthropic.claude-opus-4-6-team-v1:0", name: "Claude Opus 4.6 Team", description: "Team mode via Bedrock" },
  { id: "global.anthropic.claude-opus-4-6-v1:0", name: "Claude Opus 4.6", description: "Via Bedrock" },
  { id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", name: "Claude Sonnet", description: "Via Bedrock" },
  { id: "us.anthropic.claude-haiku-4-5-20251001-v1:0", name: "Claude Haiku", description: "Via Bedrock" },
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

function getModelsForProvider(provider: AIProvider) {
  switch (provider) {
    case "anthropic-oauth":
      return CLAUDE_MODELS
    case "aws-bedrock":
      return BEDROCK_MODELS
    case "ollama":
      return OLLAMA_MODELS
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

  // Default model selection state
  const [defaultModel, setDefaultModel] = useState<string>("")

  // Bedrock model overrides (for advanced section)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [bedrockOpusModel, setBedrockOpusModel] = useState("")
  const [bedrockSonnetModel, setBedrockSonnetModel] = useState("")
  const [bedrockHaikuModel, setBedrockHaikuModel] = useState("")
  const [maxMcpOutputTokens, setMaxMcpOutputTokens] = useState("")
  const [maxThinkingTokens, setMaxThinkingTokens] = useState("")

  // Sync from settings
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
  const availableModels = getModelsForProvider(activeProvider)

  const handleModelChange = (modelId: string) => {
    setDefaultModel(modelId)
    // For custom API or Ollama, update the stored config
    if (activeProvider === "custom-api" || activeProvider === "ollama") {
      setCustomConfig({
        ...customConfig,
        model: modelId,
      })
    }
    toast.success(`Default model set to ${modelId}`)
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

      {/* Default Model Selection */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Default Model</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Select the default model for new conversations
          </p>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4">
            {activeProvider === "custom-api" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Custom API provider uses the model configured in the provider settings.
                </p>
                <p className="text-sm font-mono text-foreground">
                  {customConfig.model || "No model configured"}
                </p>
              </div>
            ) : (
              <Select value={defaultModel} onValueChange={handleModelChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select default model..." />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* Available Models Reference */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Available Models</h4>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-3">
            {versionInfo?.availableModels.map((model) => (
              <div key={model.id} className="flex flex-col space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{model.name}</span>
                  {model.contextWindow && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {model.contextWindow} context
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{model.description}</p>
                <p className="text-xs font-mono text-muted-foreground">{model.modelId}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

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
