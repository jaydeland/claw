/**
 * Background Tasks Module
 *
 * Provides automated monitoring, notifications, and resource management
 * for background tasks started by the Claude SDK.
 */

export { taskEvents, type TaskStatusUpdate } from "./events"
export { taskWatcher, TaskWatcher } from "./watcher"
export {
  cleanupOldOutputFiles,
  cleanupSessionDirectories,
  startCleanupScheduler,
  stopCleanupScheduler,
  runCleanupNow,
  getSessionCleanupPreview,
  type CleanupConfig,
  type SessionCleanupConfig,
} from "./cleanup"
export { notifyTaskCompleted, areNotificationsSupported } from "./notifications"
