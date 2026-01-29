"use client"

import { memo, useMemo, useRef, createContext, useContext, useSyncExternalStore, useCallback, useLayoutEffect } from "react"
import { useAtomValue } from "jotai"
import { AssistantMessageItem } from "./assistant-message-item"
import {
  messageAtomFamily,
  isLastMessageAtomFamily,
  isStreamingAtom,
  chatStatusAtom,
} from "../stores/message-store"
import { extractTextMentions, TextMentionBlocks } from "../mentions/render-file-mentions"

// ============================================================================
// OPTIMIZATION STRATEGY
// ============================================================================
//
// This file implements several key optimizations to minimize re-renders:
//
// 1. SHALLOW EQUALITY CHECKS
//    - Custom shallowEqual function for comparing objects/arrays
//    - Prevents re-renders when data hasn't actually changed
//
// 2. FINE-GRAINED SUBSCRIPTIONS
//    - Components subscribe only to the data they need
//    - MessageItemWrapper subscribes to isLast status only
//    - Message content comes from Jotai atoms, not store subscriptions
//
// 3. REFERENCE STABILITY
//    - Return cached values when data hasn't changed
//    - Use refs to store previous values for comparison
//    - Stabilize array references when contents are identical
//
// 4. CONSOLIDATED SELECTORS
//    - Extract only the minimum required state slice
//    - Avoid computing derived state in multiple places
//
// 5. MEMOIZATION BOUNDARIES
//    - Custom arePropsEqual functions for memo components
//    - MemoizedAssistantMessages only re-renders when IDs change
//
// ============================================================================

// ============================================================================
// UTILITY: Shallow Equality Helper
// ============================================================================
// Optimization: Reusable shallow comparison prevents duplicate equality logic
// and ensures consistent behavior across all hooks.

function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  // Handle objects
  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)
  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if ((a as any)[key] !== (b as any)[key]) return false
  }
  return true
}

// Optimization: Compare arrays by value efficiently
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// ============================================================================
// MESSAGE STORE - External store for fine-grained subscriptions
// ============================================================================

type Message = any

interface MessageStore {
  messages: Message[]
  status: string
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { messages: Message[]; status: string }
  initMessages: (messages: Message[], status: string) => void  // Silent init, no notifications
  setMessages: (messages: Message[], status: string) => void   // Update with notifications
}

function createMessageStore(): MessageStore {
  let messages: Message[] = []
  let status = "ready"
  let listeners = new Set<() => void>()

  // Optimization: Store snapshots of message state (not references!) to detect changes
  // Since AI SDK mutates objects in place, we can't compare object references.
  //
  // NOTE: This is a thorough change detection that checks ALL parts.
  // Compare with message-store.ts hasMessageChanged() which only checks the
  // LAST part for performance during high-frequency streaming updates.
  // Both approaches are correct for their use cases:
  // - This (messages-list): useSyncExternalStore needs accurate change detection
  // - message-store.ts: Jotai atoms optimized for streaming (last part only)
  const messageSnapshotsMap = new Map<string, {
    partsCount: number
    textLengths: number[]  // Length of each text part
    partStates: (string | undefined)[]  // State of each part
  }>()

  function getMessageSnapshot(msg: Message) {
    const parts = msg.parts || []
    return {
      partsCount: parts.length,
      textLengths: parts.map((p: any) => p.type === "text" ? (p.text?.length || 0) : -1),
      partStates: parts.map((p: any) => p.state),
    }
  }

  function hasMessageChanged(msgId: string, newMsg: Message): boolean {
    const existingSnapshot = messageSnapshotsMap.get(msgId)
    const newSnapshot = getMessageSnapshot(newMsg)

    // No existing snapshot = new message
    if (!existingSnapshot) {
      return true
    }

    // Compare parts count
    if (existingSnapshot.partsCount !== newSnapshot.partsCount) {
      return true
    }

    // Compare text lengths (this detects streaming text changes!)
    for (let i = 0; i < newSnapshot.textLengths.length; i++) {
      if (existingSnapshot.textLengths[i] !== newSnapshot.textLengths[i]) {
        return true
      }
    }

    // Compare part states
    for (let i = 0; i < newSnapshot.partStates.length; i++) {
      if (existingSnapshot.partStates[i] !== newSnapshot.partStates[i]) {
        return true
      }
    }

    return false
  }

  function stabilizeMessages(newMessages: Message[]): Message[] {
    // Check if any message changed
    let anyChanged = false

    for (const msg of newMessages) {
      if (hasMessageChanged(msg.id, msg)) {
        anyChanged = true
        // Update snapshot for this message
        messageSnapshotsMap.set(msg.id, getMessageSnapshot(msg))
      }
    }

    // If length changed, definitely return new array
    if (newMessages.length !== messages.length) {
      anyChanged = true
    }

    // Optimization: Return new array reference if anything changed, so subscribers see the update
    // Return existing reference if nothing changed to prevent unnecessary re-renders
    return anyChanged ? [...newMessages] : messages
  }

  return {
    get messages() { return messages },
    get status() { return status },

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot() {
      return { messages, status }
    },

    // Silent update - doesn't notify listeners, used for initialization
    initMessages(newMessages: Message[], newStatus: string) {
      const stabilized = stabilizeMessages(newMessages)
      messages = stabilized
      status = newStatus
    },

    setMessages(newMessages: Message[], newStatus: string) {
      const stabilized = stabilizeMessages(newMessages)
      // Optimization: Only notify if something actually changed
      // This is the core optimization - prevents cascading re-renders
      const messagesChanged = stabilized !== messages
      const statusChanged = newStatus !== status

      if (messagesChanged || statusChanged) {
        messages = stabilized
        status = newStatus
        listeners.forEach(l => l())
      }
    }
  }
}

