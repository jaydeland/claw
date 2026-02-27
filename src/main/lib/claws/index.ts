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
import { eq, desc } from "drizzle-orm"
import { getDatabase, headlessClaws, clawExecutions, githubSettings, slackSettings, whatsappSettings, type HeadlessClaw, type ClawExecution } from "../db"
import { createId } from "../db/utils"
import { getSlackTrigger } from "./slack-trigger"
import { getWhatsAppTrigger } from "./whatsapp-trigger"

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

    // Create execution record
    const executionId = createId()
    db.insert(clawExecutions)
      .values({
        id: executionId,
        clawId: claw.id,
        status: "running",
        logs: `Starting execution at ${new Date().toISOString()}\n`,
        startedAt: new Date(),
      })
      .run()

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

    // Spawn Claude Code process
    this.spawnClaudeProcess(claw, executionId, instruction)

    return executionId
  }

  /**
   * Spawn the Claude Code process
   */
  private spawnClaudeProcess(claw: HeadlessClaw, executionId: string, instruction: string): void {
    const db = getDatabase()
    let logs = ""

    // Build environment
    const env = {
      ...process.env,
      FORCE_COLOR: "0", // Strip ANSI colors
      CLAW_EXECUTION: "1", // Signal to Claude that it's running in headless mode
    }

    // Spawn the process
    // Using npx to run @anthropic-ai/claude-code with the -p flag for non-interactive mode
    const child = spawn("npx", ["@anthropic-ai/claude-code", "-p", instruction], {
      cwd: claw.targetWorktree,
      env,
      shell: true,
      detached: false,
    })

    // Update active triggers with child process
    const trigger = this.activeTriggers.get(claw.id)
    if (trigger) {
      trigger.childProcess = child
    }

    // Capture stdout
    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString()
      logs += chunk
      this.updateExecutionLogs(executionId, logs)
    })

    // Capture stderr
    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString()
      logs += chunk
      this.updateExecutionLogs(executionId, logs)
    })

    // Handle process exit
    child.on("exit", (code) => {
      const status: ExecutionStatus = code === 0 ? "success" : "failed"

      db.update(clawExecutions)
        .set({
          status,
          exitCode: code ?? undefined,
          logs: logs + `\nProcess exited with code ${code} at ${new Date().toISOString()}`,
          completedAt: new Date(),
        })
        .where(eq(clawExecutions.id, executionId))
        .run()

      // Remove child process from active triggers
      if (trigger) {
        trigger.childProcess = undefined
      }

      // Send notification
      this.sendNotification(claw.name, status)

      console.log(`[ClawDaemon] Execution ${executionId} completed with status: ${status}`)
    })

    // Handle errors
    child.on("error", (error) => {
      logs += `\nProcess error: ${error.message}`

      db.update(clawExecutions)
        .set({
          status: "failed",
          logs,
          completedAt: new Date(),
        })
        .where(eq(clawExecutions.id, executionId))
        .run()

      // Remove child process from active triggers
      if (trigger) {
        trigger.childProcess = undefined
      }

      this.sendNotification(claw.name, "failed")
    })
  }

  /**
   * Update execution logs in the database
   */
  private updateExecutionLogs(executionId: string, logs: string): void {
    const db = getDatabase()
    db.update(clawExecutions).set({ logs }).where(eq(clawExecutions.id, executionId)).run()
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
      .where(eq(clawExecutions.clawId, clawId))
      .where(eq(clawExecutions.status, "running"))
      .all()
  }
}

// Export singleton instance
export const clawDaemon = ClawDaemon.getInstance()
