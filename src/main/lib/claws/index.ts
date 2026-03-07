/**
 * ClawDaemon - Headless Agent Orchestration System
 *
 * Manages autonomous background agents (Claws) that run Claude Code
 * in response to triggers (cron, GitHub polling, or manual).
 */

import { safeStorage, Notification, app } from "electron"
import { spawn, ChildProcess } from "node:child_process"
import { existsSync, statSync, unlinkSync } from "fs"
import { join } from "path"
import { eq, desc, and } from "drizzle-orm"
import { getDatabase, headlessClaws, clawExecutions, githubSettings, slackSettings, whatsappSettings, chats, subChats, projects, chatSessions, type HeadlessClaw, type ClawExecution, type ChatSession } from "../db"
import { createId } from "../db/utils"
import { getSlackTrigger } from "./slack-trigger"
import { getWhatsAppTrigger } from "./whatsapp-trigger"
import {
  getOrCreateSession,
  updateSessionStatus,
  addMessageToSession,
  formatSessionContextForPrompt,
  type SessionContext,
} from "./session-manager"

// Re-export session manager functions
export * from "./session-manager"

// Type definitions
type TriggerType = "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message"
type ExecutionStatus = "running" | "success" | "failed"

interface CronConfig {
  expression: string // e.g., "0 9 * * 1-5" (9am weekdays)
}

interface GitHubPollConfig {
  owner: string
  repo: string
  label: string // e.g., "agent-ready"
}

interface SlackTriggerConfig {
  slackChannelFilter?: string // Optional channel filter (e.g., "#claw-commands")
}

interface WhatsAppTriggerConfig {
  whatsappChatFilter?: string // Optional chat filter (e.g., "group" or phone number)
}

// Active cron jobs and polling intervals
interface ActiveTrigger {
  clawId: string
  type: TriggerType
  timer?: NodeJS.Timeout | null
  childProcess?: ChildProcess | null
}

class ClawDaemon {
  private static instance: ClawDaemon | null = null
  private activeTriggers: Map<string, ActiveTrigger> = new Map()
  private isInitialized = false

  // Singleton pattern
  static getInstance(): ClawDaemon {
    if (!ClawDaemon.instance) {
      ClawDaemon.instance = new ClawDaemon()
    }
    return ClawDaemon.instance
  }

  /**
   * Initialize the daemon - called during app boot
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    console.log("[ClawDaemon] Initializing...")

    try {
      const db = getDatabase()
      const claws = db.select().from(headlessClaws).where(eq(headlessClaws.isEnabled, true)).all()

      for (const claw of claws) {
        await this.registerTrigger(claw)
      }

      this.isInitialized = true
      console.log(`[ClawDaemon] Initialized with ${claws.length} active claws`)
    } catch (error) {
      console.error("[ClawDaemon] Initialization failed:", error)
      throw error
    }
  }

  /**
   * Shutdown the daemon - called during app quit
   */
  async shutdown(): Promise<void> {
    console.log("[ClawDaemon] Shutting down...")

    // Stop all active triggers
    for (const [clawId, trigger] of this.activeTriggers) {
      await this.stopTrigger(clawId, trigger)
    }

    this.activeTriggers.clear()
    this.isInitialized = false
    console.log("[ClawDaemon] Shutdown complete")
  }

  /**
   * Reload triggers - called when claws are modified
   */
  async reload(): Promise<void> {
    console.log("[ClawDaemon] Reloading triggers...")

    // Stop all existing triggers
    for (const [clawId, trigger] of this.activeTriggers) {
      await this.stopTrigger(clawId, trigger)
    }
    this.activeTriggers.clear()

    // Re-register all enabled claws
    const db = getDatabase()
    const claws = db.select().from(headlessClaws).where(eq(headlessClaws.isEnabled, true)).all()

    for (const claw of claws) {
      await this.registerTrigger(claw)
    }

    console.log(`[ClawDaemon] Reloaded with ${claws.length} active claws`)
  }

