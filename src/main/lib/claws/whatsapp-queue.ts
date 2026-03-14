/**
 * WhatsApp Queue - Simplified DB-backed message processing
 *
 * Architecture:
 * - No in-memory state (survives restarts)
 * - Single source of truth: claw_executions table
 * - Atomic operations: check + insert in one transaction
 * - Auto-recovery: stale executions auto-cleared
 */

import { getDatabase, headlessClaws, clawExecutions, chatSessions } from "../db"
import { eq, and, or, lt, sql } from "drizzle-orm"
import { clawDaemon, getOrCreateSession, updateSessionStatus, addMessageToSession } from "./index"
import { getWhatsAppTrigger } from "./whatsapp-trigger"

/**
 * Check if a session has a running execution
 * Returns the running execution if found, null otherwise
 */
export async function getRunningExecution(sessionId: string) {
  const db = getDatabase()
  return db
    .select()
    .from(clawExecutions)
    .where(and(eq(clawExecutions.sessionId, sessionId), eq(clawExecutions.status, "running")))
    .get()
}

/**
 * Check for stale executions (running > 10 minutes) and mark them failed
 */
export async function cleanupStaleExecutions() {
  const db = getDatabase()
  const staleTime = new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago

  const staleExecutions = db
    .select()
    .from(clawExecutions)
    .where(and(eq(clawExecutions.status, "running"), lt(clawExecutions.startedAt, staleTime)))
    .all()

  for (const exec of staleExecutions) {
    console.log(`[WhatsAppQueue] Marking stale execution ${exec.id} as failed`)
    db.update(clawExecutions)
      .set({
        status: "failed",
        logs: exec.logs + `\n\n[Timeout] Execution exceeded 10 minute limit`,
        completedAt: new Date(),
      })
      .where(eq(clawExecutions.id, exec.id))
      .run()

    if (exec.sessionId) {
      await updateSessionStatus(exec.sessionId, "error")
    }
  }

  return staleExecutions.length
}

/**
 * Queue a WhatsApp message for processing
 * Creates a claw_execution in "pending" status
 */
export async function queueWhatsAppMessage(
  clawId: string,
  clawName: string,
  from: string,
  sender: string,
  messageText: string,
  sessionId: string
) {
  const db = getDatabase()
  const executionId = crypto.randomUUID()

  // Insert as pending execution
  db.insert(clawExecutions)
    .values({
      id: executionId,
      clawId,
      sessionId,
      status: "pending",
      logs: `Message from ${sender}: ${messageText.substring(0, 100)}`,
      startedAt: new Date(),
    })
    .run()

  console.log(`[WhatsAppQueue] Queued ${clawName} execution ${executionId}`)
  return executionId
}

/**
 * Process pending executions sequentially
 * Called by a simple interval timer
 */
let processingLock = false

export async function processPendingQueue() {
  if (processingLock) {
    console.log("[WhatsAppQueue] Already processing, skipping")
    return
  }

  processingLock = true

  try {
    // First cleanup stale executions
    const cleaned = await cleanupStaleExecutions()
    if (cleaned > 0) {
      console.log(`[WhatsAppQueue] Cleaned ${cleaned} stale executions`)
    }

    const db = getDatabase()

    // Get next pending execution (not running)
    const pending = db
      .select()
      .from(clawExecutions)
      .where(eq(clawExecutions.status, "pending"))
      .orderBy(clawExecutions.startedAt)
      .limit(1)
      .get()

    if (!pending) {
      return // No pending work
    }

    // Mark as running
    db.update(clawExecutions)
      .set({ status: "running" })
      .where(eq(clawExecutions.id, pending.id))
      .run()

    console.log(`[WhatsAppQueue] Starting execution ${pending.id}`)

    // Execute the claw
    if (!clawDaemon) {
      throw new Error("Claw daemon not available")
    }

    const session = db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, pending.sessionId!))
      .get()

    const triggerContext = session?.metadata ? JSON.parse(session.metadata) : {}

    try {
      await clawDaemon.executeClaw(pending.clawId, {
        whatsappFrom: triggerContext?.from,
        whatsappSender: triggerContext?.sender,
        originalMessage: triggerContext?.message,
        triggerSource: "whatsapp",
        sessionId: pending.sessionId!,
      })

      // Mark as success
      db.update(clawExecutions)
        .set({
          status: "success",
          completedAt: new Date(),
        })
        .where(eq(clawExecutions.id, pending.id))
        .run()

      if (pending.sessionId) {
        await updateSessionStatus(pending.sessionId, "completed")
        await addMessageToSession(pending.sessionId, "assistant", `${pending.clawId} completed`)
      }

      // Send success response
      const trigger = getWhatsAppTrigger()
      const chatId = triggerContext?.from
      if (chatId) {
        await trigger.sendMessage(chatId, `✅ *${pending.clawId}* completed`)
      } else {
        console.warn("[WhatsAppQueue] No chatId available in triggerContext, skipping success response")
      }

    } catch (error: any) {
      // Mark as failed
      db.update(clawExecutions)
        .set({
          status: "failed",
          logs: pending.logs + `\n\nError: ${error?.message || "Unknown error"}`,
          completedAt: new Date(),
        })
        .where(eq(clawExecutions.id, pending.id))
        .run()

      if (pending.sessionId) {
        await updateSessionStatus(pending.sessionId, "error")
      }

      // Send error response
      const trigger = getWhatsAppTrigger()
      const chatId = triggerContext?.from
      if (chatId) {
        await trigger.sendMessage(chatId, `❌ *${pending.clawId}* failed: ${error?.message || "Unknown error"}`)
      } else {
        console.warn("[WhatsAppQueue] No chatId available in triggerContext, skipping error response")
      }
    }

  } finally {
    processingLock = false
  }
}

/**
 * Start the queue processor interval
 * Call once on app startup
 */
let queueInterval: NodeJS.Timeout | null = null

export function startWhatsAppQueue() {
  if (queueInterval) {
    console.log("[WhatsAppQueue] Already started")
    return
  }

  // Process every 3 seconds
  queueInterval = setInterval(processPendingQueue, 3000)
  console.log("[WhatsAppQueue] Started with 3s interval")
}

/**
 * Stop the queue processor
 */
export function stopWhatsAppQueue() {
  if (queueInterval) {
    clearInterval(queueInterval)
    queueInterval = null
    console.log("[WhatsAppQueue] Stopped")
  }
}

/**
 * Get queue status for UI
 */
export function getQueueStatus() {
  const db = getDatabase()

  const pending = db
    .select({ count: sql<number>`count(*)` })
    .from(clawExecutions)
    .where(eq(clawExecutions.status, "pending"))
    .get()

  const running = db
    .select({ count: sql<number>`count(*)` })
    .from(clawExecutions)
    .where(eq(clawExecutions.status, "running"))
    .get()

  const recent = db
    .select()
    .from(clawExecutions)
    .where(eq(clawExecutions.status, "running"))
    .orderBy(clawExecutions.startedAt)
    .limit(10)
    .all()

  return {
    pending: pending?.count ?? 0,
    running: running?.count ?? 0,
    recentExecutions: recent,
  }
}
