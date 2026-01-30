import { eq } from "drizzle-orm"
import { z } from "zod"
import { backgroundTasks, subChats, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"
import { readFile, stat, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import { observable } from "@trpc/server/observable"
import { TRPCError } from "@trpc/server"
import { taskEvents, taskWatcher, type TaskStatusUpdate } from "../../background-tasks"
import { checkBackgroundTaskStatus, isBackgroundSessionReady } from "../../claude/background-session"

const execAsync = promisify(exec)

/**
 * Derived task status
 */
type TaskStatus = "running" | "completed" | "failed" | "stopped" | "unknown"

/**
 * Check if a process is still running (kept for backwards compatibility with PID-based tasks)
 */
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    await execAsync(`kill -0 ${pid}`)
    return true
  } catch {
    return false
  }
}

/**
 * Parse exit code from output file
 */
async function parseExitCode(outputFile: string): Promise<number | undefined> {
  try {
    const content = await readFile(outputFile, "utf-8")
    const match = content.match(/exit\s+code:\s*(\d+)/i)
    if (match) return parseInt(match[1], 10)
    const exitMatch = content.match(/\[Process exited with code (\d+)\]/)
    if (exitMatch) return parseInt(exitMatch[1], 10)
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Line count cache to avoid counting lines on every request
 */
interface LineCountCacheEntry {
  count: number
  mtime: number
  timestamp: number
}

const lineCountCache = new Map<string, LineCountCacheEntry>()
const CACHE_TTL = 10000 // 10 seconds

/**
 * Get cached line count for a file, or count lines if cache miss/expired
 */
async function getCachedLineCount(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath)
    const mtime = stats.mtimeMs

    // Check cache
    const cached = lineCountCache.get(filePath)
    if (cached && cached.mtime === mtime && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.count
    }

    // Count lines
    const content = await readFile(filePath, "utf-8")
    const count = content.split("\n").length

    // Update cache
    lineCountCache.set(filePath, {
      count,
      mtime,
      timestamp: Date.now(),
    })

    return count
  } catch {
    return 0
  }
}

/**
 * Read lines from a file with efficient pagination support
 */
async function readFileLines(
  filePath: string,
  options: {
    offset?: number // Start from line N (0-based)
    limit?: number // Load up to N lines
    fromEnd?: boolean // Read last N lines (for tailLines)
  } = {}
): Promise<{
  lines: string[]
  totalLines: number
  startLine: number // 0-based index of first line in result
  endLine: number // 0-based index of last line in result
}> {
  try {
    const content = await readFile(filePath, "utf-8")
    const allLines = content.split("\n")
    const totalLines = allLines.length

    let selectedLines: string[]
    let startLine: number
    let endLine: number

    if (options.fromEnd) {
      // TailLines mode: return last N lines
      const limit = options.limit || totalLines
      selectedLines = allLines.slice(-limit)
      startLine = Math.max(0, totalLines - limit)
      endLine = totalLines - 1
    } else {
      // Pagination mode: return lines from offset to offset+limit
      const offset = options.offset || 0
      const limit = options.limit || totalLines
      selectedLines = allLines.slice(offset, offset + limit)
      startLine = offset
      endLine = offset + selectedLines.length - 1
    }

    return {
      lines: selectedLines,
      totalLines,
      startLine,
      endLine,
    }
  } catch (error) {
    // File doesn't exist or can't be read
    return {
      lines: [],
      totalLines: 0,
      startLine: 0,
      endLine: -1,
    }
  }
}

/**
 * Get derived status for a task based on SDK status, output file, or messages
 *
 * Priority:
 * 1. sdkStatus from task_notification messages (most reliable)
 * 2. Exit code from output file or messages
 * 3. If we have sdkTaskId but no sdkStatus, task is still running
 * 4. Default to running (task just created)
 */
