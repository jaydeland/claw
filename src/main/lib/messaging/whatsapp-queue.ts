/**
 * WhatsApp Message Queue
 *
 * Debounces and batches incoming WhatsApp messages before triggering Claude.
 * Prevents lost responses when users send multiple rapid-fire messages.
 *
 * Behavior:
 * - Messages are saved to DB immediately (so they're never lost)
 * - Claude is only triggered after a configurable quiet period (debounce)
 * - If Claude is already streaming, new messages queue until it finishes
 * - Multiple queued messages are batched into one Claude trigger
 */

import { EventEmitter } from "events"

export interface QueuedMessage {
  chatId: string
  subChatId: string
  sender: string
  text: string
  attributedText: string
  messageKey?: any // For reactions
  timestamp: number
}

export interface QueueTriggerEvent {
  chatId: string
  subChatId: string
  /** Sender name (from last message in batch) */
  sender: string
  /** Combined attributed text from all batched messages */
  prompt: string
  /** All message keys for reacting */
  messageKeys: any[]
  /** Number of messages in this batch */
  batchSize: number
}

const DEBOUNCE_MS = 3000 // Wait 3s of quiet before triggering Claude

export class WhatsAppMessageQueue extends EventEmitter {
  // Per-chat message buffers
  private buffers = new Map<string, QueuedMessage[]>()
  // Per-chat debounce timers
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  // Per-chat streaming lock (true = Claude is currently streaming)
  private streaming = new Map<string, boolean>()

  /**
   * Add a message to the queue.
   * The message is already saved to DB by the bridge — this only controls
   * when Claude is triggered.
   */
  enqueue(message: QueuedMessage): void {
    const key = message.chatId

    // Add to buffer
    const buffer = this.buffers.get(key) || []
    buffer.push(message)
    this.buffers.set(key, buffer)

    // If Claude is streaming for this chat, just buffer — don't trigger yet
    if (this.streaming.get(key)) {
      console.log(`[WhatsAppQueue] Buffered message for ${key} (Claude is streaming, ${buffer.length} queued)`)
      return
    }

    // Reset debounce timer
    const existingTimer = this.timers.get(key)
    if (existingTimer) clearTimeout(existingTimer)

    this.timers.set(key, setTimeout(() => {
      this.flush(key)
    }, DEBOUNCE_MS))

    console.log(`[WhatsAppQueue] Debouncing for ${key} (${buffer.length} message(s), ${DEBOUNCE_MS}ms)`)
  }

  /**
   * Flush buffered messages for a chat — triggers Claude with the batch.
   */
  private flush(chatId: string): void {
    const buffer = this.buffers.get(chatId)
    if (!buffer || buffer.length === 0) return

    // Take all buffered messages
    const messages = [...buffer]
    this.buffers.set(chatId, [])
    this.timers.delete(chatId)

    // Mark as streaming
    this.streaming.set(chatId, true)

    // Build combined prompt from all buffered messages
    // If single message, use it directly; if multiple, combine them
    const prompt = messages.length === 1
      ? messages[0].attributedText
      : messages.map(m => m.attributedText).join("\n\n---\n\n")

    const messageKeys = messages
      .map(m => m.messageKey)
      .filter(Boolean)

    const event: QueueTriggerEvent = {
      chatId,
      subChatId: messages[messages.length - 1].subChatId,
      sender: messages[messages.length - 1].sender,
      prompt,
      messageKeys,
      batchSize: messages.length,
    }

    console.log(`[WhatsAppQueue] Triggering Claude for ${chatId} (${messages.length} message(s))`)
    this.emit("trigger", event)
  }

  /**
   * Called when Claude finishes streaming for a chat.
   * If there are buffered messages, triggers the next batch.
   */
  streamComplete(chatId: string): void {
    this.streaming.set(chatId, false)

    // Check if messages accumulated while streaming
    const buffer = this.buffers.get(chatId)
    if (buffer && buffer.length > 0) {
      console.log(`[WhatsAppQueue] Stream complete for ${chatId}, flushing ${buffer.length} queued message(s)`)
      // Small delay to let the DB settle
      setTimeout(() => this.flush(chatId), 500)
    }
  }

  /**
   * Check if Claude is currently streaming for a chat.
   */
  isStreaming(chatId: string): boolean {
    return this.streaming.get(chatId) || false
  }

  /**
   * Get queue stats for debugging.
   */
  getStats(): { chatId: string; buffered: number; streaming: boolean }[] {
    const stats: { chatId: string; buffered: number; streaming: boolean }[] = []
    for (const [chatId, buffer] of this.buffers) {
      stats.push({
        chatId,
        buffered: buffer.length,
        streaming: this.streaming.get(chatId) || false,
      })
    }
    return stats
  }
}

// Singleton queue instance
let queueInstance: WhatsAppMessageQueue | null = null

export function getWhatsAppQueue(): WhatsAppMessageQueue {
  if (!queueInstance) {
    queueInstance = new WhatsAppMessageQueue()
  }
  return queueInstance
}
