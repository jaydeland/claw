"use client"

import { useEffect, useMemo } from "react"
import { useAtom, useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { viewingClawExecutionAtom, isViewingClawChatAtom } from "../../../lib/atoms"
import {
  messageIdsAtom,
  messageAtomFamily,
  syncMessagesWithStatusAtom,
  type Message,
} from "../../agents/stores/message-store"
import { SessionFlowPanel } from "../../session-flow/ui/session-flow-panel"
import { Button } from "../../../components/ui/button"
import { Play, Loader2, ArrowLeft } from "lucide-react"
import { ReactFlowProvider } from "reactflow"
import { TooltipProvider } from "../../../components/ui/tooltip"
import "reactflow/dist/style.css"

interface ClawChatViewProps {
  className?: string
}

export function ClawChatView({ className }: ClawChatViewProps) {
  const [viewingExecution, setViewingExecution] = useAtom(viewingClawExecutionAtom)
  const setIsViewingClawChat = useSetAtom(isViewingClawChatAtom)
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)
  const utils = trpc.useUtils()

  const { data: executionData, isLoading } = trpc.claws.getExecution.useQuery(
    { id: viewingExecution?.executionId! },
    { enabled: !!viewingExecution?.executionId }
  )

  const { data: subChatData } = trpc.chats.getSubChat.useQuery(
    { id: executionData?.execution?.subChatId! },
    { enabled: !!executionData?.execution?.subChatId }
  )

  // Parse messages from subChat
  const messages = useMemo<Message[]>(() => {
    if (!subChatData?.messages) return []
    try {
      return JSON.parse(subChatData.messages) as Message[]
    } catch {
      return []
    }
  }, [subChatData?.messages])

  // Sync messages to store
  useEffect(() => {
    if (messages.length > 0) {
      syncMessages({
        messages,
        status: executionData?.execution?.status === "running" ? "streaming" : "ready",
        subChatId: viewingExecution?.subChatId || "claw-default",
      })
    }
  }, [messages, syncMessages, viewingExecution?.subChatId, executionData?.execution?.status])

  // Continue in main chat mutation
  const continueMutation = trpc.claws.continueInChat.useMutation({
    onSuccess: (result) => {
      if (result?.chatId && result?.subChatId) {
        // Navigate to the new chat with the continued session
        // This would need to be integrated with the main navigation
        // For now, we'll just close the claw chat view
        setIsViewingClawChat(false)
        setViewingExecution(null)
      }
    },
  })

  const handleBack = () => {
    setIsViewingClawChat(false)
    setViewingExecution(null)
  }

  const handleContinue = () => {
    if (viewingExecution?.executionId) {
      continueMutation.mutate({ executionId: viewingExecution.executionId })
    }
  }

  if (!viewingExecution) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Play className="h-12 w-12 mb-4 text-muted-foreground/30" />
        <p className="text-sm">Select a Claw execution from the history</p>
        <p className="text-xs text-muted-foreground/70 mt-1">to view the conversation</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <p className="text-sm">Loading execution...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-7 w-7 shrink-0"
            title="Back to Claws"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">
                {viewingExecution.clawName}
              </h3>
              <StatusBadge status={executionData?.execution?.status} />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {viewingExecution.subChatName || executionData?.execution?.subChatName}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleContinue}
          disabled={continueMutation.isPending || executionData?.execution?.status === "running"}
          className="flex-shrink-0 ml-2"
        >
          {continueMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1.5" />
          )}
          Continue in Chat
        </Button>
      </div>

      {/* Session Flow Panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TooltipProvider>
          <ReactFlowProvider>
            <SessionFlowPanel onScrollToMessage={() => {
              // In claw-chat-view, scrolling to message is handled differently
              // This is a no-op since the flow panel is standalone here
            }} />
          </ReactFlowProvider>
        </TooltipProvider>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const styles = {
    running: "bg-yellow-500/10 text-yellow-500",
    success: "bg-green-500/10 text-green-500",
    failed: "bg-red-500/10 text-red-500",
  }

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${styles[status as keyof typeof styles] || styles.running}`}>
      {status || "running"}
    </span>
  )
}
