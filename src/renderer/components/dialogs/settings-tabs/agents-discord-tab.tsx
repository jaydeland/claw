"use client"

import React, { useState, useRef, useEffect } from "react"
import { Check, AlertCircle, Eye, EyeOff, Trash2, Loader2, Save, Power, Hash, Plus, ChevronRight } from "lucide-react"
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

// Simple Discord icon (inline SVG to avoid external dependency)
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

export function AgentsDiscordTab() {
  const [botToken, setBotToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [showStep2, setShowStep2] = useState(false)

  // Channel setup state
  const [channelName, setChannelName] = useState("claw-agent")
  const [selectedGuildId, setSelectedGuildId] = useState("")
  const [selectedProjectPath, setSelectedProjectPath] = useState("")
  const [setupResult, setSetupResult] = useState<{ channelName: string; clawName: string } | null>(null)

  const step2Ref = useRef<HTMLDivElement>(null)
  const utils = trpc.useUtils()

  const { data: credentials, isLoading: isLoadingStatus } = trpc.discord.hasCredentials.useQuery()
  const { data: testResult, isLoading: isTesting, refetch: testConnection } = trpc.discord.testConnection.useQuery(
    undefined,
    { enabled: false }
  )
  const { data: statusData } = trpc.discord.getStatus.useQuery(undefined, {
    enabled: !!credentials?.hasBotToken,
    refetchInterval: 5000,
  })
  const { data: discordClaws } = trpc.discord.listDiscordClaws.useQuery(undefined, { enabled: !!credentials?.hasBotToken })
  const { data: guilds, isLoading: isLoadingGuilds } = trpc.discord.listGuilds.useQuery(undefined, {
    enabled: !!credentials?.hasBotToken && !!statusData?.isActive,
  })
  const { data: channels, isLoading: isLoadingChannels } = trpc.discord.listChannels.useQuery(
    { guildId: selectedGuildId || credentials?.guildId || "" },
    { enabled: !!(selectedGuildId || credentials?.guildId) && !!statusData?.isActive }
  )
  const { data: projects } = trpc.projects.list.useQuery(undefined, { enabled: !!credentials?.hasBotToken })

  // Set selected guild from settings
  useEffect(() => {
    if (credentials?.guildId && !selectedGuildId) {
      setSelectedGuildId(credentials.guildId)
    }
  }, [credentials?.guildId, selectedGuildId])

  const saveMutation = trpc.discord.saveCredentials.useMutation({
    onSuccess: () => {
      utils.discord.hasCredentials.invalidate()
      setBotToken("")
      setSavedMessage("Discord bot token saved successfully!")
      setTimeout(() => setSavedMessage(null), 3000)
      setShowStep2(true)
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
    },
  })

  useEffect(() => {
    if (showStep2 && step2Ref.current) {
      setTimeout(() => step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
    }
  }, [showStep2])

  const connectMutation = trpc.discord.connect.useMutation({
    onSuccess: () => {
      utils.discord.hasCredentials.invalidate()
      utils.discord.getStatus.invalidate()
      setSavedMessage("Discord bot connected!")
      setTimeout(() => setSavedMessage(null), 3000)
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
      setTimeout(() => setSavedMessage(null), 5000)
    },
  })

  const disconnectMutation = trpc.discord.disconnect.useMutation({
    onSuccess: () => {
      utils.discord.hasCredentials.invalidate()
      utils.discord.getStatus.invalidate()
      setSavedMessage("Discord bot disconnected")
      setTimeout(() => setSavedMessage(null), 3000)
    },
  })

  const clearMutation = trpc.discord.clearCredentials.useMutation({
    onSuccess: () => {
      utils.discord.hasCredentials.invalidate()
      utils.discord.getStatus.invalidate()
      setSavedMessage("Discord credentials cleared.")
      setTimeout(() => setSavedMessage(null), 3000)
    },
  })

  const selectGuildMutation = trpc.discord.selectGuild.useMutation({
    onSuccess: () => {
      utils.discord.hasCredentials.invalidate()
    },
  })

  const setupMutation = trpc.discord.setupChannelClaw.useMutation({
    onSuccess: (data) => {
      utils.discord.listDiscordClaws.invalidate()
      utils.discord.hasCredentials.invalidate()
      setSetupResult({ channelName: data.channelName, clawName: `Discord: #${data.channelName}` })
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
      setTimeout(() => setSavedMessage(null), 8000)
    },
  })

  const handleSave = () => {
    if (!botToken.trim()) return
    saveMutation.mutate({ botToken: botToken.trim() })
  }

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      connectMutation.mutate()
    } else {
      disconnectMutation.mutate()
    }
  }

  const handleClear = () => {
    if (confirm("Are you sure you want to remove your Discord credentials?")) {
      clearMutation.mutate()
    }
  }

  const handleTest = () => {
    testConnection()
  }

  const handleGuildSelect = (guildId: string) => {
    setSelectedGuildId(guildId)
    const guild = guilds?.find(g => g.id === guildId)
    if (guild) {
      selectGuildMutation.mutate({ guildId, guildName: guild.name })
    }
  }

  const handleSetup = () => {
    const project = projects?.find(p => p.path === selectedProjectPath)
    const guildId = selectedGuildId || credentials?.guildId
    if (!selectedProjectPath || !project || !guildId) return
    setSetupResult(null)

    setupMutation.mutate({
      guildId,
      channelName: channelName.trim(),
      projectPath: selectedProjectPath,
      projectName: project.name,
    })
  }

  const hasToken = credentials?.hasBotToken
  const isConnected = statusData?.isActive ?? false
  const cleanChannelName = channelName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
  const canSetup = !!selectedProjectPath && !setupMutation.isPending && !!cleanChannelName && !!(selectedGuildId || credentials?.guildId)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <DiscordIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Discord Integration</h2>
          <p className="text-sm text-muted-foreground">
            Connect Claw to Discord via a bot for real-time agent triggers
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
          <CardTitle>Bot Token</CardTitle>
          <CardDescription>
            Your token is encrypted and stored securely using Electron&apos;s safeStorage.
            Create a Discord bot at the Developer Portal to get a token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <span className="text-sm font-medium">Token Status</span>
            {isLoadingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : hasToken ? (
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Configured
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not configured</span>
            )}
          </div>

          {/* Token Input */}
          {!hasToken ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="discord-bot-token">Bot Token</Label>
                <div className="relative">
                  <Input
                    id="discord-bot-token"
                    type={showToken ? "text" : "password"}
                    placeholder="Your Discord bot token..."
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={!botToken.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Token
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bot Connection Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2">
                  <Power className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Bot Connection</span>
                  {isConnected && (
                    <span className="text-xs text-green-600">Connected</span>
                  )}
                </div>
                <Switch
                  checked={isConnected}
                  onCheckedChange={handleToggle}
                  disabled={connectMutation.isPending || disconnectMutation.isPending}
                />
              </div>

              {/* Guild Selector */}
              {isConnected && guilds && guilds.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Server</Label>
                  <Select value={selectedGuildId || credentials?.guildId || ""} onValueChange={handleGuildSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a server..." />
                    </SelectTrigger>
                    <SelectContent>
                      {guilds.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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
                  Clear Token
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
                      <span>Connected as <strong>{testResult.username}</strong> ({testResult.guildCount} server{testResult.guildCount !== 1 ? "s" : ""})</span>
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

      {/* Step 2: Create a Channel */}
      {(hasToken || showStep2) && (
        <Card ref={step2Ref} className={cn(showStep2 && !hasToken ? "border-primary/50 ring-1 ring-primary/20" : "")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">2</span>
              Create a Channel
            </CardTitle>
            <CardDescription>
              Create a new text channel in your Discord server. A dedicated Claw will be created to respond to messages there.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupResult ? (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md space-y-1">
                <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                  <Check className="h-4 w-4" />
                  Channel created!
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-foreground">#{setupResult.channelName}</span> is set up and the claw{" "}
                  <span className="font-medium text-foreground">{setupResult.clawName}</span> will respond to messages there.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => { setSetupResult(null); setChannelName("claw-agent") }}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create another
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
                <div className="space-y-1.5">
                  <Label htmlFor="discord-channel-name">Channel name</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="discord-channel-name"
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      className="pl-8"
                      placeholder="claw-agent"
                    />
                  </div>
                  {cleanChannelName && cleanChannelName !== channelName && (
                    <p className="text-xs text-muted-foreground">Will be created as <code>#{cleanChannelName}</code></p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="discord-project-select">Project (claw will work in this directory)</Label>
                  <Select value={selectedProjectPath} onValueChange={setSelectedProjectPath}>
                    <SelectTrigger id="discord-project-select">
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
                    {setupMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-2" />
                    )}
                    {setupMutation.isPending ? "Creating..." : "Create Channel & Claw"}
                  </Button>
                  {showStep2 && !hasToken && (
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

      {/* Active Discord Claws */}
      {hasToken && discordClaws && discordClaws.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Discord Claws</CardTitle>
            <CardDescription>Claws currently configured to respond to Discord messages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {discordClaws.map(claw => (
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
            How to create a Discord bot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm list-decimal list-inside">
            <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Discord Developer Portal</a></li>
            <li>Click &quot;New Application&quot; and give it a name</li>
            <li>Go to <strong>Bot</strong> &rarr; Click &quot;Reset Token&quot; to generate a bot token</li>
            <li>Enable <strong>Message Content Intent</strong> under Privileged Gateway Intents</li>
            <li>Go to <strong>OAuth2</strong> &rarr; URL Generator, select <code>bot</code> scope</li>
            <li>Under Bot Permissions, select: <code>Send Messages</code>, <code>Read Message History</code>, <code>Manage Channels</code></li>
            <li>Copy the generated URL and open it to invite the bot to your server</li>
            <li>Paste the bot token above and click Save</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
