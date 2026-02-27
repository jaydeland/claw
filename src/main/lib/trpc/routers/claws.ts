import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, headlessClaws, clawExecutions, mcpToolCache } from "../../db"
import { eq, desc } from "drizzle-orm"
import { createId } from "../../db/utils"
import { clawDaemon } from "../../claws"
import { safeStorage } from "electron"

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
        .select()
        .from(clawExecutions)
        .where(eq(clawExecutions.clawId, input.clawId))
        .orderBy(desc(clawExecutions.startedAt))
        .limit(input.limit)
        .all()

      return { success: true, executions }
    }),

  /**
   * Get a single execution by ID
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

      return { success: true, execution }
    }),

  /**
   * List available MCP servers (from tool cache)
   */
  listAvailableMcpServers: publicProcedure.query(async () => {
    const db = getDatabase()
    const servers = db.select().from(mcpToolCache).all()
    return servers.map(s => ({ id: s.serverId, name: s.serverId, toolCount: s.toolCount }))
  }),
})
