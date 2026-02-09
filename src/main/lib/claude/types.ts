// AI SDK UIMessageChunk format
export type UIMessageChunk =
  // Message lifecycle
  | { type: "start"; messageId?: string }
  | { type: "finish"; messageMetadata?: MessageMetadata }
  | { type: "start-step" }
  | { type: "finish-step" }
  // Text streaming
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  // Reasoning (Extended Thinking)
  | { type: "reasoning"; id: string; text: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  // Tool calls
  | { type: "tool-input-start"; toolCallId: string; toolName: string }
  | { type: "tool-input-delta"; toolCallId: string; inputTextDelta: string }
  | {
      type: "tool-input-available"
      toolCallId: string
      toolName: string
      input: unknown
    }
  | { type: "tool-output-available"; toolCallId: string; output: unknown }
  | { type: "tool-output-error"; toolCallId: string; errorText: string }
  // Background task tracking
  | {
      type: "background-task-started"
      toolCallId: string
      command: string
      description?: string
      outputFile?: string
    }
  | {
      type: "background-task-notification"
      taskId: string // The task_id from the SDK (NOT a PID - it's a string identifier)
      status: "completed" | "failed" | "stopped"
      outputFile: string
      summary: string
    }
  // Error & metadata
  | { type: "error"; errorText: string }
  | { type: "auth-error"; errorText: string }
  | {
      type: "ask-user-question"
      toolUseId: string
      questions: Array<{
        question: string
        header: string
        options: Array<{ label: string; description: string }>
        multiSelect: boolean
      }>
    }
  | { type: "message-metadata"; messageMetadata: MessageMetadata }
  // Agent team events (experimental)
  | { type: "teammate-idle"; teammateName: string }
  | { type: "task-completed"; taskId: string; taskSubject: string }
  // System tools (rendered like regular tools)
  | {
      type: "system-Compact"
      toolCallId: string
      state: "input-streaming" | "output-available"
    }
  // Session initialization (MCP servers, plugins, tools)
  | {
      type: "session-init"
      tools: string[]
      mcpServers: MCPServer[]
      plugins: { name: string; path: string }[]
      skills: string[]
      slashCommands: SDKSlashCommand[]
    }

export type SDKSlashCommand = {
  name: string
  description: string
  source: "builtin" | "custom" | "skill" | "plugin"
  argumentHint?: string
}

export type MCPServerStatus = "connected" | "failed" | "pending" | "needs-auth"

export type MCPServer = {
  name: string
  status: MCPServerStatus
  serverInfo?: {
    name: string
    version: string
  }
  error?: string
  tools?: string[] // List of tool names provided by this server (SDK 0.2.21+)
  scope?: string // Server scope/permissions (SDK 0.2.21+)
  config?: Record<string, any> // Server configuration (SDK 0.2.21+)
}

export type MessageMetadata = {
  sessionId?: string
  sdkMessageUuid?: string // SDK's message UUID for resumeSessionAt (rollback support)
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  totalCostUsd?: number
  durationMs?: number
  resultSubtype?: string
  finalTextId?: string
  stopReason?: string | null // Why the model stopped (end_turn, max_tokens, tool_use, etc.)
  contextWindow?: number // Context window size from model (e.g., 200000 for kimi-k2.5)
}