// Context for the store
const MessageStoreContext = createContext<MessageStore | null>(null)

// Hook to sync messages to global store - NOT USED, keeping for reference
export function useMessageStoreSync(_messages: Message[], _status: string) {
  // Not used
}

// Provider component
export function MessageStoreProvider({
  children,
  messages,
  status,
}: {
  children: React.ReactNode
  messages: Message[]
  status: string
}) {
  // Create store once per provider instance, initialized with current messages
  const storeRef = useRef<MessageStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createMessageStore()
    // Initialize with current messages SILENTLY - no subscribers yet anyway
    storeRef.current.initMessages(messages, status)
  }

  // CRITICAL: Use useLayoutEffect to sync messages AFTER render, not during
  // This avoids "Cannot update a component while rendering a different component" error
  useLayoutEffect(() => {
    storeRef.current?.setMessages(messages, status)
  }, [messages, status])

  return (
    <MessageStoreContext.Provider value={storeRef.current}>
      {children}
    </MessageStoreContext.Provider>
  )
}

// ============================================================================
// SELECTOR PATTERN: Reusable Selectors for State Slices
// ============================================================================
// Optimization: Centralized selectors ensure consistent state extraction
// and make it easy to optimize specific queries.

const selectors = {
  // Get last message ID - used by multiple hooks
  getLastMessageId: (messages: Message[]): string | null =>
    messages.length > 0 ? messages[messages.length - 1]?.id : null,

  // Check if status indicates streaming
  isStatusStreaming: (status: string): boolean =>
    status === "streaming" || status === "submitted",

  // Get assistant message IDs only
  getAssistantIds: (messages: Message[]): string[] =>
    messages.filter(m => m.role === "assistant").map(m => m.id),

  // Get user message IDs only
  getUserIds: (messages: Message[]): string[] =>
    messages.filter(m => m.role === "user").map(m => m.id),

  // Find message by ID
  findMessage: (messages: Message[], id: string): Message | undefined =>
    messages.find(m => m.id === id),

  // Find message index by ID
  findMessageIndex: (messages: Message[], id: string): number =>
    messages.findIndex(m => m.id === id),
}

// ============================================================================
// HOOK: useMessage - Subscribe to specific message by ID
// ============================================================================
// Optimization: Only triggers re-render when THIS message changes.
// Uses reference equality on the message object from the store.

