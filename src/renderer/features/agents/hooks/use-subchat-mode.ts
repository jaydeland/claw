import { useEffect, useRef } from "react"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import { clearSubChatCaches } from "../stores/message-store"

interface SubChatModeConfig {
  subChatId: string
  isPlanMode: boolean
  setIsPlanMode: (value: boolean) => void
  updateSubChatModeMutation: {
    mutate: (input: { subChatId: string; mode: "plan" | "agent" }) => void
  }
}

/**
 * Consolidated hook for sub-chat mode management
 * Combines initialization, sync, and cleanup effects
 * Reduces 3 separate useEffect hooks into 1
 */
export function useSubChatMode(config: SubChatModeConfig) {
  const { subChatId, isPlanMode, setIsPlanMode, updateSubChatModeMutation } = config

  // Track last initialized sub-chat to prevent re-initialization
  const lastInitializedRef = useRef<string | null>(null)

  // Track last mode to detect actual user changes (not store updates)
  const lastIsPlanModeRef = useRef<boolean>(isPlanMode)

  // ===== Combined effect: Initialize from store + sync user changes + cleanup =====
  useEffect(() => {
    // 1. Initialize mode from sub-chat metadata when switching sub-chats
    if (subChatId && subChatId !== lastInitializedRef.current) {
      const subChat = useAgentSubChatStore
        .getState()
        .allSubChats.find((sc) => sc.id === subChatId)

      if (subChat?.mode) {
        const newMode = subChat.mode === "plan"
        lastIsPlanModeRef.current = newMode
        setIsPlanMode(newMode)
      }
      lastInitializedRef.current = subChatId
    }

    // 2. Cleanup message caches on unmount
    return () => {
      clearSubChatCaches(subChatId)
    }
  }, [subChatId, setIsPlanMode])

  // ===== Sync mode changes to store and DB =====
  useEffect(() => {
    // Skip if isPlanMode didn't actually change
    if (lastIsPlanModeRef.current === isPlanMode) {
      return
    }

    const newMode = isPlanMode ? "plan" : "agent"
    lastIsPlanModeRef.current = isPlanMode

    if (subChatId) {
      // Update local store immediately (optimistic update)
      useAgentSubChatStore.getState().updateSubChatMode(subChatId, newMode)

      // Save to database with error handling
      if (!subChatId.startsWith("temp-")) {
        updateSubChatModeMutation.mutate({ subChatId, mode: newMode })
      }
    }
  }, [isPlanMode, subChatId, updateSubChatModeMutation])

  return {
    lastIsPlanModeRef,
  }
}
