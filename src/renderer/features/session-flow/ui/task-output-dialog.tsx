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
import { usePaginatedOutput } from "./use-paginated-output"
import { ArrowUp } from "lucide-react"

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

  // Use paginated output hook
  const {
    output,
    totalLines,
    oldestLoadedLine,
    newestLoadedLine,
    hasOlderLines,
    hasNewOutput,
    isLoading,
    isLoadingMore,
    loadMore,
    refresh,
    status: taskStatus,
    exitCode,
    command,
    description,
  } = usePaginatedOutput(selectedTask?.taskId || "", {
    enabled: open && !!selectedTask?.taskId,
    initialLimit: 500,
    chunkSize: 500,
  })

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
    if (!output) return

    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [output])

  const handleDownload = useCallback(() => {
    if (!output || !selectedTask) return

    const blob = new Blob([output], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    link.download = `task-output-${selectedTask.taskId.slice(0, 8)}-${timestamp}.txt`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [output, selectedTask])

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

  const currentStatus = taskStatus || selectedTask?.status || "unknown"
  const displayOutput = output || "(No output yet)"

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
                {exitCode !== undefined && (
                  <span className={cn(
                    "text-xs",
                    exitCode === 0 ? "text-green-600" : "text-red-500"
                  )}>
                    Exit: {exitCode}
                  </span>
                )}
                {totalLines > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Lines {oldestLoadedLine + 1}-{newestLoadedLine + 1} of {totalLines}
                  </span>
                )}
              </div>
            </DialogHeader>

            {/* Task Details */}
            <div className="border rounded-md p-3 space-y-2 text-xs bg-muted/20">
              <div>
                <strong className="text-foreground">Command:</strong>
                <pre className="text-muted-foreground font-mono mt-1 break-all whitespace-pre-wrap bg-muted/50 p-2 rounded">
                  {command || selectedTask.command}
                </pre>
              </div>
              {(description || selectedTask.description) && (
                <div>
                  <strong className="text-foreground">Description:</strong>
                  <p className="text-muted-foreground mt-1">
                    {description || selectedTask.description}
                  </p>
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
                {hasNewOutput && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refresh}
                    className="h-6 px-2 text-[10px] text-blue-500 hover:text-blue-600"
                    title="Reload to see new output"
                  >
                    <ArrowUp className="h-3 w-3 mr-1" />
                    New output available
                  </Button>
                )}
              </div>

              {/* Load More button */}
              {hasOlderLines && (
                <div className="mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="w-full h-8 text-xs"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ArrowUp className="h-3 w-3 mr-2" />
                        Load previous 500 lines ({oldestLoadedLine} more available)
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto border rounded-md bg-muted/30">
                {isLoading && !output ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="p-4">
                    <CodeBlock
                      code={displayOutput}
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
                disabled={copied || !output}
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
                disabled={!output}
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
