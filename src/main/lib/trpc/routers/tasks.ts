import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { backgroundTasks, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"
import { readFile } from "fs/promises"

export const tasksRouter = router({
  /**
   * List all background tasks for a sub-chat
   */
  listBySubChat: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      return db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.subChatId, input.subChatId))
        .orderBy(desc(backgroundTasks.startedAt))
        .all()
    }),

  /**
   * List all background tasks for a chat (all sub-chats)
   */
  listByChat: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      return db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.chatId, input.chatId))
        .orderBy(desc(backgroundTasks.startedAt))
        .all()
    }),

  /**
   * Get a specific task with its output
   */
  getWithOutput: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        tailLines: z.number().optional(), // Only get last N lines
      }),
    )
    .query(async ({ input }) => {
      const db = getDatabase()
      const task = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.id, input.taskId))
        .get()

      if (!task) return null

      let output = ""
      if (task.outputFile) {
        try {
          const content = await readFile(task.outputFile, "utf-8")
          if (input.tailLines) {
            const lines = content.split("\n")
            output = lines.slice(-input.tailLines).join("\n")
          } else {
            output = content
          }
        } catch {
          output = "(Output file not available)"
        }
      }

      return { ...task, output }
    }),

  /**
   * Create a new background task record
   */
  create: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        toolCallId: z.string(),
        command: z.string(),
        description: z.string().optional(),
        outputFile: z.string().optional(),
        pid: z.number().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      return db.insert(backgroundTasks).values(input).returning().get()
    }),

  /**
   * Update task status (e.g., when completed)
   */
  updateStatus: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        status: z.enum(["running", "completed", "failed", "unknown"]),
        exitCode: z.number().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(backgroundTasks)
        .set({
          status: input.status,
          exitCode: input.exitCode,
          completedAt: input.status !== "running" ? new Date() : undefined,
        })
        .where(eq(backgroundTasks.id, input.taskId))
        .returning()
        .get()
    }),

  /**
   * Check and update status of all running tasks
   * Called periodically to sync task statuses
   */
  refreshStatuses: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const { exec } = await import("node:child_process")
      const { promisify } = await import("node:util")
      const execAsync = promisify(exec)

      // Get all running tasks for this chat
      const runningTasks = db
        .select()
        .from(backgroundTasks)
        .where(
          and(
            eq(backgroundTasks.chatId, input.chatId),
            eq(backgroundTasks.status, "running"),
          ),
        )
        .all()

      const updates: Array<{ id: string; status: string }> = []

      for (const task of runningTasks) {
        if (task.pid) {
          try {
            // Check if process is still running
            await execAsync(`kill -0 ${task.pid}`)
            // Process exists, still running
          } catch {
            // Process doesn't exist, mark as completed/unknown
            db.update(backgroundTasks)
              .set({ status: "unknown", completedAt: new Date() })
              .where(eq(backgroundTasks.id, task.id))
              .run()
            updates.push({ id: task.id, status: "unknown" })
          }
        }
      }

      return { updated: updates.length, tasks: updates }
    }),

  /**
   * Delete a task record
   */
  delete: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .delete(backgroundTasks)
        .where(eq(backgroundTasks.id, input.taskId))
        .returning()
        .get()
    }),
})
