"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

export interface ChartDataItem {
  name: string
  value: number
  color: string
}

interface ResourceChartProps {
  title: string
  data: ChartDataItem[]
  centerLabel?: string
  height?: number
}

export function ResourceChart({ title, data, centerLabel, height = 200 }: ResourceChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (total === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <h4 className="text-sm font-medium mb-2">{title}</h4>
        <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
          No data available
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-lg border border-border bg-muted/30">
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value}`, name]}
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value: string) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
          {centerLabel && (
            <text
              x="50%"
              y="45%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground text-lg font-semibold"
            >
              {centerLabel}
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
