import { EventEmitter } from "events"
import { app } from "electron"
import path from "path"
import os from "os"
import fs from "fs/promises"
import crypto from "crypto"
import { ConductorJobRepository } from "../db/repositories/ConductorJobRepository"
import { ConductorCheckpointRepository } from "../db/repositories/ConductorCheckpointRepository"
import { ConductorLogRepository } from "../db/repositories/ConductorLogRepository"
import type { ConductorJob, ConductorCheckpoint, ConductorLog } from "../db/schema/conductor"
import { buildClaudeEnv, getBundledClaudeBinaryPath, ensureValidAwsCredentials } from "../claude/env"

/**
 * Output line types that can be emitted by the agent
 */
type OutputType = "checkpoint" | "log" | "status" | "other"

/**
 * Parsed output from agent execution
 */
interface ParsedOutput {
  type: OutputType
  data?: {
    message?: string
    level?: string
    metadata?: Record<string, any>
  }
}

/**
 * Active session information
 */
interface ActiveSession {
  jobId: string
  sessionId: string
  abortController: AbortController
  startedAt: Date
  lastActivityAt: Date
  messageCount: number
  toolCallCount: number
  lastCheckpointAt?: Date
}

/**
 * MCP server configuration
 */
interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

/**
 * Job execution metrics
 */
interface JobMetrics {
  messageCount: number
  toolCallCount: number
  checkpointCount: number
  errorCount: number
  duration: number
  lastHeartbeat: Date
}

/**
 * Session state for persistence
 */
interface SessionState {
  jobId: string
  sessionId: string
  startedAt: string
  lastActivityAt: string
  messageCount: number
  toolCallCount: number
  lastCheckpointId?: string
  status: "running" | "paused" | "stopped"
}

/**
 * Checkpoint strategy configuration
 */
interface CheckpointStrategy {
  enabled: boolean
  frequency?: "high" | "medium" | "low" // How often to create automatic checkpoints
  maxRetention?: number // Maximum number of checkpoints to keep
  onToolCall?: boolean // Create checkpoint after each tool call
  onError?: boolean // Create checkpoint when error occurs
}

/**
 * Tool approval request
 */
interface ToolApprovalRequest {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  resolve: (approved: boolean, message?: string) => void
}

/**
 * Job queue item
 */
interface QueuedJob {
  jobId: string
  priority: number // Lower number = higher priority
  queuedAt: Date
  dependencies?: string[] // Job IDs that must complete first
}

/**
 * Job execution result
 */
interface JobExecutionResult {
  jobId: string
  status: "completed" | "failed" | "stopped"
  duration: number
  metrics: JobMetrics
  error?: string
}

/**
 * Session management and agent execution events
 */
interface ConductorAgentEvents {
  checkpoint: (jobId: string, checkpoint: ConductorCheckpoint) => void
  log: (jobId: string, log: ConductorLog) => void
  statusChange: (jobId: string, status: string, errorMessage?: string) => void
  sessionCreated: (jobId: string, sessionId: string) => void
  sessionEnded: (jobId: string, sessionId: string, reason: string) => void
  toolApprovalRequest: (
    jobId: string,
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ) => void
  jobQueued: (jobId: string, position: number) => void
  jobDequeued: (jobId: string) => void
  jobCompleted: (jobId: string, result: JobExecutionResult) => void
}

// Declare event emitter with typed events
declare interface ConductorAgentRunner {
  on<K extends keyof ConductorAgentEvents>(
    event: K,
    listener: ConductorAgentEvents[K]
  ): this
  emit<K extends keyof ConductorAgentEvents>(
    event: K,
    ...args: Parameters<ConductorAgentEvents[K]>
  ): boolean
}

/**
 * ConductorAgentRunner executes Claude agents for conductor jobs
 * using the SDK-based approach (not process spawning).
 *
 * Features:
 * - SDK-based agent execution with streaming output
 * - Session management with resume capability
 * - Real-time checkpoint and log tracking
 * - Event emission for UI updates
 * - Graceful error handling and cancellation
 *
 * @example
 * ```typescript
 * const runner = new ConductorAgentRunner(jobRepo, checkpointRepo, logRepo)
 *
 * // Listen for events
 * runner.on('checkpoint', (jobId, checkpoint) => {
 *   console.log(`Checkpoint for ${jobId}:`, checkpoint.message)
 * })
 *
 * runner.on('statusChange', (jobId, status) => {
 *   console.log(`Job ${jobId} status: ${status}`)
 * })
 *
 * // Start a job
 * await runner.startJob(jobId)
 *
 * // Stop if needed
 * await runner.stopJob(jobId)
 * ```
 */
class ConductorAgentRunner extends EventEmitter {
  private jobRepo: ConductorJobRepository
  private checkpointRepo: ConductorCheckpointRepository
  private logRepo: ConductorLogRepository

  // Active sessions (jobId -> session info)
  private activeSessions = new Map<string, ActiveSession>()

  // Cached Claude query function
  private cachedClaudeQuery: any = null

