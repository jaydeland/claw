"use client"

import React, { useState, useEffect } from "react"
import { useAtom } from "jotai"
import {
  Key,
  Loader2,
  Trash2,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { mcpAuthModalOpenAtom, mcpAuthModalServerIdAtom } from "../atoms"
import { selectedProjectAtom } from "../../agents/atoms"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"

type OAuthStatus = "idle" | "in_progress" | "success" | "error"

// Default credential key for HTTP servers without pre-defined env vars
const DEFAULT_BEARER_TOKEN_KEY = "BEARER_TOKEN"

export function McpAuthModal() {
  const [isOpen, setIsOpen] = useAtom(mcpAuthModalOpenAtom)
  const [serverId, setServerId] = useAtom(mcpAuthModalServerIdAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const projectPath = selectedProject?.path
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>("idle")
  const [oauthError, setOAuthError] = useState<string | null>(null)

  const utils = trpc.useUtils()

  // Query server details
  const { data: server } = trpc.mcp.getServer.useQuery(
    { serverId: serverId!, projectPath: projectPath || undefined },
    { enabled: !!serverId && isOpen }
  )

  // Query auth type (OAuth vs API key) - for known providers
  const { data: authType, isLoading: isAuthTypeLoading } = trpc.mcp.getAuthType.useQuery(
    { serverId: serverId!, projectPath: projectPath || undefined },
    { enabled: !!serverId && isOpen }
  )

  // Discover OAuth metadata for HTTP servers (MCP OAuth 2.1)
  const { data: oauthDiscovery, isLoading: isDiscoveryLoading } = trpc.mcp.discoverOAuth.useQuery(
    { serverId: serverId!, projectPath: projectPath || undefined },
    { enabled: !!serverId && isOpen && (server?.config.type === "http" || server?.config.type === "sse") }
  )

  const saveMutation = trpc.mcp.saveCredentials.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      utils.mcp.getServer.invalidate({ serverId: serverId! })
      handleClose()
    },
  })

  const clearMutation = trpc.mcp.clearCredentials.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      utils.mcp.getServer.invalidate({ serverId: serverId! })
      handleClose()
    },
  })

  const oauthMutation = trpc.mcp.startOAuth.useMutation({
    onMutate: () => {
      setOAuthStatus("in_progress")
      setOAuthError(null)
    },
    onSuccess: (result) => {
      if (result.success && result.code) {
        setOAuthStatus("success")
        // Store the OAuth code as a credential
        if (serverId) {
          const oauthCredentials: Record<string, string> = {}
          // Find the appropriate credential key for OAuth token
          const tokenKey = server?.credentialEnvVars.find(
            (key) =>
              /TOKEN|CODE|ACCESS/i.test(key) || /OAUTH/i.test(key)
          )
          if (tokenKey) {
            oauthCredentials[tokenKey] = result.code
          } else {
            // Use default bearer token key for HTTP servers without pre-defined credentials
            oauthCredentials[DEFAULT_BEARER_TOKEN_KEY] = result.code
          }
          // Also store all returned params that might be credentials
          if (result.params) {
            for (const [key, value] of Object.entries(result.params)) {
              const matchingEnvVar = server?.credentialEnvVars.find(
                (envVar) => envVar.toLowerCase().includes(key.toLowerCase())
              )
              if (matchingEnvVar) {
                oauthCredentials[matchingEnvVar] = value
              }
            }
          }
          if (Object.keys(oauthCredentials).length > 0) {
            saveMutation.mutate({ serverId, credentials: oauthCredentials })
          }
        }
      } else if (result.cancelled) {
        setOAuthStatus("idle")
      } else {
        setOAuthStatus("error")
        setOAuthError(result.error || "Authentication failed")
      }
    },
    onError: (error) => {
      setOAuthStatus("error")
      setOAuthError(error.message)
    },
  })

  const cancelOAuthMutation = trpc.mcp.cancelOAuth.useMutation()

  // MCP OAuth 2.1 mutation (for HTTP servers with OAuth discovery)
  const mcpOAuthMutation = trpc.mcp.startMcpOAuth.useMutation({
    onMutate: () => {
      setOAuthStatus("in_progress")
      setOAuthError(null)
    },
    onSuccess: (result) => {
      if (result.success) {
        setOAuthStatus("success")
        // Invalidate queries to refresh auth status
        utils.mcp.listServers.invalidate()
        utils.mcp.getServer.invalidate({ serverId: serverId! })
        // Close modal after a brief delay
        setTimeout(() => handleClose(), 1500)
      } else {
        setOAuthStatus("error")
        setOAuthError(result.error || "Authentication failed")
      }
    },
    onError: (error) => {
      setOAuthStatus("error")
      setOAuthError(error.message)
    },
  })

  // Check if this is an HTTP server (may need generic bearer token)
  const isHttpServer = server?.config.type === "http" || server?.config.type === "sse"
  const hasCredentialVars = server?.credentialEnvVars && server.credentialEnvVars.length > 0

  // Initialize credentials state when server changes
  useEffect(() => {
    const initial: Record<string, string> = {}

    // Add pre-defined credential vars
    if (server?.credentialEnvVars) {
      for (const key of server.credentialEnvVars) {
        initial[key] = ""
      }
    }

    // For HTTP servers without credentials, add a default bearer token field
    if (isHttpServer && !hasCredentialVars) {
      initial[DEFAULT_BEARER_TOKEN_KEY] = ""
    }

    setCredentials(initial)
  }, [server?.credentialEnvVars, isHttpServer, hasCredentialVars])

  // Reset OAuth status when modal opens
  useEffect(() => {
    if (isOpen) {
      setOAuthStatus("idle")
      setOAuthError(null)
    }
  }, [isOpen])

  const handleClose = () => {
    // Cancel any in-progress OAuth flow
    if (oauthStatus === "in_progress" && serverId) {
      cancelOAuthMutation.mutate({ serverId })
    }
    setIsOpen(false)
    setServerId(null)
    setCredentials({})
    setOAuthStatus("idle")
    setOAuthError(null)
  }

  const handleSave = () => {
    if (serverId) {
      saveMutation.mutate({ serverId, credentials })
    }
  }

  const handleClear = () => {
    if (serverId) {
      clearMutation.mutate({ serverId })
    }
  }

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }))
  }

  const handleStartOAuth = () => {
    if (!serverId) return

    // Use MCP OAuth 2.1 flow if discovery is available
    if (oauthDiscovery?.supported) {
      mcpOAuthMutation.mutate({
        serverId,
        projectPath: projectPath || undefined,
      })
      return
    }

    // Fall back to known provider OAuth flow
    if (authType?.authUrl) {
      oauthMutation.mutate({
        serverId,
        authUrl: authType.authUrl,
        callbackPattern: authType.callbackPattern,
        title: `Sign in to ${authType.providerName || server?.name}`,
      })
    }
  }

  // Start MCP OAuth flow for discovered servers
  const handleStartMcpOAuth = () => {
    if (!serverId) return
    mcpOAuthMutation.mutate({
      serverId,
      projectPath: projectPath || undefined,
    })
  }

  const hasAnyCredentials = Object.values(credentials).some((v) => v.trim())
  const isPending =
    saveMutation.isPending ||
    clearMutation.isPending ||
    oauthMutation.isPending ||
    mcpOAuthMutation.isPending

  // Check if this server supports OAuth (either via discovery or known provider)
  const hasMcpOAuth = oauthDiscovery?.supported === true
  const isKnownOAuth = authType?.type === "oauth" && !!authType?.authUrl
  const isOAuth = hasMcpOAuth || isKnownOAuth
  const hasOAuthUrl = hasMcpOAuth || !!authType?.authUrl

  // Get provider name for display
  const oauthProviderName = hasMcpOAuth
    ? (oauthDiscovery?.metadata?.issuer ? new URL(oauthDiscovery.metadata.issuer).hostname : server?.name)
    : authType?.providerName

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Configure {server?.name || "Server"} Authentication
          </DialogTitle>
          <DialogDescription>
            {isOAuth && hasOAuthUrl
              ? `Sign in with ${oauthProviderName || "your account"} to authorize this MCP server.`
              : "Enter the credentials required by this MCP server. These will be securely stored and used when the server starts."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {(isAuthTypeLoading || isDiscoveryLoading) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isOAuth && hasOAuthUrl ? (
            /* OAuth Flow UI */
            <div className="space-y-4">
              {/* OAuth Status Display */}
              {oauthStatus === "idle" && (
                <div className="text-center py-4">
                  <Button
                    onClick={handleStartOAuth}
                    disabled={isPending}
                    className="w-full"
                    size="lg"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Sign in with {oauthProviderName || server?.name}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">
                    A new window will open to complete authentication
                  </p>
                </div>
              )}

              {oauthStatus === "in_progress" && (
                <div className="text-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm font-medium">Waiting for authentication...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Complete the sign-in in the popup window
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (serverId) cancelOAuthMutation.mutate({ serverId })
                      setOAuthStatus("idle")
                    }}
                    className="mt-4"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {oauthStatus === "success" && (
                <div className="text-center py-6">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-green-600">
                    Authentication successful!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Credentials are being saved...
                  </p>
                </div>
              )}

              {oauthStatus === "error" && (
                <div className="text-center py-4">
                  <XCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-red-600">
                    Authentication failed
                  </p>
                  {oauthError && (
                    <p className="text-xs text-muted-foreground mt-1">{oauthError}</p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setOAuthStatus("idle")}
                    className="mt-4"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* Show credential inputs as fallback */}
              {oauthStatus === "idle" && server?.credentialEnvVars && server.credentialEnvVars.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <AlertTriangle className="h-4 w-4" />
                    Or enter credentials manually
                  </div>
                  {server.credentialEnvVars.map((key) => (
                    <div key={key} className="space-y-2 mb-3">
                      <Label htmlFor={key} className="text-sm font-medium">
                        {key}
                      </Label>
                      <Input
                        id={key}
                        type="password"
                        placeholder={`Enter ${key}`}
                        value={credentials[key] || ""}
                        onChange={(e) => handleCredentialChange(key, e.target.value)}
                        disabled={isPending}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* API Key Flow UI */
            <>
              {server?.credentialEnvVars.map((key) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key} className="text-sm font-medium">
                    {key}
                  </Label>
                  <Input
                    id={key}
                    type="password"
                    placeholder={`Enter ${key}`}
                    value={credentials[key] || ""}
                    onChange={(e) => handleCredentialChange(key, e.target.value)}
                    disabled={isPending}
                  />
                </div>
              ))}

              {server?.credentialEnvVars.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  This server has no credential requirements.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          {server?.authStatus === "configured" && (
            <Button
              variant="destructive"
              onClick={handleClear}
              disabled={isPending}
              className="mr-auto"
            >
              {clearMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Clear Credentials
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          {/* Only show save button for API key flow or manual entry */}
          {(!isOAuth || !hasOAuthUrl || oauthStatus === "idle") && (
            <Button
              onClick={handleSave}
              disabled={isPending || !hasAnyCredentials}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Key className="h-4 w-4 mr-2" />
              )}
              Save Credentials
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
