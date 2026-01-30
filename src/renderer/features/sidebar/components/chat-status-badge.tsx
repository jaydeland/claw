import { cn } from "../../../lib/utils"
import { LoadingDot } from "../../../components/ui/icons"

export type ChatStatusType = "error" | "pending-input" | "unseen" | "loading" | null

interface ChatStatusBadgeProps {
  status: ChatStatusType
  isActive?: boolean
  className?: string
}

/**
 * Status indicator badge for chat rows in workspace list
 * Displays colored dot based on chat status
 *
 * Priority: error (red) > pending-input (amber) > unseen (blue) > loading (spinner)
 */
export function ChatStatusBadge({ status, isActive, className }: ChatStatusBadgeProps) {
  if (!status) return null

  return (
    <div
      className={cn(
        "absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
        isActive
          ? "bg-primary/10"
          : "bg-background",
        className
      )}
    >
      {status === "loading" ? (
        <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-muted-foreground" />
      ) : status === "error" ? (
        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
      ) : status === "pending-input" ? (
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      ) : status === "unseen" ? (
        <LoadingDot isLoading={false} className="w-2.5 h-2.5 text-muted-foreground" />
      ) : null}
    </div>
  )
}