  // MCP server configurations
  private mcpServers: Record<string, McpServerConfig> = {}

  // Job metrics tracking
  private jobMetrics = new Map<string, JobMetrics>()

  // Heartbeat interval (5 seconds)
  private readonly HEARTBEAT_INTERVAL = 5000

  // Session timeout (30 minutes of inactivity)
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000

  // Session persistence path
  private sessionStatePath: string

  // Max concurrent jobs
  private maxConcurrentJobs = 5

  // Checkpoint strategy
  private checkpointStrategy: CheckpointStrategy = {
    enabled: true,
    frequency: "medium",
    maxRetention: 50,
    onToolCall: false,
    onError: true,
  }

  // Pending tool approvals
  private pendingToolApprovals = new Map<string, ToolApprovalRequest>()

  // Tool call counter for checkpoint frequency
  private toolCallsSinceCheckpoint = new Map<string, number>()

  // Job queue
  private jobQueue: QueuedJob[] = []

  // Auto-execute queue flag
  private autoExecuteQueue = false

  // Queue processing interval
  private queueProcessorTimer?: NodeJS.Timeout

  constructor(
    jobRepo: ConductorJobRepository,
    checkpointRepo: ConductorCheckpointRepository,
    logRepo: ConductorLogRepository
  ) {
    super()
    this.jobRepo = jobRepo
    this.checkpointRepo = checkpointRepo
    this.logRepo = logRepo

    // Setup session persistence path
    this.sessionStatePath = path.join(
      app.getPath("userData"),
      "conductor-sessions.json"
    )

    // Restore sessions on startup
    this.restoreSessions().catch((error) => {
      console.error("[ConductorAgent] Failed to restore sessions:", error)
    })

    // Start heartbeat timer
    this.startHeartbeatTimer()

    // Persist sessions periodically
    this.startPersistenceTimer()

    // Start queue processor
    this.startQueueProcessor()
  }

  /**
   * Configure MCP servers for agent execution
   */
  setMcpServers(mcpServers: Record<string, McpServerConfig>): void {
    this.mcpServers = mcpServers
  }

  /**
   * Get MCP servers configuration
   */
  getMcpServers(): Record<string, McpServerConfig> {
    return { ...this.mcpServers }
  }

  /**
   * Set maximum concurrent jobs
   */
  setMaxConcurrentJobs(max: number): void {
    this.maxConcurrentJobs = Math.max(1, max)
  }

  /**
   * Get maximum concurrent jobs
   */
  getMaxConcurrentJobs(): number {
    return this.maxConcurrentJobs
  }

  /**
   * Configure checkpoint strategy
   */
  setCheckpointStrategy(strategy: Partial<CheckpointStrategy>): void {
    this.checkpointStrategy = {
      ...this.checkpointStrategy,
      ...strategy,
    }
  }

  /**
   * Get checkpoint strategy
   */
  getCheckpointStrategy(): CheckpointStrategy {
    return { ...this.checkpointStrategy }
  }

  /**
   * Respond to a tool approval request
   * @param toolUseId - The tool use ID
   * @param approved - Whether the tool use is approved
   * @param message - Optional message for denial
   */
  respondToToolApproval(
    toolUseId: string,
    approved: boolean,
    message?: string
  ): void {
    const request = this.pendingToolApprovals.get(toolUseId)
    if (!request) {
      throw new Error(`No pending approval for tool ${toolUseId}`)
    }

    request.resolve(approved, message)
    this.pendingToolApprovals.delete(toolUseId)
  }

  /**
   * Queue a job for execution
   * @param jobId - The job ID to queue
   * @param priority - Priority (lower = higher priority, default 100)
   * @param dependencies - Optional job IDs that must complete first
   */
  queueJob(jobId: string, priority: number = 100, dependencies?: string[]): void {
    // Check if already queued or running
    if (this.jobQueue.some((j) => j.jobId === jobId)) {
      throw new Error(`Job ${jobId} is already queued`)
    }
    if (this.activeSessions.has(jobId)) {
      throw new Error(`Job ${jobId} is already running`)
    }

    const queuedJob: QueuedJob = {
      jobId,
      priority,
      queuedAt: new Date(),
      dependencies,
    }

    // Insert in priority order
    const insertIndex = this.jobQueue.findIndex((j) => j.priority > priority)
    if (insertIndex === -1) {
      this.jobQueue.push(queuedJob)
    } else {
      this.jobQueue.splice(insertIndex, 0, queuedJob)
    }

    const position = this.jobQueue.findIndex((j) => j.jobId === jobId) + 1
    this.emit("jobQueued", jobId, position)

    console.log(`[ConductorAgent] Job ${jobId} queued at position ${position} (priority ${priority})`)

    // Process queue immediately if auto-execute is enabled
    if (this.autoExecuteQueue) {
      this.processQueue().catch((error) => {
        console.error("[ConductorAgent] Queue processing error:", error)
      })
    }
  }

