"use client"

import { useEffect, useMemo, useCallback } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { atom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { viewingHistoryChatIdAtom } from "../../agents/atoms"
import {
  messageIdsAtom,
  messageAtomFamily,
  syncMessagesWithStatusAtom,
  type Message,
} from "../../agents/stores/message-store"
import { SessionFlowPanel } from "../../session-flow/ui/session-flow-panel"
import { Button } from "../../../components/ui/button"
import { IconTextUndo, ArchiveIcon } from "../../../components/ui/icons"
import { ReactFlowProvider } from "reactflow"
import { TooltipProvider } from "../../../components/ui/tooltip"
import "reactflow/dist/style.css"

// Hook to populate messages from historical chat data
function useHistoryMessages(chatId: string | null) {
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)

  const { data: chatData, isLoading } = trpc.chats.get.useQuery(
    { id: chatId! },
    { enabled: !!chatId }
  )

  // Parse and flatten all messages from sub-chats
  const allMessages = useMemo<Message[]>(() => {
    if (!chatData?.subChats) return []

    const messages: Message[] = []
    for (const subChat of chatData.subChats) {
      try {
        const parsed = JSON.parse(subChat.messages || "[]") as Message[]
        // Ensure each message has a unique ID (prefix with subChat ID to avoid collisions)
        const prefixedMessages = parsed.map((msg, idx) => ({
          ...msg,
          id: msg.id || `${subChat.id}-${idx}`,
        }))
        messages.push(...prefixedMessages)
      } catch {
        // Skip invalid JSON
      }
    }
    return messages
  }, [chatData?.subChats])

  // Sync messages to the message store when they change
  useEffect(() => {
    if (allMessages.length > 0) {
      syncMessages({
        messages: allMessages,
        status: "ready", // Read-only, not streaming
        subChatId: chatId ? `history-${chatId}` : "history-default",
      })
    }
  }, [allMessages, syncMessages, chatId])

  return { chatData, isLoading, messageCount: allMessages.length }
}

interface HistoryChatViewProps {
  className?: string
}

export function HistoryChatView({ className }: HistoryChatViewProps) {
  const [viewingChatId, setViewingChatId] = useAtom(viewingHistoryChatIdAtom)
  const { chatData, isLoading, messageCount } = useHistoryMessages(viewingChatId)
  const utils = trpc.useUtils()

  // Restore chat mutation
  const restoreMutation = trpc.chats.restore.useMutation({
    onSuccess: (restoredChat) => {
      if (restoredChat) {
        utils.chats.list.setData({}, (oldData) => {
          if (!oldData) return [restoredChat]
          if (oldData.some((c) => c.id === restoredChat.id)) return oldData
          return [restoredChat, ...oldData]
        })
      }
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
      // Clear viewing state after restore
      setViewingChatId(null)
    },
  })

  const handleRestore = useCallback(() => {
    if (viewingChatId) {
      restoreMutation.mutate({ id: viewingChatId })
    }
  }, [viewingChatId, restoreMutation])

  // No-op scroll handler for read-only mode
  const handleScrollToMessage = useCallback((_messageId: string, _partIndex?: number) => {
    // In history view, we could potentially scroll to message but for now it's a no-op
  }, [])

  // No chat selected
  if (!viewingChatId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <ArchiveIcon className="h-12 w-12 mb-4 text-muted-foreground/30" />
        <p className="text-sm">Select a chat from the history list</p>
        <p className="text-xs text-muted-foreground/70 mt-1">to view its session flow</p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Loading chat history...</p>
      </div>
    )
  }

  // No messages
  if (messageCount === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">
              {chatData?.name || "Untitled"}
            </h3>
            {chatData?.branch && (
              <p className="text-xs text-muted-foreground truncate font-mono">
                {chatData.branch}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRestore}
            disabled={restoreMutation.isPending}
            className="flex-shrink-0 ml-2"
          >
            <IconTextUndo className="h-3.5 w-3.5 mr-1.5" />
            Restore
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">No messages in this chat</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">
              {chatData?.name || "Untitled"}
            </h3>
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              Read-only
            </span>
          </div>
          {chatData?.branch && (
            <p className="text-xs text-muted-foreground truncate font-mono">
              {chatData.branch}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRestore}
          disabled={restoreMutation.isPending}
          className="flex-shrink-0 ml-2"
        >
          <IconTextUndo className="h-3.5 w-3.5 mr-1.5" />
          Restore
        </Button>
      </div>

      {/* Session Flow Panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TooltipProvider>
          <ReactFlowProvider>
            <SessionFlowPanel onScrollToMessage={handleScrollToMessage} />
          </ReactFlowProvider>
        </TooltipProvider>
      </div>
    </div>
  )
}
