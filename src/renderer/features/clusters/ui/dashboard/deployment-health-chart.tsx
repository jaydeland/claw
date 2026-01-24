"use client"

import { ResourceChart, type ChartDataItem } from "./resource-chart"
import { CHART_COLORS, type ClusterStats } from "./utils"

interface DeploymentHealthChartProps {
  stats: ClusterStats
}

export function DeploymentHealthChart({ stats }: DeploymentHealthChartProps) {
  const data: ChartDataItem[] = [
    { name: "Healthy", value: stats.deployments.healthy, color: CHART_COLORS.healthy },
    { name: "Partial", value: stats.deployments.partial, color: CHART_COLORS.warning },
    { name: "Unhealthy", value: stats.deployments.unhealthy, color: CHART_COLORS.critical },
  ].filter((item) => item.value > 0)

  return (
    <ResourceChart
      title="Deployment Health"
      data={data}
      centerLabel={String(stats.deployments.total)}
    />
  )
}
