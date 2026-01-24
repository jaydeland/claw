"use client"

import { ResourceChart, type ChartDataItem } from "./resource-chart"
import { CHART_COLORS, type ClusterStats } from "./utils"

interface PodStatusChartProps {
  stats: ClusterStats
}

export function PodStatusChart({ stats }: PodStatusChartProps) {
  const data: ChartDataItem[] = [
    { name: "Running", value: stats.pods.running, color: CHART_COLORS.healthy },
    { name: "Pending", value: stats.pods.pending, color: CHART_COLORS.warning },
    { name: "Failed", value: stats.pods.failed, color: CHART_COLORS.critical },
  ].filter((item) => item.value > 0)

  return (
    <ResourceChart
      title="Pod Status"
      data={data}
      centerLabel={String(stats.pods.total)}
    />
  )
}
