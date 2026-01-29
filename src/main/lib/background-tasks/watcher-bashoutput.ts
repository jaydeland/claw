import { eq } from "drizzle-orm"
import { getDatabase, backgroundTasks } from "../db"
import { taskEvents, type TaskStatusUpdate } from "./events"
import { queryBackgroundSession, isBackgroundSessionReady } from "../claude/background-session"

/**
 * Check interval in milliseconds (10 seconds)
 */
const CHECK_INTERVAL = 10000

/**
 * TaskWatcher monitors background task status using SDK's TaskOutput tool
 *
 * According to the Agent SDK docs, background tasks should be monitored using:
 * - TaskOutput tool (for tasks started by Claude Code CLI)
 * - BashOutput tool (for tasks started via Agent SDK directly)
 *
 * Since Claw uses Claude Code CLI which creates tasks with backgroundTaskId,
 * we use TaskOutput tool to check status.
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

    console.log("[TaskWatcher] Starting with TaskOutput polling...")
    this.isRunning = true

    // Wait for background session to be ready
    if (!isBackgroundSessionReady()) {
      console.log("[TaskWatcher] Waiting for background session to initialize...")
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // Initial check after a short delay
    setTimeout(() => this.checkAllTasks(), 5000)

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
   * Check all running tasks using TaskOutput tool via background session
   */
  private async checkAllTasks(): Promise<void> {
    if (!isBackgroundSessionReady()) {
      console.log("[TaskWatcher] Background session not ready, skipping check")
      return
    }

    const db = getDatabase()

    // Get all tasks that have sdkTaskId but no final status
    const tasks = db.select().from(backgroundTasks).all()
    const taskAny = tasks as any[]
    const runningTasks = taskAny.filter(
      (t) => t.sdkTaskId && (!t.sdkStatus || t.sdkStatus === "running")
    )

    if (runningTasks.length === 0) return

    console.log(`[TaskWatcher] Checking ${runningTasks.length} running tasks`)

    // Check each task (limit to 3 per interval to avoid overwhelming the session)
    const tasksToCheck = runningTasks.slice(0, 3)
    for (const task of tasksToCheck) {
      await this.checkTaskStatus(task)
    }
  }

  /**
   * Check a single task using TaskOutput tool through background session
   */
  private async checkTaskStatus(task: typeof backgroundTasks.$inferSelect): Promise<void> {
    const taskAny = task as any
    const shellId = taskAny.sdkTaskId

    if (!shellId) return

    try {
      // Use background session to invoke TaskOutput tool
      const prompt = `Check the status of background task ${shellId} using the TaskOutput tool. Return ONLY the tool output, no explanation.`

      const result = await queryBackgroundSession(prompt, { model: "haiku" })

      if (result.success) {
        // Parse the response to extract task information
        // The response might contain text like "The task completed with exit code 0"
        // or actual tool output data
        await this.parseTaskResponse(task, result.text)
      }
    } catch (err) {
      console.error(`[TaskWatcher] Failed to check task ${task.id}:`, err)
    }
  }

  /**
   * Parse the response from TaskOutput check
   */
  private async parseTaskResponse(
    task: typeof backgroundTasks.$inferSelect,
    responseText: string
  ): Promise<void> {
    // Try to extract status information from the response
    // Look for keywords indicating completion
    const lowerText = responseText.toLowerCase()

    let status: string | null = null
    let exitCode: number | undefined

    // Check for completion indicators
    if (lowerText.includes("completed") || lowerText.includes("finished") || lowerText.includes("done")) {
      // Try to extract exit code
      const exitMatch = responseText.match(/exit\s*code[:\s]+(\d+)/i)
      if (exitMatch) {
        exitCode = parseInt(exitMatch[1], 10)
        status = exitCode === 0 ? "completed" : "failed"
      } else {
        status = "completed" // Assume success if no exit code mentioned
        exitCode = 0
      }
    } else if (lowerText.includes("failed") || lowerText.includes("error")) {
      status = "failed"
      exitCode = 1
    } else if (lowerText.includes("running") || lowerText.includes("still executing")) {
      status = "running"
    }

    // If we determined a final status, update the database
    if (status && status !== "running") {
      const db = getDatabase()

      db.update(backgroundTasks)
        .set({ sdkStatus: status } as any)
        .where(eq(backgroundTasks.id, task.id))
        .run()

      const update: TaskStatusUpdate = {
        id: task.id,
        chatId: task.chatId,
        subChatId: task.subChatId,
        status: status as any,
        exitCode,
        completedAt: new Date(),
      }

      console.log(`[TaskWatcher] Task ${task.id} ${status} (exit code: ${exitCode})`)
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

    await this.checkTaskStatus(task)

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