  /**
   * Remove a job from the queue
   * @param jobId - The job ID to remove
   */
  dequeueJob(jobId: string): boolean {
    const index = this.jobQueue.findIndex((j) => j.jobId === jobId)
    if (index === -1) {
      return false
    }

    this.jobQueue.splice(index, 1)
    this.emit("jobDequeued", jobId)
    return true
  }

  /**
   * Get the current job queue
   */
  getJobQueue(): QueuedJob[] {
    return [...this.jobQueue]
  }

  /**
   * Enable or disable automatic queue execution
   */
  setAutoExecuteQueue(enabled: boolean): void {
    this.autoExecuteQueue = enabled
    if (enabled) {
      this.processQueue().catch((error) => {
        console.error("[ConductorAgent] Queue processing error:", error)
      })
    }
  }

  /**
   * Check if auto-execute is enabled
   */
  isAutoExecuteEnabled(): boolean {
    return this.autoExecuteQueue
  }

  /**
   * Start executing a conductor job with Claude agent
   * @param jobId - The job ID to start
   */
  async startJob(jobId: string): Promise<void> {
    // Check if job is already running
    if (this.activeSessions.has(jobId)) {
      throw new Error(`Job ${jobId} is already running`)
    }

    // Check concurrent job limit
    if (this.activeSessions.size >= this.maxConcurrentJobs) {
      throw new Error(
        `Maximum concurrent jobs (${this.maxConcurrentJobs}) reached. Stop a job first.`
      )
    }

    // Get job from database
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    // Validate job has required fields
    if (!job.intent) {
      throw new Error(`Job ${jobId} has no intent defined`)
    }

    if (!job.worktreePath) {
      throw new Error(`Job ${jobId} has no worktree path defined`)
    }

    try {
      // Create session
      const sessionId = this.createSession(job)

      // Update job status to in_progress
      this.jobRepo.update(jobId, {
        status: "in_progress",
        errorMessage: null,
      })
      this.emitStatusChange(jobId, "in_progress")

      // Execute agent in background (don't await)
      this.executeAgent(job, sessionId).catch((error) => {
        console.error(`[ConductorAgent] Job ${jobId} failed:`, error)
        this.handleJobError(jobId, error)
      })
    } catch (error) {
      this.handleJobError(jobId, error)
      throw error
    }
  }

  /**
   * Stop a running conductor job
   * @param jobId - The job ID to stop
   */
  async stopJob(jobId: string): Promise<void> {
    const session = this.activeSessions.get(jobId)
    if (!session) {
      throw new Error(`Job ${jobId} is not running`)
    }

    try {
      // Abort the session
      session.abortController.abort()

      // Log the stop
      this.emitLog(jobId, {
        level: "info",
        message: "Job stopped by user",
        timestamp: new Date(),
      })

      // Update job status
      this.jobRepo.update(jobId, {
        status: "blocked",
        pid: null,
      })
      this.emitStatusChange(jobId, "blocked")

      // Clean up session
      this.cleanupSession(session.sessionId)

      // Emit session ended event
      this.emit("sessionEnded", jobId, session.sessionId, "stopped")
    } catch (error) {
      console.error(`[ConductorAgent] Failed to stop job ${jobId}:`, error)
      throw error
    }
  }

  /**
   * Resume a previously stopped or failed job
   * @param jobId - The job ID to resume
   */
  async resumeJob(jobId: string): Promise<void> {
    // Check if job is already running
    if (this.activeSessions.has(jobId)) {
      throw new Error(`Job ${jobId} is already running`)
    }

    // Get job from database
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    // Get the latest checkpoint to resume from
    const latestCheckpoint = this.checkpointRepo.findLatestByJobId(jobId)

    try {
      // Create new session (will use existing sessionId if available from checkpoint)
      const sessionId = latestCheckpoint?.metadata
        ? JSON.parse(latestCheckpoint.metadata).sessionId || this.createSession(job)
        : this.createSession(job)

      // Update job status
      this.jobRepo.update(jobId, {
        status: "in_progress",
        errorMessage: null,
      })
      this.emitStatusChange(jobId, "in_progress")

      // Log resume
      this.emitLog(jobId, {
        level: "info",
        message: latestCheckpoint
          ? `Resuming from checkpoint: ${latestCheckpoint.message}`
          : "Resuming job",
        timestamp: new Date(),
      })

      // Execute agent in background
      this.executeAgent(job, sessionId, latestCheckpoint?.id).catch((error) => {
        console.error(`[ConductorAgent] Job ${jobId} failed on resume:`, error)
        this.handleJobError(jobId, error)
      })
    } catch (error) {
      this.handleJobError(jobId, error)
      throw error
    }
  }

  /**
   * Create a new session for a job
   * @param job - The conductor job
   * @returns Session ID
   */
  private createSession(job: ConductorJob): string {
    const sessionId = crypto.randomUUID()
    const abortController = new AbortController()

    const session: ActiveSession = {
      jobId: job.id,
      sessionId,
      abortController,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      messageCount: 0,
      toolCallCount: 0,
    }

    this.activeSessions.set(job.id, session)

    // Initialize metrics
    this.jobMetrics.set(job.id, {
      messageCount: 0,
      toolCallCount: 0,
      checkpointCount: 0,
      errorCount: 0,
      duration: 0,
      lastHeartbeat: new Date(),
    })

    this.emit("sessionCreated", job.id, sessionId)

    return sessionId
  }

