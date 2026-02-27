"use client"

import React, { useState, useRef, useEffect } from "react"
import { Slack, Check, AlertCircle, Eye, EyeOff, Trash2, Loader2, Save, Power, Hash, Plus, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"
import {
  Alert,
  AlertDescription,
} from "../../ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"

export function AgentsSlackTab() {
  const [appToken, setAppToken] = useState("")
  const [botToken, setBotToken] = useState("")
  const [showAppToken, setShowAppToken] = useState(false)
  const [showBotToken, setShowBotToken] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  // Show Step 2 card after credentials saved
  const [showStep2, setShowStep2] = useState(false)

  // Channel setup state
  const [channelSetupMode, setChannelSetupMode] = useState<"select" | "create">("select")
  const [channelName, setChannelName] = useState("claw-agent")
  const [selectedExistingChannel, setSelectedExistingChannel] = useState("")
  const [selectedProjectPath, setSelectedProjectPath] = useState("")
  const [setupResult, setSetupResult] = useState<{ channelName: string; clawName: string } | null>(null)

  const step2Ref = useRef<HTMLDivElement>(null)

  const utils = trpc.useUtils()

  const { data: credentials, isLoading: isLoadingStatus } = trpc.slack.hasCredentials.useQuery()
  const { data: testResult, isLoading: isTesting, refetch: testConnection } = trpc.slack.testConnection.useQuery(
    undefined,
    { enabled: false }
  )
  const { data: slackClaws } = trpc.slack.listSlackClaws.useQuery(undefined, { enabled: !!credentials?.hasAppToken })
  const { data: projects } = trpc.projects.list.useQuery(undefined, { enabled: !!credentials?.hasAppToken })
  const { data: botChannels, refetch: refetchBotChannels } = trpc.slack.listBotChannels.useQuery(
    undefined,
    { enabled: !!credentials?.hasAppToken }
  )

  const saveMutation = trpc.slack.saveCredentials.useMutation({
    onSuccess: () => {
      utils.slack.hasCredentials.invalidate()
      setAppToken("")
      setBotToken("")
      setSavedMessage("Slack credentials saved successfully!")
      setTimeout(() => setSavedMessage(null), 3000)
      // Trigger Step 2 after credentials saved
      setShowStep2(true)
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
    },
  })

  // Scroll Step 2 card into view when it appears
  useEffect(() => {
    if (showStep2 && step2Ref.current) {
      setTimeout(() => step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
    }
  }, [showStep2])

  const toggleMutation = trpc.slack.toggleSocketMode.useMutation({
    onSuccess: (data) => {
      utils.slack.hasCredentials.invalidate()
      setSavedMessage(data.isEnabled ? "Socket Mode enabled" : "Socket Mode disabled")
      setTimeout(() => setSavedMessage(null), 3000)
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
      setTimeout(() => setSavedMessage(null), 3000)
    },
  })

  const clearMutation = trpc.slack.clearCredentials.useMutation({
    onSuccess: () => {
      utils.slack.hasCredentials.invalidate()
      setSavedMessage("Slack credentials cleared.")
      setTimeout(() => setSavedMessage(null), 3000)
    },
  })

  const setupMutation = trpc.slack.setupChannelClaw.useMutation({
    onSuccess: (data) => {
      utils.slack.listSlackClaws.invalidate()
      utils.slack.hasCredentials.invalidate()
      refetchBotChannels()
      setSetupResult({ channelName: data.channelName, clawName: `Slack: #${data.channelName}` })
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
      setTimeout(() => setSavedMessage(null), 8000)
    },
  })

  const handleSave = () => {
    if (!appToken.trim() || !botToken.trim()) return
    saveMutation.mutate({ appToken: appToken.trim(), botToken: botToken.trim() })
  }

  const handleToggle = (enabled: boolean) => {
    toggleMutation.mutate({ enabled })
  }

  const handleClear = () => {
    if (confirm("Are you sure you want to remove your Slack credentials?")) {
      clearMutation.mutate()
    }
  }

  const handleTest = () => {
    testConnection()
  }

  const connectMutation = trpc.claws.create.useMutation({
    onSuccess: () => {
      utils.slack.listSlackClaws.invalidate()
      utils.claws.getAll.invalidate()
      const ch = botChannels?.find(c => c.id === selectedExistingChannel)
      setSetupResult({ channelName: ch?.name ?? selectedExistingChannel, clawName: `Slack: #${ch?.name ?? selectedExistingChannel}` })
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
      setTimeout(() => setSavedMessage(null), 8000)
    },
  })

  const handleSetup = () => {
    const project = projects?.find(p => p.path === selectedProjectPath)
    if (!selectedProjectPath || !project) return
    setSetupResult(null)

    if (channelSetupMode === "create") {
      if (!channelName.trim()) return
      setupMutation.mutate({
        channelName: channelName.trim(),
        projectPath: selectedProjectPath,
        projectName: project.name,
      })
    } else {
      // Connect to existing channel — create claw directly
      if (!selectedExistingChannel) return
      const ch = botChannels?.find(c => c.id === selectedExistingChannel)
      const chName = ch?.name ?? selectedExistingChannel
      connectMutation.mutate({
        name: `Slack: #${chName}`,
        instruction: `You are a helpful AI assistant responding to messages in the #${chName} Slack channel. Help users with their questions and tasks related to the project at ${selectedProjectPath}.`,
        targetWorktree: selectedProjectPath,
        triggerType: "slack_mention",
        triggerConfig: { slackChannelFilter: selectedExistingChannel },
        allowedDirectories: [],
        allowedMcpServers: [],
      })
    }
  }

  const hasTokens = credentials?.hasAppToken && credentials?.hasBotToken
  const cleanChannelName = channelName.toLowerCase().replace(/^#/, "").replace(/\s+/g, "-")
  const isPending = setupMutation.isPending || connectMutation.isPending
  const canSetup = !!selectedProjectPath && !isPending && (
    channelSetupMode === "create" ? !!cleanChannelName : !!selectedExistingChannel
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Slack className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Slack Integration</h2>
          <p className="text-sm text-muted-foreground">
            Connect Claw to Slack via Socket Mode for real-time agent triggers
          </p>
        </div>
      </div>

      {/* Status Alert */}
      {savedMessage && (
        <Alert className={savedMessage.startsWith("Error") ? "destructive" : "default"}>
          <AlertDescription className="flex items-center gap-2">
            {!savedMessage.startsWith("Error") && <Check className="h-4 w-4 text-green-500" />}
            {savedMessage.startsWith("Error") && <AlertCircle className="h-4 w-4" />}
            {savedMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Slack App Credentials</CardTitle>
          <CardDescription>
            Your tokens are encrypted and stored securely using Electron&apos;s safeStorage.
            Create a Slack app with Socket Mode enabled to get these tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <span className="text-sm font-medium">Token Status</span>
            {isLoadingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : hasTokens ? (
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Configured
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not configured</span>
            )}
          </div>

          {/* Token Inputs */}
          {!hasTokens ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slack-app-token">App Token (xapp-...)</Label>
                <div className="relative">
                  <Input
                    id="slack-app-token"
                    type={showAppToken ? "text" : "password"}
                    placeholder="xapp-1-..."
                    value={appToken}
                    onChange={(e) => setAppToken(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppToken(!showAppToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showAppToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slack-bot-token">Bot Token (xoxb-...)</Label>
                <div className="relative">
                  <Input
                    id="slack-bot-token"
                    type={showBotToken ? "text" : "password"}
                    placeholder="xoxb-..."
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={!appToken.trim().startsWith("xapp-") || !botToken.trim().startsWith("xoxb-") || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Tokens
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Socket Mode Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2">
                  <Power className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Socket Mode</span>
                </div>
                <Switch
                  checked={credentials?.isEnabled ?? false}
                  onCheckedChange={handleToggle}
                  disabled={toggleMutation.isPending}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={isTesting}
                >
                  {isTesting && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                  Test Connection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  disabled={clearMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {clearMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                  )}
                  Clear Tokens
                </Button>
              </div>

              {/* Test Result */}
              {testResult && !isTesting && (
                <div className={cn(
                  "mt-4 p-3 rounded-md text-sm",
                  testResult.success
                    ? "bg-green-500/10 text-green-700 border border-green-500/20"
                    : "bg-red-500/10 text-red-700 border border-red-500/20"
                )}>
                  {testResult.success ? (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      <span>Connected to Slack workspace: <strong>{testResult.team}</strong></span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>{testResult.error || "Connection failed"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Connect a Channel — shown when tokens are configured OR after fresh save */}
      {(hasTokens || showStep2) && (
        <Card ref={step2Ref} className={cn(showStep2 && !hasTokens ? "border-primary/50 ring-1 ring-primary/20" : "")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">2</span>
              Connect a Channel
              {!hasTokens && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">Step required to receive messages</span>
              )}
            </CardTitle>
            <CardDescription>
              Pick an existing Slack channel the bot is already in, or create a new one.
              Each channel needs a dedicated Claw to respond to messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupResult ? (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md space-y-1">
                <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                  <Check className="h-4 w-4" />
                  Channel connected!
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-foreground">#{setupResult.channelName}</span> is set up and the claw{" "}
                  <span className="font-medium text-foreground">{setupResult.clawName}</span> will respond to messages there.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => { setSetupResult(null); setSelectedExistingChannel(""); setChannelName("claw-agent") }}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Connect another
                  </Button>
                  {showStep2 && (
                    <Button variant="ghost" size="sm" onClick={() => setShowStep2(false)}>
                      Done
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Mode tabs */}
                <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
                  <button
                    type="button"
                    onClick={() => setChannelSetupMode("select")}
                    className={cn(
                      "px-3 py-1 text-sm rounded transition-colors",
                      channelSetupMode === "select" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Use existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelSetupMode("create")}
                    className={cn(
                      "px-3 py-1 text-sm rounded transition-colors",
                      channelSetupMode === "create" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Create new
                  </button>
                </div>

                {channelSetupMode === "select" ? (
                  <div className="space-y-1.5">
                    <Label>Channel (bot must already be a member)</Label>
                    <Select value={selectedExistingChannel} onValueChange={setSelectedExistingChannel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a channel..." />
                      </SelectTrigger>
                      <SelectContent>
                        {botChannels?.map(ch => (
                          <SelectItem key={ch.id} value={ch.id}>
                            #{ch.name}
                          </SelectItem>
                        ))}
                        {!botChannels?.length && (
                          <SelectItem value="__none__" disabled>
                            No channels found — invite the bot to a channel first
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="channel-name">New channel name</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="channel-name"
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value)}
                        className="pl-8"
                        placeholder="claw-agent"
                      />
                    </div>
                    {cleanChannelName && cleanChannelName !== channelName && (
                      <p className="text-xs text-muted-foreground">Will be created as <code>#{cleanChannelName}</code></p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Requires <code className="bg-muted px-1 py-0.5 rounded">channels:manage</code> scope.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="project-select">Project (claw will work in this directory)</Label>
                  <Select value={selectedProjectPath} onValueChange={setSelectedProjectPath}>
                    <SelectTrigger id="project-select">
                      <SelectValue placeholder="Select a project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map(p => (
                        <SelectItem key={p.id} value={p.path}>
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground truncate">{p.path}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSetup} disabled={!canSetup} className="flex-1">
                    {isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-2" />
                    )}
                    {isPending
                      ? channelSetupMode === "create" ? "Creating..." : "Connecting..."
                      : channelSetupMode === "create" ? "Create Channel & Claw" : "Connect Channel"
                    }
                  </Button>
                  {showStep2 && !hasTokens && (
                    <Button variant="ghost" size="sm" onClick={() => setShowStep2(false)}>
                      Skip for now
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Slack Claws */}
      {hasTokens && slackClaws && slackClaws.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Slack Claws</CardTitle>
            <CardDescription>Claws currently configured to respond to Slack messages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {slackClaws.map(claw => (
                <div key={claw.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-md">
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{claw.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {claw.channelFilter && (
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {claw.channelFilter}
                      </code>
                    )}
                    <span className={cn(
                      "text-xs font-medium",
                      claw.isEnabled ? "text-green-600" : "text-muted-foreground"
                    )}>
                      {claw.isEnabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
          <CardDescription>
            How to create a Slack app with Socket Mode
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm list-decimal list-inside">
            <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">api.slack.com/apps</a></li>
            <li>Click &quot;Create New App&quot; &rarr; &quot;From scratch&quot;</li>
            <li>Enable <strong>Socket Mode</strong> in Settings &rarr; Socket Mode</li>
            <li>Generate an <strong>App-Level Token</strong> with <code>connections:write</code> scope</li>
            <li>Go to OAuth &amp; Permissions and add scopes: <code>chat:write</code>, <code>app_mentions:read</code>, <code>im:read</code>, <code>im:write</code>, <code>channels:manage</code>, <code>channels:read</code></li>
            <li>Install the app to your workspace and copy the <strong>Bot User OAuth Token</strong></li>
            <li>Subscribe to events: <code>app_mention</code> and <code>message.im</code></li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
