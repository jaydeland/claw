"use client"

import { useAtom } from "jotai"
import { useState, useEffect } from "react"
import { trpc } from "../../../lib/trpc"
import {
  activeProviderAtom,
  type AIProvider,
  customClaudeConfigAtom,
  type CustomClaudeConfig,
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
import { Check, X, Copy, ExternalLink, Server, Settings, Cloud } from "lucide-react"
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
// Claude Code OAuth Provider
// ============================================

type AuthFlowState =
  | { step: "idle" }
  | { step: "starting" }
  | { step: "waiting_url"; sandboxId: string; sandboxUrl: string; sessionId: string }
  | { step: "has_url"; sandboxId: string; oauthUrl: string; sandboxUrl: string; sessionId: string }
  | { step: "submitting" }
  | { step: "error"; message: string }

function ClaudeCodeProvider() {
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const [authCode, setAuthCode] = useState("")
  const [copied, setCopied] = useState(false)

  const utils = trpc.useUtils()

  const { data: integration, isLoading, refetch } = trpc.claudeCode.getIntegration.useQuery()

  const startAuth = trpc.claudeCode.startAuth.useMutation({
    onSuccess: (data: { sandboxId: string; sandboxUrl: string; sessionId: string }) => {
      setFlowState({
        step: "waiting_url",
        sandboxId: data.sandboxId,
        sandboxUrl: data.sandboxUrl,
        sessionId: data.sessionId,
      })
    },
    onError: (error) => {
      setFlowState({ step: "error", message: error.message })
      toast.error(error.message || "Failed to start authentication")
    },
  })

  const { data: authStatus } = trpc.claudeCode.pollStatus.useQuery(
    {
      sandboxUrl: flowState.step === "waiting_url" ? flowState.sandboxUrl : "",
      sessionId: flowState.step === "waiting_url" ? flowState.sessionId : "",
    },
    {
      enabled: flowState.step === "waiting_url",
      refetchInterval: 1500,
      refetchIntervalInBackground: true,
    }
  )

  const submitCode = trpc.claudeCode.submitCode.useMutation({
    onSuccess: () => {
      toast.success("Claude Code connected successfully!")
      setFlowState({ step: "idle" })
      setAuthCode("")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
    },
    onError: (error) => {
      setFlowState({ step: "error", message: error.message })
      toast.error(error.message || "Failed to complete authentication")
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

  const openOAuthUrl = trpc.claudeCode.openOAuthUrl.useMutation()

  useEffect(() => {
    if (flowState.step === "waiting_url" && authStatus?.oauthUrl) {
      const currentState = flowState as Extract<AuthFlowState, { step: "waiting_url" }>
      setFlowState({
        step: "has_url",
        sandboxId: currentState.sandboxId,
        oauthUrl: authStatus.oauthUrl,
        sandboxUrl: currentState.sandboxUrl,
        sessionId: currentState.sessionId,
      })
    }
  }, [authStatus, flowState])

  const handleStartAuth = () => {
    setFlowState({ step: "starting" })
    startAuth.mutate()
  }

  const handleSubmitCode = () => {
    if (!authCode.trim() || flowState.step !== "has_url") return
    const currentState = flowState as Extract<AuthFlowState, { step: "has_url" }>
    setFlowState({ step: "submitting" })
    submitCode.mutate({
      sandboxUrl: currentState.sandboxUrl,
      sessionId: currentState.sessionId,
      code: authCode.trim(),
    })
  }

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success("URL copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const isConnected = integration?.isConnected

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
      {isConnected && flowState.step === "idle" && (
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
      {!isConnected && flowState.step === "idle" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center">
              <X className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Not connected</p>
          </div>
          <Button onClick={handleStartAuth}>Connect with Claude</Button>
        </div>
      )}

      {/* Starting / Waiting */}
      {(flowState.step === "starting" || flowState.step === "waiting_url") && (
        <div className="flex items-center gap-3 py-4">
          <IconSpinner className="h-5 w-5" />
          <p className="text-sm text-muted-foreground">Preparing authentication...</p>
        </div>
      )}

      {/* Has URL - Auth Flow */}
      {flowState.step === "has_url" && (
        <div className="space-y-4">
          {(() => {
            const urlState = flowState as Extract<AuthFlowState, { step: "has_url" }>
            return (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">1. Open this URL to authenticate</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded-md text-xs font-mono truncate">
                      {urlState.oauthUrl}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleCopyUrl(urlState.oauthUrl)}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" onClick={() => openOAuthUrl.mutate(urlState.oauthUrl)}>
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open
                    </Button>
                  </div>
                </div>
              </>
            )
          })()}

          <div className="space-y-2">
            <Label className="text-sm">2. Paste the authentication code</Label>
            <Input
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Paste code here..."
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleSubmitCode()}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setFlowState({ step: "idle" })
                setAuthCode("")
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitCode} disabled={!authCode.trim()}>
              Submit Code
            </Button>
          </div>
        </div>
      )}

      {/* Submitting */}
      {flowState.step === "submitting" && (
        <div className="flex items-center gap-3 py-4">
          <IconSpinner className="h-5 w-5" />
          <p className="text-sm text-muted-foreground">Verifying...</p>
        </div>
      )}

      {/* Error */}
      {flowState.step === "error" && (
        <div className="space-y-4">
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{flowState.message}</p>
          </div>
          <Button onClick={handleStartAuth}>Try Again</Button>
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
  const [maxMcpOutputTokens, setMaxMcpOutputTokens] = useState(200000)
  const [maxThinkingTokens, setMaxThinkingTokens] = useState(100000)

  const { data: claudeSettings, refetch: refetchSettings } = trpc.claudeSettings.getSettings.useQuery()

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
      setMaxMcpOutputTokens(claudeSettings.maxMcpOutputTokens || 200000)
      setMaxThinkingTokens(claudeSettings.maxThinkingTokens || 100000)
    }
  }, [claudeSettings])

  const isConfigured = Boolean(
    claudeSettings?.authMode === "aws" &&
      (connectionMethod === "profile" || claudeSettings?.bedrockRegion)
  )

  return (
    <div className="space-y-4">
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

const OLLAMA_MODELS = [
  { id: "kimi-k2.5:cloud", name: "Kimi K2.5 Cloud", description: "Cloud-based Kimi model" },
  { id: "qwen3-coder", name: "Qwen 3 Coder", description: "Strong coding performance" },
  { id: "glm-4.7", name: "GLM 4.7", description: "General purpose" },
  { id: "gpt-oss:20b", name: "GPT-OSS 20B", description: "20B parameter model" },
  { id: "gpt-oss:120b", name: "GPT-OSS 120B", description: "120B parameter model" },
]

type OllamaMode = "local" | "cloud" | null

function OllamaProvider() {
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const [ollamaApiKey, setOllamaApiKey] = useState(storedConfig.ollamaApiKey || "")
  const [ollamaMode, setOllamaMode] = useState<OllamaMode>(null)

  useEffect(() => {
    // Infer mode from stored config
    if (storedConfig.baseUrl.includes("localhost")) {
      setOllamaMode("local")
    } else if (storedConfig.baseUrl.includes("ollama.com")) {
      setOllamaMode("cloud")
    }
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
    setOllamaApiKey(storedConfig.ollamaApiKey || "")
  }, [storedConfig])

  const applyOllamaPreset = (mode: OllamaMode) => {
    setOllamaMode(mode)
    if (mode === "local") {
      setToken("ollama")
      setBaseUrl("http://localhost:11434")
      setOllamaApiKey("")
    } else if (mode === "cloud") {
      setToken("ollama")
      setBaseUrl("https://api.ollama.com")
    }
  }

  const handleSave = () => {
    if (!model.trim() || !baseUrl.trim() || !token.trim()) {
      toast.error("Please fill in all required fields")
      return
    }
    setStoredConfig({
      model: model.trim(),
      token: token.trim(),
      baseUrl: baseUrl.trim(),
      ollamaApiKey: ollamaApiKey.trim() || undefined,
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
          Local uses localhost:11434, Cloud uses api.ollama.com
        </p>
      </div>

      {ollamaMode && (
        <>
          {/* Model Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {OLLAMA_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.description}</span>
                    </div>
                  </SelectItem>
                ))}
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
              placeholder={ollamaMode === "local" ? "http://localhost:11434" : "https://api.ollama.com"}
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

          {/* Save Button */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOllamaMode(null)
                setModel("")
                setBaseUrl("")
                setToken("")
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
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const [apiKey, setApiKey] = useState(storedConfig.apiKey || "")

  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
    setApiKey(storedConfig.apiKey || "")
  }, [storedConfig])

  const handleSave = () => {
    if (!model.trim() || !baseUrl.trim() || !token.trim()) {
      toast.error("Please fill in model, token, and base URL")
      return
    }
    setStoredConfig({
      model: model.trim(),
      token: token.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
    })
    toast.success("Custom API configuration saved")
  }

  const handleReset = () => {
    setStoredConfig({ model: "", token: "", baseUrl: "", apiKey: "", ollamaApiKey: "" })
    setModel("")
    setBaseUrl("")
    setToken("")
    setApiKey("")
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
  const [customConfig] = useAtom(customClaudeConfigAtom)

  // Backend sync mutation
  const syncMutation = trpc.claudeSettings.syncProviderToBackend.useMutation()

  // Check connection status for each provider
  const { data: claudeIntegration } = trpc.claudeCode.getIntegration.useQuery()
  const { data: awsStatus } = trpc.awsSso.getStatus.useQuery()

  const isClaudeConnected = claudeIntegration?.isConnected ?? false
  const isAWSConnected = awsStatus?.authenticated ?? false
  const isOllamaConfigured = Boolean(
    customConfig.model && customConfig.baseUrl && customConfig.token
  )
  const isCustomApiConfigured = Boolean(
    customConfig.model && customConfig.baseUrl && customConfig.token && !customConfig.token.includes("ollama")
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
    syncMutation.mutate({ provider: providerId })
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
          <strong>Tip:</strong> Switching providers changes which AI model processes your requests.
          Your chat history and projects remain the same.
        </p>
        <p>
          Model-specific settings can be configured in the{" "}
          <span className="text-foreground font-medium">Models</span> tab.
        </p>
      </div>
    </div>
  )
}
