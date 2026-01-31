"use client"

import { useState, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Copy, Check, AlertCircle, Loader2, RefreshCw, Star } from "lucide-react"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  selectedClusterIdAtom,
  selectedClusterTabAtom,
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
import { ClusterTabs } from "./cluster-tabs"
import { DashboardTab } from "./dashboard-tab"
import { PvcTab } from "./pvc-tab"
import { PodsTab } from "./pods-tab"
import { ServicesTab } from "./services-tab"
import { DeploymentsTab } from "./deployments-tab"
import { LogsTab } from "./logs-tab"
import { DevSpaceTab } from "./devspace-tab"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"

function InfoRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string
  value: string
  onCopy?: () => void
  copied?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm text-muted-foreground w-24 flex-shrink-0">
        {label}
      </span>
      <code className="flex-1 text-xs bg-muted px-2 py-1 rounded break-all">
        {value}
      </code>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  )
}

export function ClusterDetail() {
  const [selectedClusterId, setSelectedClusterId] = useAtom(selectedClusterIdAtom)
  const [defaultClusterId, setDefaultClusterId] = useAtom(defaultClusterIdAtom)
  const selectedTab = useAtomValue(selectedClusterTabAtom)
  const setAvailableClusters = useSetAtom(availableClustersAtom)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingDefaultCluster, setPendingDefaultCluster] = useState<string | null>(null)

  // Get list of all clusters for the dropdown
  const {
    data: clusters,
    isLoading: clustersLoading,
    refetch: refetchClusters,
    isRefetching,
  } = trpc.clusters.discover.useQuery()

  // Update available clusters atom when clusters load
  // The derived selectedClusterIdAtom will automatically select a default
  useEffect(() => {
    if (clusters && clusters.length > 0) {
      setAvailableClusters(clusters)
    }
  }, [clusters, setAvailableClusters])

  // Get cluster details for selected cluster
  const { data: cluster, isLoading: clusterLoading } = trpc.clusters.get.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId }
  )

  // Get cluster status
  const { data: status } = trpc.clusters.getStatus.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId }
  )

  const handleCopy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedField(field)
    toast.success(`Copied ${field} to clipboard`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleClusterChange = (clusterName: string) => {
    setSelectedClusterId(clusterName)
  }

  const handleSetDefaultCluster = (clusterName: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent dropdown from closing

    // If clicking the current default, unset it
    if (defaultClusterId === clusterName) {
      setDefaultClusterId(null)
      toast.success("Default cluster removed")
      return
    }

    // If no default is set, set it immediately
    if (!defaultClusterId) {
      setDefaultClusterId(clusterName)
      toast.success(`${clusterName} set as default cluster`)
      return
    }

    // Default exists - show confirmation dialog
    setPendingDefaultCluster(clusterName)
    setShowConfirmDialog(true)
  }

  const handleConfirmDefaultChange = () => {
    if (pendingDefaultCluster) {
      setDefaultClusterId(pendingDefaultCluster)
      toast.success(`${pendingDefaultCluster} set as default cluster`)
    }
    setShowConfirmDialog(false)
    setPendingDefaultCluster(null)
  }

  const handleCancelDefaultChange = () => {
    setShowConfirmDialog(false)
    setPendingDefaultCluster(null)
  }

  // Loading state for initial clusters fetch
  if (clustersLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // No clusters available
  if (!clusters || clusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <p>No clusters available</p>
        <button
          type="button"
          onClick={() => refetchClusters()}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className={cn("h-3 w-3", isRefetching && "animate-spin")} />
          Refresh
        </button>
      </div>
    )
  }

  // Show loading while auto-select effect runs or cluster details load
  if (!selectedClusterId || clusterLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cluster) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Cluster not found
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with cluster selector */}
      <div className="p-6 pb-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Cluster selector dropdown */}
            <Select value={selectedClusterId} onValueChange={handleClusterChange}>
              <SelectTrigger className="w-auto max-w-[300px] h-auto border-0 bg-transparent shadow-none px-0 py-0 text-xl font-semibold hover:bg-muted/50 rounded-md focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select a cluster" />
              </SelectTrigger>
              <SelectContent>
                {clusters.map((c) => (
                  <SelectItem key={`${c.name}-${defaultClusterId === c.name}`} value={c.name}>
                    <div className="flex items-center justify-between gap-2 w-full">
                      <div className="flex items-center gap-2">
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">({c.region})</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleSetDefaultCluster(c.name, e)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title={
                          defaultClusterId === c.name
                            ? "Remove as default cluster"
                            : "Set as default cluster"
                        }
                      >
                        <Star
                          className={cn(
                            "h-3.5 w-3.5",
                            defaultClusterId === c.name
                              ? "fill-yellow-500 text-yellow-500"
                              : "text-muted-foreground"
                          )}
                        />
                      </button>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Kubernetes {cluster.version} in {cluster.region}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => refetchClusters()}
              disabled={isRefetching}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted transition-colors"
              title="Refresh clusters"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            </button>
            <div
              className={cn(
                "px-2 py-1 text-xs rounded-full font-medium",
                status?.connected
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-red-500/10 text-red-500"
              )}
            >
              {status?.connected ? "Connected" : "Disconnected"}
            </div>
          </div>
        </div>

        {/* Connection warning */}
        {!status?.connected && status?.error && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-500">Connection failed</p>
              <p className="text-muted-foreground mt-1">{status.error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <ClusterTabs />

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {selectedTab === "dashboard" && <DashboardTab />}
        {selectedTab === "pvcs" && <PvcTab />}
        {selectedTab === "pods" && <PodsTab />}
        {selectedTab === "services" && <ServicesTab />}
        {selectedTab === "deployments" && <DeploymentsTab />}
        {selectedTab === "logs" && <LogsTab />}
        {selectedTab === "devspace" && <DevSpaceTab />}
      </div>

      {/* Confirmation Dialog for changing default cluster */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Default Cluster?</AlertDialogTitle>
            <AlertDialogDescription>
              You already have <span className="font-mono font-semibold">{defaultClusterId}</span> set as your default cluster.
              <br /><br />
              Do you want to replace it with <span className="font-mono font-semibold">{pendingDefaultCluster}</span>?
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
