// Consolidated hooks for reducing useEffect count in active-chat.tsx
export {
  useChatKeyboardShortcuts,
  navigateSubChat,
} from "./use-chat-keyboard-shortcuts"

export { usePendingMessages } from "./use-pending-messages"

export {
  useDiffSidebarEffects,
  useThrottledDiffRefetch,
} from "./use-diff-sidebar-effects"

export { useChatScroll } from "./use-chat-scroll"

export {
  useAtomSync,
  useSetAtomSync,
  useSetAtomCleanup,
  usePendingPlanApprovalsSync,
  useRollbackSync,
  useStreamingStatusSync,
} from "./use-atom-sync"

export { useSubChatMode } from "./use-subchat-mode"

// Re-export existing hooks
export { useAgentsFileUpload } from "./use-agents-file-upload"
export { useChangedFilesTracking } from "./use-changed-files-tracking"
export { useDesktopNotifications } from "./use-desktop-notifications"
export { useFocusInputOnEnter } from "./use-focus-input-on-enter"
export { useHaptic } from "./use-haptic"
export { useTextContextSelection } from "./use-text-context-selection"
export { useToggleFocusOnCmdEsc } from "./use-toggle-focus-on-cmd-esc"
