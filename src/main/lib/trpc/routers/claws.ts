import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, headlessClaws, clawExecutions, subChats, mcpToolCache, chatSessions } from "../../db"
import { eq, desc, and } from "drizzle-orm"
import { createId } from "../../db/utils"
import { clawDaemon } from "../../claws"
import { safeStorage } from "electron"
import {
  getOrCreateSession,
  getSession,
  getSessionWithExecutions,
  getSessionsForClaw,
  updateSessionStatus,
  addMessageToSession,
  deleteSession,
  getSessionContext,
  type SessionContext,
} from "../../claws/session-manager"

/**
 * Encrypt text using Electron's safeStorage
 */
function encryptText(text: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[claws] Encryption not available, storing as base64")
    return Buffer.from(text).toString("base64")
  }
  return safeStorage.encryptString(text).toString("base64")
}

/**
 * Decrypt text using Electron's safeStorage
 */
function decryptText(encrypted: string): string | null {
  if (!encrypted) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    const buffer = Buffer.from(encrypted, "base64")
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error("[claws] Failed to decrypt text:", error)
    return null
  }
}

/**
 * Claw trigger configuration schemas
 */
const cronConfigSchema = z.object({
  expression: z.string(), // e.g., "0 9 * * 1-5"
})

const githubPollConfigSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  label: z.string(), // e.g., "agent-ready"
})

const manualConfigSchema = z.object({})

const triggerConfigSchema = z.union([
  cronConfigSchema,
  githubPollConfigSchema,
  z.object({ slackChannelFilter: z.string().min(1) }),
  z.object({ whatsappChatFilter: z.string().optional() }),
  manualConfigSchema, // Must be last - empty object matches anything
])

/**
 * Claw router for managing headless agents
 */