  /**
   * Register a trigger for a claw
   */
  private async registerTrigger(claw: HeadlessClaw): Promise<void> {
    const config = JSON.parse(claw.triggerConfig)

    switch (claw.triggerType) {
      case "cron":
        this.registerCronTrigger(claw, config as CronConfig)
        break
      case "github_poll":
        this.registerGitHubPollTrigger(claw, config as GitHubPollConfig)
        break
      case "manual":
        // Manual triggers don't need registration - they're triggered on-demand
        console.log(`[ClawDaemon] Claw "${claw.name}" registered as manual trigger`)
        break
      case "slack_mention":
        // Slack triggers are handled by SlackTrigger singleton
        console.log(`[ClawDaemon] Claw "${claw.name}" registered for Slack mentions`)
        // Ensure SlackTrigger is started if credentials are configured
        await this.ensureSlackTriggerStarted()
        break
      case "whatsapp_message":
        // WhatsApp triggers are handled by WhatsAppTrigger singleton
        console.log(`[ClawDaemon] Claw "${claw.name}" registered for WhatsApp messages`)
        // Ensure WhatsAppTrigger is started if credentials exist
        await this.ensureWhatsAppTriggerStarted()
        break
      default:
        console.warn(`[ClawDaemon] Unknown trigger type: ${claw.triggerType}`)
    }
  }

  /**
   * Register a cron trigger
   */
  private registerCronTrigger(claw: HeadlessClaw, config: CronConfig): void {
    // Simple cron parser - supports basic format: "minute hour day month weekday"
    // For production, consider using a library like node-cron
    const interval = this.parseCronToMs(config.expression)

    if (!interval) {
      console.error(`[ClawDaemon] Invalid cron expression: ${config.expression}`)
      return
    }

    const timer = setInterval(() => {
      this.executeClaw(claw.id)
    }, interval)

    this.activeTriggers.set(claw.id, {
      clawId: claw.id,
      type: "cron",
      timer,
    })

    console.log(`[ClawDaemon] Registered cron trigger for "${claw.name}": ${config.expression}`)
  }

  /**
   * Register a GitHub polling trigger
   */
  private registerGitHubPollTrigger(claw: HeadlessClaw, config: GitHubPollConfig): void {
    // Poll every 5 minutes (300000ms)
    const POLL_INTERVAL = 5 * 60 * 1000
    let lastETag: string | null = null
    let lastIssueIds = new Set<number>()

    const poll = async () => {
      try {
        const token = await this.getDecryptedGitHubToken()
        if (!token) {
          console.warn("[ClawDaemon] No GitHub token configured, skipping poll")
          return
        }

        // Fetch issues with the specified label
        const url = `https://api.github.com/repos/${config.owner}/${config.repo}/issues?labels=${encodeURIComponent(config.label)}&state=open`
        const headers: HeadersInit = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Claw-App",
        }

        if (lastETag) {
          headers["If-None-Match"] = lastETag
        }

        const response = await fetch(url, { headers })

        if (response.status === 304) {
          // No changes
          return
        }

        if (response.ok) {
          lastETag = response.headers.get("ETag")
          const issues = await response.json()

          // Check for new issues
          for (const issue of issues) {
            if (!lastIssueIds.has(issue.id)) {
              // New issue detected - trigger the claw
              console.log(`[ClawDaemon] New issue detected: #${issue.number} - ${issue.title}`)
              await this.executeClaw(claw.id, { issueNumber: issue.number, issueTitle: issue.title })
              lastIssueIds.add(issue.id)
            }
          }

          // Clean up closed issues from tracking
          const currentIds = new Set(issues.map((i: { id: number }) => i.id))
          lastIssueIds = new Set([...lastIssueIds].filter((id) => currentIds.has(id)))
        }
      } catch (error) {
        console.error("[ClawDaemon] GitHub poll error:", error)
      }
    }

