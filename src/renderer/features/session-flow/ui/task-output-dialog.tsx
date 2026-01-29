"use client"

import { memo, useCallback, useState, useEffect, useRef } from "react"
import { useAtom } from "jotai"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Copy,
  Download,
  CheckIcon,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  FileText,
  WrapText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import {
  selectedBackgroundTaskAtom,
  backgroundTaskOutputDialogOpenAtom,
} from "../atoms"
import { CodeBlock } from "../../agents/ui/code-block"

interface TaskOutputDialogProps {
  /** Chat ID - dialog closes when this changes */
  chatId?: string
}

export const TaskOutputDialog = memo(function TaskOutputDialog({
  chatId,
}: TaskOutputDialogProps) {
  const [open, setOpen] = useAtom(backgroundTaskOutputDialogOpenAtom)
  const [selectedTask, setSelectedTask] = useAtom(selectedBackgroundTaskAtom)
  const [copied, setCopied] = useState(false)
  const [wrapText, setWrapText] = useState(true)
  const prevChatIdRef = useRef(chatId)

  // Fetch task with output from backend
  const { data: taskDetail, isLoading } = trpc.tasks.getWithOutput.useQuery(
    { taskId: selectedTask?.taskId || "", tailLines: 500 },
    {
      enabled: open && !!selectedTask?.taskId,
      refetchInterval: (data) => {
        // Poll every 2 seconds if task is running, otherwise stop polling
        return data?.status === "running" ? 2000 : false
      },
      onSuccess: (data) => {
        console.log('[TaskDialog] Received task data:', {
          taskId: data?.id,
          status: data?.status,
          outputFile: data?.outputFile,
          hasOutput: !!data?.output,
          outputLength: data?.output?.length
        })
      }
    }
  )

  // Close dialog when chat changes to prevent showing stale data
  useEffect(() => {
    if (prevChatIdRef.current !== chatId && open) {
      setOpen(false)
      setSelectedTask(null)
    }
    prevChatIdRef.current = chatId
  }, [chatId, open, setOpen, setSelectedTask])

  const handleClose = useCallback(() => {
    setOpen(false)
    // Clear selection after dialog closes
    setTimeout(() => setSelectedTask(null), 200)
  }, [setOpen, setSelectedTask])

  const handleCopy = useCallback(async () => {
    if (!taskDetail?.output) return

    try {
      await navigator.clipboard.writeText(taskDetail.output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [taskDetail?.output])

  const handleDownload = useCallback(() => {
    if (!taskDetail?.output || !selectedTask) return

    const blob = new Blob([taskDetail.output], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    link.download = `task-output-${selectedTask.taskId.slice(0, 8)}-${timestamp}.txt`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [taskDetail?.output, selectedTask])

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

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "running":
        return "secondary"
      case "completed":
        return "default"
      case "failed":
        return "destructive"
      default:
        return "outline"
    }
  }

  const currentStatus = taskDetail?.status || selectedTask?.status || "unknown"
  const output = taskDetail?.output || "(No output yet)"

  return (
    <Dialog open={open && !!selectedTask} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) {
        // Clear selection after dialog closes
        setTimeout(() => setSelectedTask(null), 200)
      }
    }}>
      <DialogContent className="w-[80vw] max-w-[80vw] h-[80vh] flex flex-col">
        {selectedTask && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {getStatusIcon(currentStatus)}
                <span>Background Task Output</span>
              </DialogTitle>
              <DialogDescription>
                Task execution details and output
              </DialogDescription>
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {selectedTask.taskId.slice(0, 12)}...
                </Badge>
                <Badge
                  variant={getStatusBadgeVariant(currentStatus)}
                  className="text-[10px] capitalize"
                >
                  {currentStatus}
                </Badge>
                {taskDetail?.exitCode !== undefined && (
                  <span className={cn(
                    "text-xs",
                    taskDetail.exitCode === 0 ? "text-green-600" : "text-red-500"
                  )}>
                    Exit: {taskDetail.exitCode}
                  </span>
                )}
                {taskDetail?.pid && (
                  <span className="text-xs text-muted-foreground">
                    PID: {taskDetail.pid}
                  </span>
                )}
              </div>
            </DialogHeader>

            {/* Task Details */}
            <div className="border rounded-md p-3 space-y-2 text-xs bg-muted/20">
              <div>
                <strong className="text-foreground">Command:</strong>
                <pre className="text-muted-foreground font-mono mt-1 break-all whitespace-pre-wrap bg-muted/50 p-2 rounded">
                  {taskDetail?.command || selectedTask.command}
                </pre>
              </div>
              {(taskDetail?.description || selectedTask.description) && (
                <div>
                  <strong className="text-foreground">Description:</strong>
                  <p className="text-muted-foreground mt-1">
                    {taskDetail?.description || selectedTask.description}
                  </p>
                </div>
              )}
              {taskDetail?.outputFile && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-foreground">Output File:</strong>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">
                    {taskDetail.outputFile}
                  </code>
                </div>
              )}
            </div>

            {/* Output content */}
            <div className="flex flex-col flex-1 min-h-0">
              {/* Output controls */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground">Output:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWrapText(!wrapText)}
                  className={cn("h-6 px-2 text-[10px]", wrapText && "bg-muted")}
                  title="Toggle text wrapping"
                >
                  <WrapText className="h-3 w-3 mr-1" />
                  Wrap
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto border rounded-md bg-muted/30">
                {isLoading && !taskDetail ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="p-4">
                    <CodeBlock
                      code={output}
                      language="bash"
                      showLineNumbers={false}
                      wrap={wrapText}
                    />
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={copied || !taskDetail?.output}
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5 mr-1.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy Output
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!taskDetail?.output}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </Button>
              <Button variant="default" size="sm" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})
