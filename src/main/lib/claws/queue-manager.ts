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
import { DEFAULT_QUEUE_CONFIG } from "./queue-types"
import { getWhatsAppTrigger } from "./whatsapp-trigger"

export class WhatsAppQueueManager extends EventEmitter {
  private queues: Map<string, WhatsAppQueueItem[]> = new Map() // clawId -> queue items
  private isProcessing = false
  private config: QueueConfig

  constructor(config?: Partial<QueueConfig>) {
    super()
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config }
  }

  /**
   * Get or create queue for a specific claw
   */
  private getQueue(clawId: string): WhatsAppQueueItem[] {
    if (!this.queues.has(clawId)) {
      this.queues.set(clawId, [])
    }
    return this.queues.get(clawId)!
  }

  /**
   * Add message to queue for a specific claw
   */
  enqueue(item: WhatsAppQueueItem): void {
    console.log(`[QueueManager] Enqueueing: claw=${item.clawName} (${item.clawId}), sender=${item.sender}, text=${item.messageText.substring(0, 50)}`)
    const queue = this.getQueue(item.clawId)
    queue.push(item)
    this.emit("queued", item)
    this.processQueue(item.clawId)
  }

  /**
   * Process queue sequentially for a specific claw
   */
  private async processQueue(clawId?: string): Promise<void> {
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
      // If clawId specified, process only that claw's queue
      if (clawId) {
        await this.processClawQueue(clawId)
      } else {
        // Process all claws' queues in round-robin fashion
        for (const [cid] of this.queues) {
          await this.processClawQueue(cid)
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process queue for a single claw
   */
  private async processClawQueue(clawId: string): Promise<void> {
    const queue = this.getQueue(clawId)
    const clawName = queue[0]?.clawName || clawId

    while (queue.length > 0 && this.config.mode !== "paused") {
      // Find next pending item
      const itemIndex = queue.findIndex(i => i.status === "pending" || i.status === "processing")
      if (itemIndex === -1) break

      const item = queue[itemIndex]

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
            // Check for timeout - force fail if exceeded
            const elapsed = Date.now() - startTime
            if (elapsed > timeout) {
              console.log(`[QueueManager] Execution ${item.executionId} timeout after ${Math.floor(elapsed / 1000)}s, marking as failed`)
              clearInterval(checkIntervalId)
              clearTimeout(timeoutId)

              // Force update execution to failed
              db.update(clawExecutions)
                .set({
                  status: "failed",
                  logs: execution.logs + `\n\n[Timeout] Execution exceeded ${timeout / 1000}s limit`,
                  completedAt: new Date(),
                })
                .where(eq(clawExecutions.id, item.executionId!))
                .run()

              item.exitCode = null
              item.logs = execution.logs || ""
              item.errorMessage = "Execution timeout"
              resolve()
              return
            }
            console.log(`[QueueManager] Execution ${item.executionId} still running (${Math.floor(elapsed / 1000)}s elapsed)`)
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
   * Get queue status - optionally filtered by clawId
   */
  getQueueStatus(clawId?: string): QueueStatus {
    let allItems: WhatsAppQueueItem[] = []
    if (clawId) {
      allItems = this.getQueue(clawId)
    } else {
      for (const [, queue] of this.queues) {
        allItems = allItems.concat(queue)
      }
    }
    return {
      pending: allItems.filter(i => i.status === "pending").length,
      processing: allItems.filter(i => i.status === "processing").length,
      completed: allItems.filter(i => i.status === "completed").length,
      failed: allItems.filter(i => i.status === "failed").length,
      total: allItems.length,
    }
  }

  /**
   * Get all queue items - optionally filtered by clawId
   */
  getQueueItems(clawId?: string): WhatsAppQueueItem[] {
    if (clawId) {
      return [...this.getQueue(clawId)]
    }
    let allItems: WhatsAppQueueItem[] = []
    for (const [, queue] of this.queues) {
      allItems = allItems.concat(queue)
    }
    return allItems
  }

  /**
   * Get all claw IDs with queued items
   */
  getClawIds(): string[] {
    return Array.from(this.queues.keys())
  }

  /**
   * Clear queue - optionally for a specific claw
   */
  clearQueue(clawId?: string): void {
    if (clawId) {
      console.log(`[QueueManager] Clearing queue for claw ${clawId}`)
      this.queues.set(clawId, [])
    } else {
      console.log("[QueueManager] Clearing all queues")
      this.queues.clear()
    }
    this.emit("cleared", clawId)
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
   * Resume queue processing - optionally for a specific claw
   */
  resume(clawId?: string): void {
    console.log("[QueueManager] Resuming")
    this.config.mode = "queued"
    this.emit("resumed")
    this.processQueue(clawId)
  }

  /**
   * Remove specific item from queue
   */
  removeItem(itemId: string): boolean {
    for (const [, queue] of this.queues) {
      const index = queue.findIndex(i => i.id === itemId)
      if (index !== -1) {
        const removed = queue.splice(index, 1)[0]
        this.emit("removed", removed)
        return true
      }
    }
    return false
  }

  /**
   * Clear stuck processing state - use when queue is wedged
   * Resets isProcessing flag and marks any processing items as failed
   */
  clearStuckState(clawId?: string): void {
    console.log("[QueueManager] Clearing stuck state")

    // Mark any stuck processing items as failed
    const items = clawId ? this.getQueue(clawId) : this.getQueueItems()
    const stuckItems = items.filter(i => i.status === "processing")
    for (const item of stuckItems) {
      console.log(`[QueueManager] Marking stuck item ${item.id} (${item.clawName}) as failed`)
      item.status = "failed"
      item.errorMessage = "Stuck execution - cleared by admin"
      this.emit("failed", item, new Error("Stuck execution"))
    }

    // Reset processing flag
    this.isProcessing = false
    this.emit("stuck-cleared")

    // Attempt to process remaining items
    this.processQueue(clawId)
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
