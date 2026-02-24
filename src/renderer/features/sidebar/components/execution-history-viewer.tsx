"use client"

import React, { useRef, useEffect } from "react"
import { ArrowLeft, Play, CheckCircle, XCircle, Loader2, Clock, RefreshCw, Terminal } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { Badge } from "../../../components/ui/badge"
import { formatDistanceToNow } from "../../../lib/utils"

interface ExecutionHistoryViewerProps {
  claw: {
    id: string
    name: string
    triggerType: "cron" | "github_poll" | "manual"
  }
  onBack: () => void
  className?: string
}

interface Execution {
  id: string
  clawId: string
  status: "running" | "success" | "failed"
  logs: string
  exitCode: number | null
  startedAt: Date
  completedAt: Date | null
}

export function ExecutionHistoryViewer({ claw, onBack, className }: ExecutionHistoryViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const logsRef = useRef<HTMLPreElement>(null)

  const utils = trpc.useUtils()

  // Fetch executions with 3-second polling for active runs
  const { data: executionsData, isLoading } = trpc.claws.getExecutions.useQuery(
    { clawId: claw.id, limit: 50 },
    {
      refetchInterval: (data) => {
        const hasRunning = data?.executions?.some((e) => e.status === "running")
        return hasRunning ? 3000 : false // Poll every 3 seconds if there's a running execution
      },
    }
  )

  const triggerMutation = trpc.claws.trigger.useMutation({
    onSuccess: () => {
      utils.claws.getExecutions.invalidate({ clawId: claw.id })
    },
  })

  const executions = (executionsData?.executions || []) as Execution[]

  // Auto-scroll logs to bottom when they update
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [executions])

  const getStatusIcon = (status: Execution["status"]) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
    }
  }

  const getStatusBadge = (status: Execution["status"]) => {
    switch (status) {
      case "running":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            Running
          </Badge>
        )
      case "success":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
            Success
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
            Failed
          </Badge>
        )
    }
  }

  const formatDuration = (start: Date, end: Date | null) => {
    const startTime = new Date(start).getTime()
    const endTime = end ? new Date(end).getTime() : Date.now()
    const durationMs = endTime - startTime
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const hasRunningExecution = executions.some((e) => e.status === "running")

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-2 pb-2 border-b border-border/50">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{claw.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{claw.triggerType} trigger</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => triggerMutation.mutate({ id: claw.id })}
          disabled={triggerMutation.isPending || hasRunningExecution}
        >
          {triggerMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1" />
          )}
          Run Now
        </Button>
      </div>

      {/* Executions List */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane: Execution list */}
        <div className="w-64 border-r border-border/50 flex flex-col">
          <div className="p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
            Execution History
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : executions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 p-4 text-center">
                <Clock className="h-6 w-6 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">No executions yet</span>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {executions.map((execution) => (
                  <div
                    key={execution.id}
                    className={cn(
                      "p-2 hover:bg-foreground/5 cursor-pointer transition-colors",
                      execution.status === "running" && "bg-yellow-500/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      {getStatusIcon(execution.status)}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(execution.startedAt))}
                      </span>
                    </div>
                    <div className="mt-1">{getStatusBadge(execution.status)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Duration: {formatDuration(execution.startedAt, execution.completedAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right pane: Logs */}
        <div className="flex-1 flex flex-col bg-black">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-black">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Logs</span>
            <div className="flex-1" />
            {hasRunningExecution && (
              <div className="flex items-center gap-1 text-xs text-yellow-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Live
              </div>
            )}
          </div>
          <ScrollArea ref={scrollRef} className="flex-1">
            <pre
              ref={logsRef}
              className="p-3 text-xs font-mono text-green-400 whitespace-pre-wrap break-all min-h-full"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            >
              {executions.length > 0 ? (
                executions[0].logs || "No logs available..."
              ) : (
                <span className="text-muted-foreground">No execution logs available...</span>
              )}
            </pre>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
