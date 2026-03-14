"use client"

import { useState } from "react"
import { List, Play, Pause, Trash2, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, AlertTriangle } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Badge } from "../../ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card"
import { ScrollArea } from "../../ui/scroll-area"
import { toast } from "sonner"

interface WhatsAppQueueStatusProps {
  clawId?: string // Show queue for specific claw
}

// Helper functions
function formatTimeElapsed(timestamp: string): string {
  const elapsed = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(elapsed / 60000)
  const seconds = Math.floor((elapsed % 60000) / 1000)
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

function getStatusBadge(item: { status: string; startedAt: string | Date }) {
  switch (item.status) {
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      )
    case "running":
      return (
        <Badge variant="default" className="gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Running ({formatTimeElapsed(item.startedAt)})
        </Badge>
      )
    case "success":
      return (
        <Badge variant="outline" className="gap-1 text-green-600">
          <CheckCircle className="h-3 w-3" />
          Success
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      )
  }
}

// Helper component to render queue section for a single claw
function ClawQueueSection({ clawId }: { clawId: string }) {
  const utils = trpc.useUtils()
  const { data: queueStatus } = trpc.whatsapp.getQueueStatus.useQuery(undefined, { refetchInterval: 3000 })
  const { data: queueItems } = trpc.whatsapp.getQueueItems.useQuery({ clawId }, { refetchInterval: 3000 })

  const clearStuckQueue = trpc.whatsapp.clearStuckQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate({ clawId })
      toast.success(`Stuck queue cleared (${clearStuckQueue.data?.cleaned ?? 0} executions)`)
    },
    onError: (error) => {
      toast.error("Failed to clear stuck queue", { description: error.message })
    },
  })

  const handleClearStuckQueue = () => {
    if (confirm("This will mark any stuck 'running' executions (older than 10 minutes) as failed. Continue?")) {
      clearStuckQueue.mutate()
    }
  }

  return (
    <div className="border rounded-md">
      <div className="p-3 bg-muted/50 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{clawId}</span>
          {queueStatus && (
            <div className="text-xs text-muted-foreground">
              {queueStatus.pending} pending · {queueStatus.running} running
            </div>
          )}
        </div>
        {queueStatus && queueStatus.running > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearStuckQueue}
            className="text-amber-600 hover:text-amber-700 h-7 text-xs"
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            Clear Stuck
          </Button>
        )}
      </div>
      <div className="p-3 space-y-2">
        {!queueItems || queueItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No executions</p>
        ) : (
          queueItems.map((item) => (
            <div key={item.id} className="text-xs space-y-1 p-2 border rounded bg-background">
              <div className="flex items-center gap-2">
                {getStatusBadge(item)}
                <span className="font-mono text-xs">{item.id.slice(0, 8)}...</span>
              </div>
              {item.logs && (
                <p className="text-muted-foreground/70 font-mono text-xs">{item.logs.substring(0, 200)}</p>
              )}
              {item.status === "running" && (
                <p className="text-amber-600">Running for {formatTimeElapsed(item.startedAt)}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function WhatsAppQueueStatus({ clawId }: WhatsAppQueueStatusProps) {
  const utils = trpc.useUtils()

  // Get all claw IDs with pending executions
  const { data: clawIds } = trpc.whatsapp.getClawIds.useQuery()

  // Polling for queue status - filtered by clawId if provided
  const { data: queueStatus, isLoading } = trpc.whatsapp.getQueueStatus.useQuery(
    undefined,
    { refetchInterval: 3000 }
  )

  const { data: queueItems } = trpc.whatsapp.getQueueItems.useQuery(
    { clawId },
    { refetchInterval: 3000 }
  )

  // Mutations
  const pauseQueue = trpc.whatsapp.pauseQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate({ clawId })
      toast.success("Pending executions cleared")
    },
    onError: (error) => {
      toast.error("Failed to pause queue", { description: error.message })
    },
  })

  const resumeQueue = trpc.whatsapp.resumeQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate({ clawId })
      toast.success("Queue processing triggered")
    },
    onError: (error) => {
      toast.error("Failed to resume queue", { description: error.message })
    },
  })

  const clearQueue = trpc.whatsapp.clearQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate({ clawId })
      toast.success("Pending executions cleared")
    },
    onError: (error) => {
      toast.error("Failed to clear queue", { description: error.message })
    },
  })

  const clearStuckQueue = trpc.whatsapp.clearStuckQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate({ clawId })
      toast.success(`Stuck executions cleared (${clearStuckQueue.data?.cleaned ?? 0})`)
    },
    onError: (error) => {
      toast.error("Failed to clear stuck queue", { description: error.message })
    },
  })

  const handleClearQueue = () => {
    if (confirm("Clear all pending executions?")) {
      clearQueue.mutate()
    }
  }

  const handleClearStuckQueue = () => {
    if (confirm("Mark stuck 'running' executions as failed?")) {
      clearStuckQueue.mutate()
    }
  }

  const pendingCount = queueStatus?.pending ?? 0
  const runningCount = queueStatus?.running ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="h-4 w-4" />
            WhatsApp Queue Status
          </div>
          {clawIds && clawIds.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {clawIds.length} claws with pending executions
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Show per-claw sections if viewing all claws */}
        {!clawId && clawIds && clawIds.length > 0 ? (
          <div className="space-y-3">
            {clawIds.map((cid) => (
              <ClawQueueSection key={cid} clawId={cid} />
            ))}
          </div>
        ) : (
          /* Single claw view with controls */
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {queueStatus && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pauseQueue.mutate()}
                    disabled={pauseQueue.isPending || pendingCount === 0}
                  >
                    <Pause className="h-3 w-3 mr-1" />
                    Clear Pending
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resumeQueue.mutate()}
                    disabled={resumeQueue.isPending}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Process Now
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearQueue}
                    disabled={clearQueue.isPending || pendingCount === 0}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearStuckQueue}
                    disabled={clearStuckQueue.isPending || runningCount === 0}
                    className="text-amber-600 hover:text-amber-700"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Clear Stuck
                  </Button>
                </>
              )}
            </div>

            {/* Queue Items */}
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !queueItems || queueItems.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
                No pending executions.
                <br />
                <span className="text-xs">Incoming WhatsApp messages will create new executions.</span>
              </div>
            ) : (
              <ScrollArea className="h-80">
                <div className="space-y-2">
                  {queueItems
                    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between p-3 rounded-md border bg-muted/50 gap-3"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{item.clawId}</span>
                            {getStatusBadge(item)}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p className="font-mono text-xs">ID: {item.id}</p>
                            {item.logs && (
                              <p className="font-mono text-xs text-muted-foreground/70">
                                {item.logs.substring(0, 300)}
                              </p>
                            )}
                            {item.status === "running" && (
                              <p className="text-xs text-amber-600">
                                Running for {formatTimeElapsed(item.startedAt)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
