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
} from "lucide-react"
import { cn } from "../../../lib/utils"

interface TasksPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function TasksPanel({ isOpen, onClose }: TasksPanelProps) {
  const chatId = useAtomValue(selectedAgentChatIdAtom)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Fetch tasks for current chat
  const { data: tasks, refetch, isLoading } = trpc.tasks.listByChat.useQuery(
    { chatId: chatId || "" },
    { enabled: isOpen && !!chatId, refetchInterval: 5000 },
  )

  // Fetch selected task with output
  const { data: taskDetail } = trpc.tasks.getWithOutput.useQuery(
    { taskId: selectedTaskId || "", tailLines: 100 },
    { enabled: !!selectedTaskId, refetchInterval: selectedTaskId ? 2000 : false },
  )

  // Refresh task statuses
  const refreshMutation = trpc.tasks.refreshStatuses.useMutation({
    onSuccess: () => refetch(),
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[600px] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Background Tasks
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => chatId && refreshMutation.mutate({ chatId })}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  refreshMutation.isPending && "animate-spin",
                )}
              />
            </Button>
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
                          : "hover:bg-muted/50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <span className="text-xs font-mono truncate flex-1">
                          {task.command.slice(0, 40)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", getStatusBadge(task.status))}
                        >
                          {task.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(task.startedAt!).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Task Detail */}
          <div className="flex-1 border rounded-lg flex flex-col">
            {selectedTaskId && taskDetail ? (
              <>
                <div className="p-3 border-b">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(taskDetail.status)}
                    <Badge
                      variant="outline"
                      className={getStatusBadge(taskDetail.status)}
                    >
                      {taskDetail.status}
                    </Badge>
                    {taskDetail.exitCode !== null && (
                      <span className="text-xs text-muted-foreground">
                        Exit code: {taskDetail.exitCode}
                      </span>
                    )}
                  </div>
                  <code className="text-xs font-mono bg-muted p-1 rounded block">
                    {taskDetail.command}
                  </code>
                  {taskDetail.description && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {taskDetail.description}
                    </p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  <pre className="p-3 text-xs font-mono whitespace-pre-wrap">
                    {taskDetail.output || "(No output yet)"}
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
  )
}
