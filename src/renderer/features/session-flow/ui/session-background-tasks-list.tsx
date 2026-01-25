"use client"

import { memo, useCallback, useMemo } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { cn } from "@/lib/utils"
import { CheckIcon, IconSpinner } from "@/components/ui/icons"
import { X, Terminal, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  sessionFlowBackgroundTasksAtom,
  selectedBackgroundTaskAtom,
  backgroundTaskOutputDialogOpenAtom,
  type BackgroundTask,
} from "../atoms"

interface SessionBackgroundTasksListProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

// Status icon component
const TaskStatusIcon = memo(function TaskStatusIcon({
  status,
}: {
  status: BackgroundTask["status"]
}) {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-3.5 h-3.5 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(142 76% 36%)" }}
        >
          <CheckIcon className="w-2 h-2 text-green-600 dark:text-green-500" />
        </div>
      )
    case "failed":
      return (
        <div
          className="w-3.5 h-3.5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(0 84% 60%)" }}
        >
          <X className="w-2 h-2 text-red-600 dark:text-red-500" />
        </div>
      )
    case "running":
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <IconSpinner className="w-2 h-2 text-background" />
        </div>
      )
    default:
      return (
        <div
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
})

// Format duration in human-readable format
function formatDuration(ms?: number): string {
  if (!ms || ms < 1000) return ""
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

// Individual background task item component
const BackgroundTaskItem = memo(function BackgroundTaskItem({
  task,
  isLast,
  onClick,
  onOpenDialog,
}: {
  task: BackgroundTask
  isLast: boolean
  onClick: () => void
  onOpenDialog: () => void
}) {
  const hasOutput = !!task.output || !!task.error
  const duration = formatDuration(task.duration)

  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 px-2.5 py-1.5",
        "hover:bg-muted/50 transition-colors",
        !isLast && "border-b border-border/30"
      )}
    >
      <button
        onClick={onClick}
        disabled={!hasOutput && task.status !== "running"}
        className={cn(
          "flex-1 flex items-center gap-2 min-w-0 text-left",
          hasOutput || task.status === "running" ? "cursor-pointer" : "cursor-default opacity-60"
        )}
      >
        <div className="flex-shrink-0 text-muted-foreground">
          <Terminal className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{task.description}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="capitalize">{task.type}</span>
            {duration && (
              <>
                <span>-</span>
                <span className="tabular-nums">{duration}</span>
              </>
            )}
          </div>
        </div>
        <TaskStatusIcon status={task.status} />
      </button>

      {/* Dialog button */}
      {hasOutput && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 flex-shrink-0 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation()
                onOpenDialog()
              }}
            >
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">View output</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
})

export const SessionBackgroundTasksList = memo(function SessionBackgroundTasksList({
  onScrollToMessage,
}: SessionBackgroundTasksListProps) {
  const backgroundTasks = useAtomValue(sessionFlowBackgroundTasksAtom)
  const setSelectedTask = useSetAtom(selectedBackgroundTaskAtom)
  const setDialogOpen = useSetAtom(backgroundTaskOutputDialogOpenAtom)

  // Sort tasks: running first, then failed, then completed
  const sortedTasks = useMemo(() => {
    const running: BackgroundTask[] = []
    const failed: BackgroundTask[] = []
    const completed: BackgroundTask[] = []

    for (const task of backgroundTasks) {
      if (task.status === "running") {
        running.push(task)
      } else if (task.status === "failed") {
        failed.push(task)
      } else {
        completed.push(task)
      }
    }

    // Reverse each section so newest is first
    return {
      running: running.reverse(),
      failed: failed.reverse(),
      completed: completed.reverse(),
      all: [...running, ...failed, ...completed],
    }
  }, [backgroundTasks])

  const handleTaskClick = useCallback(
    (task: BackgroundTask) => {
      // If task has output, open dialog
      if (task.output || task.error) {
        setSelectedTask(task)
        setDialogOpen(true)
      } else if (task.status === "running") {
        // If running, scroll to the message
        onScrollToMessage(task.messageId, task.partIndex)
      }
    },
    [onScrollToMessage, setSelectedTask, setDialogOpen]
  )

  const handleOpenDialog = useCallback(
    (task: BackgroundTask) => {
      setSelectedTask(task)
      setDialogOpen(true)
    },
    [setSelectedTask, setDialogOpen]
  )

  const runningCount = sortedTasks.running.length
  const totalCount = backgroundTasks.length

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 flex-shrink-0">
          <span className="text-xs font-medium">Background Tasks</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            0
          </Badge>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
          No background tasks yet. Claude will spawn background tasks when using run_in_background.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 flex-shrink-0">
        <span className="text-xs font-medium">Background Tasks</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {runningCount > 0 ? `${runningCount} running` : totalCount}
        </Badge>
      </div>

      {/* Tasks list - grouped by status */}
      <div className="flex-1 overflow-y-auto">
        {/* Running tasks section */}
        {sortedTasks.running.length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 bg-muted/30 border-b border-border/30">
              Running
            </div>
            {sortedTasks.running.map((task, idx) => (
              <BackgroundTaskItem
                key={task.taskId}
                task={task}
                isLast={idx === sortedTasks.running.length - 1 && sortedTasks.failed.length === 0 && sortedTasks.completed.length === 0}
                onClick={() => handleTaskClick(task)}
                onOpenDialog={() => handleOpenDialog(task)}
              />
            ))}
          </div>
        )}

        {/* Failed tasks section */}
        {sortedTasks.failed.length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 bg-muted/30 border-b border-border/30">
              Failed
            </div>
            {sortedTasks.failed.map((task, idx) => (
              <BackgroundTaskItem
                key={task.taskId}
                task={task}
                isLast={idx === sortedTasks.failed.length - 1 && sortedTasks.completed.length === 0}
                onClick={() => handleTaskClick(task)}
                onOpenDialog={() => handleOpenDialog(task)}
              />
            ))}
          </div>
        )}

        {/* Completed tasks section */}
        {sortedTasks.completed.length > 0 && (
          <div>
            {(sortedTasks.running.length > 0 || sortedTasks.failed.length > 0) && (
              <div className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 bg-muted/30 border-b border-border/30">
                Completed
              </div>
            )}
            {sortedTasks.completed.map((task, idx) => (
              <BackgroundTaskItem
                key={task.taskId}
                task={task}
                isLast={idx === sortedTasks.completed.length - 1}
                onClick={() => handleTaskClick(task)}
                onOpenDialog={() => handleOpenDialog(task)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
