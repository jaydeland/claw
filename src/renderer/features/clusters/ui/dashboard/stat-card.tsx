import type { LucideIcon } from "lucide-react"
import { cn } from "../../../../lib/utils"
import type { StatusType } from "./utils"

interface StatCardProps {
  title: string
  icon: LucideIcon
  value: string | number
  subtitle: string
  status: StatusType
  onClick?: () => void
}

const statusColors: Record<StatusType, string> = {
  healthy: "text-emerald-500",
  warning: "text-amber-500",
  critical: "text-red-500",
  neutral: "text-muted-foreground",
}

const statusBgColors: Record<StatusType, string> = {
  healthy: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
  critical: "bg-red-500/10",
  neutral: "bg-muted/50",
}

export function StatCard({ title, icon: Icon, value, subtitle, status, onClick }: StatCardProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg border border-border bg-muted/30",
        "flex flex-col gap-1",
        onClick && "cursor-pointer hover:bg-muted/50 transition-colors"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className={cn("p-1.5 rounded", statusBgColors[status])}>
          <Icon className={cn("h-4 w-4", statusColors[status])} />
        </div>
      </div>
      <div className={cn("text-2xl font-semibold", statusColors[status])}>{value}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  )
}
