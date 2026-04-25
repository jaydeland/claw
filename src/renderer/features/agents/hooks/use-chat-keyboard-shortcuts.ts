import { useEffect, useRef } from "react"
import { isDesktopApp } from "../../../lib/utils/platform"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import { agentChatStore } from "../stores/agent-chat-store"

interface KeyboardShortcutHandlers {
  onStopStream?: () => Promise<void>
  onSkipQuestions?: () => Promise<void>
  onApprovePlan?: () => void
  onScrollToBottom?: () => void
  onCreateNewSubChat?: () => void
  onCloseSubChat?: (subChatId: string) => void
  onNavigateSubChat?: (direction: "prev" | "next") => void
  onToggleDiffSidebar?: () => void
  onCreatePr?: () => void
  onRestoreWorkspace?: () => void
}

interface KeyboardShortcutState {
  isActive: boolean
  isStreaming: boolean
  hasUnapprovedPlan: boolean
  hasPendingQuestions: boolean
  canCreatePr: boolean
  isCreatingPr: boolean
  isArchived: boolean
  subChatId: string
  editorRef: React.RefObject<{ getValue: () => string } | null>
}

/**
 * Consolidated keyboard shortcuts hook for ChatViewInner
 * Reduces 9+ separate useEffect hooks into a single unified handler
 */
