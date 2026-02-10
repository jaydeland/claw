/**
 * Background Claude Session for Utility Tasks
 *
 * A persistent background Claude session that runs when the app starts for utility tasks:
 * - Querying MCP servers for their available tools
 * - Generating chat titles from first messages
 * - Other utility AI tasks without user-visible session
 *
 * The session is initialized on app startup, kept alive in the background,
 * reused for multiple requests, and cleaned up on app shutdown.
 */

import { app } from "electron"
import * as path from "path"
import * as fs from "fs/promises"
import { existsSync } from "fs"
import { buildClaudeEnv, getBundledClaudeBinaryPath } from "./env"
import { getDatabase, claudeCodeCredentials } from "../db"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"

// Types for session state tracking
export interface BackgroundSessionState {
  status: "idle" | "initializing" | "ready" | "error" | "closed"
  sessionId: string | null
  model: string
  requestCount: number
  lastUsedTime: Date | null
  errorMessage: string | null
  initTime: Date | null
}

// Session configuration
interface BackgroundSessionConfig {
  apiKey?: string
  model?: string
  cwd?: string
}

// Cached SDK query function
let cachedClaudeQuery: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null

// Background session state
let sessionState: BackgroundSessionState = {
  status: "idle",
  sessionId: null,
  model: "haiku", // Fast, cheap for utility tasks
  requestCount: 0,
  lastUsedTime: null,
  errorMessage: null,
  initTime: null,
}

// Active abort controller for the background session
let backgroundAbortController: AbortController | null = null

// Config directory for background session
let backgroundConfigDir: string | null = null

/**
 * Get the cached Claude SDK query function
 */
async function getClaudeQuery() {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery
  }
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeQuery = sdk.query
  return cachedClaudeQuery
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Get Claude Code OAuth token from local SQLite
 * Returns null if not connected
 */
function getClaudeCodeToken(): string | null {
  try {
    const db = getDatabase()
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!cred?.oauthToken) {
      return null
    }

    return decryptToken(cred.oauthToken)
  } catch (error) {
    console.error("[background-session] Error getting Claude Code token:", error)
    return null
  }
}

/**
 * Initialize the background Claude session
 *
 * Creates a new background session that can be used for utility tasks.
 * The session uses a fast, cheap model (haiku) by default.
 *
 * @param config - Optional configuration overrides
 * @returns The background session state
 */
export async function initBackgroundSession(
  config?: BackgroundSessionConfig
): Promise<BackgroundSessionState> {
  // Don't reinitialize if already ready
  if (sessionState.status === "ready" || sessionState.status === "initializing") {
    console.log("[background-session] Already initialized or initializing")
    return sessionState
  }

  sessionState.status = "initializing"
  sessionState.initTime = new Date()
  sessionState.errorMessage = null

  console.log("[background-session] Initializing...")

  try {
    // Create isolated config directory for background session
    backgroundConfigDir = path.join(
      app.getPath("userData"),
      "claude-sessions",
      "background-utility"
    )

    // Get Claude SDK
    const claudeQuery = await getClaudeQuery()

    // Build environment
    const claudeCodeToken = getClaudeCodeToken()
    const claudeEnv = buildClaudeEnv()

    const finalEnv: Record<string, string> = {
      ...claudeEnv,
      ...(claudeCodeToken && {
        CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
      }),
      ...(backgroundConfigDir && {
        CLAUDE_CONFIG_DIR: backgroundConfigDir,
      }),
    }

    // Get bundled Claude binary path
    const claudeBinaryPath = getBundledClaudeBinaryPath()

    // Create abort controller for this session
    backgroundAbortController = new AbortController()

    // Resolve model and working directory
    const model = config?.model || "haiku"
    const cwd = config?.cwd || app.getPath("userData")

    sessionState.model = model

    // Clean up any stale session files before initializing
    const backgroundProjectsDir = path.join(backgroundConfigDir, "projects")
    if (existsSync(backgroundProjectsDir)) {
      await fs.rm(backgroundProjectsDir, { recursive: true, force: true })
      console.log("[background-session] Cleaned up stale session files")
    }

    // Initialize with a simple ping to verify the session works
    const queryOptions = {
      prompt: "ping",
      options: {
        abortController: backgroundAbortController,
        cwd,
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
        },
        env: finalEnv,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: claudeBinaryPath,
        // Omit continue for fresh initialization - let SDK create new session
        model,
        persistSession: false, // Don't save ephemeral utility sessions
      },
    }

    // Run a quick query to initialize the session
    const stream = claudeQuery(queryOptions)
    let gotInit = false

    for await (const msg of stream) {
      const msgAny = msg as any

      // Track sessionId from any message
      if (msgAny.session_id && !sessionState.sessionId) {
        sessionState.sessionId = msgAny.session_id
      }

      // Check for init message
      if (msgAny.type === "system" && msgAny.subtype === "init") {
        gotInit = true
        console.log("[background-session] Received init message")
        break
      }

      // Also check for result message (means session is working)
      if (msgAny.type === "result") {
        gotInit = true
        break
      }
    }

    if (gotInit) {
      sessionState.status = "ready"
      sessionState.requestCount = 1
      sessionState.lastUsedTime = new Date()
      console.log(
        `[background-session] Initialized successfully (session: ${sessionState.sessionId?.slice(0, 8)}...)`
      )
    } else {
      sessionState.status = "error"
      sessionState.errorMessage = "Did not receive init message"
      console.error("[background-session] Did not receive init message")
    }

    return sessionState
  } catch (error) {
    sessionState.status = "error"
    sessionState.errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[background-session] Initialization failed:", error)
    return sessionState
  }
}