async function getDerivedStatus(
  task: typeof backgroundTasks.$inferSelect
): Promise<{ status: TaskStatus; exitCode?: number }> {
  // Cast to access new fields (may not exist in older tasks)
  const taskAny = task as any

  // 1. If we have SDK status from task_notification, use it directly
  if (taskAny.sdkStatus) {
    // Parse exit code from output file if available
    let exitCode: number | undefined
    if (task.outputFile && existsSync(task.outputFile)) {
      exitCode = await parseExitCode(task.outputFile)
    }

    // Map SDK status to our status type
    if (taskAny.sdkStatus === "completed") {
      return { status: "completed", exitCode: exitCode ?? 0 }
    } else if (taskAny.sdkStatus === "failed") {
      return { status: "failed", exitCode: exitCode ?? 1 }
    } else if (taskAny.sdkStatus === "stopped") {
      return { status: "stopped", exitCode }
    }
  }

  // 2. Check output file for exit code or content (fallback for older tasks or if notification was missed)
  if (task.outputFile && existsSync(task.outputFile)) {
    const exitCode = await parseExitCode(task.outputFile)
    if (exitCode !== undefined) {
      return {
        status: exitCode === 0 ? "completed" : "failed",
        exitCode,
      }
    }

    // If file has content but no exit code marker, assume completed
    // (SDK writes output but doesn't write exit code markers)
    try {
      const content = await readFile(task.outputFile, "utf-8")
      if (content.trim().length > 0) {
        return {
          status: "completed",
          exitCode: 0, // Assume success if we have output
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // 3. If we have sdkTaskId but no status/exit code, task is still running
  if (taskAny.sdkTaskId) {
    return { status: "running" }
  }

  // 4. No SDK task info - consider it running (newly created)
  return { status: "running" }
}

/**
 * Extract output and exit code from messages for a given toolCallId
 * Command and description are now stored in the background_tasks table
 * Also looks for TaskOutput tool results that reference the same task
 */
function getTaskDataFromMessages(
  task: typeof backgroundTasks.$inferSelect
): { output?: string; exitCode?: number } {
  try {
    const db = getDatabase()
    const subChat = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, task.subChatId))
      .get()

    if (!subChat || !subChat.messages) {
      return {}
    }

    const messages = JSON.parse(subChat.messages as string) as any[]

    let output: string | undefined
    let exitCode: number | undefined
    let taskIdFromOutput: string | undefined

    // Find message parts with matching toolCallId
    for (const message of messages) {
      if (message.type === "assistant" && message.parts) {
        for (const part of message.parts) {
          if (part.toolCallId === task.toolCallId) {
            // Extract output from tool result (stored in output or result field)
            const toolOutput = part.output || part.result
            if (toolOutput && typeof toolOutput === "object") {
              const stdout = toolOutput.stdout || toolOutput.output || ""
              const stderr = toolOutput.stderr || ""

              // For background tasks, also capture the task_id for finding TaskOutput results
              taskIdFromOutput = toolOutput.task_id || toolOutput.taskId

              // Combine stdout and stderr
              const outputParts: string[] = []
              if (stdout) outputParts.push(stdout)
              if (stderr) outputParts.push(`[stderr]\n${stderr}`)
              output = outputParts.join("\n\n")

              // Extract exit code
              exitCode = toolOutput.exit_code ?? toolOutput.exitCode
            } else if (typeof toolOutput === "string") {
              output = toolOutput
            }
          }

          // Also check for TaskOutput tool calls that reference this task
          // TaskOutput is used to check on background tasks started earlier
          if (
            (part.type === "tool-TaskOutput" || part.type?.includes("TaskOutput")) &&
            taskIdFromOutput &&
            (part.input?.task_id === taskIdFromOutput || part.input?.taskId === taskIdFromOutput)
          ) {
            const taskOutputResult = part.output || part.result
            if (taskOutputResult && typeof taskOutputResult === "object") {
              const taskStdout = taskOutputResult.stdout || taskOutputResult.output || ""
              const taskStderr = taskOutputResult.stderr || ""
              const taskExitCode = taskOutputResult.exit_code ?? taskOutputResult.exitCode

              // TaskOutput results override the initial background task output
              if (taskStdout || taskStderr) {
                const outputParts: string[] = []
                if (taskStdout) outputParts.push(taskStdout)
                if (taskStderr) outputParts.push(`[stderr]\n${taskStderr}`)
                output = outputParts.join("\n\n")
              }

              if (taskExitCode !== undefined) {
                exitCode = taskExitCode
              }
            }
          }
        }
      }
    }

    return { output, exitCode }
  } catch (error) {
    console.error("[Tasks] Failed to extract task data from messages:", error)
    return {}
  }
}

/**
 * Enhanced task with derived status and command info
 */
interface EnhancedTask {
  id: string
  subChatId: string
  chatId: string
  toolCallId: string
  outputFile: string | null
  pid: number | null
  sdkTaskId?: string | null
  sdkStatus?: string | null
  status: TaskStatus
  exitCode?: number
  command?: string
  description?: string
  output?: string
}

export const tasksRouter = router({
  /**
   * List all background tasks for a sub-chat with derived status
   */
  listBySubChat: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const tasks = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.subChatId, input.subChatId))
        .all()

      // Derive status and output for each task
      const enhancedTasks: EnhancedTask[] = await Promise.all(
        tasks.map(async (task) => {
          const { status, exitCode: derivedExitCode } = await getDerivedStatus(task)
          const { output, exitCode: messageExitCode } = getTaskDataFromMessages(task)
          // Prefer exit code from messages if available
          const exitCode = messageExitCode ?? derivedExitCode
          return { ...task, status, exitCode, output }
        })
      )

      return enhancedTasks
    }),

  /**
   * List all background tasks for a chat (all sub-chats) with derived status
   */
  listByChat: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const tasks = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.chatId, input.chatId))
        .all()

      // Derive status and output for each task
      const enhancedTasks: EnhancedTask[] = await Promise.all(
        tasks.map(async (task) => {
          const { status, exitCode: derivedExitCode } = await getDerivedStatus(task)
          const { output, exitCode: messageExitCode } = getTaskDataFromMessages(task)
          // Prefer exit code from messages if available
          const exitCode = messageExitCode ?? derivedExitCode
          return { ...task, status, exitCode, output }
        })
      )

      return enhancedTasks
    }),

  /**
   * Get a specific task with its output and derived status
   */
  getWithOutput: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        tailLines: z.number().optional(), // LEGACY: Only get last N lines (backward compat)
        offset: z.number().min(0).optional(), // NEW: Start from line N (0-based)
        limit: z.number().min(1).max(5000).optional(), // NEW: Load N lines from offset
        includeMetadata: z.boolean().optional().default(true), // NEW: Include totalLines metadata
      })
    )
    .query(async ({ input }) => {
      const db = getDatabase()
      const task = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.id, input.taskId))
        .get()

      if (!task) return null

      // Get derived status and output from messages (command/description now in task record)
      const { status, exitCode: derivedExitCode } = await getDerivedStatus(task)
      const { output: messageOutput, exitCode: messageExitCode } = getTaskDataFromMessages(task)

      // Prefer exit code from messages if available
      const exitCode = messageExitCode ?? derivedExitCode

      // Get output - for running tasks, always read from output file for real-time updates
      // For completed tasks, prefer messages output (more reliable)
      let output = ""
      let outputMetadata: {
        totalLines: number
        startLine: number
        endLine: number
        hasMore: boolean
      } | undefined

      // Determine which mode to use for reading output
      const useTailLines = input.tailLines !== undefined
      const usePagination = input.offset !== undefined && input.limit !== undefined

      if (status === "running" && task.outputFile && existsSync(task.outputFile)) {
        // For running tasks, always read from output file for real-time updates
        try {
          if (useTailLines) {
            // Backward compatibility: use tailLines
            const result = await readFileLines(task.outputFile, {
              fromEnd: true,
              limit: input.tailLines,
            })
            output = result.lines.join("\n")
            if (input.includeMetadata) {
              outputMetadata = {
                totalLines: result.totalLines,
                startLine: result.startLine,
                endLine: result.endLine,
                hasMore: result.startLine > 0,
              }
            }
          } else if (usePagination) {
            // New pagination mode: use offset + limit
            const result = await readFileLines(task.outputFile, {
              offset: input.offset,
              limit: input.limit,
            })
            output = result.lines.join("\n")
            if (input.includeMetadata) {
              outputMetadata = {
                totalLines: result.totalLines,
                startLine: result.startLine,
                endLine: result.endLine,
                hasMore: result.startLine > 0,
              }
            }
          } else {
            // Default: return last 500 lines
            const result = await readFileLines(task.outputFile, {
              fromEnd: true,
              limit: 500,
            })
            output = result.lines.join("\n")
            if (input.includeMetadata) {
              outputMetadata = {
                totalLines: result.totalLines,
                startLine: result.startLine,
                endLine: result.endLine,
                hasMore: result.startLine > 0,
              }
            }
          }
        } catch {
          output = "(Output file not available)"
        }
      } else if (messageOutput) {
        // For completed tasks, prefer messages output
        if (useTailLines) {
          const result = await readFileLines(task.outputFile || "", {
            fromEnd: true,
            limit: input.tailLines,
          })
          output = result.lines.join("\n")
          if (input.includeMetadata) {
            outputMetadata = {
              totalLines: result.totalLines,
              startLine: result.startLine,
              endLine: result.endLine,
              hasMore: result.startLine > 0,
            }
          }
        } else if (usePagination && task.outputFile) {
          const result = await readFileLines(task.outputFile, {
            offset: input.offset,
            limit: input.limit,
          })
          output = result.lines.join("\n")
          if (input.includeMetadata) {
            outputMetadata = {
              totalLines: result.totalLines,
              startLine: result.startLine,
              endLine: result.endLine,
              hasMore: result.startLine > 0,
            }
          }
        } else {
          // Use message output as-is for completed tasks (already has all content)
          output = messageOutput
          const lines = output.split("\n")
          if (input.includeMetadata) {
            outputMetadata = {
              totalLines: lines.length,
              startLine: 0,
              endLine: lines.length - 1,
              hasMore: false,
            }
          }
        }
      } else if (task.outputFile && existsSync(task.outputFile)) {
        // Fallback to output file if no message output
        try {
          if (useTailLines) {
            const result = await readFileLines(task.outputFile, {
              fromEnd: true,
              limit: input.tailLines,
            })
            output = result.lines.join("\n")
            if (input.includeMetadata) {
              outputMetadata = {
                totalLines: result.totalLines,
                startLine: result.startLine,
                endLine: result.endLine,
                hasMore: result.startLine > 0,
              }
            }
          } else if (usePagination) {
            const result = await readFileLines(task.outputFile, {
              offset: input.offset,
              limit: input.limit,
            })
            output = result.lines.join("\n")
            if (input.includeMetadata) {
              outputMetadata = {
                totalLines: result.totalLines,
                startLine: result.startLine,
                endLine: result.endLine,
                hasMore: result.startLine > 0,
              }
            }
          } else {
            // Default: return last 500 lines
            const result = await readFileLines(task.outputFile, {
              fromEnd: true,
              limit: 500,
            })
            output = result.lines.join("\n")
            if (input.includeMetadata) {
              outputMetadata = {
                totalLines: result.totalLines,
                startLine: result.startLine,
                endLine: result.endLine,
                hasMore: result.startLine > 0,
              }
            }
          }
        } catch {
          output = "(Output file not available)"
        }
      }

      console.log(`[Tasks] getWithOutput result:`, {
        taskId: task.id,
        status,
        exitCode,
        outputFile: task.outputFile,
        sdkTaskId: (task as any).sdkTaskId,
        hasOutput: !!output,
        outputLength: output.length,
        outputMetadata,
      })

      return { ...task, status, exitCode, output, outputMetadata }
    }),

  /**
   * Get output file statistics
   */
  getOutputStats: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const task = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.id, input.taskId))
        .get()

      if (!task?.outputFile) return null

      try {
        const stats = await stat(task.outputFile)
        return {
          size: stats.size,
          lastModified: stats.mtime,
          exists: true,
        }
      } catch {
        return {
          size: 0,
          lastModified: null,
          exists: false,
        }
      }
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
        outputFile: z.string().optional(),
        pid: z.number().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const task = db.insert(backgroundTasks).values(input).returning().get()
      // Notify watcher to start/wake up for the new task
      taskWatcher.notifyNewTask()
      return task
    }),

  /**
   * Update task output file and/or PID
   */
  update: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        outputFile: z.string().optional(),
        pid: z.number().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const updates: { outputFile?: string; pid?: number } = {}
      if (input.outputFile !== undefined) updates.outputFile = input.outputFile
      if (input.pid !== undefined) updates.pid = input.pid

      return db
        .update(backgroundTasks)
        .set(updates)
        .where(eq(backgroundTasks.id, input.taskId))
        .returning()
        .get()
    }),

  /**
   * Force refresh status for all tasks in a chat using TaskOutput tool
   * This uses the background Claude session to actively poll task status
   */
  refreshStatuses: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const tasks = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.chatId, input.chatId))
        .all()

      const taskAny = tasks as any[]
      const runningTasks = taskAny.filter(t => t.sdkTaskId && (!t.sdkStatus || t.sdkStatus === "running"))

      console.log(`[Tasks] Manual refresh: checking ${runningTasks.length} running tasks`)

      // If we have running tasks and background session is ready, use TaskOutput
      if (runningTasks.length > 0 && isBackgroundSessionReady()) {
        // Check up to 3 tasks per refresh to avoid overwhelming the system
        const tasksToCheck = runningTasks.slice(0, 3)

        for (const task of tasksToCheck) {
          const shellId = task.sdkTaskId
          if (!shellId) continue

          try {
            // Use background session to invoke BashOutput tool and get raw result
            const bashOutput = await checkBackgroundTaskStatus(shellId)

            if (bashOutput) {
              const { output, status, exitCode } = bashOutput

              console.log(`[Tasks] BashOutput for ${task.id}: status=${status}, exitCode=${exitCode}, output=${output.slice(0, 100)}...`)

              // Update database if we got a final status
              if (status !== "running") {
                db.update(backgroundTasks)
                  .set({ sdkStatus: status } as any)
                  .where(eq(backgroundTasks.id, task.id))
                  .run()

                console.log(`[Tasks] Refresh detected ${task.id} as ${status}`)

                // Write output to file if we have an output file path
                if (task.outputFile && output) {
                  try {
                    await writeFile(task.outputFile, output, "utf-8")
                    console.log(`[Tasks] Wrote ${output.length} bytes to ${task.outputFile}`)
                  } catch (err) {
                    console.error(`[Tasks] Failed to write output file:`, err)
                  }
                }

                // Emit event for real-time UI updates
                taskEvents.emit("status-change", {
                  id: task.id,
                  chatId: task.chatId,
                  subChatId: task.subChatId,
                  status: status as any,
                  exitCode,
                  completedAt: new Date(),
                })
              }
            } else {
              console.log(`[Tasks] No BashOutput result for ${task.id}`)
            }
          } catch (err) {
            console.error(`[Tasks] Failed to refresh task ${task.id}:`, err)
          }
        }
      }

      // Return updated statuses for all tasks
      const results: Array<{ id: string; status: TaskStatus; exitCode?: number }> = []
      for (const task of tasks) {
        const { status, exitCode } = await getDerivedStatus(task)
        results.push({ id: task.id, status, exitCode })
      }

      return { tasks: results }
    }),

  /**
   * Kill a running task
   */
  killTask: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const task = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.id, input.taskId))
        .get()

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" })
      }

      if (!task.pid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Task has no PID" })
      }

      // Check if process is still running
      const isRunning = await isProcessRunning(task.pid)
      if (!isRunning) {
        return { success: true, killed: false, message: "Process already terminated" }
      }

      try {
        // Kill the process with SIGKILL
        await execAsync(`kill -9 ${task.pid}`)

        // Emit status change event
        taskEvents.emit("status-change", {
          id: task.id,
          chatId: task.chatId,
          subChatId: task.subChatId,
          status: "failed",
          exitCode: 137, // SIGKILL exit code
          completedAt: new Date(),
        })

        return { success: true, killed: true, message: "Process killed" }
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to kill process: ${err}`,
        })
      }
    }),

  /**
   * Clear all completed/failed tasks for a chat
   */
  clearCompleted: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const tasks = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.chatId, input.chatId))
        .all()

      let deleted = 0

      for (const task of tasks) {
        // Only delete if process is not running
        if (task.pid) {
          const isRunning = await isProcessRunning(task.pid)
          if (isRunning) continue
        }

        // Delete the task record
        db.delete(backgroundTasks).where(eq(backgroundTasks.id, task.id)).run()
        deleted++
      }

      return { deleted }
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

  /**
   * Subscribe to task status updates for a chat
   * Pushes real-time updates when task status changes
   */
  onTaskUpdate: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .subscription(({ input }) => {
      return observable<TaskStatusUpdate>((emit) => {
        const handler = (update: TaskStatusUpdate) => {
          // Only emit updates for the subscribed chat
          if (update.chatId === input.chatId) {
            emit.next(update)
          }
        }

        // Subscribe to task events
        taskEvents.on("status-change", handler)

        // Return cleanup function
        return () => {
          taskEvents.off("status-change", handler)
        }
      })
    }),

  /**
   * Get count of running tasks for a chat
   */
  getRunningCount: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const tasks = db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.chatId, input.chatId))
        .all()

      let running = 0
      for (const task of tasks) {
        const { status } = await getDerivedStatus(task)
        if (status === "running") running++
      }

      return { running, total: tasks.length }
    }),

  /**
   * Get task watcher status for debugging
   * Returns current state of the smart polling system
   */
  getWatcherStatus: publicProcedure.query(() => {
    return taskWatcher.getStatus()
  }),
})
