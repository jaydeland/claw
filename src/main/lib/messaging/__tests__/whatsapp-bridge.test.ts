// @ts-expect-error - vitest types not installed
import { describe, test, expect, beforeEach } from "vitest"
import {
  processIncomingWhatsAppMessage,
  wouldClaudeDetectDuplicate,
  buildAttributedText,
  type IncomingPlatformMessage,
  type BridgeDataAccess,
} from "../whatsapp-bridge"

/**
 * WhatsApp Bridge Tests
 *
 * Tests the core 2-way sync logic using an in-memory mock data access layer.
 * No native modules (better-sqlite3) needed — runs on any Node.js/vitest.
 *
 * Run: npx vitest run src/main/lib/messaging/__tests__/whatsapp-bridge.test.ts
 */

// ─────────────────────────────────────────────────────────────────
// In-Memory Mock Data Access
// ─────────────────────────────────────────────────────────────────

function createMockDataAccess(options: {
  chat?: { id: string; [key: string]: any }
  subChat?: { id: string; chatId: string; messages: string | null; [key: string]: any }
}): BridgeDataAccess & { getStoredMessages: () => string | null } {
  let storedMessages = options.subChat?.messages ?? null

  return {
    getChatById(chatId: string) {
      return options.chat?.id === chatId ? options.chat : undefined
    },
    getMostRecentSubChat(chatId: string) {
      if (!options.subChat || options.subChat.chatId !== chatId) return undefined
      // Return current stored messages (not the original snapshot)
      return { ...options.subChat, messages: storedMessages }
    },
    updateSubChatMessages(_subChatId: string, messages: string) {
      storedMessages = messages
    },
    getStoredMessages() {
      return storedMessages
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────

const CHAT_ID = "test-chat-wa"
const SUBCHAT_ID = "test-subchat-wa"
const GROUP_JID = "120363407419186305@g.us"

const SEED_MESSAGES = JSON.stringify([
  { id: "msg-1", role: "user", parts: [{ type: "text", text: "Hello from desktop" }] },
  { id: "msg-2", role: "assistant", parts: [{ type: "text", text: "Hi! How can I help?" }] },
])

function makeMessage(overrides?: Partial<IncomingPlatformMessage>): IncomingPlatformMessage {
  return {
    platform: "whatsapp",
    chatId: CHAT_ID,
    sender: "Alice",
    text: "Hello from WhatsApp!",
    timestamp: Date.now(),
    messageId: "wa_msg_001",
    metadata: { whatsappJid: GROUP_JID, isGroup: true, fromMe: false },
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────
// Core Flow Tests
// ─────────────────────────────────────────────────────────────────

describe("processIncomingWhatsAppMessage", () => {
  let dataAccess: ReturnType<typeof createMockDataAccess>

  beforeEach(() => {
    dataAccess = createMockDataAccess({
      chat: { id: CHAT_ID, connectionType: "whatsapp", connectionTarget: GROUP_JID },
      subChat: { id: SUBCHAT_ID, chatId: CHAT_ID, messages: SEED_MESSAGES },
    })
  })

  test("persists message to DB and returns emit payload", () => {
    const result = processIncomingWhatsAppMessage(makeMessage(), dataAccess)

    expect(result.action).toBe("emit")
    if (result.action !== "emit") return

    // Payload structure
    expect(result.payload.chatId).toBe(CHAT_ID)
    expect(result.payload.subChatId).toBe(SUBCHAT_ID)
    expect(result.payload.sender).toBe("Alice")
    expect(result.payload.text).toBe("Hello from WhatsApp!")
    expect(result.payload.fromMe).toBe(false)
    expect(result.payload.whatsappJid).toBe(GROUP_JID)

    // DB persistence
    const stored = JSON.parse(dataAccess.getStoredMessages()!)
    expect(stored).toHaveLength(3) // 2 original + 1 WhatsApp
    expect(stored[2].role).toBe("user")
    expect(stored[2].parts[0].text).toContain("📱 WhatsApp")
    expect(stored[2].parts[0].text).toContain("Alice")
    expect(stored[2].parts[0].text).toContain("Hello from WhatsApp!")
    expect(stored[2].metadata.source).toBe("whatsapp")
    expect(stored[2].metadata.sender).toBe("Alice")
  })

  test("saved message is returned in result for caller use", () => {
    const result = processIncomingWhatsAppMessage(makeMessage(), dataAccess)

    if (result.action !== "emit") return
    expect(result.savedMessage.role).toBe("user")
    expect(result.savedMessage.metadata.source).toBe("whatsapp")
    expect(result.savedMessage.id).toMatch(/^wa_/)
  })

  // ─── fromMe / Echo Filtering ─────────────────────────────────
  // Note: Bot echo filtering is handled upstream in WhatsAppAdapter.handleMessage()
  // using content-based matching (isBotEcho). The bridge function processes all
  // messages that reach it — fromMe is no longer checked here because the user's
  // phone and Baileys bot share the same WhatsApp account.

  test("processes messages regardless of fromMe flag (echo filtering is upstream)", () => {
    const result = processIncomingWhatsAppMessage(
      makeMessage({ metadata: { whatsappJid: GROUP_JID, fromMe: true } }),
      dataAccess,
    )
    // Bridge no longer filters on fromMe — adapter does it
    expect(result.action).toBe("emit")
  })

  test("processes messages with no metadata", () => {
    const result = processIncomingWhatsAppMessage(
      makeMessage({ metadata: undefined }),
      dataAccess,
    )
    expect(result.action).toBe("emit")
  })

  // ─── Platform Filtering ─────────────────────────────────────────

  test("skips non-whatsapp platform messages", () => {
    const result = processIncomingWhatsAppMessage(
      makeMessage({ platform: "discord" }),
      dataAccess,
    )
    expect(result.action).toBe("skip")
    if (result.action !== "skip") return
    expect(result.reason).toContain("non-whatsapp")
  })

  // ─── Missing Data ──────────────────────────────────────────────

  test("skips when chat does not exist", () => {
    const result = processIncomingWhatsAppMessage(
      makeMessage({ chatId: "nonexistent" }),
      dataAccess,
    )
    expect(result.action).toBe("skip")
    if (result.action !== "skip") return
    expect(result.reason).toContain("no chat found")
  })

  test("skips when no subChat exists for chat", () => {
    const noSubChatAccess = createMockDataAccess({
      chat: { id: CHAT_ID },
      // no subChat
    })
    const result = processIncomingWhatsAppMessage(makeMessage(), noSubChatAccess)
    expect(result.action).toBe("skip")
    if (result.action !== "skip") return
    expect(result.reason).toContain("no subChat found")
  })

  // ─── Multiple Messages ─────────────────────────────────────────

  test("multiple messages accumulate without data loss", () => {
    processIncomingWhatsAppMessage(makeMessage({ text: "First", messageId: "wa_1" }), dataAccess)
    processIncomingWhatsAppMessage(makeMessage({ text: "Second", messageId: "wa_2" }), dataAccess)
    processIncomingWhatsAppMessage(makeMessage({ text: "Third", messageId: "wa_3" }), dataAccess)

    const stored = JSON.parse(dataAccess.getStoredMessages()!)
    expect(stored).toHaveLength(5) // 2 original + 3 new

    // Originals preserved
    expect(stored[0].parts[0].text).toBe("Hello from desktop")
    expect(stored[1].parts[0].text).toBe("Hi! How can I help?")

    // WhatsApp messages in order
    expect(stored[2].parts[0].text).toContain("First")
    expect(stored[3].parts[0].text).toContain("Second")
    expect(stored[4].parts[0].text).toContain("Third")
  })

  // ─── Edge Cases ────────────────────────────────────────────────

  test("handles null messages field in subChat", () => {
    const nullMsgAccess = createMockDataAccess({
      chat: { id: CHAT_ID },
      subChat: { id: SUBCHAT_ID, chatId: CHAT_ID, messages: null },
    })

    const result = processIncomingWhatsAppMessage(makeMessage(), nullMsgAccess)
    expect(result.action).toBe("emit")

    const stored = JSON.parse(nullMsgAccess.getStoredMessages()!)
    expect(stored).toHaveLength(1)
  })

  test("handles empty string messages field in subChat", () => {
    const emptyMsgAccess = createMockDataAccess({
      chat: { id: CHAT_ID },
      subChat: { id: SUBCHAT_ID, chatId: CHAT_ID, messages: "" },
    })

    const result = processIncomingWhatsAppMessage(makeMessage(), emptyMsgAccess)
    expect(result.action).toBe("emit")

    const stored = JSON.parse(emptyMsgAccess.getStoredMessages()!)
    expect(stored).toHaveLength(1)
  })

  // ─── Duplicate Detection Integration ───────────────────────────

  test("persisted message matches Claude's duplicate detection", () => {
    const msg = makeMessage({ sender: "Alice", text: "Hello from WhatsApp!" })
    processIncomingWhatsAppMessage(msg, dataAccess)

    const stored = JSON.parse(dataAccess.getStoredMessages()!)

    // The prompt that onTriggerResponse sends
    const promptFromBridge = buildAttributedText("Alice", "Hello from WhatsApp!")

    // Claude's isDuplicate check should match
    expect(wouldClaudeDetectDuplicate(stored, promptFromBridge)).toBe(true)

    // Different prompt should NOT match
    expect(wouldClaudeDetectDuplicate(stored, "something else")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// Unit Tests: Helper Functions
// ─────────────────────────────────────────────────────────────────

describe("buildAttributedText", () => {
  test("formats sender and text with WhatsApp attribution", () => {
    const result = buildAttributedText("Alice", "Hello!")
    expect(result).toBe("**📱 WhatsApp** (Alice):\n\nHello!")
  })
})

describe("wouldClaudeDetectDuplicate", () => {
  test("detects exact duplicate of last user message", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "assistant", parts: [{ type: "text", text: "hi" }] },
      { role: "user", parts: [{ type: "text", text: "the prompt" }] },
    ]
    expect(wouldClaudeDetectDuplicate(messages, "the prompt")).toBe(true)
  })

  test("does not match when last message is assistant", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "assistant", parts: [{ type: "text", text: "the prompt" }] },
    ]
    expect(wouldClaudeDetectDuplicate(messages, "the prompt")).toBe(false)
  })

  test("does not match when text differs", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "different" }] },
    ]
    expect(wouldClaudeDetectDuplicate(messages, "the prompt")).toBe(false)
  })

  test("handles empty array", () => {
    expect(wouldClaudeDetectDuplicate([], "anything")).toBe(false)
  })
})
