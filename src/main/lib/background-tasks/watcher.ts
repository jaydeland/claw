import { readFile } from "fs/promises"
import { existsSync } from "fs"
import { eq } from "drizzle-orm"
import { getDatabase, backgroundTasks } from "../db"
import { taskEvents, type TaskStatusUpdate } from "./events"

/**
 * Exponential backoff intervals in milliseconds
 * Starts fast (5s) and slows down to conserve resources
 */
const BACKOFF_INTERVALS = [
  5000,   // 5 seconds - initial fast check
  15000,  // 15 seconds
  30000,  // 30 seconds
  60000,  // 60 seconds - max interval
]

/**
 * TaskWatcher provides lightweight fallback monitoring with smart polling
 *
 * HYBRID APPROACH:
 * - Primary: Task data derived from messages when Claude uses BashOutput (FREE, FAST)
 * - Manual: User clicks refresh -> invokes BashOutput via background session (ACCURATE, ON-DEMAND)
 * - Fallback: This watcher checks output files for exit codes (SIMPLE, LIGHTWEIGHT)
 *
 * OPTIMIZATION:
 * - Only polls when pending tasks exist in the database
 * - Uses exponential backoff when no tasks complete (5s -> 15s -> 30s -> 60s)
 * - Immediately checks when new tasks are added via notifyNewTask()
 * - Zero CPU usage when no background tasks are running
 *
 * Note: Claw uses Bash tool with run_in_background, so we use BashOutput (not TaskOutput)
 * to check background shell status.
 *
 * This watcher only:
 * 1. Checks output files for exit codes (no API calls)
 * 2. Emits status change events for UI updates
 *
 * No automatic BashOutput polling to avoid API costs.
 */
export class TaskWatcher {
  private watcherTimeout: NodeJS.Timeout | null = null
  private isRunning = false
  private backoffIndex = 0
  private consecutiveEmptyChecks = 0

  /**
   * Start the task watcher
   * Will only actively poll if there are pending tasks
   */
  start(): void {
    if (this.isRunning) {
      console.log("[TaskWatcher] Already running")
      return
    }

    console.log("[TaskWatcher] Starting (smart polling mode)...")
    this.isRunning = true
    this.backoffIndex = 0
    this.consecutiveEmptyChecks = 0

    // Check if there are pending tasks before starting the poll loop
    this.scheduleNextCheck()
  }

  /**
   * Stop the task watcher
   */
  stop(): void {
    this.clearScheduledCheck()
    this.isRunning = false
    this.backoffIndex = 0
    this.consecutiveEmptyChecks = 0
    console.log("[TaskWatcher] Stopped")
  }

  /**
   * Clear any scheduled check timeout
   */
  private clearScheduledCheck(): void {
    if (this.watcherTimeout) {
      clearTimeout(this.watcherTimeout)
      this.watcherTimeout = null
    }
  }

  /**
   * Notify the watcher that a new task has been created
   * This resets backoff and immediately schedules a check
   */
  notifyNewTask(): void {
    if (!this.isRunning) {
      console.log("[TaskWatcher] Not running, starting for new task...")
      this.start()
      return
    }

    console.log("[TaskWatcher] New task notification - resetting backoff and scheduling immediate check")

    // Reset backoff since we have new work
    this.backoffIndex = 0
    this.consecutiveEmptyChecks = 0

    // Clear existing scheduled check and schedule an immediate one
    this.clearScheduledCheck()
    this.scheduleNextCheck(100) // Small delay to allow DB transaction to complete
  }

  /**
   * Schedule the next check with exponential backoff
   * @param overrideDelay Optional delay override in ms
   */
  private scheduleNextCheck(overrideDelay?: number): void {
    if (!this.isRunning) return

    const delay = overrideDelay ?? BACKOFF_INTERVALS[this.backoffIndex]

    console.log(`[TaskWatcher] Scheduling next check in ${delay}ms (backoff level: ${this.backoffIndex})`)

    this.watcherTimeout = setTimeout(async () => {
      await this.checkAllTasks()
    }, delay)
  }

  /**
   * Get the count of pending tasks (have sdkTaskId but no sdkStatus)
   */
  private getPendingTaskCount(): number {
    const db = getDatabase()
    const tasks = db.select().from(backgroundTasks).all()
    const taskAny = tasks as any[]
    return taskAny.filter(t => t.sdkTaskId && !t.sdkStatus).length
  }