/**
 * Get the current background session state
 *
 * @returns The current session state or null if not initialized
 */
export function getBackgroundSessionState(): BackgroundSessionState {
  return { ...sessionState }
}

/**
 * Check if the background session is ready for use
 */
export function isBackgroundSessionReady(): boolean {
  return sessionState.status === "ready"
}

/**
 * Execute a query using the background session
 *
 * @param prompt - The prompt to send
 * @param options - Optional overrides
 * @returns The response text
 */
export async function queryBackgroundSession(
  prompt: string,
  options?: {
    model?: string
    maxTokens?: number
  }
): Promise<{ text: string; success: boolean; error?: string }> {
  if (sessionState.status !== "ready") {
    return {
      text: "",
      success: false,
      error: `Background session not ready (status: ${sessionState.status})`,
    }
  }

  try {
    const claudeQuery = await getClaudeQuery()
    const claudeCodeToken = getClaudeCodeToken()
    const claudeEnv = buildClaudeEnv()

    const finalEnv: Record<string, string> = {
      ...claudeEnv,
      ...(claudeCodeToken && {
        CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
      }),
      ...(backgroundConfigDir && {
        CLAUDE_CONFIG_DIR: backgroundConfigDir,
      }),
    }

    const claudeBinaryPath = getBundledClaudeBinaryPath()
    const model = options?.model || sessionState.model

    // Create new abort controller for this query
    const queryAbortController = new AbortController()

    const queryOptions = {
      prompt,
      options: {
        abortController: queryAbortController,
        cwd: app.getPath("userData"),
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
        },
        env: finalEnv,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: claudeBinaryPath,
        // Only use continue when we have a valid sessionId to resume
        ...(sessionState.sessionId && {
          resume: sessionState.sessionId,
          continue: true,
        }),
        model,
        persistSession: false, // Don't save ephemeral utility sessions
      },
    }

    const stream = claudeQuery(queryOptions)
    let responseText = ""

    for await (const msg of stream) {
      const msgAny = msg as any

      // Update sessionId if we get a new one
      if (msgAny.session_id) {
        sessionState.sessionId = msgAny.session_id
      }

      // Collect text content
      if (msgAny.type === "assistant" && msgAny.message?.content) {
        if (!Array.isArray(msgAny.message.content)) {
          console.warn("[BackgroundSession] Expected content to be array, got:", typeof msgAny.message.content)
          continue
        }
        for (const block of msgAny.message.content) {
          if (block.type === "text") {
            responseText += block.text
          }
        }
      }

      // Check for result message
      if (msgAny.type === "result") {
        if (msgAny.result) {
          responseText = msgAny.result
        }
        break
      }
    }

    sessionState.requestCount++
    sessionState.lastUsedTime = new Date()

    return { text: responseText, success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[background-session] Query failed:", errorMessage)
    return { text: "", success: false, error: errorMessage }
  }
}

