import { useEffect, useRef } from "react"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import { clearSubChatCaches } from "../stores/message-store"
import type { AgentMode } from "../atoms"

interface SubChatModeConfig {
  subChatId: string
  mode: AgentMode
  setMode: (value: AgentMode) => void
  updateSubChatModeMutation: {
    mutate: (input: { subChatId: string; mode: AgentMode }) => void
  }
}

// Legacy interface for backward compatibility
interface LegacySubChatModeConfig {
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
 * Supports both new tri-state mode and legacy boolean mode for backward compatibility
 */
export function useSubChatMode(config: SubChatModeConfig | LegacySubChatModeConfig) {
  // Detect if using legacy interface
  const isLegacy = "isPlanMode" in config

  // Normalize to new interface
  const subChatId = config.subChatId
  const mode: AgentMode = isLegacy
    ? (config as LegacySubChatModeConfig).isPlanMode ? "plan" : "agent"
    : (config as SubChatModeConfig).mode
  const setMode = isLegacy
    ? (newMode: AgentMode) => (config as LegacySubChatModeConfig).setIsPlanMode(newMode === "plan")
    : (config as SubChatModeConfig).setMode
  const updateSubChatModeMutation = config.updateSubChatModeMutation

  // Track last initialized sub-chat to prevent re-initialization
  const lastInitializedRef = useRef<string | null>(null)

  // Track last mode to detect actual user changes (not store updates)
  const lastModeRef = useRef<AgentMode>(mode)

  // ===== Combined effect: Initialize from store + sync user changes + cleanup =====
  useEffect(() => {
    // 1. Initialize mode from sub-chat metadata when switching sub-chats
    if (subChatId && subChatId !== lastInitializedRef.current) {
      const subChat = useAgentSubChatStore
        .getState()
        .allSubChats.find((sc) => sc.id === subChatId)

      if (subChat?.mode) {
        const newMode = subChat.mode as AgentMode
        lastModeRef.current = newMode
        setMode(newMode)
      }
      lastInitializedRef.current = subChatId
    }

    // 2. Cleanup message caches on unmount
    return () => {
      clearSubChatCaches(subChatId)
    }
  }, [subChatId, setMode])

  // ===== Sync mode changes to store and DB =====
  useEffect(() => {
    // Skip if mode didn't actually change
    if (lastModeRef.current === mode) {
      return
    }

    lastModeRef.current = mode

    if (subChatId) {
      // Update local store immediately (optimistic update)
      useAgentSubChatStore.getState().updateSubChatMode(subChatId, mode)

      // Save to database with error handling
      if (!subChatId.startsWith("temp-")) {
        updateSubChatModeMutation.mutate({ subChatId, mode })
      }
    }
  }, [mode, subChatId, updateSubChatModeMutation])

  return {
    lastModeRef,
    // Legacy compatibility
    lastIsPlanModeRef: { current: mode === "plan" },
  }
}
