import { useState } from "react"
import { useAtomValue } from "jotai"
import { trpc } from "../../../lib/trpc"
import { selectedAgentChatIdAtom } from "../atoms"
import { Button } from "../../../components/ui/button"
import { Loader2, Terminal } from "lucide-react"
import { cn } from "../../../lib/utils"
import { TasksPanel } from "./tasks-panel"

/**
 * Task Status Indicator
 *
 * Shows a compact indicator of running background tasks.
 * Click to open the full tasks panel.
 */
export function TaskStatusIndicator() {
  const chatId = useAtomValue(selectedAgentChatIdAtom)
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false)

  // Fetch running task count
  const { data: taskCount } = trpc.tasks.getRunningCount.useQuery(
    { chatId: chatId || "" },
    {
      enabled: !!chatId,
      refetchInterval: 5000, // Poll every 5 seconds
    }
  )

  const runningCount = taskCount?.running ?? 0
  const totalCount = taskCount?.total ?? 0

  // Don't show anything if no tasks
  if (totalCount === 0) {
    return null
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 px-2 gap-1.5 text-xs",
          runningCount > 0 && "text-blue-500 hover:text-blue-600"
        )}
        onClick={() => setIsTasksPanelOpen(true)}
      >
        {runningCount > 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Terminal className="h-3.5 w-3.5" />
        )}
        <span>
          {runningCount > 0
            ? `${runningCount} running`
            : `${totalCount} task${totalCount === 1 ? "" : "s"}`}
        </span>
      </Button>

      <TasksPanel
        isOpen={isTasksPanelOpen}
        onClose={() => setIsTasksPanelOpen(false)}
      />
    </>
  )
}

/**
 * Minimal badge indicator for tight spaces
 */
export function TaskStatusBadge() {
  const chatId = useAtomValue(selectedAgentChatIdAtom)
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false)

  // Fetch running task count
  const { data: taskCount } = trpc.tasks.getRunningCount.useQuery(
    { chatId: chatId || "" },
    {
      enabled: !!chatId,
      refetchInterval: 5000,
    }
  )

  const runningCount = taskCount?.running ?? 0

  // Don't show anything if no running tasks
  if (runningCount === 0) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsTasksPanelOpen(true)}
        className={cn(
          "relative inline-flex items-center justify-center",
          "h-5 min-w-5 px-1 rounded-full",
          "bg-blue-500 text-white text-[10px] font-medium",
          "animate-pulse"
        )}
      >
        {runningCount}
      </button>

      <TasksPanel
        isOpen={isTasksPanelOpen}
        onClose={() => setIsTasksPanelOpen(false)}
      />
    </>
  )
}
