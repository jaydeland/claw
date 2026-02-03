import { useState } from "react"
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Format token count for display in section headers
 * Shows abbreviated format for larger numbers
 */
function formatSectionTokens(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`
  }
  return `${(tokens / 1000).toFixed(1)}k tokens`
}

interface ContextSectionProps {
  title: string
  icon: LucideIcon
  count?: number
  tokenCount?: number
  defaultExpanded?: boolean
  children: React.ReactNode
  className?: string
}

export function ContextSection({
  title,
  icon: Icon,
  count,
  tokenCount,
  defaultExpanded = false,
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
        {tokenCount !== undefined && tokenCount > 0 && (
          <span className="text-[10px] text-muted-foreground/70 mr-1">
            {formatSectionTokens(tokenCount)}
          </span>
        )}
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
