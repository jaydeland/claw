import { useAtomValue } from "jotai"
import { useMemo } from "react"
import {
  loadingSubChatsAtom,
  agentsUnseenChangesAtom,
  pendingUserQuestionsAtom,
  pendingPlanApprovalsAtom,
  subChatToChatMapAtom,
} from "../../agents/atoms"
import { useStreamingStatusStore } from "../../agents/stores/streaming-status-store"
import type { ChatStatusType } from "../components/chat-status-badge"

/**
 * Hook to get aggregated status for a chat from all its sub-chats
 * Priority: error > pending-input > unseen > loading > null
 */
export function useChatStatus(chatId: string): ChatStatusType {
  // Read atoms
  const loadingSubChats = useAtomValue(loadingSubChatsAtom)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  const pendingPlanApprovals = useAtomValue(pendingPlanApprovalsAtom)
  const subChatToChatMap = useAtomValue(subChatToChatMapAtom)

  // Subscribe to streaming status store for error detection
  const streamingStatuses = useStreamingStatusStore((state) => state.statuses)

  return useMemo(() => {
    // Priority 1: Check for errors in any sub-chat belonging to this chat
    for (const [subChatId, status] of Object.entries(streamingStatuses)) {
      if (status === "error") {
        const parentChatId = subChatToChatMap.get(subChatId)
        if (parentChatId === chatId) {
          return "error"
        }
      }
    }

    // Priority 2: Check for pending user questions
    for (const question of pendingQuestions.values()) {
      if (question.parentChatId === chatId) {
        return "pending-input"
      }
    }

    // Priority 3: Check for pending plan approvals
    for (const subChatId of pendingPlanApprovals) {
      const parentChatId = subChatToChatMap.get(subChatId)
      if (parentChatId === chatId) {
        return "pending-input" // Use same indicator as pending user question
      }
    }

    // Priority 4: Check for unseen changes (already at chat level)
    if (unseenChanges.has(chatId)) {
      return "unseen"
    }

    // Priority 5: Check for loading/streaming
    for (const parentChatId of loadingSubChats.values()) {
      if (parentChatId === chatId) {
        return "loading"
      }
    }

    return null
  }, [
    chatId,
    loadingSubChats,
    unseenChanges,
    pendingQuestions,
    pendingPlanApprovals,
    subChatToChatMap,
    streamingStatuses,
  ])
}

/**
 * Hook to get status for multiple chats at once (more efficient for lists)
 * Returns a Map<chatId, ChatStatusType>
 */
export function useChatStatuses(chatIds: string[]): Map<string, ChatStatusType> {
  const loadingSubChats = useAtomValue(loadingSubChatsAtom)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  const pendingPlanApprovals = useAtomValue(pendingPlanApprovalsAtom)
  const subChatToChatMap = useAtomValue(subChatToChatMapAtom)
  const streamingStatuses = useStreamingStatusStore((state) => state.statuses)

  return useMemo(() => {
    const chatIdSet = new Set(chatIds)
    const statuses = new Map<string, ChatStatusType>()

    // Build sets for quick lookup
    const loadingChatIds = new Set<string>()
    for (const parentChatId of loadingSubChats.values()) {
      if (chatIdSet.has(parentChatId)) {
        loadingChatIds.add(parentChatId)
      }
    }

    const errorChatIds = new Set<string>()
    for (const [subChatId, status] of Object.entries(streamingStatuses)) {
      if (status === "error") {
        const parentChatId = subChatToChatMap.get(subChatId)
        if (parentChatId && chatIdSet.has(parentChatId)) {
          errorChatIds.add(parentChatId)
        }
      }
    }

    const pendingInputChatIds = new Set<string>()
    for (const question of pendingQuestions.values()) {
      if (chatIdSet.has(question.parentChatId)) {
        pendingInputChatIds.add(question.parentChatId)
      }
    }

    // Add pending plan approvals to pending input
    for (const subChatId of pendingPlanApprovals) {
      const parentChatId = subChatToChatMap.get(subChatId)
      if (parentChatId && chatIdSet.has(parentChatId)) {
        pendingInputChatIds.add(parentChatId)
      }
    }

    // Assign statuses by priority
    for (const chatId of chatIds) {
      if (errorChatIds.has(chatId)) {
        statuses.set(chatId, "error")
      } else if (pendingInputChatIds.has(chatId)) {
        statuses.set(chatId, "pending-input")
      } else if (unseenChanges.has(chatId)) {
        statuses.set(chatId, "unseen")
      } else if (loadingChatIds.has(chatId)) {
        statuses.set(chatId, "loading")
      }
    }

    return statuses
  }, [
    chatIds,
    loadingSubChats,
    unseenChanges,
    pendingQuestions,
    pendingPlanApprovals,
    subChatToChatMap,
    streamingStatuses,
  ])
}
