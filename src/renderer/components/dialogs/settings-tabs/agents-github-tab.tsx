"use client"

import React, { useState } from "react"
import { Github, Check, AlertCircle, Eye, EyeOff, Trash2, Loader2, Save } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
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

export function AgentsGitHubTab() {
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const { data: tokenStatus, isLoading: isLoadingStatus } = trpc.github.hasToken.useQuery()
  const { data: testResult, isLoading: isTesting, refetch: testToken } = trpc.github.testToken.useQuery(
    undefined,
    { enabled: false }
  )

  const saveMutation = trpc.github.saveToken.useMutation({
    onSuccess: () => {
      utils.github.hasToken.invalidate()
      setToken("")
      setSavedMessage("Token saved successfully!")
      setTimeout(() => setSavedMessage(null), 3000)
    },
    onError: (error) => {
      setSavedMessage(`Error: ${error.message}`)
    },
  })

  const clearMutation = trpc.github.clearToken.useMutation({
    onSuccess: () => {
      utils.github.hasToken.invalidate()
      setSavedMessage("Token cleared.")
      setTimeout(() => setSavedMessage(null), 3000)
    },
  })

  const handleSave = () => {
    if (!token.trim()) return
    saveMutation.mutate({ token: token.trim() })
  }

  const handleClear = () => {
    if (confirm("Are you sure you want to remove your GitHub token?")) {
      clearMutation.mutate()
    }
  }

  const handleTest = () => {
    testToken()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Github className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">GitHub Integration</h2>
          <p className="text-sm text-muted-foreground">
            Configure your GitHub Personal Access Token for Claws integration
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

      {/* Token Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Access Token</CardTitle>
          <CardDescription>
            Your token is encrypted and stored securely using Electron&apos;s safeStorage.
            It is only used for GitHub API operations like polling for issues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <span className="text-sm font-medium">Token Status</span>
            {isLoadingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : tokenStatus?.hasToken ? (
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Configured
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not configured</span>
            )}
          </div>

          {/* Token Input */}
          <div className="space-y-2">
            <Label htmlFor="github-token">Fine-Grained Personal Access Token</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="github-token"
                  type={showToken ? "text" : "password"}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button
                onClick={handleSave}
                disabled={!token.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create a token at{" "}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                github.com/settings/tokens
              </a>
              . Required scopes: repo (for private repos), read:org (for organization repos).
            </p>
          </div>

          {/* Actions */}
          {tokenStatus?.hasToken && (
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
          )}

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
                    Connected as <strong>{testResult.user?.login}</strong>
                    {testResult.user?.name && ` (${testResult.user.name})`}
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
        </CardContent>
      </Card>

      {/* Usage Info */}
      <Card>
        <CardHeader>
          <CardTitle>Token Usage</CardTitle>
          <CardDescription>
            Your GitHub token is used for the following features:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Polling for issues with specific labels (Claws GitHub trigger)</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Creating comments on issues and PRs</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Fetching repository information</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
