import { useState } from "react"
import { useAtomValue } from "jotai"
import { trpc } from "../../../lib/trpc"
import { selectedAgentChatIdAtom } from "../atoms"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Terminal,
  RefreshCw,
  Trash2,
  Square,
  ArrowUp,
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
import { usePaginatedOutput } from "../../session-flow/ui/use-paginated-output"

interface TasksPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function TasksPanel({ isOpen, onClose }: TasksPanelProps) {
  const chatId = useAtomValue(selectedAgentChatIdAtom)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [taskToKill, setTaskToKill] = useState<string | null>(null)

  // Fetch tasks for current chat
  const { data: tasks, refetch, isLoading } = trpc.tasks.listByChat.useQuery(
    { chatId: chatId || "" },
    { enabled: isOpen && !!chatId, refetchInterval: 5000 }
  )

  // Use paginated output hook for selected task
  const {
    output: taskOutput,
    totalLines,
    oldestLoadedLine,
    newestLoadedLine,
    hasOlderLines,
    isLoadingMore,
    loadMore,
    status: taskStatus,
    exitCode: taskExitCode,
    command: taskCommand,
    description: taskDescription,
  } = usePaginatedOutput(selectedTaskId || "", {
    enabled: !!selectedTaskId,
    initialLimit: 100,
    chunkSize: 100,
  })

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
      setSelectedTaskId(null)
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

  const runningCount = tasks?.filter((t) => t.status === "running").length ?? 0
  const completedCount = tasks?.filter((t) => t.status !== "running").length ?? 0

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl h-[600px] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Background Tasks
                {runningCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {runningCount} running
                  </Badge>
                )}
              </DialogTitle>
              <div className="flex items-center gap-2">
                {completedCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => chatId && clearMutation.mutate({ chatId })}
                    disabled={clearMutation.isPending}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear Completed
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => chatId && refreshMutation.mutate({ chatId })}
                  disabled={refreshMutation.isPending}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      refreshMutation.isPending && "animate-spin"
                    )}
                  />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex gap-4 min-h-0">
            {/* Task List */}
            <div className="w-1/3 border rounded-lg">
              <div className="h-full overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading tasks...
                  </div>
                ) : tasks?.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No background tasks yet
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {tasks?.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={cn(
                          "w-full text-left p-2 rounded-md transition-colors",
                          selectedTaskId === task.id
                            ? "bg-accent"
                            : "hover:bg-muted/50"
                        )}
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
                          {task.status === "running" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={(e) => {
                                e.stopPropagation()
                                setTaskToKill(task.id)
                              }}
                            >
                              <Square className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", getStatusBadge(task.status))}
                          >
                            {task.status}
                          </Badge>
                          {task.exitCode !== undefined && (
                            <span className="text-[10px] text-muted-foreground">
                              exit: {task.exitCode}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Task Detail */}
            <div className="flex-1 border rounded-lg flex flex-col">
              {selectedTaskId ? (
                <>
                  <div className="p-3 border-b">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(taskStatus || "unknown")}
                      <Badge
                        variant="outline"
                        className={getStatusBadge(taskStatus || "unknown")}
                      >
                        {taskStatus || "unknown"}
                      </Badge>
                      {taskExitCode !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          Exit code: {taskExitCode}
                        </span>
                      )}
                      {totalLines > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ({oldestLoadedLine + 1}-{newestLoadedLine + 1} of {totalLines})
                        </span>
                      )}
                      {taskStatus === "running" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setTaskToKill(selectedTaskId)}
                        >
                          <Square className="h-3 w-3 mr-1" />
                          Kill
                        </Button>
                      )}
                    </div>
                    <div className="text-xs space-y-2">
                      {taskCommand && (
                        <div>
                          <strong className="text-foreground">Command:</strong>
                          <p className="text-muted-foreground font-mono mt-1 break-all">
                            {taskCommand}
                          </p>
                        </div>
                      )}
                      {taskDescription && (
                        <div>
                          <strong className="text-foreground">Description:</strong>
                          <p className="text-muted-foreground mt-1">
                            {taskDescription}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Load More button */}
                  {hasOlderLines && (
                    <div className="px-3 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="w-full h-7 text-xs"
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ArrowUp className="h-3 w-3 mr-1.5" />
                            Load more ({oldestLoadedLine} lines)
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto">
                    <pre className="p-3 text-xs font-mono whitespace-pre-wrap bg-muted/30">
                      {taskOutput || "(No output yet)"}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  Select a task to view details
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kill confirmation dialog */}
      <AlertDialog open={!!taskToKill} onOpenChange={() => setTaskToKill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kill Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will forcefully terminate the background process. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => taskToKill && killMutation.mutate({ taskId: taskToKill })}
            >
              {killMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Kill Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
