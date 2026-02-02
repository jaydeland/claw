import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, FolderOpen, User } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ClaudeMdFile } from "../types"

interface ClaudeMdItemProps {
  file: ClaudeMdFile
}

export function ClaudeMdItem({ file }: ClaudeMdItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Truncate content for preview (first 500 chars)
  const previewContent = file.content.slice(0, 500)
  const hasMore = file.content.length > 500

  return (
    <div className="border border-border/30 rounded-md overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-muted/30 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-medium flex-1 truncate">
          {file.relativePath || file.path}
        </span>
        <SourceBadge source={file.source} />
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-muted/10">
          <pre className="text-xs p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-muted-foreground max-h-[300px] overflow-y-auto">
            {isExpanded ? file.content : previewContent}
            {!isExpanded && hasMore && (
              <span className="text-muted-foreground/50">...</span>
            )}
          </pre>
        </div>
      )}
    </div>
  )
}

interface SourceBadgeProps {
  source: "project" | "user" | "custom"
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const config = {
    project: {
      icon: FolderOpen,
      label: "Project",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    user: {
      icon: User,
      label: "User",
      className: "bg-green-500/10 text-green-600 dark:text-green-400",
    },
    custom: {
      icon: FolderOpen,
      label: "Custom",
      className: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    },
  }

  const { icon: Icon, label, className } = config[source]

  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", className)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}
