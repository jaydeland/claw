/**
 * WhatsApp Queue Manager - Sequential message processing
 *
 * Processes WhatsApp messages one at a time to:
 * - Prevent race conditions with parallel claw executions
 * - Maintain message ordering in conversations
 * - Control API resource usage
 * - Enable error recovery and retry logic
 */

import { EventEmitter } from "events"
import { getDatabase, headlessClaws, clawExecutions } from "../db"
import { eq } from "drizzle-orm"
import { clawDaemon, getOrCreateSession, updateSessionStatus, addMessageToSession } from "./index"
import type { WhatsAppQueueItem, QueueStatus, QueueConfig } from "./queue-types"
import { getWhatsAppTrigger } from "./whatsapp-trigger"

export class WhatsAppQueueManager extends EventEmitter {
  private queue: WhatsAppQueueItem[] = []
  private isProcessing = false
  private config: QueueConfig

  constructor(config?: Partial<QueueConfig>) {
    super()
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config }
  }

  /**
   * Add message to queue
   */
  enqueue(item: WhatsAppQueueItem): void {
    console.log(`[QueueManager] Enqueueing: claw=${item.clawName}, sender=${item.sender}, text=${item.messageText.substring(0, 50)}`)
    this.queue.push(item)
    this.emit("queued", item)
    this.processQueue()
  }

  /**
   * Process queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log("[QueueManager] Already processing, skipping")
      return
    }

    if (this.config.mode === "paused") {
      console.log("[QueueManager] Queue is paused")
      return
    }

    this.isProcessing = true

    try {
      while (this.queue.length > 0 && this.config.mode !== "paused") {
        // Find next pending item
        const itemIndex = this.queue.findIndex(i => i.status === "pending" || i.status === "processing")
        if (itemIndex === -1) break

        const item = this.queue[itemIndex]

        try {
          item.status = "processing"
          this.emit("processing", item)

          console.log(`[QueueManager] Processing: ${item.clawName} (${item.id})`)

          // Execute the claw
          if (!clawDaemon) {
            throw new Error("Claw daemon not available")
          }

          const executionId = await clawDaemon.executeClaw(item.clawId, {
            whatsappFrom: item.externalId,
            whatsappSender: item.sender,
            originalMessage: item.messageText,
            triggerSource: "whatsapp",
            sessionId: item.sessionId,
          })

          item.executionId = executionId
          console.log(`[QueueManager] Execution started: ${executionId}`)

          // Monitor and wait for completion
          await this.monitorExecution(item)

          item.status = "completed"
          this.emit("completed", item)
          console.log(`[QueueManager] Completed: ${item.clawName}`)

          // Send response via WhatsApp
          await this.sendResponse(item)

        } catch (error: any) {
          console.error(`[QueueManager] Failed: ${item.clawName}`, error)
          item.status = "failed"
          item.errorMessage = error?.message || "Unknown error"
          this.emit("failed", item, error)

          // Send error response via WhatsApp
          await this.sendResponse(item)

          // Auto-retry if enabled
          if (this.config.autoRetry && item.status === "failed") {
            const retryCount = (item as any)._retryCount || 0
            if (retryCount < this.config.maxRetries) {
              console.log(`[QueueManager] Retrying (${retryCount + 1}/${this.config.maxRetries}): ${item.clawName}`)
              ;(item as any)._retryCount = retryCount + 1
              item.status = "pending"
              continue // Will re-process on next iteration
            }
          }
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Monitor execution until complete
   */
  private async monitorExecution(item: WhatsAppQueueItem): Promise<void> {
    const checkInterval = 2000 // Check every 2 seconds
    const timeout = 10 * 60 * 1000 // 10 minutes

    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      const checkIntervalId = setInterval(async () => {
        try {
          const db = getDatabase()
          const execution = db
            .select()
            .from(clawExecutions)
            .where(eq(clawExecutions.id, item.executionId!))
            .get()

          if (!execution) {
            console.log(`[QueueManager] Execution ${item.executionId} not found`)
            return
          }

          if (execution.status === "running") {
            console.log(`[QueueManager] Execution ${item.executionId} still running`)
            return
          }

          // Execution complete
          clearInterval(checkIntervalId)
          clearTimeout(timeoutId)

          item.exitCode = execution.exitCode
          item.logs = execution.logs || ""

          // Update session status
          if (item.sessionId) {
            const sessionStatus = execution.status === "success" ? "completed" : "error"
            await updateSessionStatus(item.sessionId, sessionStatus)
            await addMessageToSession(item.sessionId, "assistant", `${item.clawName} completed`)
          }

          resolve()

        } catch (error) {
          console.error(`[QueueManager] Monitor error:`, error)
          clearInterval(checkIntervalId)
          clearTimeout(timeoutId)
          reject(error)
        }
      }, checkInterval)

      const timeoutId = setTimeout(() => {
        console.log(`[QueueManager] Timeout for ${item.executionId}`)
        clearInterval(checkIntervalId)
        reject(new Error("Execution timeout"))
      }, timeout)
    })
  }

  /**
   * Send response via WhatsApp after completion
   */
  async sendResponse(item: WhatsAppQueueItem): Promise<void> {
    const whatsappTrigger = getWhatsAppTrigger()

    if (item.status === "completed") {
      const logs = item.logs || ""
      const truncatedLogs = logs.length > 1500 ? "..." + logs.slice(-1500) : logs
      const message = `✅ *${item.clawName}* completed successfully\n\n\`\`\`${truncatedLogs}\`\`\``
      await whatsappTrigger.sendMessage(item.externalId, message)
    } else if (item.status === "failed") {
      const message = `❌ *${item.clawName}* failed: ${item.errorMessage || "Unknown error"}\n\nExit code: ${item.exitCode}`
      await whatsappTrigger.sendMessage(item.externalId, message)
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): QueueStatus {
    return {
      pending: this.queue.filter(i => i.status === "pending").length,
      processing: this.queue.filter(i => i.status === "processing").length,
      completed: this.queue.filter(i => i.status === "completed").length,
      failed: this.queue.filter(i => i.status === "failed").length,
      total: this.queue.length,
    }
  }

  /**
   * Get all queue items
   */
  getQueueItems(): WhatsAppQueueItem[] {
    return [...this.queue]
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    console.log("[QueueManager] Clearing queue")
    this.queue = []
    this.emit("cleared")
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    console.log("[QueueManager] Pausing")
    this.config.mode = "paused"
    this.emit("paused")
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    console.log("[QueueManager] Resuming")
    this.config.mode = "queued"
    this.emit("resumed")
    this.processQueue()
  }

  /**
   * Remove specific item from queue
   */
  removeItem(itemId: string): boolean {
    const index = this.queue.findIndex(i => i.id === itemId)
    if (index === -1) return false

    const removed = this.queue.splice(index, 1)[0]
    this.emit("removed", removed)
    return true
  }
}

// Singleton instance
let queueManagerInstance: WhatsAppQueueManager | null = null

/**
 * Get the WhatsAppQueueManager singleton
 */
export function getWhatsAppQueueManager(): WhatsAppQueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new WhatsAppQueueManager()
  }
  return queueManagerInstance
}

/**
 * Destroy the queue manager instance
 */
export function destroyWhatsAppQueueManager(): void {
  if (queueManagerInstance) {
    queueManagerInstance.removeAllListeners()
    queueManagerInstance = null
  }
}
