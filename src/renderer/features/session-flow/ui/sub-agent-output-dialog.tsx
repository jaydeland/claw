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
import { Copy, Download, CheckIcon, AlertCircle, WrapText, Bot, Clock, FileCode, Wrench, Search, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  selectedSubAgentAtom,
  subAgentOutputDialogOpenAtom,
  type SessionNestedTool,
} from "../atoms"
import { CodeBlock } from "../../agents/ui/code-block"

interface SubAgentOutputDialogProps {
  /** Chat ID - dialog closes when this changes */
  chatId?: string
}

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

// Detect the likely language/format of the output
function detectOutputLanguage(content: string): string {
  // Check for JSON
  const trimmed = content.trim()
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed)
      return "json"
    } catch {
      // Not valid JSON
    }
  }

  // Check for common patterns
  if (trimmed.includes("```") || trimmed.includes("def ") || trimmed.includes("function ")) {
    return "markdown"
  }

  if (trimmed.includes("import ") || trimmed.includes("export ") || trimmed.includes("const ")) {
    return "typescript"
  }

  if (trimmed.includes("error") || trimmed.includes("Error") || trimmed.includes("exception")) {
    return "log"
  }

  return "text"
}

// Format the output content for better readability
function formatContent(rawContent: string): string {
  // Try to parse and pretty-print JSON
  try {
    const parsed = JSON.parse(rawContent)
    return JSON.stringify(parsed, null, 2)
  } catch {
    // Not JSON, return as-is
    return rawContent
  }
}

// Group nested tools by tool name for consolidated display
interface GroupedTool {
  toolName: string
  count: number
  hasError: boolean
  hasPending: boolean
}

function groupNestedTools(tools: SessionNestedTool[]): GroupedTool[] {
  const groups = new Map<string, GroupedTool>()

  for (const tool of tools) {
    const existing = groups.get(tool.toolName)
    if (existing) {
      existing.count++
      if (tool.status === "error") existing.hasError = true
      if (tool.status === "pending") existing.hasPending = true
    } else {
      groups.set(tool.toolName, {
        toolName: tool.toolName,
        count: 1,
        hasError: tool.status === "error",
        hasPending: tool.status === "pending",
      })
    }
  }

  // Sort by count descending, then by name
  return Array.from(groups.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.toolName.localeCompare(b.toolName)
  })
}

// Tool icon helper for nested tools
function getToolIcon(toolName: string, iconClass = "w-2.5 h-2.5") {
  switch (toolName.toLowerCase()) {
    case "read":
    case "grep":
    case "glob":
      return <FileCode className={iconClass} />
    case "bash":
      return <Wrench className={iconClass} />
    case "webfetch":
    case "websearch":
      return <Search className={iconClass} />
    default:
      return <Wrench className={iconClass} />
  }
}

export const SubAgentOutputDialog = memo(function SubAgentOutputDialog({
  chatId,
}: SubAgentOutputDialogProps) {
  const [open, setOpen] = useAtom(subAgentOutputDialogOpenAtom)
  const [selectedAgent, setSelectedAgent] = useAtom(selectedSubAgentAtom)
  const [copied, setCopied] = useState(false)
  const [wrapText, setWrapText] = useState(true)
  const prevChatIdRef = useRef(chatId)

  // Close dialog when chat changes to prevent showing stale data
  useEffect(() => {
    if (prevChatIdRef.current !== chatId && open) {
      setOpen(false)
      setSelectedAgent(null)
    }
    prevChatIdRef.current = chatId
  }, [chatId, open, setOpen, setSelectedAgent])

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

  // Compute display values (with fallbacks for when selectedAgent is null)
  const hasError = !!selectedAgent?.error
  const rawContent = selectedAgent?.error || selectedAgent?.output || "No output available"
  const content = formatContent(rawContent)
  const language = detectOutputLanguage(content)
  const duration = formatDuration(selectedAgent?.duration)

  // Always render Dialog to ensure it can open when state changes
  // The Dialog's open prop controls visibility - don't use early return
  return (
    <Dialog open={open && !!selectedAgent} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) {
        // Clear selection after dialog closes
        setTimeout(() => setSelectedAgent(null), 200)
      }
    }}>
      <DialogContent className="w-[80vw] max-w-[80vw] h-[80vh] flex flex-col">
        {selectedAgent && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {hasError ? (
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                ) : (
                  <Bot className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="truncate">{selectedAgent.description}</span>
              </DialogTitle>
              <DialogDescription>
                Sub-agent execution output
              </DialogDescription>
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {selectedAgent.agentId.slice(0, 12)}...
                </Badge>
                <Badge
                  variant={
                    hasError ? "destructive" : selectedAgent.status === "completed" ? "default" : "secondary"
                  }
                  className="text-[10px] capitalize"
                >
                  {selectedAgent.status}
                </Badge>
                {duration && (
                  <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {duration}
                  </span>
                )}
              </div>
            </DialogHeader>

            {/* Requests - top level when present */}
            {selectedAgent.nestedTools && selectedAgent.nestedTools.length > 0 && (
              <div className="border rounded-md p-3 text-xs bg-muted/20">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <strong className="text-foreground">Requests:</strong>
                  <span className="text-muted-foreground">{selectedAgent.nestedTools.length} total</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {groupNestedTools(selectedAgent.nestedTools).map((group) => (
                    <Badge
                      key={group.toolName}
                      variant="outline"
                      className={cn(
                        "h-5 px-1.5 text-[10px] gap-1",
                        group.hasError && "border-red-500/50 text-red-600 dark:text-red-400",
                        group.hasPending && !group.hasError && "border-foreground/50 animate-pulse"
                      )}
                    >
                      {getToolIcon(group.toolName)}
                      <span>{group.toolName}</span>
                      {group.count > 1 && (
                        <span className="tabular-nums text-muted-foreground">({group.count})</span>
                      )}
                      {!group.hasError && !group.hasPending && <CheckIcon className="w-2.5 h-2.5 text-green-600 dark:text-green-500" />}
                      {group.hasError && <AlertCircle className="w-2.5 h-2.5" />}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Details */}
            <div className="border rounded-md p-3 text-xs bg-muted/20">
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <strong className="text-foreground">Agent Type:</strong>
                <span className="text-muted-foreground capitalize">
                  {selectedAgent.type.replace(/-/g, " ")}
                </span>
              </div>
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
                <div className="p-4">
                  <CodeBlock
                    code={content}
                    language={language}
                    showLineNumbers={false}
                    wrap={wrapText}
                  />
                </div>
              </div>
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
