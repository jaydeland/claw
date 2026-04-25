"use client"

import { memo, useCallback } from "react"
import { useAtomValue } from "jotai"
import { Play } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { messageIdsAtom, messageAtomFamily, chatStatusAtom } from "../stores/message-store"

interface AgentContinueButtonProps {
  onContinue: () => void
  isStreaming: boolean
}

/**
 * AgentContinueButton - Shows a Continue button when the last assistant message was interrupted.
 *
 * Detection logic:
 * - Chat status is "ready" (not streaming)
 * - Last message is from assistant
 * - Last message has at least one part with state that's not "output-available" or "output-error"
 *   (indicating incomplete tool execution)
 */
export const AgentContinueButton = memo(function AgentContinueButton({
  onContinue,
  isStreaming,
}: AgentContinueButtonProps) {
  const messageIds = useAtomValue(messageIdsAtom)
  const lastMessageId = messageIds.length > 0 ? messageIds[messageIds.length - 1] : null
  const lastMessage = useAtomValue(messageAtomFamily(lastMessageId || ""))
  const chatStatus = useAtomValue(chatStatusAtom)

  // Check if the last message was interrupted
  const isInterrupted = useCallback(() => {
    // If chat status is "error", the session was interrupted
    if (chatStatus === "error") return true

    // Must not be streaming
    if (isStreaming || chatStatus === "streaming" || chatStatus === "submitted") {
      return false
    }

    // Must have a last message from assistant
    if (!lastMessage || lastMessage.role !== "assistant") {
      return false
    }

    // Check if any part is in an incomplete state
    const parts = lastMessage.parts || []
    const hasIncompletePart = parts.some((part: any) => {
      // A part is incomplete if it has a state that's not "output-available" or "output-error"
      // and it's a tool call (has a type starting with "tool-")
      if (!part.type?.startsWith("tool-")) {
        return false
      }

      // Check for pending state (state exists but is not complete)
      const hasPendingState =
        part.state &&
        part.state !== "output-available" &&
        part.state !== "output-error" &&
        part.state !== "result"

      return hasPendingState
    })

    return hasIncompletePart
  }, [lastMessage, isStreaming, chatStatus])

  if (!isInterrupted()) {
    return null
  }

  return (
    <div className="px-2 py-3 flex justify-center">
      <Button
        onClick={onContinue}
        size="sm"
        variant="secondary"
        className="gap-1.5 shadow-sm hover:shadow-md transition-shadow"
      >
        <Play className="h-3.5 w-3.5" />
        Continue
      </Button>
    </div>
  )
})