export const clawsRouter = router({
  /**
   * Get all claws
   */
  getAll: publicProcedure.query(async () => {
    const db = getDatabase()
    const claws = db.select().from(headlessClaws).orderBy(desc(headlessClaws.createdAt)).all()

    return {
      success: true,
      claws: claws.map((claw) => ({
        ...claw,
        triggerConfig: JSON.parse(claw.triggerConfig),
      })),
    }
  }),

  /**
   * Get a single claw by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const claw = db.select().from(headlessClaws).where(eq(headlessClaws.id, input.id)).get()

      if (!claw) {
        return { success: false, error: "Claw not found" }
      }

      return {
        success: true,
        claw: {
          ...claw,
          triggerConfig: JSON.parse(claw.triggerConfig),
        },
      }
    }),

  /**
   * Create a new claw
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        instruction: z.string().min(1),
        targetWorktree: z.string().min(1),
        triggerType: z.enum(["cron", "github_poll", "manual", "slack_mention", "whatsapp_message"]),
        triggerConfig: triggerConfigSchema,
        isEnabled: z.boolean().default(true),
        allowedDirectories: z.array(z.string()).default([]),
        allowedMcpServers: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const id = createId()

      db.insert(headlessClaws)
        .values({
          id,
          name: input.name,
          instruction: input.instruction,
          targetWorktree: input.targetWorktree,
          triggerType: input.triggerType,
          triggerConfig: JSON.stringify(input.triggerConfig),
          isEnabled: input.isEnabled,
          allowedDirectories: JSON.stringify(input.allowedDirectories),
          allowedMcpServers: JSON.stringify(input.allowedMcpServers),
        })
        .run()

      // Reload daemon to register the new trigger
      await clawDaemon.reload()

      return { success: true, id }
    }),

  /**
   * Update a claw
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        instruction: z.string().min(1).optional(),
        targetWorktree: z.string().min(1).optional(),
        triggerType: z.enum(["cron", "github_poll", "manual", "slack_mention", "whatsapp_message"]).optional(),
        triggerConfig: triggerConfigSchema.optional(),
        allowedDirectories: z.array(z.string()).optional(),
        allowedMcpServers: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const { id, ...updates } = input

      const updateData: Record<string, string | boolean | Date | undefined> = { updatedAt: new Date() }

      if (updates.name !== undefined) updateData.name = updates.name
      if (updates.instruction !== undefined) updateData.instruction = updates.instruction
      if (updates.targetWorktree !== undefined) updateData.targetWorktree = updates.targetWorktree
      if (updates.triggerType !== undefined) updateData.triggerType = updates.triggerType
      if (updates.triggerConfig !== undefined) {
        updateData.triggerConfig = JSON.stringify(updates.triggerConfig)
      }
      if (updates.allowedDirectories !== undefined) {
        updateData.allowedDirectories = JSON.stringify(updates.allowedDirectories)
      }
      if (updates.allowedMcpServers !== undefined) {
        updateData.allowedMcpServers = JSON.stringify(updates.allowedMcpServers)
      }

      db.update(headlessClaws).set(updateData).where(eq(headlessClaws.id, id)).run()

      // Reload daemon to update triggers
      await clawDaemon.reload()

      return { success: true }
    }),

  /**
   * Toggle a claw's enabled state
   */
  toggleEnabled: publicProcedure
    .input(z.object({ id: z.string(), isEnabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      db.update(headlessClaws)
        .set({ isEnabled: input.isEnabled, updatedAt: new Date() })
        .where(eq(headlessClaws.id, input.id))
        .run()

      // Reload daemon to enable/disable trigger
      await clawDaemon.reload()

      return { success: true }
    }),

  /**
   * Delete a claw
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Delete will cascade to executions due to foreign key constraint
      db.delete(headlessClaws).where(eq(headlessClaws.id, input.id)).run()

      // Reload daemon to remove trigger
      await clawDaemon.reload()

      return { success: true }
    }),

  /**
   * Trigger a manual execution
   */
  trigger: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const executionId = await clawDaemon.executeClaw(input.id)
        return { success: true, executionId }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Get executions for a claw
   */
  getExecutions: publicProcedure
    .input(
      z.object({
        clawId: z.string(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = getDatabase()
      const executions = db
        .select({
          id: clawExecutions.id,
          clawId: clawExecutions.clawId,
          subChatId: clawExecutions.subChatId,
          status: clawExecutions.status,
          logs: clawExecutions.logs,
          exitCode: clawExecutions.exitCode,
          startedAt: clawExecutions.startedAt,
          completedAt: clawExecutions.completedAt,
        })
        .from(clawExecutions)
        .where(eq(clawExecutions.clawId, input.clawId))
        .orderBy(desc(clawExecutions.startedAt))
        .limit(input.limit)
        .all()

      // Fetch subChat names for executions that have them
      const executionsWithNames = await Promise.all(
        executions.map(async (execution) => {
          if (!execution.subChatId) return execution

          const subChat = db
            .select({ name: subChats.name })
            .from(subChats)
            .where(eq(subChats.id, execution.subChatId))
            .get()

          return {
            ...execution,
            subChatName: subChat?.name,
          }
        })
      )

      return { success: true, executions: executionsWithNames }
    }),

  /**
   * Get a single execution by ID with subChat details
   */
  getExecution: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const execution = db
        .select()
        .from(clawExecutions)
        .where(eq(clawExecutions.id, input.id))
        .get()

      if (!execution) {
        return { success: false, error: "Execution not found" }
      }

      let subChatName = null
      if (execution.subChatId) {
        const subChat = db
          .select({ name: subChats.name })
          .from(subChats)
          .where(eq(subChats.id, execution.subChatId))
          .get()
        subChatName = subChat?.name
      }

      return {
        success: true,
        execution: {
          ...execution,
          subChatName,
        },
      }
    }),

  /**
   * Continue execution in main chat
   */
  continueInChat: publicProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      const execution = db
        .select()
        .from(clawExecutions)
        .where(eq(clawExecutions.id, input.executionId))
        .get()

      if (!execution?.subChatId) {
        throw new Error("Execution has no associated subChat")
      }

      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, execution.subChatId))
        .get()

      if (!subChat) {
        throw new Error("SubChat not found")
      }

      // Create a new subChat in the same chat with the existing messages
      const newSubChatId = createId()
      db.insert(subChats)
        .values({
          id: newSubChatId,
          chatId: subChat.chatId,
          name: `Continued: ${subChat.name}`,
          messages: subChat.messages,
          sessionId: subChat.sessionId,
          mode: "agent",
        })
        .run()

      return {
        chatId: subChat.chatId,
        subChatId: newSubChatId,
      }
    }),

  /**
   * List available MCP servers (from tool cache)
   */
  listAvailableMcpServers: publicProcedure.query(async () => {
    const db = getDatabase()
    const servers = db.select().from(mcpToolCache).all()
    return servers.map(s => ({ id: s.serverId, name: s.serverId, toolCount: s.toolCount }))
  }),

  /**
   * Get chat sessions for a claw
   */
  getSessions: publicProcedure
    .input(z.object({ clawId: z.string() }))
    .query(async ({ input }) => {
      const sessions = await getSessionsForClaw(input.clawId)
      return {
        success: true,
        sessions: sessions.map(session => ({
          ...session,
          context: JSON.parse(session.context),
        })),
      }
    }),

  /**
   * Get a single session with execution history
   */
  getSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const { session, executions } = await getSessionWithExecutions(input.sessionId)

      if (!session) {
        return { success: false, error: "Session not found" }
      }

      return {
        success: true,
        session: {
          ...session,
          context: JSON.parse(session.context),
        },
        executions: executions.map(exec => ({
          id: exec.id,
          status: exec.status,
          logs: exec.logs,
          exitCode: exec.exitCode,
          startedAt: exec.startedAt,
          completedAt: exec.completedAt,
        })),
      }
    }),

  /**
   * Delete a session
   */
  deleteSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      await deleteSession(input.sessionId)
      return { success: true }
    }),

  /**
   * Continue a session (trigger a new execution with session context)
   */
  continueSession: publicProcedure
    .input(z.object({ sessionId: z.string(), message: z.string() }))
    .mutation(async ({ input }) => {
      const session = await getSession(input.sessionId)

      if (!session) {
        return { success: false, error: "Session not found" }
      }

      const db = getDatabase()
      const claw = db
        .select()
        .from(headlessClaws)
        .where(eq(headlessClaws.id, session.clawId))
        .get()

      if (!claw) {
        return { success: false, error: "Claw not found" }
      }

      // Check if session is already active
      if (session.status === "active") {
        return { success: false, error: "Session already has an active execution" }
      }

      // Add user message to session
      await addMessageToSession(session.id, "user", input.message)
      await updateSessionStatus(session.id, "active")

      // Execute claw with session context
      const executionId = await clawDaemon.executeClaw(claw.id, {
        originalMessage: input.message,
        triggerSource: session.platform === "whatsapp" ? "whatsapp" : "slack",
        sessionId: session.id,
      })

      return { success: true, executionId }
    }),
})
