"use client"

import { useSetAtom, useAtom } from "jotai"
import { ChevronLeft, Server, Cloud } from "lucide-react"
import { useState } from "react"

import { Logo } from "../../components/ui/logo"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { billingMethodAtom, ollamaOnboardingCompletedAtom, customClaudeConfigAtom, activeProviderAtom } from "../../lib/atoms"
import { cn } from "../../lib/utils"

const OLLAMA_MODELS = [
  { id: "qwen3-coder", name: "Qwen 3 Coder", description: "Strong coding performance" },
  { id: "glm-4.7", name: "GLM 4.7", description: "General purpose" },
  { id: "gpt-oss:20b", name: "GPT-OSS 20B", description: "20B parameter model" },
  { id: "gpt-oss:120b", name: "GPT-OSS 120B", description: "120B parameter model" },
]

type OllamaMode = "local" | "cloud" | null

export function OllamaOnboardingPage() {
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setOllamaOnboardingCompleted = useSetAtom(ollamaOnboardingCompletedAtom)
  const setActiveProvider = useSetAtom(activeProviderAtom)
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)

  const [ollamaMode, setOllamaMode] = useState<OllamaMode>(null)
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [token, setToken] = useState("")
  const [ollamaApiKey, setOllamaApiKey] = useState("")

  const handleBack = () => {
    setBillingMethod(null)
  }

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

  const handleContinue = () => {
    if (!model.trim() || !baseUrl.trim() || !token.trim()) {
      return
    }

    // Save Ollama configuration
    setStoredConfig({
      model: model.trim(),
      token: token.trim(),
      baseUrl: baseUrl.trim(),
      ollamaApiKey: ollamaApiKey.trim() || undefined,
    })

    // Mark onboarding as completed
    setOllamaOnboardingCompleted(true)
    setActiveProvider("ollama")
  }

  const canContinue = Boolean(model.trim() && baseUrl.trim() && token.trim())

  return (
    <div className="h-screen w-screen flex flex-col bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back button - non-draggable */}
      <button
        onClick={handleBack}
        className="fixed top-3 left-4 z-10 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-10">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Header */}
          <div className="text-center space-y-4">
            <Logo className="w-10 h-10 mx-auto" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Connect to Ollama
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Use local or cloud Ollama models for AI assistance
              </p>
            </div>
          </div>

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

              {/* Continue Button */}
              <button
                onClick={handleContinue}
                disabled={!canContinue}
                className={cn(
                  "w-full h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center",
                  !canContinue && "opacity-50 cursor-not-allowed"
                )}
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
