import { Notification, BrowserWindow } from "electron"
import type { TaskStatusUpdate } from "./events"

/**
 * Send a desktop notification when a background task completes
 */
export function notifyTaskCompleted(
  update: TaskStatusUpdate,
  getWindow: () => BrowserWindow | null
): void {
  // Only notify for completed or failed tasks
  if (update.status !== "completed" && update.status !== "failed") {
    return
  }

  const title = update.status === "completed" ? "Task Completed" : "Task Failed"
  const body =
    update.status === "completed"
      ? `Background task finished successfully${update.exitCode !== undefined ? ` (exit code: ${update.exitCode})` : ""}`
      : `Background task failed${update.exitCode !== undefined ? ` with exit code ${update.exitCode}` : ""}`

  try {
    const notification = new Notification({
      title,
      body,
      silent: false,
    })

    // Click handler - focus the app window
    notification.on("click", () => {
      const win = getWindow()
      if (win) {
        if (win.isMinimized()) {
          win.restore()
        }
        win.focus()
      }
    })

    notification.show()
  } catch (err) {
    console.error("[Notifications] Failed to show notification:", err)
  }
}

/**
 * Check if notifications are supported and enabled
 */
export function areNotificationsSupported(): boolean {
  return Notification.isSupported()
}
