import { useEffect, useRef } from "react"
import type { PrimitiveAtom } from "jotai"
import { useAtom } from "jotai"

interface PendingMessagesConfig {
  isStreaming: boolean
  subChatId: string
  sendMessage: (message: { role: "user"; parts: Array<{ type: "text"; text: string } | { type: "data-image"; data: any }> }) => void
  setIsCreatingPr: (value: boolean) => void
}

interface PendingMessageAtoms {
  pendingPrMessageAtom: PrimitiveAtom<string | null>
  pendingReviewMessageAtom: PrimitiveAtom<string | null>
  pendingConflictResolutionMessageAtom: PrimitiveAtom<string | null>
  pendingPostMergeMessageAtom: PrimitiveAtom<string | null>
  pendingAuthRetryMessageAtom: PrimitiveAtom<{
    subChatId: string
    prompt: string
    images?: Array<{ base64Data: string; mediaType: string; filename?: string }>
    readyToRetry?: boolean
  } | null>
}

/**
 * Consolidated hook for watching pending messages (PR, Review, Conflict, Auth)
 * Reduces 4 separate useEffect hooks into 1
 */
export function usePendingMessages(
  config: PendingMessagesConfig,
  atoms: PendingMessageAtoms
) {
  const { isStreaming, subChatId, sendMessage, setIsCreatingPr } = config

  const [pendingPrMessage, setPendingPrMessage] = useAtom(atoms.pendingPrMessageAtom)
  const [pendingReviewMessage, setPendingReviewMessage] = useAtom(atoms.pendingReviewMessageAtom)
  const [pendingConflictMessage, setPendingConflictMessage] = useAtom(atoms.pendingConflictResolutionMessageAtom)
  const [pendingPostMergeMessage, setPendingPostMergeMessage] = useAtom(atoms.pendingPostMergeMessageAtom)
  const [pendingAuthRetry, setPendingAuthRetry] = useAtom(atoms.pendingAuthRetryMessageAtom)

  // Keep sendMessage in ref to avoid effect re-runs
  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage

  useEffect(() => {
    // Skip if streaming - wait for stream to finish
    if (isStreaming) return

    // Process pending PR message
    if (pendingPrMessage) {
      setPendingPrMessage(null)
      sendMessageRef.current({
        role: "user",
        parts: [{ type: "text", text: pendingPrMessage }],
      })
      setIsCreatingPr(false)
      return
    }

    // Process pending Review message
    if (pendingReviewMessage) {
      setPendingReviewMessage(null)
      sendMessageRef.current({
        role: "user",
        parts: [{ type: "text", text: pendingReviewMessage }],
      })
      return
    }

    // Process pending Conflict message
    if (pendingConflictMessage) {
      setPendingConflictMessage(null)
      sendMessageRef.current({
        role: "user",
        parts: [{ type: "text", text: pendingConflictMessage }],
      })
      return
    }

    // Process pending Post-Merge message
    if (pendingPostMergeMessage) {
      setPendingPostMergeMessage(null)
      sendMessageRef.current({
        role: "user",
        parts: [{ type: "text", text: pendingPostMergeMessage }],
      })
      return
    }

    // Process pending Auth retry
    if (pendingAuthRetry?.readyToRetry && pendingAuthRetry.subChatId === subChatId) {
      setPendingAuthRetry(null)
      const parts: Array<{ type: "text"; text: string } | { type: "data-image"; data: any }> = [
        { type: "text", text: pendingAuthRetry.prompt }
      ]
      if (pendingAuthRetry.images?.length) {
        for (const img of pendingAuthRetry.images) {
          parts.push({
            type: "data-image",
            data: {
              base64Data: img.base64Data,
              mediaType: img.mediaType,
              filename: img.filename,
            },
          })
        }
      }
      sendMessageRef.current({ role: "user", parts })
    }
  }, [
    isStreaming,
    subChatId,
    pendingPrMessage,
    pendingReviewMessage,
    pendingConflictMessage,
    pendingPostMergeMessage,
    pendingAuthRetry,
    setPendingPrMessage,
    setPendingReviewMessage,
    setPendingConflictMessage,
    setPendingPostMergeMessage,
    setPendingAuthRetry,
    setIsCreatingPr,
  ])

  return {
    setPendingPrMessage,
    setPendingReviewMessage,
    setPendingConflictMessage,
    setPendingPostMergeMessage,
    setPendingAuthRetry,
  }
}
