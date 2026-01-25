"use client"

import { memo, useCallback, useState } from "react"
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
import { Copy, Download, CheckIcon, AlertCircle, Terminal } from "lucide-react"
import {
  selectedBackgroundTaskAtom,
  backgroundTaskOutputDialogOpenAtom,
} from "../atoms"

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

export const BackgroundTaskOutputDialog = memo(function BackgroundTaskOutputDialog() {
  const [open, setOpen] = useAtom(backgroundTaskOutputDialogOpenAtom)
  const [selectedTask, setSelectedTask] = useAtom(selectedBackgroundTaskAtom)
  const [copied, setCopied] = useState(false)

  const handleClose = useCallback(() => {
    setOpen(false)
    // Clear selection after dialog closes
    setTimeout(() => setSelectedTask(null), 200)
  }, [setOpen, setSelectedTask])

  const handleCopy = useCallback(async () => {
    if (!selectedTask) return

    const content = selectedTask.error || selectedTask.output || ""
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [selectedTask])

  const handleDownload = useCallback(() => {
    if (!selectedTask) return

    const content = selectedTask.error || selectedTask.output || ""
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    link.download = `background-task-${selectedTask.type}-${timestamp}.txt`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [selectedTask])

  // Compute display values (with fallbacks for when selectedTask is null)
  const hasError = !!selectedTask?.error
  const content = selectedTask?.error || selectedTask?.output || "No output available"
  const duration = formatDuration(selectedTask?.duration)

  // Always render Dialog to ensure it can open when state changes
  // The Dialog's open prop controls visibility - don't use early return
  return (
    <Dialog open={open && !!selectedTask} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) {
        // Clear selection after dialog closes
        setTimeout(() => setSelectedTask(null), 200)
      }
    }}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        {selectedTask && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {hasError ? (
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                ) : (
                  <Terminal className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="truncate">{selectedTask.description}</span>
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {selectedTask.taskId}
                </Badge>
                <Badge
                  variant={
                    hasError ? "destructive" : selectedTask.status === "completed" ? "default" : "secondary"
                  }
                  className="text-[10px] capitalize"
                >
                  {selectedTask.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Type: {selectedTask.type}
                </span>
                {duration && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Duration: {duration}
                  </span>
                )}
                {selectedTask.exitCode !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Exit code: {selectedTask.exitCode}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* Command (if available) */}
            {selectedTask.command && (
              <div className="border rounded-md bg-muted/30 px-3 py-2 flex-shrink-0">
                <div className="text-[10px] text-muted-foreground mb-1">Command</div>
                <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                  <span className="text-amber-600 dark:text-amber-400">$ </span>
                  {selectedTask.command}
                </pre>
              </div>
            )}

            {/* Output content */}
            <div className="flex-1 overflow-y-auto border rounded-md bg-muted/30">
              <pre className="text-xs font-mono p-4 whitespace-pre-wrap break-words">
                {content}
              </pre>
            </div>

            <DialogFooter className="flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={copied}
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
              <Button variant="outline" size="sm" onClick={handleDownload}>
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
