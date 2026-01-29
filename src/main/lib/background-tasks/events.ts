import { EventEmitter } from "events"

/**
 * Task status update event payload
 */
export interface TaskStatusUpdate {
  id: string
  chatId: string
  subChatId: string
  status: "running" | "completed" | "failed" | "stopped" | "unknown"
  exitCode?: number
  completedAt?: Date
}

/**
 * Typed event emitter for task status changes
 */
class TaskEventEmitter extends EventEmitter {
  emit(event: "status-change", update: TaskStatusUpdate): boolean
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  on(event: "status-change", listener: (update: TaskStatusUpdate) => void): this
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }

  off(event: "status-change", listener: (update: TaskStatusUpdate) => void): this
  off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener)
  }
}

/**
 * Singleton event emitter for task status changes
 * Used by TaskWatcher to emit updates and by tRPC subscriptions to receive them
 */
export const taskEvents = new TaskEventEmitter()