    // Initial poll
    poll()

    // Set up interval
    const timer = setInterval(poll, POLL_INTERVAL)

    this.activeTriggers.set(claw.id, {
      clawId: claw.id,
      type: "github_poll",
      timer,
    })

    console.log(`[ClawDaemon] Registered GitHub poll trigger for "${claw.name}": ${config.owner}/${config.repo}#${config.label}`)
  }

  /**
   * Stop a trigger
   */
  private async stopTrigger(clawId: string, trigger: ActiveTrigger): Promise<void> {
    if (trigger.timer) {
      clearInterval(trigger.timer)
    }
    if (trigger.childProcess) {
      trigger.childProcess.kill("SIGTERM")
      // Give it 5 seconds to exit gracefully, then force kill
      setTimeout(() => {
        if (trigger.childProcess && !trigger.childProcess.killed) {
          trigger.childProcess.kill("SIGKILL")
        }
      }, 5000)
    }
  }

  /**
   * Ensure Slack trigger is started if credentials are configured
   */
  private async ensureSlackTriggerStarted(): Promise<void> {
    try {
      const slackTrigger = getSlackTrigger()
      if (!slackTrigger.isActive()) {
        // Check if we have credentials before trying to start
        const db = getDatabase()
        const settings = db.select().from(slackSettings).where(eq(slackSettings.id, "default")).get()
        if (settings?.encryptedAppToken && settings?.encryptedBotToken && settings?.isSocketModeEnabled) {
          await slackTrigger.start()
        }
      }
    } catch (error) {
      console.error("[ClawDaemon] Failed to start Slack trigger:", error)
    }
  }

  /**
   * Start Slack trigger (called from settings when enabling Socket Mode)
   */
  async startSlackTrigger(): Promise<void> {
    const slackTrigger = getSlackTrigger()
    await slackTrigger.start()
  }

  /**
   * Stop Slack trigger (called from settings when disabling Socket Mode)
   */
  async stopSlackTrigger(): Promise<void> {
    const slackTrigger = getSlackTrigger()
    await slackTrigger.stop()
  }

  /**
   * Ensure WhatsApp trigger is started if a session exists.
   * We check both the DB flag and the presence of creds.json on disk —
   * the DB flag can be stale (e.g. after deleting+rescanning), so disk wins.
   */
  private async ensureWhatsAppTriggerStarted(): Promise<void> {
    try {
      const whatsappTrigger = getWhatsAppTrigger()
      if (whatsappTrigger.isActive()) {
        console.log("[ClawDaemon] WhatsApp trigger already active, skipping auto-start")
        return
      }

      // Check for creds.json on disk
      const credsPath = join(app.getPath("userData"), "baileys_auth", "creds.json")
      if (!existsSync(credsPath)) {
        console.log("[ClawDaemon] No WhatsApp session on disk — waiting for user to scan QR")
        return
      }

      // Validate the session file isn't empty/corrupted
      try {
        const stats = statSync(credsPath)
        if (stats.size < 100) {
          console.log("[ClawDaemon] WhatsApp creds file too small, likely corrupted — clearing and waiting for re-scan")
          unlinkSync(credsPath)
          return
        }
      } catch (e) {
        console.log("[ClawDaemon] Could not read WhatsApp creds file — waiting for re-scan")
        return
      }

      console.log("[ClawDaemon] WhatsApp session found, auto-starting trigger")
      await whatsappTrigger.start()
    } catch (error) {
      console.error("[ClawDaemon] Failed to start WhatsApp trigger:", error)
    }
  }

  /**
   * Start WhatsApp trigger
   */
  async startWhatsAppTrigger(): Promise<void> {
    const whatsappTrigger = getWhatsAppTrigger()
    await whatsappTrigger.start()
  }

  /**
   * Stop WhatsApp trigger
   */
  async stopWhatsAppTrigger(): Promise<void> {
    const whatsappTrigger = getWhatsAppTrigger()
    await whatsappTrigger.stop()
  }

  /**
   * Logout from WhatsApp and clear session
   */
  async logoutWhatsApp(): Promise<void> {
    const whatsappTrigger = getWhatsAppTrigger()
    await whatsappTrigger.logout()
  }

  /**
   * Execute a claw (trigger a run)
   */
  async executeClaw(
    clawId: string,
    context?: {
      issueNumber?: number
      issueTitle?: string
      slackChannel?: string
      slackUser?: string
      slackThreadTs?: string
      whatsappFrom?: string
      whatsappSender?: string
      originalMessage?: string
      triggerSource?: "slack" | "whatsapp" | "github" | "cron" | "manual"
      sessionId?: string // Optional: existing session ID for persistence
    }
  ): Promise<string> {
    const db = getDatabase()
    const claw = db.select().from(headlessClaws).where(eq(headlessClaws.id, clawId)).get()

    if (!claw) {
      throw new Error(`Claw not found: ${clawId}`)
    }

    if (!claw.isEnabled) {
      throw new Error(`Claw is disabled: ${claw.name}`)
    }

    // Handle session persistence for WhatsApp and Slack
    let session: ChatSession | null = null
    let sessionContextText = ""

    if (context?.sessionId) {
      // Use existing session
      session = db.select().from(chatSessions).where(eq(chatSessions.id, context.sessionId)).get() ?? null
      if (session) {
        sessionContextText = formatSessionContextForPrompt(session)
        await updateSessionStatus(session.id, "active")
      }
    } else if (context?.triggerSource === "whatsapp" && context.whatsappFrom) {
      // Create or get WhatsApp session
      session = await getOrCreateSession(claw.id, context.whatsappFrom, "whatsapp", {
        metadata: { sender: context.whatsappSender },
      })
      sessionContextText = formatSessionContextForPrompt(session)
      await updateSessionStatus(session.id, "active")
      await addMessageToSession(session.id, "user", context.originalMessage || "Trigger received")
    } else if (context?.triggerSource === "slack" && context.slackChannel) {
      // Create or get Slack session (use thread TS if available, otherwise channel)
      const externalId = context.slackThreadTs || context.slackChannel
      session = await getOrCreateSession(claw.id, externalId, "slack", {
        metadata: { channel: context.slackChannel, user: context.slackUser, threadTs: context.slackThreadTs },
      })
      sessionContextText = formatSessionContextForPrompt(session)
      await updateSessionStatus(session.id, "active")
      await addMessageToSession(session.id, "user", context.originalMessage || "Trigger received")
    }

    // Create or get the Claw Chat (parent chat for this claw)
    const clawChat = await this.getOrCreateClawChat(claw)

    // Create execution record
    const executionId = createId()

    // Create subChat for this execution
    const subChatName = this.generateSubChatName(claw, context)
    const subChatId = createId()

    // Initial messages array with system context
    const initialMessages = this.buildInitialMessages(claw, context, sessionContextText)

    db.insert(subChats)
      .values({
        id: subChatId,
        chatId: clawChat.id,
        name: subChatName,
        messages: JSON.stringify(initialMessages),
        mode: "agent",
      })
      .run()

    // Create execution record with subChat and session links
    db.insert(clawExecutions)
      .values({
        id: executionId,
        clawId: claw.id,
        subChatId: subChatId,
        sessionId: session?.id || null,
        status: "running",
        logs: `Starting execution at ${new Date().toISOString()}\n`,
        startedAt: new Date(),
      })
      .run()

    // Update session with current execution
    if (session) {
      await updateSessionStatus(session.id, "active", executionId)
    }

    // Build the instruction with context
    let instruction = claw.instruction

    if (context) {
      const contextParts: string[] = []

      if (context.issueNumber) {
        contextParts.push(`Processing issue #${context.issueNumber}` + (context.issueTitle ? ` - "${context.issueTitle}"` : ""))
      }

      if (context.triggerSource === "slack") {
        contextParts.push(`Triggered via Slack by user ${context.slackUser}`)
        if (context.originalMessage) {
          contextParts.push(`Original message: "${context.originalMessage}"`)
        }
      }

      if (context.triggerSource === "whatsapp") {
        contextParts.push(`Triggered via WhatsApp by ${context.whatsappSender} (${context.whatsappFrom})`)
        if (context.originalMessage) {
          contextParts.push(`Original message: "${context.originalMessage}"`)
        }
      }

      if (contextParts.length > 0) {
        instruction += `\n\nContext: ${contextParts.join(". ")}`
      }
    }

    // Add session context to instruction for WhatsApp/Slack
    if (sessionContextText) {
      instruction = sessionContextText + instruction
    }

    // Execute using Claude SDK with subChat tracking
    this.executeClaudeSDK(claw, executionId, subChatId, instruction, session)

    return executionId
  }

  /**
   * Get or create a Claw Chat for storing execution subChats
   */
  private async getOrCreateClawChat(claw: HeadlessClaw): Promise<typeof chats.$inferSelect> {
    const db = getDatabase()

    // Look for existing claw chat by name pattern
    const existingChat = db
      .select()
      .from(chats)
      .where(eq(chats.name, `Claw: ${claw.name}`))
      .get()

    if (existingChat) {
      return existingChat
    }

    // Need to find or create a project for claw chats
    let project = db.select().from(projects).where(eq(projects.name, "Claw Executions")).get()

    if (!project) {
      const projectId = createId()
      db.insert(projects)
        .values({
          id: projectId,
          name: "Claw Executions",
          path: claw.targetWorktree,
        })
        .run()
      project = { id: projectId, name: "Claw Executions", path: claw.targetWorktree, createdAt: new Date(), updatedAt: new Date(), startCommands: "[]" } as typeof projects.$inferSelect
    }

    // Create the chat
    const chatId = createId()
    db.insert(chats)
      .values({
        id: chatId,
        name: `Claw: ${claw.name}`,
        projectId: project.id,
        sourceView: "commands",
        sourceContext: JSON.stringify({ clawId: claw.id }),
      })
      .run()

    return db.select().from(chats).where(eq(chats.id, chatId)).get()!
  }

  /**
   * Generate a name for the subChat based on trigger context
   */
  private generateSubChatName(claw: HeadlessClaw, context?: any): string {
    const timestamp = new Date().toLocaleTimeString()

    if (context?.triggerSource === "whatsapp" && context?.whatsappSender) {
      return `${timestamp} - WhatsApp from ${context.whatsappSender}`
    }

    if (context?.triggerSource === "slack" && context?.slackUser) {
      return `${timestamp} - Slack from ${context.slackUser}`
    }

    if (context?.issueNumber) {
      return `${timestamp} - Issue #${context.issueNumber}`
    }

    return `${timestamp} - ${claw.triggerType}`
  }

  /**
   * Build initial messages with context
   */
  private buildInitialMessages(claw: HeadlessClaw, context?: any, sessionContextText?: string): any[] {
    const messages = []

    // System/context message
    const contextParts = [`Claw "${claw.name}" triggered via ${claw.triggerType}`]

    // Add purpose if set
    if (claw.purpose) {
      contextParts.push(`Purpose: ${claw.purpose}`)
    }

    if (context?.triggerSource === "whatsapp") {
      contextParts.push(`From: ${context.whatsappSender} (${context.whatsappFrom})`)
      if (context.originalMessage) {
        contextParts.push(`Message: "${context.originalMessage}"`)
      }
      if (sessionContextText) {
        contextParts.push(`This conversation has session history that will be included in the prompt.`)
      }
    }

    if (context?.triggerSource === "slack") {
      contextParts.push(`From: ${context.slackUser} in ${context.slackChannel}`)
      if (context.originalMessage) {
        contextParts.push(`Message: "${context.originalMessage}"`)
      }
      if (sessionContextText) {
        contextParts.push(`This conversation has session history that will be included in the prompt.`)
      }
    }

    if (context?.issueNumber) {
      contextParts.push(`GitHub Issue #${context.issueNumber}: ${context.issueTitle || "N/A"}`)
    }

    messages.push({
      id: createId(),
      role: "user",
      content: [{ type: "text", text: contextParts.join("\n") }],
      timestamp: Date.now(),
    })

    // The instruction as user message
    messages.push({
      id: createId(),
      role: "user",
      content: [{ type: "text", text: claw.instruction }],
      timestamp: Date.now(),
    })

    return messages
  }

  /**
   * Execute Claude Code using the SDK
   */
  private async executeClaudeSDK(
    claw: HeadlessClaw,
    executionId: string,
    subChatId: string,
    instruction: string,
    session?: ChatSession | null
  ): Promise<void> {
    const db = getDatabase()
    let logs = ""

    console.log(`[ClawDaemon] Executing Claude SDK for execution ${executionId} in ${claw.targetWorktree}`)

    try {
      // Import the SDK
      const sdk = await import("@anthropic-ai/claude-agent-sdk")
      const claudeQuery = sdk.query

      // Build environment
      const { buildClaudeEnv, getBundledClaudeBinaryPath } = await import("../claude/env")
      const claudeEnv = buildClaudeEnv()
      const claudeBinaryPath = getBundledClaudeBinaryPath()

      const env: Record<string, string> = {
        ...claudeEnv,
        FORCE_COLOR: "0",
        CLAW_EXECUTION: "1",
      }

      // Create abort controller
      const abortController = new AbortController()

      // Store abort controller for potential cancellation
      const trigger = this.activeTriggers.get(claw.id)
      if (trigger) {
        // Store a mock child process for compatibility with existing code
        trigger.childProcess = {
          kill: () => abortController.abort(),
        } as any
      }

      console.log(`[ClawDaemon] Starting SDK query with bundled binary: ${claudeBinaryPath}`)

      // Allowed directories: targetWorktree is always included; user can add more
      const extraDirs: string[] = claw.allowedDirectories
        ? JSON.parse(claw.allowedDirectories)
        : []
      const allowedDirs = [claw.targetWorktree, ...extraDirs]

      // MCP servers: empty array = no MCPs (default safe); non-empty = restrict to named servers
      const allowedMcps: string[] = claw.allowedMcpServers
        ? JSON.parse(claw.allowedMcpServers)
        : []

      const finalEnv: Record<string, string> = {
        ...env,
        ...(allowedMcps.length > 0 ? { CLAUDE_MCP_ALLOW_LIST: allowedMcps.join(",") } : { CLAUDE_MCP_DISABLE_ALL: "1" }),
      }

      const stream = claudeQuery({
        prompt: instruction,
        options: {
          abortController,
          cwd: claw.targetWorktree,
          systemPrompt: {
            type: "preset" as const,
            preset: "claude_code" as const,
          },
          env: finalEnv,
          permissionMode: "bypassPermissions" as const,
          allowDangerouslySkipPermissions: true,
          allowedDirectories: allowedDirs,
          pathToClaudeCodeExecutable: claudeBinaryPath,
          persistSession: true,
        } as any,
      })

      let messageCount = 0
      let hasError = false
      const executionMessages: any[] = []

      for await (const msg of stream) {
        const msgAny = msg as any
        messageCount++

        // Collect text from assistant messages
        if (msgAny.type === "assistant" && msgAny.message?.content) {
          let text = ""
          const content = msgAny.message.content

          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                text += block.text
              }
            }
          } else if (typeof content === "string") {
            text = content
          }

          if (text) {
            console.log(`[ClawDaemon] SDK message ${messageCount}: ${text.substring(0, 200)}`)
            logs += text + "\n"
            this.updateExecutionLogs(executionId, logs)

            // Store message in subChat
            const message = {
              id: createId(),
              role: "assistant",
              content: [{ type: "text", text }],
              timestamp: Date.now(),
            }
            executionMessages.push(message)
            await this.appendMessageToSubChat(subChatId, message)
          }
        }

        // Check for tool calls and store them as messages
        if (msgAny.type === "tool_call") {
          const toolMessage = {
            id: createId(),
            role: "assistant",
            content: [{
              type: "tool_call",
              toolCallId: msgAny.tool_call?.id,
              name: msgAny.tool_call?.name,
              input: msgAny.tool_call?.input,
            }],
            timestamp: Date.now(),
          }
          executionMessages.push(toolMessage)
          await this.appendMessageToSubChat(subChatId, toolMessage)
        }

        // Check for tool results
        if (msgAny.type === "tool_result") {
          const resultMessage = {
            id: createId(),
            role: "user",
            content: [{
              type: "tool_result",
              toolCallId: msgAny.tool_result?.toolCallId,
              output: msgAny.tool_result?.output,
              isError: msgAny.tool_result?.isError,
            }],
            timestamp: Date.now(),
          }
          executionMessages.push(resultMessage)
          await this.appendMessageToSubChat(subChatId, resultMessage)
        }

        // Check for errors
        if (msgAny.type === "result" && msgAny.is_error) {
          hasError = true
          if (msgAny.errors) {
            const errorText = msgAny.errors.join("\n")
            console.error(`[ClawDaemon] SDK errors: ${errorText}`)
            logs += `\nErrors: ${errorText}`
          }
        }

        // Break on result
        if (msgAny.type === "result") {
          console.log(`[ClawDaemon] SDK stream completed after ${messageCount} messages`)

          // Extract session ID from the result if available
          const sessionId = msgAny.sessionId || msgAny.session?.id
          if (sessionId) {
            db.update(subChats)
              .set({ sessionId })
              .where(eq(subChats.id, subChatId))
              .run()
          }

          break
        }
      }

      const status: ExecutionStatus = hasError ? "failed" : "success"

      db.update(clawExecutions)
        .set({
          status,
          logs: logs + `\nExecution completed at ${new Date().toISOString()}`,
          completedAt: new Date(),
        })
        .where(eq(clawExecutions.id, executionId))
        .run()

      // Update session status and add response to session history
      if (session) {
        const sessionStatus = hasError ? "error" : "completed"
        await updateSessionStatus(session.id, sessionStatus)
        await addMessageToSession(session.id, "assistant", logs.substring(0, 2000) || "Execution completed")
      }

      // Remove from active triggers
      if (trigger) {
        trigger.childProcess = undefined
      }

      this.sendNotification(claw.name, status)

      console.log(`[ClawDaemon] Execution ${executionId} completed with status: ${status}`)

    } catch (error: any) {
      console.error(`[ClawDaemon] SDK execution failed:`, error)
      logs += `\nExecution error: ${error.message || String(error)}`

      // Store error message in subChat
      const errorMessage = {
        id: createId(),
        role: "system",
        content: [{ type: "text", text: `Execution error: ${error.message || String(error)}` }],
        timestamp: Date.now(),
      }
      await this.appendMessageToSubChat(subChatId, errorMessage)

      db.update(clawExecutions)
        .set({
          status: "failed",
          logs,
          completedAt: new Date(),
        })
        .where(eq(clawExecutions.id, executionId))
        .run()

      // Update session status on error
      if (session) {
        await updateSessionStatus(session.id, "error")
        await addMessageToSession(session.id, "assistant", `Execution error: ${error.message || String(error)}`)
      }

      const trigger = this.activeTriggers.get(claw.id)
      if (trigger) {
        trigger.childProcess = undefined
      }

      this.sendNotification(claw.name, "failed")
    }
  }

  /**
   * Update execution logs in the database
   */
  private updateExecutionLogs(executionId: string, logs: string): void {
    const db = getDatabase()
    db.update(clawExecutions).set({ logs }).where(eq(clawExecutions.id, executionId)).run()
  }

  /**
   * Append a message to the subChat
   */
  private async appendMessageToSubChat(subChatId: string, message: any): Promise<void> {
    const db = getDatabase()

    const subChat = db.select().from(subChats).where(eq(subChats.id, subChatId)).get()
    if (!subChat) return

    try {
      const messages = JSON.parse(subChat.messages || "[]")
      messages.push(message)

      db.update(subChats)
        .set({
          messages: JSON.stringify(messages),
          updatedAt: new Date(),
        })
        .where(eq(subChats.id, subChatId))
        .run()
    } catch (e) {
      console.error("[ClawDaemon] Failed to append message to subChat:", e)
    }
  }

  /**
   * Send OS notification
   */
  private sendNotification(clawName: string, status: ExecutionStatus): void {
    if (!Notification.isSupported()) {
      return
    }

    const title = status === "success" ? "Claw Completed" : "Claw Failed"
    const body = `"${clawName}" finished with status: ${status}`

    new Notification({ title, body }).show()
  }

  /**
   * Get the decrypted GitHub token
   */
  private async getDecryptedGitHubToken(): Promise<string | null> {
    const db = getDatabase()
    const settings = db.select().from(githubSettings).where(eq(githubSettings.id, "default")).get()

    if (!settings?.encryptedToken) {
      return null
    }

    try {
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback to base64 decoding
        return Buffer.from(settings.encryptedToken, "base64").toString("utf-8")
      }

      const buffer = Buffer.from(settings.encryptedToken, "base64")
      return safeStorage.decryptString(buffer)
    } catch (error) {
      console.error("[ClawDaemon] Failed to decrypt GitHub token:", error)
      return null
    }
  }

  /**
   * Parse a simple cron expression to milliseconds interval
   * Supports: "minute hour day month weekday" format
   * Returns null if parsing fails
   */
  private parseCronToMs(expression: string): number | null {
    const parts = expression.trim().split(/\s+/)

    if (parts.length !== 5) {
      return null
    }

    // For simplicity, we convert cron to an interval
    // This is a basic implementation - for production, use a proper cron library
    const [minute, hour, day, month, weekday] = parts

    // If it's a simple interval like "*/5 * * * *" (every 5 minutes)
    if (minute.startsWith("*/") && hour === "*" && day === "*" && month === "*" && weekday === "*") {
      const intervalMinutes = parseInt(minute.slice(2))
      if (!isNaN(intervalMinutes)) {
        return intervalMinutes * 60 * 1000
      }
    }

    // If it's "0 * * * *" (every hour)
    if (minute === "0" && hour === "*" && day === "*" && month === "*" && weekday === "*") {
      return 60 * 60 * 1000
    }

    // If it's "0 0 * * *" (daily)
    if (minute === "0" && hour === "0" && day === "*" && month === "*" && weekday === "*") {
      return 24 * 60 * 60 * 1000
    }

    // Default: 1 hour interval for unsupported patterns
    console.warn(`[ClawDaemon] Complex cron expression "${expression}" not fully supported, using 1 hour interval`)
    return 60 * 60 * 1000
  }

  /**
   * Get running executions for a claw
   */
  getRunningExecutions(clawId: string): ClawExecution[] {
    const db = getDatabase()
    return db
      .select()
      .from(clawExecutions)
      .where(and(
        eq(clawExecutions.clawId, clawId),
        eq(clawExecutions.status, "running")
      ))
      .all()
  }
}

// Export singleton instance
export const clawDaemon = ClawDaemon.getInstance()
