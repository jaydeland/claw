import type { K8sPod, K8sNode, K8sDeployment, K8sService } from "../../../../../main/lib/kubernetes/kubernetes-service"

export interface ClusterStats {
  pods: {
    total: number
    running: number
    pending: number
    failed: number
  }
  nodes: {
    total: number
    ready: number
    notReady: number
  }
  deployments: {
    total: number
    healthy: number
    partial: number
    unhealthy: number
  }
  services: {
    total: number
  }
}

export type StatusType = "healthy" | "warning" | "critical" | "neutral"

export const CHART_COLORS = {
  healthy: "#10b981", // emerald-500
  warning: "#f59e0b", // amber-500
  critical: "#ef4444", // red-500
  neutral: "#6b7280", // gray-500
} as const

/**
 * Parse ready string from Kubernetes (e.g., "2/3" -> { current: 2, total: 3 })
 */
export function parseReadyString(ready: string): { current: number; total: number } {
  const parts = ready.split("/")
  if (parts.length !== 2) {
    return { current: 0, total: 0 }
  }
  return {
    current: parseInt(parts[0], 10) || 0,
    total: parseInt(parts[1], 10) || 0,
  }
}

/**
 * Calculate cluster statistics from resource data
 */
export function calculateClusterStats(
  pods: K8sPod[] | undefined,
  nodes: K8sNode[] | undefined,
  deployments: K8sDeployment[] | undefined,
  services: K8sService[] | undefined
): ClusterStats {
  // Pod stats
  const podStats = {
    total: pods?.length || 0,
    running: pods?.filter((p) => p.status === "Running").length || 0,
    pending: pods?.filter((p) => p.status === "Pending").length || 0,
    failed: pods?.filter((p) => p.status !== "Running" && p.status !== "Pending").length || 0,
  }

  // Node stats
  const nodeStats = {
    total: nodes?.length || 0,
    ready: nodes?.filter((n) => n.status === "Ready").length || 0,
    notReady: nodes?.filter((n) => n.status !== "Ready").length || 0,
  }

  // Deployment stats
  const deploymentStats = {
    total: deployments?.length || 0,
    healthy: 0,
    partial: 0,
    unhealthy: 0,
  }

  deployments?.forEach((deploy) => {
    const { current, total } = parseReadyString(deploy.ready)
    if (current === total && total > 0) {
      deploymentStats.healthy++
    } else if (current > 0 && current < total) {
      deploymentStats.partial++
    } else {
      deploymentStats.unhealthy++
    }
  })

  return {
    pods: podStats,
    nodes: nodeStats,
    deployments: deploymentStats,
    services: { total: services?.length || 0 },
  }
}

/**
 * Determine status type based on ratio
 */
export function getStatusFromRatio(current: number, total: number): StatusType {
  if (total === 0) return "neutral"
  const ratio = current / total
  if (ratio >= 1) return "healthy"
  if (ratio >= 0.8) return "warning"
  return "critical"
}

/**
 * Format memory in Mi to human readable string
 */
export function formatMemory(memoryMi: number): string {
  if (memoryMi >= 1024) {
    return `${(memoryMi / 1024).toFixed(1)}Gi`
  }
  return `${memoryMi}Mi`
}

/**
 * Format CPU in millicores to human readable string
 */
export function formatCpu(cpuMillicores: number): string {
  if (cpuMillicores >= 1000) {
    return `${(cpuMillicores / 1000).toFixed(1)} cores`
  }
  return `${cpuMillicores}m`
}