export function useMessage(messageId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessage must be used within MessageStoreProvider")

  // Optimization: Track previous message reference to detect actual changes
  const prevMessageRef = useRef<any>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      // Optimization: Only notify if THIS message changed
      // This prevents re-renders when other messages update
      const currentMsg = selectors.findMessage(store.messages, messageId)
      if (currentMsg !== prevMessageRef.current) {
        prevMessageRef.current = currentMsg
        onStoreChange()
      }
    })
  }, [store, messageId])

  const getSnapshot = useCallback(() => {
    const msg = selectors.findMessage(store.messages, messageId)
    prevMessageRef.current = msg
    return msg
  }, [store, messageId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// HOOK: useMessageIds - Subscribe to assistant message IDs only
// ============================================================================
// Optimization: Only re-renders when the list of IDs changes (add/remove).
// Content changes don't affect this hook since we only track IDs.

export function useMessageIds() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessageIds must be used within MessageStoreProvider")

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  // Optimization: Cache IDs array to maintain reference stability
  const idsRef = useRef<string[]>([])

  const getSnapshot = useCallback(() => {
    const newIds = selectors.getAssistantIds(store.messages)
    // Optimization: Return cached array if IDs haven't changed
    // This prevents child components from re-rendering unnecessarily
    if (arraysEqual(newIds, idsRef.current)) {
      return idsRef.current
    }
    idsRef.current = newIds
    return newIds
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// HOOK: useStreamingStatus - Subscribe to streaming state
// ============================================================================
// Optimization: Consolidated hook that returns all streaming-related state.
// Uses shallow equality to prevent re-renders when values haven't changed.

interface StreamingState {
  isStreaming: boolean
  status: string
  lastMessageId: string | null
}

export function useStreamingStatus() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useStreamingStatus must be used within MessageStoreProvider")

  // Optimization: Single cache for all streaming state
  // Prevents multiple object allocations and enables shallow comparison
  const cacheRef = useRef<StreamingState | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const isStreaming = selectors.isStatusStreaming(store.status)
      const lastMsgId = selectors.getLastMessageId(store.messages)

      // Optimization: Only notify when streaming-relevant state changes
      if (
        !cacheRef.current ||
        cacheRef.current.isStreaming !== isStreaming ||
        cacheRef.current.status !== store.status ||
        cacheRef.current.lastMessageId !== lastMsgId
      ) {
        cacheRef.current = { isStreaming, status: store.status, lastMessageId: lastMsgId }
        onStoreChange()
      }
    })
  }, [store])

  const getSnapshot = useCallback(() => {
    const isStreaming = selectors.isStatusStreaming(store.status)
    const lastMsgId = selectors.getLastMessageId(store.messages)

    // Optimization: Return cached object if state matches
    if (
      cacheRef.current &&
      cacheRef.current.isStreaming === isStreaming &&
      cacheRef.current.status === store.status &&
      cacheRef.current.lastMessageId === lastMsgId
    ) {
      return cacheRef.current
    }

    cacheRef.current = { isStreaming, status: store.status, lastMessageId: lastMsgId }
    return cacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// MESSAGE ITEM - Subscribes to its own message only
// ============================================================================

interface MessageItemWrapperProps {
  messageId: string
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
}

// ============================================================================
// HOOK: useIsLastMessage - Track if this message is last
// ============================================================================
// Optimization: Only re-renders THIS component when it becomes/stops being
// the last message. Other messages don't re-render when a new message arrives.

function useIsLastMessage(messageId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useIsLastMessage must be used within MessageStoreProvider")

  // Optimization: Track previous value to detect actual changes
  const prevIsLastRef = useRef<boolean>(false)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const lastMsgId = selectors.getLastMessageId(store.messages)
      const isLast = messageId === lastMsgId

      // Optimization: Only notify if THIS message's "isLast" status changed
      if (prevIsLastRef.current !== isLast) {
        prevIsLastRef.current = isLast
        onStoreChange()
      }
    })
  }, [store, messageId])

  const getSnapshot = useCallback(() => {
    const lastMsgId = selectors.getLastMessageId(store.messages)
    const isLast = messageId === lastMsgId
    prevIsLastRef.current = isLast
    return isLast
  }, [store, messageId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// HOOK: useIsStreaming - Simplified streaming status hook
// ============================================================================
// Optimization: Lighter-weight alternative to useStreamingStatus when
// only isStreaming boolean is needed. Uses same cache pattern.

interface IsStreamingState {
  isStreaming: boolean
  status: string
}

function useIsStreaming() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useIsStreaming must be used within MessageStoreProvider")

  // Optimization: Cache must be stable and only updated when values actually change
  const cacheRef = useRef<IsStreamingState | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const isStreaming = selectors.isStatusStreaming(store.status)
      if (!cacheRef.current || cacheRef.current.isStreaming !== isStreaming || cacheRef.current.status !== store.status) {
        cacheRef.current = { isStreaming, status: store.status }
        onStoreChange()
      }
    })
  }, [store])

  const getSnapshot = useCallback(() => {
    const isStreaming = selectors.isStatusStreaming(store.status)
    // Return cached value if it matches current state
    if (cacheRef.current && cacheRef.current.isStreaming === isStreaming && cacheRef.current.status === store.status) {
      return cacheRef.current
    }
    // Create and cache new value
    cacheRef.current = { isStreaming, status: store.status }
    return cacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// NonStreamingMessageItem - For non-last messages
// ============================================================================
// Optimization: No streaming subscription needed for historical messages.
// Subscribes to message via Jotai messageAtomFamily which handles its own
// change detection, passes message as prop to AssistantMessageItem.

const NonStreamingMessageItem = memo(function NonStreamingMessageItem({
  messageId,
  subChatId,
  isMobile,
  sandboxSetupStatus,
}: {
  messageId: string
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
}) {
  // Subscribe to this specific message via Jotai - only re-renders when THIS message changes
  const message = useAtomValue(messageAtomFamily(messageId))

  if (!message) return null

  return (
    <AssistantMessageItem
      message={message}
      isLastMessage={false}
      isStreaming={false}
      status="ready"
      subChatId={subChatId}
      isMobile={isMobile}
      sandboxSetupStatus={sandboxSetupStatus}
    />
  )
})

// ============================================================================
// StreamingMessageItem - For the last message
// ============================================================================
// Optimization: Subscribes to streaming status AND message via Jotai.
// Only the last message pays the cost of streaming status subscription.

const StreamingMessageItem = memo(function StreamingMessageItem({
  messageId,
  subChatId,
  isMobile,
  sandboxSetupStatus,
}: {
  messageId: string
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
}) {
  // Subscribe to this specific message via Jotai - only re-renders when THIS message changes
  const message = useAtomValue(messageAtomFamily(messageId))

  // Subscribe to streaming status
  const isStreaming = useAtomValue(isStreamingAtom)
  const status = useAtomValue(chatStatusAtom)

  if (!message) return null

  return (
    <AssistantMessageItem
      message={message}
      isLastMessage={true}
      isStreaming={isStreaming}
      status={status}
      subChatId={subChatId}
      isMobile={isMobile}
      sandboxSetupStatus={sandboxSetupStatus}
    />
  )
})

// ============================================================================
// HOOK: useMessageWithLastStatus - Combined subscription
// ============================================================================
// Optimization: Get message AND isLast in one subscription to avoid double
// re-renders. Uses stable object references when data hasn't changed.

function useMessageWithLastStatus(messageId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessageWithLastStatus must be used within MessageStoreProvider")

  // Track what we last returned to detect changes
  const lastReturnedRef = useRef<{ message: any; isLast: boolean } | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const currentMsg = selectors.findMessage(store.messages, messageId)
      const lastMsgId = selectors.getLastMessageId(store.messages)
      const isLast = messageId === lastMsgId

      const msgChanged = lastReturnedRef.current?.message !== currentMsg
      const isLastChanged = lastReturnedRef.current?.isLast !== isLast

      // Optimization: Only notify if message changed OR isLast changed
      // DO NOT update lastReturnedRef here - only in getSnapshot!
      if (!lastReturnedRef.current || msgChanged || isLastChanged) {
        onStoreChange()
      }
    })
  }, [store, messageId])

  const getSnapshot = useCallback(() => {
    const currentMsg = selectors.findMessage(store.messages, messageId)
    const lastMsgId = selectors.getLastMessageId(store.messages)
    const isLast = messageId === lastMsgId

    // Optimization: Return cached object if nothing changed
    if (
      lastReturnedRef.current &&
      lastReturnedRef.current.message === currentMsg &&
      lastReturnedRef.current.isLast === isLast
    ) {
      return lastReturnedRef.current
    }

    // Create new object and cache it
    lastReturnedRef.current = { message: currentMsg, isLast }
    return lastReturnedRef.current
  }, [store, messageId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// MessageItemWrapper - Entry point for rendering a message
// ============================================================================
// Optimization: Only subscribes to isLast status, not message content.
// Delegates content subscription to child components, ensuring minimal
// re-renders when messages update.

export const MessageItemWrapper = memo(function MessageItemWrapper({
  messageId,
  subChatId,
  isMobile,
  sandboxSetupStatus,
}: MessageItemWrapperProps) {

  // Optimization: Only subscribe to isLast - NOT to message content!
  // StreamingMessageItem and NonStreamingMessageItem will subscribe to message themselves
  const isLast = useAtomValue(isLastMessageAtomFamily(messageId))

  // Only the last message subscribes to streaming status
  if (isLast) {
    // StreamingMessageItem subscribes to messageAtomFamily internally
    return (
      <StreamingMessageItem
        messageId={messageId}
        subChatId={subChatId}
        isMobile={isMobile}
        sandboxSetupStatus={sandboxSetupStatus}
      />
    )
  }

  // NonStreamingMessageItem subscribes to messageAtomFamily internally
  return (
    <NonStreamingMessageItem
      messageId={messageId}
      subChatId={subChatId}
      isMobile={isMobile}
      sandboxSetupStatus={sandboxSetupStatus}
    />
  )
})

// ============================================================================
// MEMOIZED ASSISTANT MESSAGES - Only re-renders when message IDs change
// ============================================================================
// Optimization: This is the KEY optimization component.
// By wrapping the assistant messages .map() in a memoized component that
// compares ONLY the message IDs (not the full message objects), we prevent
// the parent's re-render from causing MessageItemWrapper to be called.

interface MemoizedAssistantMessagesProps {
  assistantMsgIds: string[]
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
}

// Optimization: Custom equality function that uses efficient array comparison
function areMemoizedAssistantMessagesEqual(
  prev: MemoizedAssistantMessagesProps,
  next: MemoizedAssistantMessagesProps
): boolean {
  // Only re-render if IDs changed (new message added/removed)
  if (!arraysEqual(prev.assistantMsgIds, next.assistantMsgIds)) {
    return false
  }

  // Also check static props
  return (
    prev.subChatId === next.subChatId &&
    prev.isMobile === next.isMobile &&
    prev.sandboxSetupStatus === next.sandboxSetupStatus
  )
}

export const MemoizedAssistantMessages = memo(function MemoizedAssistantMessages({
  assistantMsgIds,
  subChatId,
  isMobile,
  sandboxSetupStatus,
}: MemoizedAssistantMessagesProps) {
  // Optimization: This component only re-renders when assistantMsgIds changes
  // During streaming, IDs stay the same, so this doesn't re-render
  // Therefore, MessageItemWrapper is never called, and the store
  // subscription handles updates directly
  return (
    <>
      {assistantMsgIds.map((id) => (
        <MessageItemWrapper
          key={id}
          messageId={id}
          subChatId={subChatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
        />
      ))}
    </>
  )
}, areMemoizedAssistantMessagesEqual)

// ============================================================================
// HOOKS FOR ISOLATED RENDERING
// ============================================================================

// Hook to get ALL messages (user + assistant) with stable references
export function useAllMessages() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useAllMessages must be used within MessageStoreProvider")

  // Optimization: Cache array reference to detect actual changes
  const cacheRef = useRef<Message[]>([])

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  const getSnapshot = useCallback(() => {
    // Optimization: Return cached array if messages haven't changed
    if (cacheRef.current === store.messages) {
      return cacheRef.current
    }
    cacheRef.current = store.messages
    return cacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// HOOK: useMessageGroups - Computed groups with stable references
// ============================================================================
// Optimization: Returns stable references for groups that haven't changed.
// Uses multi-level caching to minimize object allocations.

interface MessageGroup {
  userMsg: Message
  assistantMsgIds: string[]
  assistantMsgsCount: number
}

export function useMessageGroups() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessageGroups must be used within MessageStoreProvider")

  // Optimization: Multi-level cache for stable group references
  const groupsCacheRef = useRef<MessageGroup[]>([])
  const assistantIdsCacheRef = useRef<Map<string, string[]>>(new Map())

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  const getSnapshot = useCallback(() => {
    const messages = store.messages

    // Compute groups
    const groups: MessageGroup[] = []
    let currentGroup: MessageGroup | null = null

    for (const msg of messages) {
      if (msg.role === "user") {
        if (currentGroup) {
          groups.push(currentGroup)
        }
        currentGroup = {
          userMsg: msg,
          assistantMsgIds: [],
          assistantMsgsCount: 0
        }
      } else if (currentGroup && msg.role === "assistant") {
        currentGroup.assistantMsgIds.push(msg.id)
        currentGroup.assistantMsgsCount++
      }
    }
    if (currentGroup) {
      groups.push(currentGroup)
    }

    // Optimization: Stabilize group references - only create new objects if content changed
    // Check if groups count changed
    if (groups.length !== groupsCacheRef.current.length) {
      // Stabilize individual groups
      for (let i = 0; i < groups.length; i++) {
        const newGroup = groups[i]
        const cachedGroup = groupsCacheRef.current[i]
        const cachedIds = assistantIdsCacheRef.current.get(newGroup.userMsg.id)

        // Stabilize assistantMsgIds array
        if (cachedIds && arraysEqual(cachedIds, newGroup.assistantMsgIds)) {
          newGroup.assistantMsgIds = cachedIds
        } else {
          assistantIdsCacheRef.current.set(newGroup.userMsg.id, newGroup.assistantMsgIds)
        }

        // Reuse cached group object if nothing changed
        if (cachedGroup &&
            cachedGroup.userMsg === newGroup.userMsg &&
            cachedGroup.assistantMsgIds === newGroup.assistantMsgIds &&
            cachedGroup.assistantMsgsCount === newGroup.assistantMsgsCount) {
          groups[i] = cachedGroup
        }
      }
      groupsCacheRef.current = groups
      return groups
    }

    // Same length - check each group for changes
    let anyChanged = false
    for (let i = 0; i < groups.length; i++) {
      const newGroup = groups[i]
      const cachedGroup = groupsCacheRef.current[i]
      const cachedIds = assistantIdsCacheRef.current.get(newGroup.userMsg.id)

      // Stabilize assistantMsgIds array
      if (cachedIds && arraysEqual(cachedIds, newGroup.assistantMsgIds)) {
        newGroup.assistantMsgIds = cachedIds
      } else {
        assistantIdsCacheRef.current.set(newGroup.userMsg.id, newGroup.assistantMsgIds)
        anyChanged = true
      }

      // Check if group itself changed
      if (!cachedGroup ||
          cachedGroup.userMsg !== newGroup.userMsg ||
          cachedGroup.assistantMsgIds !== newGroup.assistantMsgIds ||
          cachedGroup.assistantMsgsCount !== newGroup.assistantMsgsCount) {
        anyChanged = true
      } else {
        // Reuse cached group
        groups[i] = cachedGroup
      }
    }

    if (anyChanged) {
      groupsCacheRef.current = groups
      return groups
    }

    return groupsCacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// MESSAGES LIST - Only re-renders when message IDs change (add/remove)
// ============================================================================

interface MessagesListProps {
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
}

export const MessagesList = memo(function MessagesList({
  subChatId,
  isMobile,
  sandboxSetupStatus,
}: MessagesListProps) {
  const messageIds = useMessageIds()

  return (
    <>
      {messageIds.map((id) => (
        <MessageItemWrapper
          key={id}
          messageId={id}
          subChatId={subChatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
        />
      ))}
    </>
  )
})

// ============================================================================
// HOOK: useUserMessageIds - Only returns user message IDs (for groups)
// ============================================================================
// Optimization: Focused hook that only tracks user messages.
// Uses efficient array comparison for stability.

export function useUserMessageIds() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useUserMessageIds must be used within MessageStoreProvider")

  // Optimization: Cache IDs array for reference stability
  const idsRef = useRef<string[]>([])

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  const getSnapshot = useCallback(() => {
    const newIds = selectors.getUserIds(store.messages)
    // Optimization: Return cached array if IDs haven't changed
    if (arraysEqual(newIds, idsRef.current)) {
      return idsRef.current
    }
    idsRef.current = newIds
    return newIds
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// HOOK: useUserMessageWithAssistants - Get user message and its assistant IDs
// ============================================================================
// Optimization: Consolidated subscription for a message group.
// Computes assistant IDs efficiently and maintains stable references.

interface UserMessageWithAssistantsState {
  userMsg: Message | undefined
  assistantMsgIds: string[]
  isLastGroup: boolean
}

export function useUserMessageWithAssistants(userMsgId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useUserMessageWithAssistants must be used within MessageStoreProvider")

  // Optimization: Cache for stable return value
  const cacheRef = useRef<UserMessageWithAssistantsState | null>(null)

  // Optimization: Helper to compute assistant IDs for a user message
  const computeAssistantIds = useCallback((messages: Message[], userIndex: number): string[] => {
    const assistantMsgIds: string[] = []
    for (let i = userIndex + 1; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.role === "user") break  // Next user message = end of group
      if (msg.role === "assistant") {
        assistantMsgIds.push(msg.id)
      }
    }
    return assistantMsgIds
  }, [])

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      // Get user message
      const userMsg = selectors.findMessage(store.messages, userMsgId)
      if (!userMsg) {
        if (cacheRef.current?.userMsg !== undefined) {
          onStoreChange()
        }
        return
      }

      // Find assistant messages that follow this user message
      const userIndex = selectors.findMessageIndex(store.messages, userMsgId)
      const assistantMsgIds = computeAssistantIds(store.messages, userIndex)

      // Check if this is the last group
      const userMsgIds = selectors.getUserIds(store.messages)
      const isLastGroup = userMsgIds[userMsgIds.length - 1] === userMsgId

      // Optimization: Check if anything changed before notifying
      if (cacheRef.current) {
        const idsChanged = !arraysEqual(assistantMsgIds, cacheRef.current.assistantMsgIds)
        const isLastChanged = isLastGroup !== cacheRef.current.isLastGroup
        const userMsgChanged = userMsg !== cacheRef.current.userMsg

        if (!idsChanged && !isLastChanged && !userMsgChanged) {
          return  // Nothing changed, don't notify
        }
      }

      onStoreChange()
    })
  }, [store, userMsgId, computeAssistantIds])

  const getSnapshot = useCallback(() => {
    const userMsg = selectors.findMessage(store.messages, userMsgId)
    if (!userMsg) {
      if (!cacheRef.current || cacheRef.current.userMsg !== undefined) {
        cacheRef.current = { userMsg: undefined, assistantMsgIds: [], isLastGroup: false }
      }
      return cacheRef.current
    }

    // Find assistant messages
    const userIndex = selectors.findMessageIndex(store.messages, userMsgId)
    const assistantMsgIds = computeAssistantIds(store.messages, userIndex)

    // Check if this is the last group
    const userMsgIds = selectors.getUserIds(store.messages)
    const isLastGroup = userMsgIds[userMsgIds.length - 1] === userMsgId

    // Optimization: Return cached value if nothing changed
    if (cacheRef.current) {
      const idsMatch = arraysEqual(assistantMsgIds, cacheRef.current.assistantMsgIds)

      if (
        userMsg === cacheRef.current.userMsg &&
        idsMatch &&
        isLastGroup === cacheRef.current.isLastGroup
      ) {
        return cacheRef.current
      }

      // Optimization: Stabilize assistantMsgIds if they match
      if (idsMatch) {
        cacheRef.current = {
          userMsg,
          assistantMsgIds: cacheRef.current.assistantMsgIds,  // Reuse stable reference
          isLastGroup
        }
        return cacheRef.current
      }
    }

    cacheRef.current = { userMsg, assistantMsgIds, isLastGroup }
    return cacheRef.current
  }, [store, userMsgId, computeAssistantIds])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// ISOLATED MESSAGE GROUP - Renders a single user message + its assistants
// ============================================================================
// Optimization: This component subscribes to ONE user message and its assistant IDs.
// It only re-renders when:
// - The user message content changes
// - New assistant messages are added to this group
// - This becomes/stops being the last group

interface SimpleIsolatedGroupProps {
  userMsgId: string
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  isSubChatsSidebarOpen: boolean
  stickyTopClass: string
  sandboxSetupError?: string
  onRetrySetup?: () => void
  // Components passed from parent - must be stable references
  UserBubbleComponent: React.ComponentType<{
    messageId: string
    textContent: string
    imageParts: any[]
    skipTextMentionBlocks?: boolean
  }>
  ToolCallComponent: React.ComponentType<{
    icon: any
    title: string
    isPending: boolean
    isError: boolean
  }>
  MessageGroupComponent: React.ComponentType<{ children: React.ReactNode }>
  toolRegistry: Record<string, { icon: any; title: (args: any) => string }>
}

// Optimization: Custom equality check avoids re-renders when static props match
function areSimpleGroupPropsEqual(
  prev: SimpleIsolatedGroupProps,
  next: SimpleIsolatedGroupProps
): boolean {
  return (
    prev.userMsgId === next.userMsgId &&
    prev.subChatId === next.subChatId &&
    prev.isMobile === next.isMobile &&
    prev.sandboxSetupStatus === next.sandboxSetupStatus &&
    prev.isSubChatsSidebarOpen === next.isSubChatsSidebarOpen &&
    prev.stickyTopClass === next.stickyTopClass &&
    prev.sandboxSetupError === next.sandboxSetupError &&
    prev.onRetrySetup === next.onRetrySetup &&
    prev.UserBubbleComponent === next.UserBubbleComponent &&
    prev.ToolCallComponent === next.ToolCallComponent &&
    prev.MessageGroupComponent === next.MessageGroupComponent &&
    prev.toolRegistry === next.toolRegistry
  )
}

export const SimpleIsolatedGroup = memo(function SimpleIsolatedGroup({
  userMsgId,
  subChatId,
  isMobile,
  sandboxSetupStatus,
  stickyTopClass,
  sandboxSetupError,
  onRetrySetup,
  UserBubbleComponent,
  ToolCallComponent,
  MessageGroupComponent,
  toolRegistry,
}: SimpleIsolatedGroupProps) {
  // Subscribe to this specific user message and its assistant IDs
  const { userMsg, assistantMsgIds, isLastGroup } = useUserMessageWithAssistants(userMsgId)
  const { isStreaming } = useStreamingStatus()

  if (!userMsg) return null

  // User message data
  const rawTextContent = userMsg.parts
    ?.filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("\n") || ""

  const imageParts = userMsg.parts?.filter((p: any) => p.type === "data-image") || []

  // Optimization: Memoize text extraction to avoid recomputation
  const { textMentions, cleanedText: textContent } = useMemo(
    () => extractTextMentions(rawTextContent),
    [rawTextContent]
  )

  // Show cloning when sandbox is being set up
  const shouldShowCloning =
    sandboxSetupStatus === "cloning" &&
    isLastGroup &&
    assistantMsgIds.length === 0

  // Show setup error if sandbox setup failed
  const shouldShowSetupError =
    sandboxSetupStatus === "error" &&
    isLastGroup &&
    assistantMsgIds.length === 0

  return (
    <MessageGroupComponent>
      {/* Attachments - NOT sticky */}
      {imageParts.length > 0 && (
        <div className="mb-2 pointer-events-auto">
          <UserBubbleComponent
            messageId={userMsg.id}
            textContent=""
            imageParts={imageParts}
            skipTextMentionBlocks
          />
        </div>
      )}

      {/* Text mentions (quote/diff) - NOT sticky */}
      {textMentions.length > 0 && (
        <div className="mb-2 pointer-events-auto">
          <TextMentionBlocks mentions={textMentions} />
        </div>
      )}

      {/* User message text - sticky */}
      <div
        data-user-message-id={userMsg.id}
        className={`[&>div]:!mb-4 pointer-events-auto sticky z-10 ${stickyTopClass}`}
      >
        <UserBubbleComponent
          messageId={userMsg.id}
          textContent={textContent}
          imageParts={[]}
          skipTextMentionBlocks
        />

        {/* Cloning indicator */}
        {shouldShowCloning && (
          <div className="mt-4">
            <ToolCallComponent
              icon={toolRegistry["tool-cloning"]?.icon}
              title={toolRegistry["tool-cloning"]?.title({}) || "Cloning..."}
              isPending={true}
              isError={false}
            />
          </div>
        )}

        {/* Setup error with retry */}
        {shouldShowSetupError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <span>
                Failed to set up sandbox
                {sandboxSetupError ? `: ${sandboxSetupError}` : ""}
              </span>
              {onRetrySetup && (
                <button className="px-2 py-1 text-sm hover:bg-destructive/20 rounded" onClick={onRetrySetup}>
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Assistant messages */}
      {assistantMsgIds.length > 0 && (
        <MemoizedAssistantMessages
          assistantMsgIds={assistantMsgIds}
          subChatId={subChatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
        />
      )}

      {/* Planning indicator */}
      {isStreaming && isLastGroup && assistantMsgIds.length === 0 && sandboxSetupStatus === "ready" && (
        <div className="mt-4">
          <ToolCallComponent
            icon={toolRegistry["tool-planning"]?.icon}
            title={toolRegistry["tool-planning"]?.title({}) || "Planning..."}
            isPending={true}
            isError={false}
          />
        </div>
      )}
    </MessageGroupComponent>
  )
}, areSimpleGroupPropsEqual)

// ============================================================================
// SIMPLE ISOLATED MESSAGES LIST - Renders all message groups
// ============================================================================

interface SimpleIsolatedListProps {
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  isSubChatsSidebarOpen: boolean
  stickyTopClass: string
  sandboxSetupError?: string
  onRetrySetup?: () => void
  UserBubbleComponent: SimpleIsolatedGroupProps["UserBubbleComponent"]
  ToolCallComponent: SimpleIsolatedGroupProps["ToolCallComponent"]
  MessageGroupComponent: SimpleIsolatedGroupProps["MessageGroupComponent"]
  toolRegistry: SimpleIsolatedGroupProps["toolRegistry"]
}

// Optimization: Efficient equality check for list props
function areSimpleListPropsEqual(
  prev: SimpleIsolatedListProps,
  next: SimpleIsolatedListProps
): boolean {
  return (
    prev.subChatId === next.subChatId &&
    prev.isMobile === next.isMobile &&
    prev.sandboxSetupStatus === next.sandboxSetupStatus &&
    prev.isSubChatsSidebarOpen === next.isSubChatsSidebarOpen &&
    prev.stickyTopClass === next.stickyTopClass &&
    prev.sandboxSetupError === next.sandboxSetupError &&
    prev.onRetrySetup === next.onRetrySetup &&
    prev.UserBubbleComponent === next.UserBubbleComponent &&
    prev.ToolCallComponent === next.ToolCallComponent &&
    prev.MessageGroupComponent === next.MessageGroupComponent &&
    prev.toolRegistry === next.toolRegistry
  )
}

export const SimpleIsolatedMessagesList = memo(function SimpleIsolatedMessagesList({
  subChatId,
  isMobile,
  sandboxSetupStatus,
  isSubChatsSidebarOpen,
  stickyTopClass,
  sandboxSetupError,
  onRetrySetup,
  UserBubbleComponent,
  ToolCallComponent,
  MessageGroupComponent,
  toolRegistry,
}: SimpleIsolatedListProps) {
  // Subscribe to user message IDs only
  const userMsgIds = useUserMessageIds()

  return (
    <>
      {userMsgIds.map((userMsgId) => (
        <SimpleIsolatedGroup
          key={userMsgId}
          userMsgId={userMsgId}
          subChatId={subChatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
          isSubChatsSidebarOpen={isSubChatsSidebarOpen}
          stickyTopClass={stickyTopClass}
          sandboxSetupError={sandboxSetupError}
          onRetrySetup={onRetrySetup}
          UserBubbleComponent={UserBubbleComponent}
          ToolCallComponent={ToolCallComponent}
          MessageGroupComponent={MessageGroupComponent}
          toolRegistry={toolRegistry}
        />
      ))}
    </>
  )
}, areSimpleListPropsEqual)
