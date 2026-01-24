"use client"

import { useAtom, useAtomValue } from "jotai"
import {
  Box,
  Server,
  Rocket,
  Network,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedClusterIdAtom, selectedNamespaceAtom } from "../atoms"
import { clustersDefaultNamespaceAtom } from "../../../lib/atoms"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import {
  StatCard,
  PodStatusChart,
  DeploymentHealthChart,
  NodeMetricsChart,
  TopPodsChart,
  calculateClusterStats,
  getStatusFromRatio,
} from "./dashboard"

export function DashboardTab() {
  const selectedClusterId = useAtomValue(selectedClusterIdAtom)
  const [selectedNamespace, setSelectedNamespace] = useAtom(selectedNamespaceAtom)
  const defaultNamespaceOverride = useAtomValue(clustersDefaultNamespaceAtom)

  // Get derived namespace from email
  const { data: derivedNamespace } = trpc.clusters.getDefaultNamespace.useQuery()

  // Effective default namespace
  const effectiveDefaultNamespace = defaultNamespaceOverride || derivedNamespace || "default"
  const currentNamespace = selectedNamespace || effectiveDefaultNamespace

  // Get cluster status
  const { data: status } = trpc.clusters.getStatus.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId }
  )

  // Get namespaces
  const { data: namespaces, isLoading: namespacesLoading } = trpc.clusters.getNamespaces.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId && status?.connected }
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

  // Get pods in selected namespace
  const {
    data: pods,
    isLoading: podsLoading,
    refetch: refetchPods,
    isRefetching: podsRefetching,
  } = trpc.clusters.getPods.useQuery(
    { clusterName: selectedClusterId!, namespace: currentNamespace },
    { enabled: !!selectedClusterId && status?.connected && !!currentNamespace }
  )

  // Get deployments in selected namespace
  const {
    data: deployments,
    isLoading: deploymentsLoading,
    refetch: refetchDeployments,
    isRefetching: deploymentsRefetching,
  } = trpc.clusters.getDeployments.useQuery(
    { clusterName: selectedClusterId!, namespace: currentNamespace },
    { enabled: !!selectedClusterId && status?.connected && !!currentNamespace }
  )

  // Get services in selected namespace
  const {
    data: services,
    isLoading: servicesLoading,
    refetch: refetchServices,
    isRefetching: servicesRefetching,
  } = trpc.clusters.getServices.useQuery(
    { clusterName: selectedClusterId!, namespace: currentNamespace },
    { enabled: !!selectedClusterId && status?.connected && !!currentNamespace }
  )

  // Get node metrics
  const { data: nodeMetrics, isLoading: nodeMetricsLoading } =
    trpc.clusters.getNodeMetrics.useQuery(
      { clusterName: selectedClusterId! },
      { enabled: !!selectedClusterId && status?.connected }
    )

  // Get pod metrics
  const { data: podMetrics, isLoading: podMetricsLoading } =
    trpc.clusters.getPodMetrics.useQuery(
      { clusterName: selectedClusterId!, namespace: currentNamespace },
      { enabled: !!selectedClusterId && status?.connected && !!currentNamespace }
    )

  // Calculate stats
  const stats = calculateClusterStats(pods, nodes, deployments, services)

  if (!status?.connected) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Waiting for cluster connection...
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Namespace Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Namespace:</span>
          <Select
            value={currentNamespace}
            onValueChange={(value) => setSelectedNamespace(value)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Select namespace" />
            </SelectTrigger>
            <SelectContent>
              {namespaces?.map((ns) => (
                <SelectItem key={ns.name} value={ns.name}>
                  <span className="flex items-center gap-2">
                    {ns.name}
                    {ns.name === effectiveDefaultNamespace && (
                      <span className="text-xs text-muted-foreground">(default)</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Pods"
          icon={Box}
          value={`${stats.pods.running}/${stats.pods.total}`}
          subtitle="pods running"
          status={getStatusFromRatio(stats.pods.running, stats.pods.total)}
        />
        <StatCard
          title="Nodes"
          icon={Server}
          value={`${stats.nodes.ready}/${stats.nodes.total}`}
          subtitle="nodes ready"
          status={stats.nodes.ready === stats.nodes.total ? "healthy" : "critical"}
        />
        <StatCard
          title="Deployments"
          icon={Rocket}
          value={`${stats.deployments.healthy}/${stats.deployments.total}`}
          subtitle="deployments healthy"
          status={getStatusFromRatio(stats.deployments.healthy, stats.deployments.total)}
        />
        <StatCard
          title="Services"
          icon={Network}
          value={stats.services.total}
          subtitle="services active"
          status="neutral"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        <PodStatusChart stats={stats} />
        <DeploymentHealthChart stats={stats} />
      </div>

      {/* Metrics Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        <NodeMetricsChart metrics={nodeMetrics} isLoading={nodeMetricsLoading} />
        <TopPodsChart metrics={podMetrics} isLoading={podMetricsLoading} sortBy="cpu" />
      </div>

      {/* Resource Tables */}
      <div className="space-y-6">
        {/* Deployments Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Deployments ({deployments?.length || 0})
            </h3>
            <button
              type="button"
              onClick={() => refetchDeployments()}
              disabled={deploymentsRefetching}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={cn("h-3 w-3", deploymentsRefetching && "animate-spin")}
              />
            </button>
          </div>

          {deploymentsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : deployments && deployments.length > 0 ? (
            <div className="space-y-2">
              {deployments.map((deploy) => {
                const [ready, total] = deploy.ready.split("/").map(Number)
                const isHealthy = ready === total && total > 0
                const isPartial = ready > 0 && ready < total
                const isFailed = ready === 0 && total > 0

                return (
                  <div
                    key={deploy.name}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                  >
                    <div className="flex items-center gap-2 truncate flex-1 mr-2">
                      {isHealthy && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      )}
                      {isPartial && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      )}
                      {isFailed && (
                        <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium truncate">{deploy.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span
                        className={cn(
                          "text-xs font-mono",
                          isHealthy && "text-emerald-500",
                          isPartial && "text-amber-500",
                          isFailed && "text-red-500"
                        )}
                      >
                        {deploy.ready} ready
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No deployments found in {currentNamespace}
            </p>
          )}
        </div>

        {/* Services Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Network className="h-4 w-4" />
              Services ({services?.length || 0})
            </h3>
            <button
              type="button"
              onClick={() => refetchServices()}
              disabled={servicesRefetching}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={cn("h-3 w-3", servicesRefetching && "animate-spin")}
              />
            </button>
          </div>

          {servicesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : services && services.length > 0 ? (
            <div className="space-y-2">
              {services.map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                >
                  <div className="truncate flex-1 mr-2">
                    <span className="font-medium">{svc.name}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs px-1.5 py-0.5 bg-muted rounded">
                      {svc.type}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {svc.clusterIp}
                    </span>
                    <span className="text-xs text-muted-foreground">{svc.ports}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No services found in {currentNamespace}
            </p>
          )}
        </div>

        {/* Pods Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4" />
              Pods ({pods?.length || 0})
            </h3>
            <button
              type="button"
              onClick={() => refetchPods()}
              disabled={podsRefetching}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={cn("h-3 w-3", podsRefetching && "animate-spin")}
              />
            </button>
          </div>

          {podsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : pods && pods.length > 0 ? (
            <div className="space-y-2">
              {pods.slice(0, 20).map((pod) => (
                <div
                  key={pod.name}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                >
                  <div className="truncate flex-1 mr-2">
                    <span className="font-medium">{pod.name}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{pod.ready}</span>
                    <span
                      className={cn(
                        "text-xs",
                        pod.status === "Running"
                          ? "text-emerald-500"
                          : pod.status === "Pending"
                            ? "text-amber-500"
                            : "text-red-500"
                      )}
                    >
                      {pod.status}
                    </span>
                    {pod.restarts > 0 && (
                      <span className="text-xs text-amber-500">
                        {pod.restarts} restarts
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {pods.length > 20 && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing 20 of {pods.length} pods
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No pods found in {currentNamespace}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