  /**
   * Clean up session resources
   * @param sessionId - The session ID to clean up
   */
  private cleanupSession(sessionId: string): void {
    // Find session by sessionId
    for (const [jobId, session] of this.activeSessions.entries()) {
      if (session.sessionId === sessionId) {
        this.activeSessions.delete(jobId)

        // Clean up metrics after a delay (keep for reporting)
        setTimeout(() => {
          this.jobMetrics.delete(jobId)
        }, 60000) // Keep metrics for 1 minute

        break
      }
    }
  }

  /**
   * Start heartbeat timer to check for stale sessions
   */
  private startHeartbeatTimer(): void {
    setInterval(() => {
      const now = new Date()

      for (const [jobId, session] of this.activeSessions.entries()) {
        const inactiveTime = now.getTime() - session.lastActivityAt.getTime()

        // Check for timeout
        if (inactiveTime > this.SESSION_TIMEOUT) {
          console.warn(`[ConductorAgent] Session timeout for job ${jobId}`)
          this.stopJob(jobId).catch((error) => {
            console.error(`[ConductorAgent] Failed to stop timed-out job ${jobId}:`, error)
          })
        }

        // Update metrics heartbeat
        const metrics = this.jobMetrics.get(jobId)
        if (metrics) {
          metrics.lastHeartbeat = now
          metrics.duration = now.getTime() - session.startedAt.getTime()
        }
      }
    }, this.HEARTBEAT_INTERVAL)
  }

  /**
   * Start persistence timer to save sessions periodically
   */
  private startPersistenceTimer(): void {
    setInterval(() => {
      this.persistSessions().catch((error) => {
        console.error("[ConductorAgent] Failed to persist sessions:", error)
      })
    }, 10000) // Persist every 10 seconds
  }

  /**
   * Persist active sessions to disk
   */
  private async persistSessions(): Promise<void> {
    try {
      const sessionStates: SessionState[] = []

      for (const [jobId, session] of this.activeSessions.entries()) {
        // Get last checkpoint for this job
        const lastCheckpoint = this.checkpointRepo.findLatestByJobId(jobId)

        sessionStates.push({
          jobId,
          sessionId: session.sessionId,
          startedAt: session.startedAt.toISOString(),
          lastActivityAt: session.lastActivityAt.toISOString(),
          messageCount: session.messageCount,
          toolCallCount: session.toolCallCount,
          lastCheckpointId: lastCheckpoint?.id,
          status: "running",
        })
      }

      await fs.writeFile(
        this.sessionStatePath,
        JSON.stringify({ sessions: sessionStates, version: 1 }, null, 2),
        "utf-8"
      )
    } catch (error) {
      console.error("[ConductorAgent] Failed to persist sessions:", error)
    }
  }

