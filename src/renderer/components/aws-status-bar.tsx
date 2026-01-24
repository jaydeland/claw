"use client"

import { useEffect, useCallback } from "react"
import { useAtom, useAtomValue } from "jotai"
import { Cloud, RefreshCw, Clock, AlertTriangle, Server } from "lucide-react"
import { trpc } from "../lib/trpc"
import { cn } from "../lib/utils"
import { toast } from "sonner"
import { clustersFeatureEnabledAtom, clustersDefaultNamespaceAtom } from "../lib/atoms"
import {
  selectedClusterIdAtom,
  selectedClustersCategoryAtom,
  selectedNamespaceAtom,
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
  const selectedNamespace = useAtomValue(selectedNamespaceAtom)
  const defaultNamespaceOverride = useAtomValue(clustersDefaultNamespaceAtom)
  const [, setSelectedClustersCategory] = useAtom(selectedClustersCategoryAtom)

  // Query AWS status
  const { data: awsStatus, refetch: refetchStatus } = trpc.awsSso.getStatus.useQuery(undefined, {
    refetchInterval: 60000, // Update every minute
  })

  // Query derived namespace from email
  const { data: derivedNamespace } = trpc.clusters.getDefaultNamespace.useQuery(undefined, {
    enabled: clustersEnabled,
  })

  // Query cluster connection status
  const { data: clusterStatus } = trpc.clusters.getStatus.useQuery(
    { clusterName: selectedClusterId! },
    {
      enabled: clustersEnabled && !!selectedClusterId,
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

  // Don't show if not authenticated with AWS
  if (!awsStatus?.authenticated || !awsStatus?.hasCredentials) {
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

        {/* Account */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground/70">Account:</span>
          <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
            {awsStatus.accountName || awsStatus.accountId || "Unknown"}
          </span>
        </div>

        {/* Role */}
        {awsStatus.roleName && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground/70">Role:</span>
            <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">{awsStatus.roleName}</span>
          </div>
        )}

        {/* Token Expiry */}
        {credentialsExpiry && (
          <div
            className={cn(
              "flex items-center gap-1",
              !credentialsExpiry.isExpiringSoon && !credentialsExpiry.isExpired && "text-green-600 dark:text-green-400",
              credentialsExpiry.isExpiringSoon && "text-yellow-600 dark:text-yellow-500",
              credentialsExpiry.isExpired && "text-red-600 dark:text-red-500"
            )}
          >
            {credentialsExpiry.isExpiringSoon ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            <span className="text-muted-foreground/70">Token:</span>
            <span className="font-semibold">{credentialsExpiry.text}</span>
          </div>
        )}
      </div>

      {/* K8s Cluster Indicator (right side) */}
      {clustersEnabled && selectedClusterId && (
        <button
          onClick={() => setSelectedClustersCategory("clusters")}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-muted transition-colors mr-2"
          title={`Cluster: ${selectedClusterId}\nNamespace: ${effectiveNamespace}\nClick to open clusters panel`}
        >
          {/* Connection status dot */}
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              clusterStatus?.connected ? "bg-emerald-500" : "bg-red-500"
            )}
          />
          <Server className="h-3 w-3" />
          <span className="font-mono text-xs">
            {selectedClusterId.length > 20
              ? `${selectedClusterId.slice(0, 20)}...`
              : selectedClusterId}
          </span>
          <span className="text-muted-foreground/70">/</span>
          <span className="font-mono text-xs">{effectiveNamespace}</span>
        </button>
      )}

      {/* Refresh Button */}
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
        <span className="sr-only">Refresh</span>
      </button>
    </div>
  )
}
