/**
 * Queue types for WhatsApp message processing
 */

export interface WhatsAppQueueItem {
  id: string
  clawId: string
  clawName: string
  externalId: string      // WhatsApp JID (group or user)
  sender: string
  messageText: string
  timestamp: Date
  status: "pending" | "processing" | "completed" | "failed"
  sessionId: string
  executionId?: string
  exitCode?: number
  logs?: string
  errorMessage?: string
}

export interface QueueStatus {
  pending: number
  processing: number
  completed: number
  failed: number
  total: number
}

export interface QueueConfig {
  mode: "immediate" | "queued" | "paused"
  maxConcurrent: number
  rateLimitPerMinute: number
  autoRetry: boolean
  maxRetries: number
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  mode: "queued",
  maxConcurrent: 1,
  rateLimitPerMinute: 10,
  autoRetry: true,
  maxRetries: 2,
}
