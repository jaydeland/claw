import { create } from "zustand"
import { useMessageQueueStore } from "./message-queue-store"
import { useStreamingStatusStore } from "./streaming-status-store"
import { agentChatStore } from "./agent-chat-store"
import { clearSubChatCaches } from "./message-store"

export interface SubChatMeta {
  id: string
  name: string
  created_at?: string
  updated_at?: string
  mode?: "plan" | "agent" | "swarm"
}

interface AgentSubChatStore {
  // Current parent chat context
  chatId: string | null

  // State
  activeSubChatId: string | null // Currently selected tab
  openSubChatIds: string[] // Open tabs (preserves order)
  pinnedSubChatIds: string[] // Pinned sub-chats
  allSubChats: SubChatMeta[] // All sub-chats for history

  // Actions
  setChatId: (chatId: string | null) => void
  setActiveSubChat: (subChatId: string) => void
  setOpenSubChats: (subChatIds: string[]) => void
  addToOpenSubChats: (subChatId: string) => void
  removeFromOpenSubChats: (subChatId: string) => void
  togglePinSubChat: (subChatId: string) => void
  setAllSubChats: (subChats: SubChatMeta[]) => void
  addToAllSubChats: (subChat: SubChatMeta) => void
  updateSubChatName: (subChatId: string, name: string) => void
  updateSubChatMode: (subChatId: string, mode: "plan" | "agent" | "swarm") => void
  updateSubChatTimestamp: (subChatId: string) => void
  reset: () => void
}

// localStorage helpers - store open tabs, active tab, and pinned tabs
const getStorageKey = (chatId: string, type: "open" | "active") =>
  `agent-${type}-sub-chats-${chatId}`

// Global storage key for pins (across all workspaces)
const GLOBAL_PINS_KEY = "agent-global-pinned-sub-chats"

// Custom event for notifying other components when open sub-chats change
export const OPEN_SUB_CHATS_CHANGE_EVENT = "open-sub-chats-change"

// Debounce timer to avoid rapid-fire events
let openSubChatsChangeTimer: ReturnType<typeof setTimeout> | null = null

const saveToLS = (chatId: string, type: "open" | "active", value: unknown) => {
  if (typeof window === "undefined") return
  localStorage.setItem(getStorageKey(chatId, type), JSON.stringify(value))
  // Dispatch debounced event when open sub-chats change so sidebar can update
  if (type === "open") {
    if (openSubChatsChangeTimer) clearTimeout(openSubChatsChangeTimer)
    openSubChatsChangeTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SUB_CHATS_CHANGE_EVENT))
      openSubChatsChangeTimer = null
    }, 50)
  }
}

