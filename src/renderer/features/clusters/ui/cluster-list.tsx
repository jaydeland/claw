"use client"

import React, { useEffect, useState } from "react"
import { useAtom, useSetAtom, useAtomValue } from "jotai"
import { Search, RefreshCw, Check, X, Loader2, AlertCircle, Star } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  selectedClusterIdAtom,
  clusterSearchAtom,
  availableClustersAtom,
  defaultClusterIdAtom,
} from "../atoms"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog"

function getStatusIcon(status: string) {
  switch (status) {
    case "ACTIVE":
      return <Check className="h-3 w-3 text-emerald-500" />
    case "CREATING":
    case "UPDATING":
      return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
    case "DELETING":
      return <Loader2 className="h-3 w-3 text-red-500 animate-spin" />
    case "FAILED":
      return <X className="h-3 w-3 text-red-500" />
    default:
      return <AlertCircle className="h-3 w-3 text-muted-foreground" />
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "text-emerald-500"
    case "CREATING":
    case "UPDATING":
      return "text-blue-500"
    case "DELETING":
    case "FAILED":
      return "text-red-500"
    default:
      return "text-muted-foreground"
  }
}

export function ClusterList() {
  const [selectedCluster, setSelectedCluster] = useAtom(selectedClusterIdAtom)
  const [search, setSearch] = useAtom(clusterSearchAtom)
  const setAvailableClusters = useSetAtom(availableClustersAtom)
  const [defaultClusterId, setDefaultClusterId] = useAtom(defaultClusterIdAtom)

  // State for confirmation dialog
  const [pendingDefaultCluster, setPendingDefaultCluster] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const {
    data: clusters,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = trpc.clusters.discover.useQuery()

  // Update available clusters atom when clusters load
  // The derived selectedClusterIdAtom will automatically select a default
  useEffect(() => {
    if (clusters && clusters.length > 0) {
      setAvailableClusters(clusters)
    }
  }, [clusters, setAvailableClusters])

  // Handle star icon click
  const handleSetDefaultCluster = (clusterName: string) => {
    // If this cluster is already the default, unset it
    if (defaultClusterId === clusterName) {
      setDefaultClusterId(null)
      return
    }

    // If there's already a default set, show confirmation dialog
    if (defaultClusterId) {
      setPendingDefaultCluster(clusterName)
      setShowConfirmDialog(true)
    } else {
      // No default set yet, directly set it
      setDefaultClusterId(clusterName)
    }
  }

  // Confirm default cluster change
  const handleConfirmDefaultChange = () => {
    if (pendingDefaultCluster) {
      setDefaultClusterId(pendingDefaultCluster)
      setPendingDefaultCluster(null)
    }
    setShowConfirmDialog(false)
  }

  // Cancel default cluster change
  const handleCancelDefaultChange = () => {
    setPendingDefaultCluster(null)
    setShowConfirmDialog(false)
  }

  // Filter clusters based on search
  const filteredClusters = React.useMemo(() => {
    if (!clusters) return []
    if (!search.trim()) return clusters

    const query = search.toLowerCase()
    return clusters.filter(
      (cluster) =>
        cluster.name.toLowerCase().includes(query) ||
        cluster.region.toLowerCase().includes(query)
    )
  }, [clusters, search])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Failed to discover clusters</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error.message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search clusters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {filteredClusters.length} cluster{filteredClusters.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className={cn("h-3 w-3", isRefetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Cluster list */}
      <div className="flex-1 overflow-y-auto">
        {filteredClusters.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            {clusters?.length === 0
              ? "No EKS clusters found in this region."
              : "No clusters match your search"}
          </div>
        ) : (
          <div className="py-1">
            {filteredClusters.map((cluster) => (
              <div
                key={cluster.name}
                className={cn(
                  "group relative w-full px-3 py-2 transition-colors",
                  "hover:bg-muted/50",
                  selectedCluster === cluster.name && "bg-accent"
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCluster(cluster.name)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium truncate">
                      {cluster.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {getStatusIcon(cluster.status)}
                    <span className={cn("text-xs", getStatusColor(cluster.status))}>
                      {cluster.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({cluster.region})
                    </span>
                  </div>
                </button>

                {/* Star icon button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSetDefaultCluster(cluster.name)
                  }}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/70 transition-colors",
                    defaultClusterId === cluster.name ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  title={
                    defaultClusterId === cluster.name
                      ? "Remove as default cluster"
                      : "Set as default cluster"
                  }
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      defaultClusterId === cluster.name
                        ? "fill-yellow-500 text-yellow-500"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change default cluster?</AlertDialogTitle>
            <AlertDialogDescription>
              {defaultClusterId && (
                <>
                  The cluster <span className="font-mono font-semibold">{defaultClusterId}</span>{" "}
                  is currently set as the default. Do you want to replace it with{" "}
                  <span className="font-mono font-semibold">{pendingDefaultCluster}</span>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDefaultChange}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDefaultChange}>
              Change Default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
