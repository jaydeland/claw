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
import type { NodeMetric } from "../../../../../main/lib/kubernetes/kubernetes-service"
import { formatCpu, formatMemory, CHART_COLORS } from "./utils"

interface NodeMetricsChartProps {
  metrics: NodeMetric[] | undefined
  isLoading: boolean
}

export function NodeMetricsChart({ metrics, isLoading }: NodeMetricsChartProps) {
  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <h4 className="text-sm font-medium mb-2">Node Resource Usage</h4>
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <h4 className="text-sm font-medium mb-2">Node Resource Usage</h4>
        <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
          No metrics available
        </div>
      </div>
    )
  }

  // Prepare data for chart - show CPU usage
  const data = metrics.slice(0, 5).map((node) => ({
    name: node.name.length > 20 ? `${node.name.slice(0, 20)}...` : node.name,
    cpu: node.cpuMillicores,
    memory: node.memoryMi,
    cpuLabel: formatCpu(node.cpuMillicores),
    memoryLabel: formatMemory(node.memoryMi),
  }))

  return (
    <div className="p-4 rounded-lg border border-border bg-muted/30">
      <h4 className="text-sm font-medium mb-2">Node Resource Usage</h4>
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
            formatter={(value: number, name: string) => {
              if (name === "cpu") return [formatCpu(value), "CPU"]
              if (name === "memory") return [formatMemory(value), "Memory"]
              return [value, name]
            }}
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="cpu" name="cpu" radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell key={`cpu-${index}`} fill={CHART_COLORS.healthy} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