const loadFromLS = <T>(chatId: string, type: "open" | "active", fallback: T): T => {
  if (typeof window === "undefined") return fallback
  try {
    const stored = localStorage.getItem(getStorageKey(chatId, type))
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

// Global pins storage (works across all workspaces)
const saveGlobalPins = (pinnedIds: string[]) => {
  if (typeof window === "undefined") return
  localStorage.setItem(GLOBAL_PINS_KEY, JSON.stringify(pinnedIds))
}

const loadGlobalPins = (): string[] => {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(GLOBAL_PINS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export const useAgentSubChatStore = create<AgentSubChatStore>((set, get) => ({
  chatId: null,
  activeSubChatId: null,
  openSubChatIds: [],
  pinnedSubChatIds: [],
  allSubChats: [],

  setChatId: (chatId) => {
    if (!chatId) {
      set({
        chatId: null,
        activeSubChatId: null,
        openSubChatIds: [],
        pinnedSubChatIds: loadGlobalPins(), // Keep global pins even when no chat selected
        allSubChats: [],
      })
      return
    }

    // Load open/active IDs from localStorage (workspace-specific)
    // Load pinned IDs from global storage (shared across all workspaces)
    // allSubChats will be populated from DB + placeholders in init effect
    const openSubChatIds = loadFromLS<string[]>(chatId, "open", [])
    const activeSubChatId = loadFromLS<string | null>(chatId, "active", null)
    const pinnedSubChatIds = loadGlobalPins() // Global across all workspaces

    set({ chatId, openSubChatIds, activeSubChatId, pinnedSubChatIds, allSubChats: [] })
  },

  setActiveSubChat: (subChatId) => {
    const { chatId } = get()
    set({ activeSubChatId: subChatId })
    if (chatId) saveToLS(chatId, "active", subChatId)
  },

  setOpenSubChats: (subChatIds) => {
    const { chatId } = get()
    set({ openSubChatIds: subChatIds })
    if (chatId) saveToLS(chatId, "open", subChatIds)
  },

  addToOpenSubChats: (subChatId) => {
    const { openSubChatIds, chatId } = get()
    if (openSubChatIds.includes(subChatId)) return
    const newIds = [...openSubChatIds, subChatId]
    set({ openSubChatIds: newIds })
    if (chatId) saveToLS(chatId, "open", newIds)
  },

  removeFromOpenSubChats: (subChatId) => {
    const { openSubChatIds, activeSubChatId, chatId } = get()
    const newIds = openSubChatIds.filter((id) => id !== subChatId)

    // If closing active tab, switch to last remaining tab
    let newActive = activeSubChatId
    if (activeSubChatId === subChatId) {
      newActive = newIds[newIds.length - 1] || null
    }

    set({ openSubChatIds: newIds, activeSubChatId: newActive })
    if (chatId) {
      saveToLS(chatId, "open", newIds)
      saveToLS(chatId, "active", newActive)
    }

    // Cleanup queue, streaming status, Chat instance, and message caches/atoms
    // to prevent memory leaks and race conditions
    useMessageQueueStore.getState().clearQueue(subChatId)
    useStreamingStatusStore.getState().clearStatus(subChatId)
    agentChatStore.delete(subChatId)
    clearSubChatCaches(subChatId)
  },

  togglePinSubChat: (subChatId) => {
    const { pinnedSubChatIds } = get()
    const newPinnedIds = pinnedSubChatIds.includes(subChatId)
      ? pinnedSubChatIds.filter((id) => id !== subChatId)
      : [...pinnedSubChatIds, subChatId]

    set({ pinnedSubChatIds: newPinnedIds })
    // Save to global storage (shared across all workspaces)
    saveGlobalPins(newPinnedIds)
  },

  setAllSubChats: (subChats) => {
    set({ allSubChats: subChats })
  },

  addToAllSubChats: (subChat) => {
    const { allSubChats } = get()
    if (allSubChats.some((sc) => sc.id === subChat.id)) return
    set({ allSubChats: [...allSubChats, subChat] })
    // No localStorage persistence - allSubChats is rebuilt from DB + open IDs on init
  },

  updateSubChatName: (subChatId, name) => {
    const { allSubChats } = get()
    set({
      allSubChats: allSubChats.map((sc) =>
        sc.id === subChatId
          ? { ...sc, name }
          : sc,
      ),
    })
    // No localStorage modification - just update in-memory state (like Canvas)
  },

  updateSubChatMode: (subChatId, mode) => {
    const { allSubChats } = get()
    set({
      allSubChats: allSubChats.map((sc) =>
        sc.id === subChatId
          ? { ...sc, mode }
          : sc,
      ),
    })
  },

  updateSubChatTimestamp: (subChatId: string) => {
    const { allSubChats } = get()
    const newTimestamp = new Date().toISOString()

    set({
      allSubChats: allSubChats.map((sc) =>
        sc.id === subChatId
          ? { ...sc, updated_at: newTimestamp }
          : sc,
      ),
    })
  },

  reset: () => {
    set({
      chatId: null,
      activeSubChatId: null,
      openSubChatIds: [],
      pinnedSubChatIds: [],
      allSubChats: [],
    })
  },
}))
