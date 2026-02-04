"use client"

import { useEffect, useCallback } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Cloud, RefreshCw, Clock, AlertTriangle, Server, Shield } from "lucide-react"
import { trpc } from "../lib/trpc"
import { cn } from "../lib/utils"
import { toast } from "sonner"
import {
  clustersFeatureEnabledAtom,
  clustersDefaultNamespaceAtom,
  agentsSettingsDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
} from "../lib/atoms"
import {
  selectedClusterIdAtom,
  selectedClustersCategoryAtom,
  selectedNamespaceAtom,
  defaultClusterIdAtom,
} from "../features/clusters/atoms"

/**
 * Format time remaining until expiration
 */
function formatTimeRemaining(expiresAt: string): {
  text: string
  isExpiringSoon: boolean
  isExpired: boolean
} {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()

  if (diffMs < 0) {
    return { text: "Expired", isExpiringSoon: true, isExpired: true }
  }

  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)

  // Consider "expiring soon" if less than 10 minutes remaining
  const isExpiringSoon = diffMinutes < 10

  if (diffMinutes < 1) {
    return { text: "<1 min", isExpiringSoon, isExpired: false }
  }

  if (diffMinutes < 60) {
    return { text: `${diffMinutes} min`, isExpiringSoon, isExpired: false }
  }

  if (diffHours < 24) {
    const remainingMins = diffMinutes % 60
    return {
      text: remainingMins > 0 ? `${diffHours}h ${remainingMins}m` : `${diffHours}h`,
      isExpiringSoon,
      isExpired: false,
    }
  }

  const diffDays = Math.floor(diffHours / 24)
  return { text: `${diffDays}d`, isExpiringSoon, isExpired: false }
}

/**
 * AWS Status Bar Component
 *
 * Displays at the bottom of the app when authenticated with AWS,
 * showing account, role, and token expiration status.
 * Automatically refreshes credentials before expiration.
 */
