"use client"

import React, { useState } from "react"
import { Slack, Check, AlertCircle, Eye, EyeOff, Trash2, Loader2, Save, Power } from "lucide-react"
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

export function AgentsSlackTab() {
  const [appToken, setAppToken] = useState("")
  const [botToken, setBotToken] = useState("")
  const [showAppToken, setShowAppToken] = useState(false)
  const [showBotToken, setShowBotToken] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const { data: credentials, isLoading: isLoadingStatus } = trpc.slack.hasCredentials.useQuery()
  const { data: testResult, isLoading: isTesting, refetch: testConnection } = trpc.slack.testConnection.useQuery(
    undefined,
    { enabled: false }
  )

  const saveMutation = trpc.slack.saveCredentials.useMutation({
    onSuccess: () => {
      utils.slack.hasCredentials.invalidate()
      setAppToken("")
      setBotToken("")
      setSavedMessage("Slack credentials saved successfully!")
      setTimeout(() => setSavedMessage(null), 3000)
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
    },
  })

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

  const hasTokens = credentials?.hasAppToken && credentials?.hasBotToken

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
                    {showAppToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
                    {showBotToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
                      <span>
                        Connected to Slack workspace: <strong>{testResult.team}</strong>
                      </span>
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
            <li>Generate an <strong>App-Level Token</strong> with connections:write scope</li>
            <li>Go to OAuth &amp; Permissions and add scopes: <code>chat:write</code>, <code>app_mentions:read</code>, <code>im:read</code>, <code>im:write</code></li>
            <li>Install the app to your workspace and copy the <strong>Bot User OAuth Token</strong></li>
            <li>Subscribe to events: <code>app_mention</code> and <code>message.im</code></li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
