"use client"

import { useState } from "react"
import { List, Play, Pause, Trash2, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Badge } from "../../ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card"
import { ScrollArea } from "../../ui/scroll-area"
import { toast } from "sonner"
import type { WhatsAppQueueItem } from "../../../../main/lib/claws/queue-types"

interface WhatsAppQueueStatusProps {
  chatId?: string
}

export function WhatsAppQueueStatus({ chatId }: WhatsAppQueueStatusProps) {
  const utils = trpc.useUtils()

  // Polling for queue status (simpler than subscription for this use case)
  const { data: queueStatus, isLoading } = trpc.whatsapp.getQueueStatus.useQuery()
  const { data: queueItems } = trpc.whatsapp.getQueueItems.useQuery(undefined, {
    refetchInterval: 3000, // Refresh every 3 seconds
  })

  // Mutations
  const pauseQueue = trpc.whatsapp.pauseQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate()
      toast.success("Queue paused")
    },
    onError: (error) => {
      toast.error("Failed to pause queue", { description: error.message })
    },
  })

  const resumeQueue = trpc.whatsapp.resumeQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate()
      toast.success("Queue resumed")
    },
    onError: (error) => {
      toast.error("Failed to resume queue", { description: error.message })
    },
  })

  const clearQueue = trpc.whatsapp.clearQueue.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate()
      toast.success("Queue cleared")
    },
    onError: (error) => {
      toast.error("Failed to clear queue", { description: error.message })
    },
  })

  const removeQueueItem = trpc.whatsapp.removeQueueItem.useMutation({
    onSuccess: () => {
      utils.whatsapp.getQueueStatus.invalidate()
      utils.whatsapp.getQueueItems.invalidate()
      toast.success("Item removed from queue")
    },
    onError: (error) => {
      toast.error("Failed to remove item", { description: error.message })
    },
  })

  const handleClearQueue = () => {
    if (confirm("Are you sure you want to clear all pending queue items?")) {
      clearQueue.mutate()
    }
  }

  const getStatusBadge = (item: WhatsAppQueueItem) => {
    switch (item.status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        )
      case "processing":
        return (
          <Badge variant="default" className="gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Processing
          </Badge>
        )
      case "completed":
        return (
          <Badge variant="outline" className="gap-1 text-green-600">
            <CheckCircle className="h-3 w-3" />
            Completed
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

  const pendingCount = queueStatus?.pending ?? 0
  const processingCount = queueStatus?.processing ?? 0
  const completedCount = queueStatus?.completed ?? 0
  const failedCount = queueStatus?.failed ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="h-4 w-4" />
            WhatsApp Queue Status
          </div>
          <div className="flex items-center gap-2">
            {queueStatus && (
              <div className="text-xs text-muted-foreground">
                {pendingCount} pending · {processingCount} processing · {completedCount} completed
              </div>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Controls */}
        <div className="flex items-center gap-2">
          {queueStatus && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pauseQueue.mutate()}
                disabled={pauseQueue.isPending || processingCount > 0}
              >
                <Pause className="h-3 w-3 mr-1" />
                Pause
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => resumeQueue.mutate()}
                disabled={resumeQueue.isPending}
              >
                <Play className="h-3 w-3 mr-1" />
                Resume
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearQueue}
                disabled={clearQueue.isPending || pendingCount === 0}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
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
            No messages in queue.
            <br />
            <span className="text-xs">Incoming WhatsApp messages will be queued for sequential processing.</span>
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {queueItems
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-md border bg-muted/50"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.clawName}</span>
                        {getStatusBadge(item)}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="truncate">From: {item.sender}</p>
                        <p className="truncate text-muted-foreground/70">
                          {item.messageText.length > 60
                            ? `${item.messageText.substring(0, 60)}...`
                            : item.messageText}
                        </p>
                      </div>
                      {item.errorMessage && (
                        <div className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          {item.errorMessage}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeQueueItem.mutate({ itemId: item.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
