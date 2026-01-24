"use client"

import { useAtomValue } from "jotai"
import { Server, RefreshCw, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedClusterIdAtom } from "../atoms"
import { formatCpu, formatMemory } from "./dashboard"

export function NodesTab() {
  const selectedClusterId = useAtomValue(selectedClusterIdAtom)

  // Get cluster status
  const { data: status } = trpc.clusters.getStatus.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId }
  )

  // Get nodes
  const {
    data: nodes,
    isLoading: nodesLoading,
    refetch: refetchNodes,
    isRefetching: nodesRefetching,
  } = trpc.clusters.getNodes.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId && status?.connected }
  )

  // Get node metrics
  const {
    data: nodeMetrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
    isRefetching: metricsRefetching,
  } = trpc.clusters.getNodeMetrics.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId && status?.connected }
  )

  // Create a map of node metrics by name
  const metricsMap = new Map(
    nodeMetrics?.map((m) => [m.name, m]) || []
  )

  if (!status?.connected) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Waiting for cluster connection...
      </div>
    )
  }

  const isLoading = nodesLoading || metricsLoading
  const isRefetching = nodesRefetching || metricsRefetching

  const handleRefresh = () => {
    refetchNodes()
    refetchMetrics()
  }

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Nodes ({nodes?.length || 0})
        </h3>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefetching}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className={cn("h-3 w-3", isRefetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : nodes && nodes.length > 0 ? (
        <div className="space-y-3">
          {nodes.map((node) => {
            const metrics = metricsMap.get(node.name)

            return (
              <div
                key={node.name}
                className="p-4 bg-muted/30 border border-border rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{node.name}</span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          node.status === "Ready"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-red-500/10 text-red-500"
                        )}
                      >
                        {node.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {node.roles.join(", ")} &middot; {node.version}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground font-mono">
                      {node.internalIp}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">CPU</div>
                      <div className="text-sm font-medium">
                        {metrics ? formatCpu(metrics.cpuMillicores) : "--"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Memory</div>
                      <div className="text-sm font-medium">
                        {metrics ? formatMemory(metrics.memoryMi) : "--"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          No nodes found
        </p>
      )}
    </div>
  )
}