export function useChatKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  state: KeyboardShortcutState
) {
  // Keep state in refs for the event handler
  const stateRef = useRef(state)
  stateRef.current = state

  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    // Skip keyboard handlers for inactive tabs (keep-alive)
    if (!state.isActive) return

    const handleKeyDown = async (e: KeyboardEvent) => {
      const currentState = stateRef.current
      const currentHandlers = handlersRef.current
      const isDesktop = isDesktopApp()

      // ===== ESC / Ctrl+C: Stop streaming or skip questions =====
      if (
        (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) ||
        (e.ctrlKey && !e.metaKey && e.code === "KeyC")
      ) {
        if (!currentState.isStreaming) return

        // For Ctrl+C, check if there's a text selection (allow copy)
        if (e.ctrlKey && e.code === "KeyC") {
          const selection = window.getSelection()
          if (selection && selection.toString().length > 0) return
        }

        // For ESC, check if inside overlay
        if (e.key === "Escape") {
          const target = e.target as HTMLElement
          const isInsideOverlay = target.closest(
            '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-state="open"]'
          )
          const hasOpenDialog = document.querySelector(
            '[role="dialog"][aria-modal="true"], [data-modal="agents-settings"]'
          )
          if (isInsideOverlay || hasOpenDialog) return
        }

        e.preventDefault()
        if (currentState.hasPendingQuestions && currentHandlers.onSkipQuestions) {
          await currentHandlers.onSkipQuestions()
        } else if (currentHandlers.onStopStream) {
          agentChatStore.setManuallyAborted(currentState.subChatId, true)
          await currentHandlers.onStopStream()
        }
        return
      }

      // ===== Cmd+Shift+Backspace: Force stop =====
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Backspace" && currentState.isStreaming) {
        e.preventDefault()
        if (currentHandlers.onStopStream) {
          agentChatStore.setManuallyAborted(currentState.subChatId, true)
          await currentHandlers.onStopStream()
        }
        return
      }

      // ===== Cmd+Enter: Approve plan =====
      if (
        e.key === "Enter" &&
        e.metaKey &&
        !e.shiftKey &&
        currentState.hasUnapprovedPlan &&
        !currentState.isStreaming &&
        currentHandlers.onApprovePlan
      ) {
        e.preventDefault()
        currentHandlers.onApprovePlan()
        return
      }

      // ===== Cmd+ArrowDown: Scroll to bottom =====
      if (
        e.key === "ArrowDown" &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        currentHandlers.onScrollToBottom
      ) {
        // Don't intercept if input has content
        const inputValue = currentState.editorRef.current?.getValue() || ""
        if (inputValue.trim().length > 0) return
        e.preventDefault()
        currentHandlers.onScrollToBottom()
        return
      }

      // ===== Cmd+T / Opt+Cmd+T: New sub-chat =====
      const isNewSubChatDesktop = isDesktop && e.metaKey && e.code === "KeyT" && !e.altKey
      const isNewSubChatWeb = e.altKey && e.metaKey && e.code === "KeyT"
      if ((isNewSubChatDesktop || isNewSubChatWeb) && currentHandlers.onCreateNewSubChat) {
        e.preventDefault()
        currentHandlers.onCreateNewSubChat()
        return
      }

      // ===== Cmd+W / Opt+Cmd+W: Close sub-chat =====
      const isCloseDesktop = isDesktop && e.metaKey && e.code === "KeyW" && !e.altKey && !e.shiftKey && !e.ctrlKey
      const isCloseWeb = e.altKey && e.metaKey && e.code === "KeyW"
      if ((isCloseDesktop || isCloseWeb) && currentHandlers.onCloseSubChat) {
        e.preventDefault()
        const store = useAgentSubChatStore.getState()
        const activeId = store.activeSubChatId
        const openIds = store.openSubChatIds
        if (activeId && openIds.length > 1) {
          currentHandlers.onCloseSubChat(activeId)
        }
        return
      }

      // ===== Cmd+[ / Opt+Cmd+[: Previous sub-chat =====
      const isPrevDesktop = isDesktop && e.metaKey && e.code === "BracketLeft" && !e.altKey && !e.shiftKey && !e.ctrlKey
      const isPrevWeb = e.altKey && e.metaKey && e.code === "BracketLeft"
      if ((isPrevDesktop || isPrevWeb) && currentHandlers.onNavigateSubChat) {
        e.preventDefault()
        currentHandlers.onNavigateSubChat("prev")
        return
      }

      // ===== Cmd+] / Opt+Cmd+]: Next sub-chat =====
      const isNextDesktop = isDesktop && e.metaKey && e.code === "BracketRight" && !e.altKey && !e.shiftKey && !e.ctrlKey
      const isNextWeb = e.altKey && e.metaKey && e.code === "BracketRight"
      if ((isNextDesktop || isNextWeb) && currentHandlers.onNavigateSubChat) {
        e.preventDefault()
        currentHandlers.onNavigateSubChat("next")
        return
      }

      // ===== Cmd+D: Toggle diff sidebar =====
      if (e.metaKey && !e.altKey && !e.shiftKey && !e.ctrlKey && e.code === "KeyD" && currentHandlers.onToggleDiffSidebar) {
        e.preventDefault()
        e.stopPropagation()
        currentHandlers.onToggleDiffSidebar()
        return
      }

      // ===== Cmd+P / Opt+Cmd+P: Create PR =====
      const isPrDesktop = isDesktop && e.metaKey && e.code === "KeyP" && !e.altKey && !e.shiftKey && !e.ctrlKey
      const isPrWeb = e.altKey && e.metaKey && e.code === "KeyP"
      if ((isPrDesktop || isPrWeb) && currentHandlers.onCreatePr) {
        if (currentState.canCreatePr && !currentState.isCreatingPr) {
          e.preventDefault()
          e.stopPropagation()
          currentHandlers.onCreatePr()
        }
        return
      }

      // ===== Cmd+Shift+E: Restore archived workspace =====
      if (
        e.metaKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        e.code === "KeyE" &&
        currentState.isArchived &&
        currentHandlers.onRestoreWorkspace
      ) {
        e.preventDefault()
        e.stopPropagation()
        currentHandlers.onRestoreWorkspace()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [state.isActive]) // Only re-attach when isActive changes
}

/**
 * Hook for sub-chat navigation (used by keyboard shortcuts)
 */
export function navigateSubChat(direction: "prev" | "next") {
  const store = useAgentSubChatStore.getState()
  const activeId = store.activeSubChatId
  const openIds = store.openSubChatIds

  if (openIds.length <= 1) return

  if (!activeId) {
    store.setActiveSubChat(openIds[0])
    return
  }

  const currentIndex = openIds.indexOf(activeId)
  if (currentIndex === -1) {
    store.setActiveSubChat(openIds[0])
    return
  }

  let nextIndex: number
  if (direction === "prev") {
    nextIndex = currentIndex - 1 < 0 ? openIds.length - 1 : currentIndex - 1
  } else {
    nextIndex = (currentIndex + 1) % openIds.length
  }

  const nextId = openIds[nextIndex]
  if (nextId) {
    store.setActiveSubChat(nextId)
  }
}