/**
 * Check background task status using BashOutput tool
 * Returns the raw tool output, not Claude's interpretation
 *
 * @param shellId - The background task ID
 * @returns The BashOutput tool result
 */
export async function checkBackgroundTaskStatus(
  shellId: string
): Promise<{ output: string; status: string; exitCode?: number } | null> {
  if (!isBackgroundSessionReady()) {
    console.log("[background-session] Not ready for task check")
    return null
  }

  try {
    const claudeQuery = await getClaudeQuery()
    const claudeCodeToken = getClaudeCodeToken()
    const claudeEnv = buildClaudeEnv()

    const finalEnv: Record<string, string> = {
      ...claudeEnv,
      ...(claudeCodeToken && {
        CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
      }),
      ...(backgroundConfigDir && {
        CLAUDE_CONFIG_DIR: backgroundConfigDir,
      }),
    }

    const claudeBinaryPath = getBundledClaudeBinaryPath()
    const queryAbortController = new AbortController()

    const prompt = `Use the BashOutput tool to check the status of background shell ${shellId}. Return the exact fields from the tool result.`

    // Define schema for structured output matching BashOutputToolOutput
    const schema = {
      type: 'object' as const,
      properties: {
        output: { type: 'string', description: 'Command output from the background shell' },
        status: { type: 'string', enum: ['running', 'completed', 'failed', 'not found'], description: 'Shell status' },
        exitCode: { type: 'number', description: 'Exit code if completed' }
      },
      required: ['status']
    }

    const queryOptions = {
      prompt,
      options: {
        abortController: queryAbortController,
        cwd: app.getPath("userData"),
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
        },
        env: finalEnv,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: claudeBinaryPath,
        // Only use continue when we have a valid sessionId to resume
        ...(sessionState.sessionId && {
          resume: sessionState.sessionId,
          continue: true,
        }),
        model: "haiku",
        persistSession: false, // Don't save ephemeral utility sessions
        outputFormat: {
          type: 'json_schema' as const,
          schema: schema
        }
      },
    }

    const stream = claudeQuery(queryOptions)
    let structuredOutput: any = null

    for await (const msg of stream) {
      const msgAny = msg as any

      // Update sessionId
      if (msgAny.session_id) {
        sessionState.sessionId = msgAny.session_id
      }

      // Check for structured_output in result message
      if (msgAny.type === "result" && msgAny.structured_output) {
        structuredOutput = msgAny.structured_output
        console.log(`[background-session] Got structured output for ${shellId}:`, JSON.stringify(structuredOutput))
        break
      }
    }

    sessionState.requestCount++
    sessionState.lastUsedTime = new Date()

    // Use the structured output directly
    if (structuredOutput) {
      let status = structuredOutput.status || "unknown"
      const exitCode = structuredOutput.exitCode
      const output = structuredOutput.output || ""

      // Handle "not found" - shell was already cleaned up after completion
      if (status.toLowerCase().includes("not found") || status === "not found") {
        status = "completed"
        console.log(`[background-session] Shell ${shellId} not found but completed (was cleaned up)`)
      }

      return {
        output,
        status,
        exitCode: exitCode ?? (status === "completed" ? 0 : undefined),
      }
    }

    console.log(`[background-session] No structured output for ${shellId}`)
    return null
  } catch (error) {
    console.error("[background-session] Task check failed:", error)
    return null
  }
}

/**
 * Generate a chat title from the first message
 *
 * @param firstMessage - The first message in the conversation
 * @returns The generated title or null if generation fails
 */
