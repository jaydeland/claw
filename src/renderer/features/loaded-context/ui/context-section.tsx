import { useState } from "react"
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ContextSectionProps {
  title: string
  icon: LucideIcon
  count?: number
  defaultExpanded?: boolean
  children: React.ReactNode
  className?: string
}

export function ContextSection({
  title,
  icon: Icon,
  count,
  defaultExpanded = true,
  children,
  className,
}: ContextSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={cn("border border-border/50 rounded-lg overflow-hidden", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {count}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-2 space-y-1 bg-background">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Empty state for when a section has no items
 */
interface EmptyStateProps {
  message: string
}

export function ContextSectionEmpty({ message }: EmptyStateProps) {
  return (
    <div className="text-xs text-muted-foreground italic px-2 py-1">
      {message}
    </div>
  )
}
