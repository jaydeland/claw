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
import { Copy, Download, CheckIcon, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  selectedSubAgentAtom,
  subAgentOutputDialogOpenAtom,
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

export const SubAgentOutputDialog = memo(function SubAgentOutputDialog() {
  const [open, setOpen] = useAtom(subAgentOutputDialogOpenAtom)
  const [selectedAgent, setSelectedAgent] = useAtom(selectedSubAgentAtom)
  const [copied, setCopied] = useState(false)

  const handleClose = useCallback(() => {
    setOpen(false)
    // Clear selection after dialog closes
    setTimeout(() => setSelectedAgent(null), 200)
  }, [setOpen, setSelectedAgent])

  const handleCopy = useCallback(async () => {
    if (!selectedAgent) return

    const content = selectedAgent.error || selectedAgent.output || ""
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [selectedAgent])

  const handleDownload = useCallback(() => {
    if (!selectedAgent) return

    const content = selectedAgent.error || selectedAgent.output || ""
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    link.download = `sub-agent-${selectedAgent.type}-${timestamp}.txt`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [selectedAgent])

  if (!selectedAgent) return null

  const hasError = !!selectedAgent.error
  const content = selectedAgent.error || selectedAgent.output || "No output available"
  const duration = formatDuration(selectedAgent.duration)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasError && (
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
            <span className="truncate">{selectedAgent.description}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-mono">
              {selectedAgent.agentId}
            </Badge>
            <Badge
              variant={
                hasError ? "destructive" : selectedAgent.status === "completed" ? "default" : "secondary"
              }
              className="text-[10px] capitalize"
            >
              {selectedAgent.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Type: {selectedAgent.type.replace(/-/g, " ")}
            </span>
            {duration && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Duration: {duration}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  )
})