export function AwsStatusBar() {
  // Clusters state
  const clustersEnabled = useAtomValue(clustersFeatureEnabledAtom)
  const selectedClusterId = useAtomValue(selectedClusterIdAtom)
  const defaultClusterId = useAtomValue(defaultClusterIdAtom)
  const selectedNamespace = useAtomValue(selectedNamespaceAtom)
  const defaultNamespaceOverride = useAtomValue(clustersDefaultNamespaceAtom)
  const [, setSelectedClustersCategory] = useAtom(selectedClustersCategoryAtom)

  // Use default cluster for status bar if set, otherwise use selected
  const displayClusterId = defaultClusterId || selectedClusterId

  // Settings dialog atoms for opening auth settings
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  // Open auth settings
  const openAuthSettings = useCallback(() => {
    setSettingsTab("claude-code")
    setSettingsOpen(true)
  }, [setSettingsTab, setSettingsOpen])

  // Query AWS status
  const { data: awsStatus, refetch: refetchStatus } = trpc.awsSso.getStatus.useQuery(undefined, {
    refetchInterval: 60000, // Update every minute
  })

  // Query VPN status (runs independently - backend checks if enabled)
  const { data: vpnStatus } = trpc.awsSso.checkVpnStatus.useQuery(undefined, {
    refetchInterval: 60000, // Check every minute
  })

  // Query derived namespace from email
  const { data: derivedNamespace } = trpc.clusters.getDefaultNamespace.useQuery(undefined, {
    enabled: clustersEnabled,
  })

  // Query cluster connection status
  const { data: clusterStatus } = trpc.clusters.getStatus.useQuery(
    { clusterName: displayClusterId! },
    {
      enabled: clustersEnabled && !!displayClusterId,
      refetchInterval: 60000, // Check connection every minute
    }
  )

  // Effective namespace
  const effectiveNamespace =
    selectedNamespace || defaultNamespaceOverride || derivedNamespace || "default"

  // Refresh credentials mutation
  const refreshMutation = trpc.awsSso.refreshCredentials.useMutation({
    onSuccess: () => {
      refetchStatus()
    },
    onError: (error) => {
      toast.error(`Failed to refresh credentials: ${error.message}`)
    },
  })

  // Auto-refresh credentials when expiring soon
  const checkAndRefresh = useCallback(async () => {
    if (!awsStatus?.credentialsExpiresAt || !awsStatus?.hasCredentials) return

    const expiresAt = new Date(awsStatus.credentialsExpiresAt)
    const now = new Date()
    const minutesRemaining = (expiresAt.getTime() - now.getTime()) / 1000 / 60

    // Refresh when 5 minutes remaining
    if (minutesRemaining < 5 && minutesRemaining > 0) {
      console.log("[aws-status] Auto-refreshing credentials, minutes remaining:", minutesRemaining)
      try {
        await refreshMutation.mutateAsync()
        toast.success("AWS credentials auto-refreshed")
      } catch (error) {
        // Error already handled by mutation
      }
    }
  }, [awsStatus, refreshMutation])

  // Check for refresh every minute
  useEffect(() => {
    if (!awsStatus?.hasCredentials) return

    const interval = setInterval(checkAndRefresh, 60000)
    return () => clearInterval(interval)
  }, [awsStatus, checkAndRefresh])

  // Don't show if not using AWS auth mode or not configured
  // Show even if credentials expired so user can refresh
  if (!awsStatus?.authMode || awsStatus.authMode !== "aws" || !awsStatus?.configured) {
    return null
  }

  const credentialsExpiry = awsStatus.credentialsExpiresAt
    ? formatTimeRemaining(awsStatus.credentialsExpiresAt)
    : null

  const tokenExpiry = awsStatus.tokenExpiresAt
    ? formatTimeRemaining(awsStatus.tokenExpiresAt)
    : null

  const handleRefresh = async () => {
    try {
      await refreshMutation.mutateAsync()
      toast.success("Credentials refreshed")
    } catch (error) {
      // Error already handled by mutation
    }
  }

  return (
    <div className="h-6 bg-muted/50 border-t border-border flex items-center px-3 text-xs text-muted-foreground flex-shrink-0">
      <div className="flex items-center gap-4 flex-1">
        {/* AWS Icon */}
        <div className="flex items-center gap-1.5">
          <Cloud className="h-3 w-3" />
          <span className="font-medium">AWS</span>
        </div>

        {/* Account - show if available, otherwise show "Not authenticated" */}
        {awsStatus.accountName || awsStatus.accountId ? (
          <button
            onClick={openAuthSettings}
            className="flex items-center gap-1 hover:bg-muted/50 px-1.5 py-0.5 rounded transition-colors"
            title="Click to open authentication settings"
          >
            <span className="font-semibold text-muted-foreground/70">Account:</span>
            <span className="font-mono text-primary">
              {awsStatus.accountName || awsStatus.accountId}
            </span>
          </button>
        ) : (
          <button
            onClick={openAuthSettings}
            className="flex items-center gap-1 hover:bg-muted/50 px-1.5 py-0.5 rounded transition-colors"
            title="Click to open authentication settings"
          >
            <span className="font-semibold text-muted-foreground/70">Status:</span>
            <span className="text-destructive">Not authenticated</span>
          </button>
        )}

        {/* Role */}
        {awsStatus.roleName && (
          <button
            onClick={openAuthSettings}
            className="flex items-center gap-1 hover:bg-muted/50 px-1.5 py-0.5 rounded transition-colors"
            title="Click to open authentication settings"
          >
            <span className="font-semibold text-muted-foreground/70">Role:</span>
            <span className="font-mono text-primary">{awsStatus.roleName}</span>
          </button>
        )}

        {/* Token Expiry */}
        {credentialsExpiry && (
          <button
            onClick={openAuthSettings}
            className={cn(
              "flex items-center gap-1 hover:bg-muted/50 px-1.5 py-0.5 rounded transition-colors",
              !credentialsExpiry.isExpiringSoon && !credentialsExpiry.isExpired && "text-emerald-600 dark:text-emerald-500",
              credentialsExpiry.isExpiringSoon && "text-amber-600 dark:text-amber-500",
              credentialsExpiry.isExpired && "text-destructive"
            )}
            title="Click to open authentication settings"
          >
            {credentialsExpiry.isExpiringSoon ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            <span className="font-semibold text-muted-foreground/70">Token:</span>
            <span>{credentialsExpiry.text}</span>
          </button>
        )}

        {/* Refresh Button - right after token */}
        {credentialsExpiry && (
          <button
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors",
              refreshMutation.isPending && "opacity-50 cursor-not-allowed"
            )}
            title="Refresh credentials"
          >
            <RefreshCw
              className={cn(
                "h-3 w-3",
                refreshMutation.isPending && "animate-spin"
              )}
            />
          </button>
        )}
      </div>

      {/* VPN Status Indicator */}
      {vpnStatus?.enabled && (
        <button
          onClick={openAuthSettings}
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded mr-2 hover:bg-muted/50 transition-colors",
            vpnStatus.connected ? "text-muted-foreground" : "text-destructive"
          )}
          title={
            vpnStatus.connected
              ? "VPN Connected - Click to open authentication settings"
              : "VPN Disconnected - Click to open authentication settings"
          }
        >
          {/* Connection status dot */}
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              vpnStatus.connected ? "bg-emerald-500" : "bg-destructive"
            )}
          />
          <Shield className="h-3 w-3" />
          <span className="text-xs font-semibold">VPN</span>
        </button>
      )}

      {/* K8s Cluster Indicator (right side) */}
      {clustersEnabled && displayClusterId && (
        <button
          onClick={() => setSelectedClustersCategory("clusters")}
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-muted transition-colors mr-2",
            !clusterStatus?.connected && "text-destructive"
          )}
          title={`Cluster: ${displayClusterId}\nNamespace: ${effectiveNamespace}\nClick to open clusters panel`}
        >
          {/* Connection status dot */}
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              clusterStatus?.connected ? "bg-emerald-500" : "bg-destructive"
            )}
          />
          <Server className="h-3 w-3" />
          <span className="font-mono text-xs text-primary">
            {displayClusterId.length > 20
              ? `${displayClusterId.slice(0, 20)}...`
              : displayClusterId}
          </span>
          <span className="text-muted-foreground/70 font-semibold">/</span>
          <span className="font-mono text-xs text-primary">{effectiveNamespace}</span>
        </button>
      )}
    </div>
  )
}