export async function generateChatTitle(firstMessage: string): Promise<string | null> {
  if (!isBackgroundSessionReady()) {
    console.log("[background-session] Not ready for title generation, using fallback")
    return fallbackTitleGeneration(firstMessage)
  }

  try {
    const prompt = `Generate a short title (5-8 words max) for a conversation that starts with this message. Return ONLY the title, no quotes, no explanation:

${firstMessage.slice(0, 500)}`

    const result = await queryBackgroundSession(prompt, { model: "haiku" })

    if (result.success && result.text) {
      // Clean up the title (remove quotes, trim)
      const title = result.text
        .replace(/^["']|["']$/g, "")
        .trim()
        .slice(0, 100)
      return title
    }

    return fallbackTitleGeneration(firstMessage)
  } catch (error) {
    console.error("[background-session] Title generation failed:", error)
    return fallbackTitleGeneration(firstMessage)
  }
}

/**
 * Fallback title generation (no AI)
 * Used when background session is not available
 */
function fallbackTitleGeneration(message: string): string {
  // Take first 50 chars, remove newlines, trim
  const cleaned = message.replace(/\n/g, " ").trim()
  if (cleaned.length <= 50) {
    return cleaned
  }
  // Find last space before 50 chars to avoid cutting words
  const lastSpace = cleaned.lastIndexOf(" ", 50)
  if (lastSpace > 20) {
    return cleaned.slice(0, lastSpace) + "..."
  }
  return cleaned.slice(0, 50) + "..."
}

/**
 * Close the background session
 *
 * Should be called when the app is shutting down.
 */
export async function closeBackgroundSession(): Promise<void> {
  if (sessionState.status === "closed") {
    return
  }

  console.log("[background-session] Closing...")

  // Abort any active queries
  if (backgroundAbortController) {
    backgroundAbortController.abort()
    backgroundAbortController = null
  }

  sessionState.status = "closed"
  sessionState.sessionId = null

  console.log("[background-session] Closed")
}

/**
 * Active Task tracking for background operations
 */
const activeTasks = new Map<string, {
  abortController: AbortController
  startTime: Date
  prompt: string
  type: string
}>()

/**
 * Execute a Task tool via the background session to spawn a subagent
 *
 * This allows spawning parallel subagents for complex operations like codebase analysis.
 * Each task runs independently and can be monitored via its taskCallId.
 *
 * @param prompt - The prompt/instructions for the subagent
 * @param options - Task configuration options
 * @returns Task info with callId for tracking
 */
export async function executeBackgroundTask(
  prompt: string,
  options?: {
    model?: "sonnet" | "haiku"
    subagentType?: string
    timeout?: number
    signal?: AbortSignal
  }
): Promise<{ success: boolean; callId?: string; error?: string }> {
  if (sessionState.status !== "ready") {
    return {
      success: false,
      error: `Background session not ready (status: ${sessionState.status})`,
    }
  }

  try {
    const claudeQuery = await getClaudeQuery()
    const claudeCodeToken = getClaudeCodeToken()
    const claudeEnv = buildClaudeEnv()

    const finalEnv: Record<string, string> = {
      ...claudeEnv,
      ...(claudeCodeToken && {
        CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
      }),
      ...(backgroundConfigDir && {
        CLAUDE_CONFIG_DIR: backgroundConfigDir,
      }),
    }

    const claudeBinaryPath = getBundledClaudeBinaryPath()
    const model = options?.model || "sonnet"

    // Create abort controller for this task
    const taskAbortController = new AbortController()
    const callId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    // Track the task
    activeTasks.set(callId, {
      abortController: taskAbortController,
      startTime: new Date(),
      prompt,
      type: options?.subagentType || "general",
    })

    // Link external abort signal if provided
    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        taskAbortController.abort()
        activeTasks.delete(callId)
      })
    }

    // Build the Task tool invocation
    const taskPrompt = `Use the Task tool to spawn a subagent for this work:

${prompt}

Use subagent type: ${options?.subagentType || "general"}

After the task completes, return ONLY a JSON object with:
{
  "success": true|false,
  "result": <the subagent's output>,
  "error": <error message if any>
}`

    const queryOptions = {
      prompt: taskPrompt,
      options: {
        abortController: taskAbortController,
        cwd: app.getPath("userData"),
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
        },
        env: finalEnv,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: claudeBinaryPath,
        ...(sessionState.sessionId && {
          resume: sessionState.sessionId,
          continue: true,
        }),
        model,
        persistSession: false,
      },
    }

    // Execute the task (non-blocking, we track via the callId)
    // The task runs in the background and we poll for results
    const stream = claudeQuery(queryOptions)

    // Start processing the stream in the background
    processTaskStream(callId, stream)

    sessionState.requestCount++
    sessionState.lastUsedTime = new Date()

    return { success: true, callId }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[background-session] Task execution failed:", errorMessage)
    return { success: false, error: errorMessage }
  }
}