  /**
   * Restore sessions from disk after restart
   */
  private async restoreSessions(): Promise<void> {
    try {
      // Check if session state file exists
      try {
        await fs.access(this.sessionStatePath)
      } catch {
        // No state file, nothing to restore
        return
      }

      const data = await fs.readFile(this.sessionStatePath, "utf-8")
      const parsed = JSON.parse(data)

      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
        console.warn("[ConductorAgent] Invalid session state format")
        return
      }

      // Restore sessions that were running
      for (const sessionState of parsed.sessions) {
        if (sessionState.status === "running") {
          const job = this.jobRepo.findById(sessionState.jobId)
          if (job && job.status === "in_progress") {
            console.log(`[ConductorAgent] Restoring session for job ${sessionState.jobId}`)

            // Resume the job
            try {
              await this.resumeJob(sessionState.jobId)
            } catch (error) {
              console.error(
                `[ConductorAgent] Failed to restore job ${sessionState.jobId}:`,
                error
              )
              // Mark job as blocked if restore fails
              this.jobRepo.update(sessionState.jobId, {
                status: "blocked",
                errorMessage: "Failed to restore after restart",
              })
            }
          }
        }
      }

      // Clean up the state file
      await fs.unlink(this.sessionStatePath)
    } catch (error) {
      console.error("[ConductorAgent] Failed to restore sessions:", error)
    }
  }

  /**
   * Execute Claude agent for a job
   * @param job - The conductor job
   * @param sessionId - The session ID
   * @param resumeCheckpointId - Optional checkpoint ID to resume from
   */
  private async executeAgent(
    job: ConductorJob,
    sessionId: string,
    resumeCheckpointId?: string
  ): Promise<void> {
    const session = this.activeSessions.get(job.id)
    if (!session) {
      throw new Error(`Session not found for job ${job.id}`)
    }

    try {
      // Get Claude SDK query function
      const claudeQuery = await this.getClaudeQuery()

      // Ensure AWS credentials are valid (auto-refresh if needed)
      const credentialRefreshResult = await ensureValidAwsCredentials()
      if (!credentialRefreshResult.success && credentialRefreshResult.error) {
        console.warn("[ConductorAgent] AWS credential refresh failed:", credentialRefreshResult.error)
        // Profile mode can fall back to system credentials
        // SSO mode would throw error
      }

      // Build environment
      const claudeEnv = buildClaudeEnv()

      // Create isolated config directory for this job
      const isolatedConfigDir = path.join(
        app.getPath("userData"),
        "claude-sessions",
        "conductor",
        job.id
      )
      await fs.mkdir(isolatedConfigDir, { recursive: true })

      // Setup symlinks for skills/agents from ~/.claude/ (following Claw pattern)
      await this.setupIsolatedConfig(isolatedConfigDir)

      // Build prompt based on job intent
      const prompt = this.buildJobPrompt(job)

      // Log execution start
      this.emitLog(job.id, {
        level: "info",
        message: `Starting agent execution for: ${job.title}`,
        timestamp: new Date(),
      })

      // Filter MCP servers (only include enabled ones)
      const enabledMcpServers = Object.fromEntries(
        Object.entries(this.mcpServers).filter(([_, config]) => !config.disabled)
      )

      // Configure query options
      const queryOptions = {
        prompt,
        options: {
          abortController: session.abortController,
          cwd: job.worktreePath!,
          systemPrompt: {
            type: "preset" as const,
            preset: "claude_code" as const,
          },
          env: {
            ...claudeEnv,
            CLAUDE_CONFIG_DIR: isolatedConfigDir,
          },
          permissionMode: "bypassPermissions" as const,
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          pathToClaudeCodeExecutable: getBundledClaudeBinaryPath(),
          settingSources: ["project" as const, "user" as const, "local" as const],
          // Add MCP servers if configured
          ...(Object.keys(enabledMcpServers).length > 0 && {
            mcpServers: enabledMcpServers,
          }),
          // Resume from previous session if available
          ...(resumeCheckpointId && { resume: sessionId, continue: true }),
          ...(!resumeCheckpointId && { continue: true }),
          // Tool approval callback
          canUseTool: async (
            toolName: string,
            toolInput: Record<string, unknown>,
            options: { toolUseID: string }
          ) => {
            // Check if tool requires approval (e.g., Bash, Write, Edit)
            const requiresApproval = ["Bash", "Write", "Edit"].includes(toolName)

            if (requiresApproval) {
              // Emit approval request event
              this.emit("toolApprovalRequest", job.id, options.toolUseID, toolName, toolInput)

              // Wait for approval
              const approved = await new Promise<boolean>((resolve) => {
                const request: ToolApprovalRequest = {
                  toolUseId: options.toolUseID,
                  toolName,
                  toolInput,
                  resolve: (approved: boolean, message?: string) => {
                    if (!approved) {
                      this.emitLog(job.id, {
                        level: "warning",
                        message: `Tool ${toolName} denied: ${message || "No reason provided"}`,
                        timestamp: new Date(),
                      })
                    }
                    resolve(approved)
                  },
                }
                this.pendingToolApprovals.set(options.toolUseID, request)
              })

              if (!approved) {
                return {
                  behavior: "deny" as const,
                  message: "Tool use denied by user",
                }
              }
            }

            return {
              behavior: "allow" as const,
              updatedInput: toolInput,
            }
          },
          stderr: (data: string) => {
            // Log stderr output
            this.emitLog(job.id, {
              level: "debug",
              message: `Agent stderr: ${data}`,
              timestamp: new Date(),
            })
          },
        },
      }

      // Start streaming
      const stream = claudeQuery(queryOptions)

      for await (const msg of stream) {
        // Check if aborted
        if (session.abortController.signal.aborted) {
          break
        }

        // Update session stats
        session.messageCount++
        session.lastActivityAt = new Date()

        // Update metrics
        const metrics = this.jobMetrics.get(job.id)
        if (metrics) {
          metrics.messageCount++
        }

        // Parse and process message
        await this.processMessage(job.id, msg, sessionId)
      }

      // Job completed successfully
      this.jobRepo.update(job.id, {
        status: "done",
        pid: null,
      })
      this.emitStatusChange(job.id, "done")

      const metrics = this.jobMetrics.get(job.id)
      this.emitLog(job.id, {
        level: "info",
        message: `Job completed successfully (${metrics?.messageCount || 0} messages, ${metrics?.toolCallCount || 0} tool calls, ${metrics?.checkpointCount || 0} checkpoints)`,
        timestamp: new Date(),
      })

      // Emit job completed event
      if (metrics) {
        const result: JobExecutionResult = {
          jobId: job.id,
          status: "completed",
          duration: Date.now() - session.startedAt.getTime(),
          metrics,
        }
        this.emit("jobCompleted", job.id, result)
      }

      // Clean up
      this.cleanupSession(sessionId)
      this.emit("sessionEnded", job.id, sessionId, "completed")
    } catch (error: any) {
      // Check if it was an abort
      if (session.abortController.signal.aborted) {
        this.emitLog(job.id, {
          level: "info",
          message: "Job aborted by user",
          timestamp: new Date(),
        })
      } else {
        this.handleJobError(job.id, error)
      }

      this.cleanupSession(sessionId)
      this.emit("sessionEnded", job.id, sessionId, "error")
      throw error
    }
  }

  /**
   * Get or import Claude SDK query function
   */
  private async getClaudeQuery(): Promise<any> {
    if (this.cachedClaudeQuery) {
      return this.cachedClaudeQuery
    }

    const sdk = await import("@anthropic-ai/claude-agent-sdk")
    this.cachedClaudeQuery = sdk.query
    return this.cachedClaudeQuery
  }

  /**
   * Build prompt for a job based on its intent and context
   */
  private buildJobPrompt(job: ConductorJob): string {
    const parts: string[] = []

    parts.push(`# Conductor Job: ${job.title}`)
    parts.push("")
    parts.push(`## Intent`)
    parts.push(job.intent!)
    parts.push("")

    if (job.type) {
      parts.push(`## Job Type`)
      parts.push(job.type)
      parts.push("")
    }

    parts.push(`## Instructions`)
    parts.push(`You are working in a conductor-managed worktree at: ${job.worktreePath}`)
    parts.push(`Branch: ${job.branchName || "unknown"}`)
    parts.push("")
    parts.push(`Please implement the intent above. Use the available tools to:`)
    parts.push(`1. Analyze the codebase to understand the context`)
    parts.push(`2. Make necessary code changes`)
    parts.push(`3. Test your changes if applicable`)
    parts.push(`4. Create checkpoints at major milestones using structured output`)
    parts.push("")
    parts.push(`When you reach significant milestones, output: CHECKPOINT: <description>`)
    parts.push(`When you encounter issues, output: ERROR: <description>`)
    parts.push(`When you complete the task, output: COMPLETE: <summary>`)

    return parts.join("\n")
  }

  /**
   * Process a message from the Claude SDK stream
   */
  private async processMessage(
    jobId: string,
    msg: any,
    sessionId: string
  ): Promise<void> {
    try {
      // Check for error messages
      if (msg.type === "error" || msg.error) {
        const errorMsg = msg.error || msg.message || "Unknown error"
        this.emitLog(jobId, {
          level: "error",
          message: errorMsg,
          timestamp: new Date(),
        })
        return
      }

      // Extract text content from message
      let textContent = ""
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            textContent += block.text
          }
        }
      }

      // Parse output for structured content
      if (textContent) {
        const parsed = this.parseOutput(textContent)

        if (parsed.type === "checkpoint" && parsed.data) {
          // Create checkpoint in database
          const checkpoint = this.checkpointRepo.create({
            jobId,
            timestamp: new Date(),
            message: parsed.data.message || "Checkpoint",
            metadata: JSON.stringify({
              sessionId,
              ...parsed.data.metadata,
            }),
          })
          this.emitCheckpoint(jobId, checkpoint)
        } else if (parsed.type === "log" && parsed.data) {
          // Create log entry
          this.emitLog(jobId, {
            level: parsed.data.level || "info",
            message: parsed.data.message || textContent,
            timestamp: new Date(),
          })
        } else if (parsed.type === "status" && parsed.data) {
          // Update job status
          const status = parsed.data.message?.includes("COMPLETE") ? "done" : "in_progress"
          this.jobRepo.update(jobId, { status })
          this.emitStatusChange(jobId, status)
        }
      }

      // Track tool calls and log them
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            // Update metrics
            const session = this.activeSessions.get(jobId)
            if (session) {
              session.toolCallCount++
            }

            const metrics = this.jobMetrics.get(jobId)
            if (metrics) {
              metrics.toolCallCount++
            }

            // Log tool call
            this.emitLog(jobId, {
              level: "debug",
              message: `Tool: ${block.name} (${block.id?.slice(0, 8)})`,
              timestamp: new Date(),
            })

            // Auto-checkpoint after tool call if strategy enabled
            if (this.checkpointStrategy.enabled && this.checkpointStrategy.onToolCall) {
              await this.createAutoCheckpoint(
                jobId,
                sessionId,
                `After tool: ${block.name}`
              )
            } else if (this.checkpointStrategy.enabled) {
              // Check frequency-based checkpoints
              await this.checkFrequencyBasedCheckpoint(jobId, sessionId)
            }
          }
        }
      }
    } catch (error) {
      console.error(`[ConductorAgent] Error processing message:`, error)
    }
  }

  /**
   * Setup isolated config directory with symlinks to shared resources
   */
  private async setupIsolatedConfig(isolatedConfigDir: string): Promise<void> {
    try {
      const homeClaudeDir = path.join(os.homedir(), ".claude")

      // Helper to check if path exists
      const pathExists = async (p: string) =>
        fs.stat(p).then(() => true).catch(() => false)

      // Symlink skills directory if it exists
      const skillsSource = path.join(homeClaudeDir, "skills")
      const skillsTarget = path.join(isolatedConfigDir, "skills")
      if (await pathExists(skillsSource)) {
        try {
          await fs.symlink(skillsSource, skillsTarget, "dir")
        } catch (error: any) {
          if (error.code !== "EEXIST") {
            console.warn("[ConductorAgent] Failed to symlink skills:", error)
          }
        }
      }

      // Symlink agents directory if it exists
      const agentsSource = path.join(homeClaudeDir, "agents")
      const agentsTarget = path.join(isolatedConfigDir, "agents")
      if (await pathExists(agentsSource)) {
        try {
          await fs.symlink(agentsSource, agentsTarget, "dir")
        } catch (error: any) {
          if (error.code !== "EEXIST") {
            console.warn("[ConductorAgent] Failed to symlink agents:", error)
          }
        }
      }
    } catch (error) {
      console.error("[ConductorAgent] Failed to setup isolated config:", error)
    }
  }

  /**
   * Parse output line for structured content
   * Enhanced version with better pattern matching
   * @param line - The output line to parse
   * @returns Parsed output with type and data
   */
  private parseOutput(line: string): ParsedOutput {
    // Check for checkpoint markers (support various formats)
    const checkpointPatterns = [
      /CHECKPOINT:\s*(.+)/i,
      /\[CHECKPOINT\]\s*(.+)/i,
      /✓\s*Checkpoint:\s*(.+)/i,
    ]

    for (const pattern of checkpointPatterns) {
      const match = line.match(pattern)
      if (match) {
        const message = match[1]?.trim()
        // Track checkpoint in metrics
        const metrics = Array.from(this.jobMetrics.values()).find(() => true)
        if (metrics) {
          metrics.checkpointCount++
        }
        return {
          type: "checkpoint",
          data: {
            message,
            metadata: { type: "manual", timestamp: Date.now() },
          },
        }
      }
    }

    // Check for error markers (support various formats)
    const errorPatterns = [
      /ERROR:\s*(.+)/i,
      /\[ERROR\]\s*(.+)/i,
      /✗\s*(.+)/i,
      /Failed:\s*(.+)/i,
    ]

    for (const pattern of errorPatterns) {
      const match = line.match(pattern)
      if (match) {
        const message = match[1]?.trim()
        // Track error in metrics
        const metrics = Array.from(this.jobMetrics.values()).find(() => true)
        if (metrics) {
          metrics.errorCount++
        }

        // Create error checkpoint if strategy enabled
        if (this.checkpointStrategy.enabled && this.checkpointStrategy.onError) {
          // Note: We can't easily get jobId/sessionId here, but the error will trigger
          // checkpoint creation through the message processing flow
        }

        return {
          type: "log",
          data: {
            level: "error",
            message,
          },
        }
      }
    }

    // Check for completion markers
    const completePatterns = [
      /COMPLETE:\s*(.+)/i,
      /\[COMPLETE\]\s*(.+)/i,
      /✓\s*Done:\s*(.+)/i,
      /Task completed:\s*(.+)/i,
    ]

    for (const pattern of completePatterns) {
      const match = line.match(pattern)
      if (match) {
        const message = match[1]?.trim()
        return {
          type: "status",
          data: {
            message: `COMPLETE: ${message}`,
          },
        }
      }
    }

    // Check for progress markers
    if (/Progress:|Step \d+\/\d+|Stage:/i.test(line)) {
      return {
        type: "log",
        data: {
          level: "info",
          message: line.trim(),
        },
      }
    }

    // Default to log for non-empty lines
    if (line.trim()) {
      return {
        type: "log",
        data: {
          level: "info",
          message: line.trim(),
        },
      }
    }

    return {
      type: "other",
    }
  }

  /**
   * Create automatic checkpoint based on strategy
   */
  private async createAutoCheckpoint(
    jobId: string,
    sessionId: string,
    message: string
  ): Promise<void> {
    try {
      const checkpoint = this.checkpointRepo.create({
        jobId,
        timestamp: new Date(),
        message,
        metadata: JSON.stringify({
          sessionId,
          type: "auto",
          timestamp: Date.now(),
        }),
      })

      this.emitCheckpoint(jobId, checkpoint)

      // Reset tool call counter
      this.toolCallsSinceCheckpoint.set(jobId, 0)

      // Clean up old checkpoints if retention limit is set
      if (this.checkpointStrategy.maxRetention) {
        this.checkpointRepo.deleteOldCheckpoints(
          jobId,
          this.checkpointStrategy.maxRetention
        )
      }
    } catch (error) {
      console.error(`[ConductorAgent] Failed to create auto checkpoint:`, error)
    }
  }

  /**
   * Check if frequency-based checkpoint should be created
   */
  private async checkFrequencyBasedCheckpoint(
    jobId: string,
    sessionId: string
  ): Promise<void> {
    if (!this.checkpointStrategy.enabled || !this.checkpointStrategy.frequency) {
      return
    }

    // Get tool call count since last checkpoint
    const toolCalls = this.toolCallsSinceCheckpoint.get(jobId) || 0
    this.toolCallsSinceCheckpoint.set(jobId, toolCalls + 1)

    // Determine threshold based on frequency
    let threshold: number
    switch (this.checkpointStrategy.frequency) {
      case "high":
        threshold = 5
        break
      case "medium":
        threshold = 10
        break
      case "low":
        threshold = 20
        break
      default:
        threshold = 10
    }

    // Create checkpoint if threshold reached
    if (toolCalls >= threshold) {
      await this.createAutoCheckpoint(
        jobId,
        sessionId,
        `Progress checkpoint (${toolCalls} tool calls)`
      )
    }
  }

  /**
   * Emit checkpoint event and store in database
   */
  private emitCheckpoint(jobId: string, checkpoint: ConductorCheckpoint): void {
    // Update session's last checkpoint time
    const session = this.activeSessions.get(jobId)
    if (session) {
      session.lastCheckpointAt = new Date()
    }

    this.emit("checkpoint", jobId, checkpoint)
  }

  /**
   * Emit log event and store in database
   */
  private emitLog(
    jobId: string,
    logData: { level: string; message: string; timestamp: Date }
  ): void {
    const log = this.logRepo.create({
      jobId,
      timestamp: logData.timestamp,
      level: logData.level,
      message: logData.message,
    })
    this.emit("log", jobId, log)
  }

  /**
   * Emit status change event
   */
  private emitStatusChange(jobId: string, status: string, errorMessage?: string): void {
    this.emit("statusChange", jobId, status, errorMessage)
  }

  /**
   * Handle job error
   */
  private handleJobError(jobId: string, error: any): void {
    const errorMessage = error instanceof Error ? error.message : String(error)

    this.jobRepo.update(jobId, {
      status: "blocked",
      errorMessage,
      pid: null,
    })

    this.emitLog(jobId, {
      level: "error",
      message: `Job failed: ${errorMessage}`,
      timestamp: new Date(),
    })

    this.emitStatusChange(jobId, "blocked", errorMessage)
  }

  /**
   * Get active session for a job
   */
  getActiveSession(jobId: string): ActiveSession | undefined {
    return this.activeSessions.get(jobId)
  }

  /**
   * Check if a job is currently running
   */
  isJobRunning(jobId: string): boolean {
    return this.activeSessions.has(jobId)
  }

  /**
   * Get all active job IDs
   */
  getActiveJobIds(): string[] {
    return Array.from(this.activeSessions.keys())
  }

  /**
   * Get metrics for a job
   */
  getJobMetrics(jobId: string): JobMetrics | undefined {
    return this.jobMetrics.get(jobId)
  }

  /**
   * Get metrics for all jobs
   */
  getAllMetrics(): Map<string, JobMetrics> {
    return new Map(this.jobMetrics)
  }

  /**
   * Start queue processor timer
   */
  private startQueueProcessor(): void {
    this.queueProcessorTimer = setInterval(() => {
      if (this.autoExecuteQueue) {
        this.processQueue().catch((error) => {
          console.error("[ConductorAgent] Queue processing error:", error)
        })
      }
    }, 5000) // Check every 5 seconds
  }

  /**
   * Process job queue and start next eligible job
   */
  private async processQueue(): Promise<void> {
    // Check if we can start more jobs
    if (this.activeSessions.size >= this.maxConcurrentJobs) {
      return
    }

    // Check if queue is empty
    if (this.jobQueue.length === 0) {
      return
    }

    // Find first eligible job (no pending dependencies)
    for (let i = 0; i < this.jobQueue.length; i++) {
      const queuedJob = this.jobQueue[i]

      // Check dependencies
      const hasBlockingDeps = queuedJob.dependencies?.some((depId) => {
        const dep = this.jobRepo.findById(depId)
        return dep && dep.status !== "done"
      })

      if (hasBlockingDeps) {
        continue
      }

      // Found eligible job - remove from queue and start
      this.jobQueue.splice(i, 1)
      this.emit("jobDequeued", queuedJob.jobId)

      console.log(`[ConductorAgent] Starting queued job ${queuedJob.jobId}`)

      try {
        await this.startJob(queuedJob.jobId)
      } catch (error) {
        console.error(`[ConductorAgent] Failed to start queued job ${queuedJob.jobId}:`, error)
        // Mark as blocked
        this.jobRepo.update(queuedJob.jobId, {
          status: "blocked",
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }

      // Only start one job per iteration
      break
    }
  }

  /**
   * Cleanup resources (call on app shutdown)
   */
  async cleanup(): Promise<void> {
    // Stop queue processor
    if (this.queueProcessorTimer) {
      clearInterval(this.queueProcessorTimer)
    }

    // Persist sessions one last time
    await this.persistSessions()

    // Stop all active jobs
    for (const jobId of this.activeSessions.keys()) {
      try {
        await this.stopJob(jobId)
      } catch (error) {
        console.error(`[ConductorAgent] Failed to stop job ${jobId}:`, error)
      }
    }
  }
}

export { ConductorAgentRunner, type ActiveSession, type ConductorAgentEvents }
