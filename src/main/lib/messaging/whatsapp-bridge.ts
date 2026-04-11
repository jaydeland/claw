/**
 * WhatsApp Bridge - Core message handling logic extracted for testability.
 *
 * Processes incoming WhatsApp messages: filters echoes, persists to DB,
 * and builds the payload for frontend emission.
 */

export interface IncomingPlatformMessage {
  platform: string
  chatId: string
  sender: string
  text: string
  timestamp: number
  messageId: string
  metadata?: {
    whatsappJid?: string
    isGroup?: boolean
    fromMe?: boolean
    media?: any
  }
}

export interface BridgePayload {
  bridgeId: string
  chatId: string
  subChatId: string
  whatsappJid: string
  sender: string
  text: string
  timestamp: number
  messageId: string
  fromMe: boolean
}

export type BridgeResult =
  | { action: "skip"; reason: string }
  | { action: "emit"; payload: BridgePayload; savedMessage: SavedWhatsAppMessage }

export interface SavedWhatsAppMessage {
  id: string
  role: "user"
  parts: Array<{ type: "text"; text: string }>
  metadata: { source: "whatsapp"; sender: string }
}

/**
 * Data access interface for the bridge logic.
 * Abstracts away Drizzle so we can test with a plain in-memory mock.
 */
export interface BridgeDataAccess {
  getChatById(chatId: string): { id: string; [key: string]: any } | undefined
  getMostRecentSubChat(chatId: string): { id: string; chatId: string; messages: string | null; [key: string]: any } | undefined
  updateSubChatMessages(subChatId: string, messages: string): void
}

/**
 * Create a BridgeDataAccess backed by Drizzle ORM tables.
 */
export function createDrizzleBridgeAccess(db: any, chatsTable: any, subChatsTable: any): BridgeDataAccess {
  // Lazy import to avoid pulling drizzle into test context
  const { eq, desc } = require("drizzle-orm")

  return {
    getChatById(chatId: string) {
      return db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).get()
    },
    getMostRecentSubChat(chatId: string) {
      return db.select().from(subChatsTable).where(eq(subChatsTable.chatId, chatId)).orderBy(desc(subChatsTable.createdAt)).limit(1).get()
    },
    updateSubChatMessages(subChatId: string, messages: string) {
      db.update(subChatsTable).set({ messages, updatedAt: new Date() }).where(eq(subChatsTable.id, subChatId)).run()
    },
  }
}

/**
 * Process an incoming WhatsApp message:
 * 1. Validates it's a WhatsApp message for a connected chat
 * 2. Filters out fromMe echoes (outgoing Claude responses)
 * 3. Persists the message to the subChat's messages in the database
 * 4. Returns the payload for frontend emission
 */
export function processIncomingWhatsAppMessage(
  message: IncomingPlatformMessage,
  dataAccess: BridgeDataAccess,
): BridgeResult {
  // Only handle WhatsApp messages
  if (message.platform !== "whatsapp") {
    return { action: "skip", reason: `non-whatsapp platform: ${message.platform}` }
  }

  // Get the chat connection info
  const chat = dataAccess.getChatById(message.chatId)
  if (!chat) {
    return { action: "skip", reason: `no chat found for ${message.chatId}` }
  }

  // Find the most recent subChat for this chat
  const subChat = dataAccess.getMostRecentSubChat(message.chatId)
  if (!subChat) {
    return { action: "skip", reason: `no subChat found for chat ${message.chatId}` }
  }

  // Note: bot echo filtering is handled upstream in WhatsAppAdapter.handleMessage()
  // using content-based matching (isBotEcho). The fromMe flag is unreliable because
  // the user's phone and Baileys share the same WhatsApp account.

  // Persist the WhatsApp message to the subChat's messages in the database.
  const attributedText = `**📱 WhatsApp** (${message.sender}):\n\n${message.text}`
  const existingMessages = JSON.parse(subChat.messages || "[]")
  const waMessage: SavedWhatsAppMessage = {
    id: `wa_${message.messageId}_${Date.now()}`,
    role: "user",
    parts: [{ type: "text", text: attributedText }],
    metadata: { source: "whatsapp", sender: message.sender, messageKey: message.metadata?.messageKey },
  }
  existingMessages.push(waMessage)
  dataAccess.updateSubChatMessages(subChat.id, JSON.stringify(existingMessages))

  return {
    action: "emit",
    payload: {
      bridgeId: chat.id,
      chatId: chat.id,
      subChatId: subChat.id,
      whatsappJid: message.metadata?.whatsappJid || "",
      sender: message.sender,
      text: message.text,
      timestamp: message.timestamp,
      messageId: message.messageId,
      fromMe: false,
    },
    savedMessage: waMessage,
  }
}

/**
 * Build the attributed text for a WhatsApp message.
 * Used by both the backend (DB persistence) and frontend (onTriggerResponse).
 */
export function buildAttributedText(sender: string, text: string): string {
  return `**📱 WhatsApp** (${sender}):\n\n${text}`
}

/**
 * Check if a Claude streaming handler would detect a WhatsApp message as duplicate.
 * The Claude handler (claude.ts) checks: lastMsg.role === "user" && lastMsg.parts[0].text === prompt
 */
export function wouldClaudeDetectDuplicate(
  dbMessages: any[],
  prompt: string,
): boolean {
  const lastMsg = dbMessages[dbMessages.length - 1]
  return lastMsg?.role === "user" && lastMsg?.parts?.[0]?.text === prompt
}