  /**
   * Check all tasks that don't have a final status yet
   */
  private async checkAllTasks(): Promise<void> {
    if (!this.isRunning) return

    const db = getDatabase()

    // Get all tasks that have sdkTaskId but no sdkStatus (still running or missed notification)
    const tasks = db.select().from(backgroundTasks).all()
    const taskAny = tasks as any[]
    const pendingTasks = taskAny.filter(t =>
      t.sdkTaskId && !t.sdkStatus
    )

    if (pendingTasks.length === 0) {
      this.consecutiveEmptyChecks++

      // If no pending tasks for multiple consecutive checks, go idle
      if (this.consecutiveEmptyChecks >= 3) {
        console.log("[TaskWatcher] No pending tasks for 3 consecutive checks - going idle (zero CPU)")
        // Don't schedule another check - we'll wake up when notifyNewTask() is called
        return
      }

      // Increase backoff when no pending tasks
      this.backoffIndex = Math.min(this.backoffIndex + 1, BACKOFF_INTERVALS.length - 1)
      console.log(`[TaskWatcher] No pending tasks, increasing backoff to level ${this.backoffIndex}`)
      this.scheduleNextCheck()
      return
    }

    // Reset consecutive empty checks since we found tasks
    this.consecutiveEmptyChecks = 0

    console.log(`[TaskWatcher] Checking ${pendingTasks.length} pending tasks`)

    let tasksCompleted = 0
    for (const task of pendingTasks) {
      const completed = await this.checkTaskStatus(task)
      if (completed) tasksCompleted++
    }

    // Adjust backoff based on whether tasks completed
    if (tasksCompleted > 0) {
      // Tasks completed - reset to fast polling to catch more
      this.backoffIndex = 0
      console.log(`[TaskWatcher] ${tasksCompleted} task(s) completed - resetting to fast polling`)
    } else {
      // No tasks completed - increase backoff
      this.backoffIndex = Math.min(this.backoffIndex + 1, BACKOFF_INTERVALS.length - 1)
      console.log(`[TaskWatcher] No tasks completed this cycle, backoff level: ${this.backoffIndex}`)
    }

    // Schedule next check
    this.scheduleNextCheck()
  }

  /**
   * Check the status of a single task by examining its output file
   * @returns true if task status was determined (completed/failed)
   */
  private async checkTaskStatus(task: typeof backgroundTasks.$inferSelect): Promise<boolean> {
    const taskAny = task as any
    if (!taskAny.sdkTaskId) return false

    // If task already has sdkStatus from notification, skip
    if (taskAny.sdkStatus) return false

    // Try to determine status from output file
    if (task.outputFile && existsSync(task.outputFile)) {
      const exitCode = await this.parseExitCode(task.outputFile)
      if (exitCode !== undefined) {
        // Task has completed - update database and emit event
        const status = exitCode === 0 ? "completed" : "failed"
        const db = getDatabase()

        db.update(backgroundTasks)
          .set({ sdkStatus: status } as any)
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

        console.log(`[TaskWatcher] Task ${task.id} detected as ${status} from output file (exit code: ${exitCode})`)
        taskEvents.emit("status-change", update)
        return true
      }
    }
    return false
  }

  /**
   * Parse exit code from output file
   * SDK typically writes "exit code: N" at the end of output files
   */
  private async parseExitCode(outputFile: string): Promise<number | undefined> {
    try {
      const content = await readFile(outputFile, "utf-8")

      // Look for exit code pattern at end of file
      // Pattern: "exit code: N" or "Exit code: N"
      const match = content.match(/exit\s+code:\s*(\d+)/i)
      if (match) {
        return parseInt(match[1], 10)
      }

      // Also check for shell exit status pattern
      const exitMatch = content.match(/\[Process exited with code (\d+)\]/)
      if (exitMatch) {
        return parseInt(exitMatch[1], 10)
      }

      return undefined
    } catch {
      return undefined
    }
  }

  /**
   * Force refresh a specific task
   */
  async refreshTask(taskId: string): Promise<TaskStatusUpdate | null> {
    const db = getDatabase()
    const task = db.select().from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId))
      .get()

    if (!task) return null

    const taskAny = task as any

    // If we have SDK status, use it
    if (taskAny.sdkStatus) {
      const status = taskAny.sdkStatus === "completed" ? "completed"
        : taskAny.sdkStatus === "failed" ? "failed"
        : taskAny.sdkStatus === "stopped" ? "stopped"
        : "unknown"

      let exitCode: number | undefined
      if (task.outputFile && existsSync(task.outputFile)) {
        exitCode = await this.parseExitCode(task.outputFile)
      }

      return {
        id: task.id,
        chatId: task.chatId,
        subChatId: task.subChatId,
        status: status as any,
        exitCode,
        completedAt: new Date(),
      }
    }

    // If we have sdkTaskId but no status, check output file
    if (taskAny.sdkTaskId) {
      if (task.outputFile && existsSync(task.outputFile)) {
        const exitCode = await this.parseExitCode(task.outputFile)
        if (exitCode !== undefined) {
          return {
            id: task.id,
            chatId: task.chatId,
            subChatId: task.subChatId,
            status: exitCode === 0 ? "completed" : "failed",
            exitCode,
            completedAt: new Date(),
          }
        }
      }

      // Task is still running
      return {
        id: task.id,
        chatId: task.chatId,
        subChatId: task.subChatId,
        status: "running",
      }
    }

    // No SDK task info - consider it running (newly created)
    return {
      id: task.id,
      chatId: task.chatId,
      subChatId: task.subChatId,
      status: "running",
    }
  }

  /**
   * Get current watcher status for debugging
   */
  getStatus(): {
    isRunning: boolean
    backoffLevel: number
    currentInterval: number
    consecutiveEmptyChecks: number
    pendingTaskCount: number
  } {
    return {
      isRunning: this.isRunning,
      backoffLevel: this.backoffIndex,
      currentInterval: BACKOFF_INTERVALS[this.backoffIndex],
      consecutiveEmptyChecks: this.consecutiveEmptyChecks,
      pendingTaskCount: this.isRunning ? this.getPendingTaskCount() : 0,
    }
  }
}

/**
 * Singleton instance of TaskWatcher
 */
export const taskWatcher = new TaskWatcher()
