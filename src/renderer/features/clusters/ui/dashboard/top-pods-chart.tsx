"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Loader2 } from "lucide-react"
import type { PodMetric } from "../../../../../main/lib/kubernetes/kubernetes-service"
import { formatCpu, formatMemory, CHART_COLORS } from "./utils"

interface TopPodsChartProps {
  metrics: PodMetric[] | undefined
  isLoading: boolean
  sortBy: "cpu" | "memory"
}

export function TopPodsChart({ metrics, isLoading, sortBy }: TopPodsChartProps) {
  const title = sortBy === "cpu" ? "Top Pods by CPU" : "Top Pods by Memory"

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <h4 className="text-sm font-medium mb-2">{title}</h4>
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <h4 className="text-sm font-medium mb-2">{title}</h4>
        <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
          No metrics available
        </div>
      </div>
    )
  }

  // Sort and take top 5
  const sorted = [...metrics]
    .sort((a, b) =>
      sortBy === "cpu"
        ? b.cpuMillicores - a.cpuMillicores
        : b.memoryMi - a.memoryMi
    )
    .slice(0, 5)

  const data = sorted.map((pod) => ({
    name: pod.name.length > 20 ? `${pod.name.slice(0, 20)}...` : pod.name,
    value: sortBy === "cpu" ? pod.cpuMillicores : pod.memoryMi,
    label: sortBy === "cpu" ? formatCpu(pod.cpuMillicores) : formatMemory(pod.memoryMi),
  }))

  const color = sortBy === "cpu" ? CHART_COLORS.healthy : CHART_COLORS.warning

  return (
    <div className="p-4 rounded-lg border border-border bg-muted/30">
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 40 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number) => [
              sortBy === "cpu" ? formatCpu(value) : formatMemory(value),
              sortBy === "cpu" ? "CPU" : "Memory",
            ]}
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
