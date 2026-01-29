import { useAtomValue, useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { selectedAgentChatIdAtom } from "../../agents/atoms"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  RefreshCw,
  Trash2,
  Square,
  Eye,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog"
import { useState } from "react"
import {
  selectedBackgroundTaskAtom,
  backgroundTaskOutputDialogOpenAtom,
} from "../atoms"
import { TaskOutputDialog } from "./task-output-dialog"

export function SessionFlowTasks() {
  const chatId = useAtomValue(selectedAgentChatIdAtom)
  const [taskToKill, setTaskToKill] = useState<string | null>(null)
  const setSelectedTask = useSetAtom(selectedBackgroundTaskAtom)
  const setDialogOpen = useSetAtom(backgroundTaskOutputDialogOpenAtom)

  // Fetch tasks for current chat
  const { data: tasks, refetch, isLoading } = trpc.tasks.listByChat.useQuery(
    { chatId: chatId || "" },
    { enabled: !!chatId, refetchInterval: 5000 }
  )

  // Refresh task statuses
  const refreshMutation = trpc.tasks.refreshStatuses.useMutation({
    onSuccess: () => refetch(),
  })

  // Kill task mutation
  const killMutation = trpc.tasks.killTask.useMutation({
    onSuccess: (result) => {
      if (result.killed) {
        toast.success("Task killed")
      } else {
        toast.info(result.message)
      }
      refetch()
      setTaskToKill(null)
    },
    onError: (error) => {
      toast.error(`Failed to kill task: ${error.message}`)
      setTaskToKill(null)
    },
  })

  // Clear completed tasks mutation
  const clearMutation = trpc.tasks.clearCompleted.useMutation({
    onSuccess: (result) => {
      if (result.deleted > 0) {
        toast.success(`Cleared ${result.deleted} completed task(s)`)
      } else {
        toast.info("No completed tasks to clear")
      }
      refetch()
    },
    onError: (error) => {
      toast.error(`Failed to clear tasks: ${error.message}`)
    },
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      running: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      completed: "bg-green-500/10 text-green-500 border-green-500/20",
      failed: "bg-red-500/10 text-red-500 border-red-500/20",
      unknown: "bg-muted text-muted-foreground",
    }
    return variants[status] || variants.unknown
  }

  const handleViewOutput = (task: typeof tasks extends (infer T)[] | undefined ? T : never) => {
    if (!task) return
    setSelectedTask({
      taskId: task.id,
      toolCallId: task.toolCallId,
      command: task.command || "",
      description: task.description,
      status: task.status as "running" | "completed" | "failed" | "unknown",
      messageId: "",
      partIndex: 0,
    })
    setDialogOpen(true)
  }

  const runningCount = tasks?.filter((t) => t.status === "running").length ?? 0
  const completedCount = tasks?.filter((t) => t.status !== "running").length ?? 0

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Background Tasks</span>
            {runningCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                {runningCount} running
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {completedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => chatId && clearMutation.mutate({ chatId })}
                disabled={clearMutation.isPending}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => chatId && refreshMutation.mutate({ chatId })}
              disabled={refreshMutation.isPending}
              className="h-6 px-2 text-[10px]"
              title="Refresh task statuses"
            >
              <RefreshCw className={cn("h-3 w-3", refreshMutation.isPending && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : tasks?.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              No background tasks yet
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {tasks?.map((task) => (
                <div
                  key={task.id}
                  className="p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(task.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate">
                        {task.command || `Task ${task.id.slice(0, 8)}...`}
                      </p>
                      {task.description && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => handleViewOutput(task)}
                        title="View output"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {task.status === "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => setTaskToKill(task.id)}
                          title="Kill task"
                        >
                          <Square className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 ml-6">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", getStatusBadge(task.status))}
                    >
                      {task.status}
                    </Badge>
                    {task.exitCode !== undefined && (
                      <span className={cn(
                        "text-[10px]",
                        task.exitCode === 0 ? "text-green-600" : "text-red-500"
                      )}>
                        exit: {task.exitCode}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task Output Dialog */}
      <TaskOutputDialog chatId={chatId || undefined} />

      {/* Kill Confirmation Dialog */}
      <AlertDialog open={!!taskToKill} onOpenChange={(open) => !open && setTaskToKill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kill Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will forcefully terminate the running process. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => taskToKill && killMutation.mutate({ taskId: taskToKill })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Kill Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
