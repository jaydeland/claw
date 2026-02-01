import { useAtom } from "jotai"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Play, Square, Trash2, AlertCircle, ChevronRight, ExternalLink, GripVertical, Loader2 } from "lucide-react"
import { useState, useCallback, memo } from "react"
import { motion, AnimatePresence } from "motion/react"
import { selectedConductorJobIdAtom } from "../../atoms"
import { Button } from "@/renderer/components/ui/button"
import { Badge } from "@/renderer/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip"
import { cn } from "@/renderer/lib/utils"
import type { ConductorJob } from "@/main/lib/db/schema/conductor"

interface JobCardProps {
  job: ConductorJob
  childrenCount?: number
  compact?: boolean
  isLoading?: boolean
  onStart?: (jobId: string) => void
  onStop?: (jobId: string) => void
  onDelete?: (jobId: string) => void
}

// Type badge color mapping
const typeColors = {
  feature: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  bug: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  refactor: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  chore: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
  docs: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  test: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
}

// Status indicator colors
const statusColors = {
  to_do: "bg-gray-400",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
}

// Status labels
const statusLabels = {
  to_do: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
}

export const JobCard = memo(function JobCard({
  job,
  childrenCount = 0,
  compact = false,
  isLoading = false,
  onStart,
  onStop,
  onDelete
}: JobCardProps) {
  const [selectedJobId, setSelectedJobId] = useAtom(selectedConductorJobIdAtom)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const isSelected = selectedJobId === job.id

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't select if clicking on a button or while dragging
    if (
      e.target instanceof HTMLButtonElement ||
      e.target instanceof SVGElement ||
      isDragging
    ) {
      return
    }
    setSelectedJobId(job.id)
  }, [isDragging, job.id, setSelectedJobId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setSelectedJobId(job.id)
    }
  }, [job.id, setSelectedJobId])

  const handleDelete = useCallback(() => {
    setDeleteDialogOpen(false)
    onDelete?.(job.id)
  }, [job.id, onDelete])

  // Get type color or default
  const typeColor = job.type && job.type in typeColors
    ? typeColors[job.type as keyof typeof typeColors]
    : typeColors.chore

  // Get status color or default
  const statusColor = job.status && job.status in statusColors
    ? statusColors[job.status as keyof typeof statusColors]
    : statusColors.to_do

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          "group relative rounded-lg border bg-card cursor-pointer transition-all",
          "hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
          compact ? "p-2" : "p-3",
          isSelected && "ring-2 ring-primary ring-offset-1",
          isDragging && "opacity-50 shadow-lg",
          job.errorMessage && "border-red-500/50 bg-red-500/5",
          isLoading && "opacity-60 pointer-events-none"
        )}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
        aria-label={`Job: ${job.title}`}
        aria-selected={isSelected}
        aria-busy={isLoading}
      >
        {/* Drag handle indicator */}
        <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none">
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>

        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Status badge (top right) */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {compact ? (
            <div
              className={cn("w-2 h-2 rounded-full", statusColor)}
              title={statusLabels[job.status as keyof typeof statusLabels]}
              aria-label={`Status: ${statusLabels[job.status as keyof typeof statusLabels]}`}
            />
          ) : (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-normal px-1.5 py-0 h-4",
                `border-${statusColor.replace("bg-", "")} ${statusColor}/20 text-${statusColor.replace("bg-", "")}`
              )}
            >
              {statusLabels[job.status as keyof typeof statusLabels]}
            </Badge>
          )}
        </div>

        {/* Main content */}
        <div className={cn("space-y-2", compact ? "pr-3 pl-3" : "pr-4 pl-3")}>
          {/* Title with optional intent tooltip */}
          {job.intent && !compact ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h3 className={cn(
                    "font-medium leading-snug",
                    compact ? "text-xs line-clamp-1" : "text-sm line-clamp-2"
                  )}>
                    {job.title}
                  </h3>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm" side="top">
                  <p className="text-xs font-semibold mb-1">Intent:</p>
                  <p className="text-xs text-muted-foreground">{job.intent}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <h3 className={cn(
              "font-medium leading-snug",
              compact ? "text-xs line-clamp-1" : "text-sm line-clamp-2"
            )}>
              {job.title}
            </h3>
          )}

          {/* Type badge and Jira key */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.type && (
              <Badge
                variant="outline"
                className={cn("text-xs font-normal capitalize border", typeColor)}
              >
                {job.type}
              </Badge>
            )}

            {/* Jira key link */}
            {job.jiraKey && (
              <a
                href={`https://jira.example.com/browse/${job.jiraKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                onClick={(e) => e.stopPropagation()}
                title="Open in Jira"
              >
                {job.jiraKey}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Parent indicator */}
            {job.parentId && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-sm border border-current opacity-50" />
                <span>Subtask</span>
              </div>
            )}

            {/* Children count */}
            {childrenCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="w-3 h-3" />
                <span>{childrenCount} subtask{childrenCount !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>

          {/* Error message indicator with tooltip */}
          {job.errorMessage && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 cursor-help">
                    <AlertCircle className="w-3 h-3" />
                    <span className="truncate">Error occurred</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">{job.errorMessage}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Quick actions (shown on hover with animation) */}
        <AnimatePresence>
          {isHovered && !isDragging && !isLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="absolute bottom-2 right-2 flex items-center gap-1 bg-background/95 backdrop-blur-sm rounded-md p-1 shadow-lg border"
            >
              {job.status === "to_do" && onStart && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation()
                          onStart(job.id)
                        }}
                        aria-label="Start job"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Start job</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {job.status === "in_progress" && onStop && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-600 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          onStop(job.id)
                        }}
                        aria-label="Stop job"
                      >
                        <Square className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Stop running job</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {onDelete && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteDialogOpen(true)
                        }}
                        aria-label="Delete job"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Delete job (cannot be undone)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{job.title}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})

// Export types for external usage
export type { JobCardProps }
export type JobCardJob = ConductorJob
