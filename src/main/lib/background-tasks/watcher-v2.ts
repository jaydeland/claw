import { eq } from "drizzle-orm"
import { getDatabase, backgroundTasks } from "../db"
import { taskEvents, type TaskStatusUpdate } from "./events"
import { getClaudeEnvironment } from "../claude/env"

/**
 * Check interval in milliseconds (10 seconds)
 * Use BashOutput tool to properly check background task status
 */
const CHECK_INTERVAL = 10000

/**
 * TaskWatcher monitors background task status using the SDK's BashOutput tool
 *
 * This is the proper way to monitor background tasks according to the Agent SDK docs:
 * https://platform.claude.com/docs/en/agent-sdk/typescript#bash
 *
 * The BashOutput tool checks running background shells and returns:
 * - output: New output since last check
 * - status: 'running' | 'completed' | 'failed'
 * - exitCode: Present when status is 'completed' or 'failed'
 */
export class TaskWatcher {
  private watcherInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private claudeModule: any = null

  /**
   * Start the task watcher
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[TaskWatcher] Already running")
      return
    }

    console.log("[TaskWatcher] Starting with BashOutput polling...")
    this.isRunning = true

    // Dynamically import Claude SDK
    try {
      this.claudeModule = await import("@anthropic-ai/claude-code")
      console.log("[TaskWatcher] Claude SDK loaded successfully")
    } catch (err) {
      console.error("[TaskWatcher] Failed to load Claude SDK:", err)
      this.isRunning = false
      return
    }

    // Initial check immediately
    this.checkAllTasks()

    // Then poll every CHECK_INTERVAL
    this.watcherInterval = setInterval(() => {
      this.checkAllTasks()
    }, CHECK_INTERVAL)
  }

  /**
   * Stop the task watcher
   */
  stop(): void {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval)
      this.watcherInterval = null
    }
    this.isRunning = false
    console.log("[TaskWatcher] Stopped")
  }

  /**
   * Check all running tasks using BashOutput tool
   */
  private async checkAllTasks(): Promise<void> {
    if (!this.claudeModule) return

    const db = getDatabase()

    // Get all tasks that have sdkTaskId but no final status
    const tasks = db.select().from(backgroundTasks).all()
    const taskAny = tasks as any[]
    const runningTasks = taskAny.filter(
      (t) => t.sdkTaskId && !t.sdkStatus
    )

    if (runningTasks.length === 0) return

    console.log(`[TaskWatcher] Checking ${runningTasks.length} running tasks using BashOutput`)

    for (const task of runningTasks) {
      await this.checkTaskWithBashOutput(task)
    }
  }

  /**
   * Check a single task using the BashOutput tool through the SDK
   */
  private async checkTaskWithBashOutput(task: typeof backgroundTasks.$inferSelect): Promise<void> {
    const taskAny = task as any
    const shellId = taskAny.sdkTaskId

    if (!shellId || !this.claudeModule) return

    try {
      // Create a minimal SDK session to invoke BashOutput tool
      const env = await getClaudeEnvironment()

      // Create a query that just checks the task status
      const query = this.claudeModule.query({
        prompt: `Use the TaskOutput tool to check on background task ${shellId}. Return the status, output, and exit code.`,
        options: {
          mode: "agent",
          apiKey: env.ANTHROPIC_API_KEY || undefined,
          // Use minimal settings for quick polling
          model: "claude-sonnet-4-5-20250107",
        },
      })

      let taskOutput: any = null

      // Process the stream to find TaskOutput/BashOutput tool results
      for await (const chunk of query) {
        if (chunk.type === "message") {
          const content = chunk.message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_result" && (block.name === "TaskOutput" || block.name === "BashOutput")) {
                taskOutput = block.output
                break
              }
            }
          }
        }
      }

      if (taskOutput) {
        await this.processTaskOutput(task, taskOutput)
      }
    } catch (err) {
      console.error(`[TaskWatcher] Failed to check task ${task.id}:`, err)
    }
  }

  /**
   * Process the output from TaskOutput/BashOutput tool
   */
  private async processTaskOutput(
    task: typeof backgroundTasks.$inferSelect,
    output: any
  ): Promise<void> {
    const status = output.status // 'running' | 'completed' | 'failed'
    const exitCode = output.exitCode || output.exit_code
    const taskOutput = output.output || output.stdout || ""

    // Only update if task has completed
    if (status !== "running") {
      const db = getDatabase()

      db.update(backgroundTasks)
        .set({
          sdkStatus: status,
        } as any)
        .where(eq(backgroundTasks.id, task.id))
        .run()

      const update: TaskStatusUpdate = {
        id: task.id,
        chatId: task.chatId,
        subChatId: task.subChatId,
        status,
        exitCode,
        completedAt: new Date(),
      }

      console.log(
        `[TaskWatcher] Task ${task.id} ${status} (exit code: ${exitCode})`
      )
      taskEvents.emit("status-change", update)
    } else {
      console.log(`[TaskWatcher] Task ${task.id} still running`)
    }
  }

  /**
   * Force refresh a specific task
   */
  async refreshTask(taskId: string): Promise<TaskStatusUpdate | null> {
    const db = getDatabase()
    const task = db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId))
      .get()

    if (!task) return null

    await this.checkTaskWithBashOutput(task)

    // Return current status
    const taskAny = task as any
    const status = taskAny.sdkStatus || "running"

    return {
      id: task.id,
      chatId: task.chatId,
      subChatId: task.subChatId,
      status,
      completedAt: status !== "running" ? new Date() : undefined,
    }
  }
}

/**
 * Singleton instance of TaskWatcher
 */
export const taskWatcher = new TaskWatcher()
