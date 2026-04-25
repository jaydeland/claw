"use client"

import { useState, useCallback } from "react"
import { trpcClient } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { Loader2, Maximize2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { ScrollArea } from "../../../components/ui/scroll-area"

interface ToolOutputViewerProps {
  subChatId: string
  toolCallId: string
  preview?: string
  fullLength?: number
  isTruncated?: boolean
}

export function ToolOutputViewer({
  subChatId,
  toolCallId,
  preview,
  fullLength,
  isTruncated,
}: ToolOutputViewerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadFullContent = useCallback(async () => {
    if (fullContent) {
      setIsOpen(true)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await trpcClient.claude.loadToolOutput.query({
        subChatId,
        toolCallId,
      })
      setFullContent(result.content)
      setIsOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load output")
    } finally {
      setIsLoading(false)
    }
  }, [subChatId, toolCallId, fullContent])

  // If not truncated or no offloading indicator, don't show the viewer
  if (!isTruncated) {
    return null
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={loadFullContent}
        disabled={isLoading}
        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Maximize2 className="h-3 w-3 mr-1" />
        )}
        {isLoading
          ? "Loading..."
          : fullLength
            ? `View full output (${(fullLength / 1000).toFixed(1)}k chars)`
            : "View full output"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Full Tool Output</DialogTitle>
          </DialogHeader>

          {error ? (
            <div className="text-destructive p-4">
              Error loading output: {error}
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-[400px] border rounded-md">
              <pre className="p-4 text-xs whitespace-pre-wrap break-all font-mono">
                {fullContent || preview || "Loading..."}
              </pre>
            </ScrollArea>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (fullContent) {
                  navigator.clipboard.writeText(fullContent)
                }
              }}
              disabled={!fullContent}
            >
              Copy to Clipboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Hook to check if a tool output is offloaded and get viewer props
 */
export function useOffloadedToolOutput(
  subChatId: string | null,
  toolCallId: string | undefined,
  output: unknown,
): { isOffloaded: boolean; viewerProps?: Omit<ToolOutputViewerProps, "subChatId"> } {
  if (!subChatId || !toolCallId) {
    return { isOffloaded: false }
  }

  // Check if this is an offloaded output reference
  if (
    output !== null &&
    typeof output === "object" &&
    "_claw_output_offloaded" in output
  ) {
    const offloadedOutput = output as {
      _claw_output_offloaded: boolean
      _claw_preview?: string
      _claw_full_length?: number
      _claw_tool_call_id: string
      _claw_stdout_preview?: boolean
      _claw_stderr_preview?: boolean
    }

    // Build preview from available fields
    let preview = offloadedOutput._claw_preview
    if (!preview) {
      // For bash tools, construct preview from stdout/stderr
      const parts: string[] = []
      if (offloadedOutput._claw_stdout_preview && typeof (output as any).stdout === "string") {
        parts.push("STDOUT:\n" + (output as any).stdout)
      }
      if (offloadedOutput._claw_stderr_preview && typeof (output as any).stderr === "string") {
        parts.push("STDERR:\n" + (output as any).stderr)
      }
      preview = parts.join("\n\n") || "Output stored in file"
    }

    return {
      isOffloaded: true,
      viewerProps: {
        toolCallId: offloadedOutput._claw_tool_call_id,
        preview,
        fullLength: offloadedOutput._claw_full_length,
        isTruncated: true,
      },
    }
  }

  return { isOffloaded: false }
}
