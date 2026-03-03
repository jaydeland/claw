/**
 * Chat Session Management Service
 *
 * Manages persistent chat sessions for WhatsApp and Slack integrations.
 * Enables conversation context to be maintained across multiple messages.
 */

import { eq, and, desc } from "drizzle-orm"
import {
  getDatabase,
  chatSessions,
  clawExecutions,
  type NewChatSession,
  type ChatSession,
} from "../db"
import type { ChatPlatform, ChatSessionStatus } from "../db/schema"

/**
 * Context data stored in a chat session
 */
export interface SessionContext {
  messageHistory: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: number
  }>
  metadata: Record<string, unknown>
}

/**
 * Get or create a chat session for a specific external chat
 */
export async function getOrCreateSession(
  clawId: string,
  externalId: string,
  platform: ChatPlatform,
  initialContext?: Partial<SessionContext>
): Promise<ChatSession> {
  const db = getDatabase()

  // Try to find existing session
  const existingSession = db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.clawId, clawId),
        eq(chatSessions.externalId, externalId),
        eq(chatSessions.platform, platform)
      )
    )
    .get()

  if (existingSession) {
    // Update last activity
    db.update(chatSessions)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(chatSessions.id, existingSession.id))
      .run()

    return existingSession
  }

  // Create new session
  const context: SessionContext = {
    messageHistory: initialContext?.messageHistory || [],
    metadata: initialContext?.metadata || {},
  }

  const newSession: NewChatSession = {
    clawId,
    externalId,
    platform,
    status: "idle",
    context: JSON.stringify(context),
  }

  const result = db.insert(chatSessions).values(newSession).returning().get()
  return result
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const db = getDatabase()
  return db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get() || null
}

/**
 * Get a session by external ID
 */
export async function getSessionByExternalId(
  clawId: string,
  externalId: string,
  platform: ChatPlatform
): Promise<ChatSession | null> {
  const db = getDatabase()
  return (
    db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.clawId, clawId),
          eq(chatSessions.externalId, externalId),
          eq(chatSessions.platform, platform)
        )
      )
      .get() || null
  )
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: ChatSessionStatus,
  executionId?: string
): Promise<void> {
  const db = getDatabase()

  const update: Partial<ChatSession> = {
    status,
    lastActivityAt: new Date(),
    updatedAt: new Date(),
  }

  if (executionId) {
    update.currentExecutionId = executionId
  }

  db.update(chatSessions).set(update).where(eq(chatSessions.id, sessionId)).run()
}

/**
 * Get session context
 */
export function getSessionContext(session: ChatSession): SessionContext {
  try {
    return JSON.parse(session.context) as SessionContext
  } catch {
    return { messageHistory: [], metadata: {} }
  }
}

/**
 * Update session context
 */
export async function updateSessionContext(
  sessionId: string,
  context: Partial<SessionContext>
): Promise<void> {
  const db = getDatabase()
  const session = await getSession(sessionId)

  if (!session) return

  const currentContext = getSessionContext(session)
  const newContext: SessionContext = {
    messageHistory: context.messageHistory || currentContext.messageHistory,
    metadata: { ...currentContext.metadata, ...context.metadata },
  }

  db.update(chatSessions)
    .set({
      context: JSON.stringify(newContext),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, sessionId))
    .run()
}

/**
 * Add a message to session history
 */
export async function addMessageToSession(
  sessionId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const db = getDatabase()
  const session = await getSession(sessionId)

  if (!session) return

  const context = getSessionContext(session)
  context.messageHistory.push({
    role,
    content,
    timestamp: Date.now(),
  })

  // Keep only last 50 messages to prevent context from growing too large
  if (context.messageHistory.length > 50) {
    context.messageHistory = context.messageHistory.slice(-50)
  }

  db.update(chatSessions)
    .set({
      context: JSON.stringify(context),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, sessionId))
    .run()
}

/**
 * Get all active sessions for a claw
 */
export async function getActiveSessionsForClaw(clawId: string): Promise<ChatSession[]> {
  const db = getDatabase()
  return db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.clawId, clawId), eq(chatSessions.status, "active")))
    .all()
}

/**
 * Get all sessions for a claw
 */
export async function getSessionsForClaw(clawId: string): Promise<ChatSession[]> {
  const db = getDatabase()
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.clawId, clawId))
    .orderBy(desc(chatSessions.lastActivityAt))
    .all()
}

/**
 * Get session with execution history
 */
export async function getSessionWithExecutions(
  sessionId: string
): Promise<{ session: ChatSession | null; executions: typeof clawExecutions.$inferSelect[] }> {
  const db = getDatabase()

  const session = await getSession(sessionId)
  if (!session) {
    return { session: null, executions: [] }
  }

  const executions = db
    .select()
    .from(clawExecutions)
    .where(eq(clawExecutions.sessionId, sessionId))
    .orderBy(desc(clawExecutions.startedAt))
    .all()

  return { session, executions }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = getDatabase()
  db.delete(chatSessions).where(eq(chatSessions.id, sessionId)).run()
}

/**
 * Clean up old inactive sessions
 */
export async function cleanupOldSessions(maxAgeDays: number = 30): Promise<number> {
  const db = getDatabase()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays)

  const result = db
    .delete(chatSessions)
    .where(
      and(
        eq(chatSessions.status, "completed"),
        desc(chatSessions.lastActivityAt) < cutoffDate.getTime()
      )
    )
    .run()

  return result.changes || 0
}

/**
 * Format session context for Claude prompt
 */
export function formatSessionContextForPrompt(session: ChatSession): string {
  const context = getSessionContext(session)

  if (context.messageHistory.length === 0) {
    return ""
  }

  const history = context.messageHistory
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n\n")

  return `Previous conversation context:\n\n${history}\n\n---\n\n`
}