/**
 * Process a task stream in the background
 * Collects results and stores them for retrieval
 */
async function processTaskStream(
  callId: string,
  stream: AsyncIterable<unknown>
): Promise<void> {
  let responseText = ""
  let toolOutput: string | null = null

  try {
    for await (const msg of stream) {
      const msgAny = msg as any

      // Update sessionId
      if (msgAny.session_id) {
        sessionState.sessionId = msgAny.session_id
      }

      // Check for task completion with output
      if (msgAny.type === "tool_output" && msgAny.tool_name === "Task") {
        toolOutput = msgAny.output || msgAny.result
      }

      // Collect text content
      if (msgAny.type === "assistant" && msgAny.message?.content) {
        if (Array.isArray(msgAny.message.content)) {
          for (const block of msgAny.message.content) {
            if (block.type === "text") {
              responseText += block.text
            }
          }
        }
      }

      // Check for result message
      if (msgAny.type === "result") {
        if (msgAny.result) {
          responseText = msgAny.result
        }
        break
      }
    }

    // Store the final result
    const task = activeTasks.get(callId)
    if (task) {
      // Parse JSON result if present
      let parsedResult: any = null
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0])
        }
      } catch {
        // Not valid JSON, store as text
      }

      // Store result for retrieval
      taskResults.set(callId, {
        text: responseText,
        parsed: parsedResult,
        toolOutput: toolOutput || undefined,
        completedAt: new Date(),
        success: true,
      })
    }

    console.log(`[background-session] Task ${callId.slice(0, 16)}... completed`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[background-session] Task ${callId} failed:`, errorMessage)

    taskResults.set(callId, {
      text: responseText,
      completedAt: new Date(),
      success: false,
      error: errorMessage,
    })
  } finally {
    activeTasks.delete(callId)
  }
}

/**
 * Stored task results for retrieval
 */
const taskResults = new Map<string, {
  text: string
  parsed?: any
  toolOutput?: string
  completedAt: Date
  success: boolean
  error?: string
}>()

/**
 * Get the result of a completed background task
 *
 * @param callId - The task call ID from executeBackgroundTask
 * @returns The task result if completed, null if still running
 */
export function getBackgroundTaskResult(
  callId: string
): {
  text: string
  parsed?: any
  toolOutput?: string
  completedAt: Date
  success: boolean
  error?: string
} | null {
  return taskResults.get(callId) || null
}

/**
 * Check if a background task is still running
 *
 * @param callId - The task call ID
 * @returns true if the task is still active
 */
export function isBackgroundTaskRunning(callId: string): boolean {
  return activeTasks.has(callId)
}

/**
 * Cancel a running background task
 *
 * @param callId - The task call ID
 * @returns true if the task was cancelled
 */
export function cancelBackgroundTask(callId: string): boolean {
  const task = activeTasks.get(callId)
  if (task) {
    task.abortController.abort()
    activeTasks.delete(callId)
    return true
  }
  return false
}

/**
 * Get list of active background tasks
 */
export function getActiveBackgroundTasks(): Array<{
  callId: string
  startTime: Date
  type: string
  duration: number
}> {
  const now = Date.now()
  return Array.from(activeTasks.entries()).map(([callId, task]) => ({
    callId,
    startTime: task.startTime,
    type: task.type,
    duration: now - task.startTime.getTime(),
  }))
}

/**
 * Reset the background session (for debugging/testing)
 *
 * Closes the current session and resets state to allow re-initialization.
 */
export async function resetBackgroundSession(): Promise<void> {
  await closeBackgroundSession()

  sessionState = {
    status: "idle",
    sessionId: null,
    model: "haiku",
    requestCount: 0,
    lastUsedTime: null,
    errorMessage: null,
    initTime: null,
  }

  // Clear all active tasks and results
  for (const [callId, task] of activeTasks) {
    task.abortController.abort()
    console.log(`[background-session] Cancelled task ${callId} during reset`)
  }
  activeTasks.clear()
  taskResults.clear()

  backgroundConfigDir = null
  console.log("[background-session] Reset complete")
}

/**
 * Fix TypeScript/ESLint errors in a file using Claude
 *
 * Uses the Claude SDK in agent mode to automatically fix linting issues.
 * Claude will read the file, analyze errors, and use the Edit tool to apply fixes.
 *
 * @param filePath - Absolute path to the file with errors
 * @param diagnostics - Array of error/warning diagnostics
 * @param cwd - Working directory (project root)
 * @returns Result with success status and number of changes applied
 */
export async function fixLintErrors(
  filePath: string,
  diagnostics: Array<{ message: string; line?: number; column?: number; severity?: string }>,
  cwd: string
): Promise<{
  success: boolean
  error?: string
  changesApplied?: number
  output?: string
}> {
  if (!isBackgroundSessionReady()) {
    return {
      success: false,
      error: "Background session not ready. Try restarting the app.",
    }
  }

  try {
    console.log(`[background-session] Fixing ${diagnostics.length} lint errors in ${filePath}`)

    // Format diagnostics for the prompt
    const formattedDiagnostics = diagnostics
      .map((d, i) => {
        const location = d.line ? `Line ${d.line}${d.column ? `:${d.column}` : ""}` : "Unknown location"
        const severity = d.severity ? `[${d.severity.toUpperCase()}]` : ""
        return `${i + 1}. ${location} ${severity} ${d.message}`
      })
      .join("\n")

    const prompt = `Fix the TypeScript/ESLint errors in this file. Use the Read and Edit tools.

File: ${filePath}

Errors to fix (${diagnostics.length} total):
${formattedDiagnostics}

Instructions:
1. Read the file first to see the current code
2. Analyze each error carefully
3. Use the Edit tool to fix each issue with minimal changes
4. Only fix the specific errors listed - do not refactor or add features
5. Do not add comments explaining the fixes
6. Preserve code style and formatting
7. After fixing, output a summary of changes made

Start by reading the file.`

    // Get Claude SDK
    const claudeQuery = await getClaudeQuery()
    const claudeCodeToken = getClaudeCodeToken()
    const claudeEnv = buildClaudeEnv()

    const finalEnv: Record<string, string> = {
      ...claudeEnv,
      ...(claudeCodeToken && {
        CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
      }),
      ...(backgroundConfigDir && {
        CLAUDE_CONFIG_DIR: backgroundConfigDir,
      }),
    }

    const claudeBinaryPath = getBundledClaudeBinaryPath()

    // Create abort controller for this operation
    const abortController = new AbortController()

    const queryOptions = {
      prompt,
      options: {
        abortController,
        cwd,
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
        },
        env: finalEnv,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: claudeBinaryPath,
        // Only use continue when we have a valid sessionId to resume
        ...(sessionState.sessionId && {
          resume: sessionState.sessionId,
          continue: true,
        }),
        model: "sonnet", // Use sonnet for code fixes (better at code)
        persistSession: false, // Don't save ephemeral utility sessions
      },
    }

    const stream = claudeQuery(queryOptions)
    let responseText = ""
    let toolUseCount = 0

    for await (const msg of stream) {
      const msgAny = msg as any

      // Update sessionId
      if (msgAny.session_id) {
        sessionState.sessionId = msgAny.session_id
      }

      // Count Edit tool uses
      if (msgAny.type === "tool_use" && msgAny.tool_name === "Edit") {
        toolUseCount++
      }

      // Collect text response
      if (msgAny.type === "assistant" && msgAny.message?.content) {
        if (!Array.isArray(msgAny.message.content)) {
          console.warn("[BackgroundSession] Expected content to be array, got:", typeof msgAny.message.content)
          continue
        }
        for (const block of msgAny.message.content) {
          if (block.type === "text") {
            responseText += block.text
          }
        }
      }

      // Check for completion
      if (msgAny.type === "result") {
        if (msgAny.result) {
          responseText = msgAny.result
        }
        break
      }
    }

    sessionState.requestCount++
    sessionState.lastUsedTime = new Date()

    console.log(`[background-session] Fixed ${toolUseCount} issues in ${filePath}`)

    return {
      success: true,
      changesApplied: toolUseCount,
      output: responseText,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[background-session] Lint fix failed:", errorMessage)
    return {
      success: false,
      error: errorMessage,
    }
  }
}
