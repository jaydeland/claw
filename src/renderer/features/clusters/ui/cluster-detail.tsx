"use client"

import { useState } from "react"
import { useAtomValue } from "jotai"
import { Copy, Check, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedClusterIdAtom, selectedClusterTabAtom } from "../atoms"
import { ClusterTabs } from "./cluster-tabs"
import { DashboardTab } from "./dashboard-tab"
import { NodesTab } from "./nodes-tab"
import { LogsTab } from "./logs-tab"

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
  const selectedClusterId = useAtomValue(selectedClusterIdAtom)
  const selectedTab = useAtomValue(selectedClusterTabAtom)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Get cluster details
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

  if (!selectedClusterId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a cluster to view details
      </div>
    )
  }

  if (clusterLoading) {
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
      {/* Header */}
      <div className="p-6 pb-4 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{cluster.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Kubernetes {cluster.version} in {cluster.region}
            </p>
          </div>
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
      <div className="flex-1 overflow-hidden">
        {selectedTab === "dashboard" && <DashboardTab />}
        {selectedTab === "nodes" && <NodesTab />}
        {selectedTab === "logs" && <LogsTab />}
      </div>
    </div>
  )
}
