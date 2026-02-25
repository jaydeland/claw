/**
 * SlackTrigger - Slack Socket Mode integration for Claw
 *
 * Uses Slack's Socket Mode (WebSocket) to receive events without public URLs.
 * Handles app mentions (@Claw) and direct messages to trigger claws.
 */

import { SocketModeClient } from "@slack/socket-mode"
import { WebClient } from "@slack/web-api"
import { getDatabase, headlessClaws, slackSettings, clawExecutions } from "../db"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { clawDaemon } from "./index"

// Singleton instance
let slackTriggerInstance: SlackTrigger | null = null

/**
 * Get the SlackTrigger singleton instance
 */
export function getSlackTrigger(): SlackTrigger {
  if (!slackTriggerInstance) {
    slackTriggerInstance = new SlackTrigger()
  }
  return slackTriggerInstance
}

/**
 * Destroy the SlackTrigger instance (for testing/cleanup)
 */
export function destroySlackTrigger(): void {
  if (slackTriggerInstance) {
    slackTriggerInstance.stop().catch(console.error)
    slackTriggerInstance = null
  }
}

export class SlackTrigger {
  private socketClient: SocketModeClient | null = null
  private webClient: WebClient | null = null
  private isRunning = false
  private isStarting = false

  /**
   * Check if Socket Mode is running
   */
  isActive(): boolean {
    return this.isRunning
  }

  /**
   * Start the Slack Socket Mode connection
   */
  async start(): Promise<void> {
    if (this.isRunning || this.isStarting) {
      console.log("[SlackTrigger] Already running or starting")
      return
    }

    this.isStarting = true

    try {
      const tokens = await this.getDecryptedTokens()

      if (!tokens.appToken || !tokens.botToken) {
        console.log("[SlackTrigger] No tokens configured, skipping start")
        this.isStarting = false
        return
      }

      console.log("[SlackTrigger] Starting Socket Mode...")

      this.socketClient = new SocketModeClient({ appToken: tokens.appToken })
      this.webClient = new WebClient(tokens.botToken)

      // Handle app mentions (@Claw)
      this.socketClient.on("app_mention", async ({ event, ack }) => {
        await ack()
        await this.handleMessage(event)
      })

      // Handle direct messages
      this.socketClient.on("message", async ({ event, ack }) => {
        await ack()
        // Only respond to direct messages (IM = instant message)
        if (event.channel_type === "im" && !event.bot_id) {
          await this.handleMessage(event)
        }
      })

      // Handle errors
      this.socketClient.on("error", (error) => {
        console.error("[SlackTrigger] Socket error:", error)
      })

      // Handle disconnect
      this.socketClient.on("disconnect", () => {
        console.log("[SlackTrigger] Disconnected from Slack")
        this.isRunning = false
      })

      await this.socketClient.start()
      this.isRunning = true
      this.isStarting = false

      // Update settings to reflect enabled state
      await this.updateConnectionStatus(true)

      console.log("[SlackTrigger] Socket Mode started successfully")
    } catch (error) {
      this.isStarting = false
      console.error("[SlackTrigger] Failed to start:", error)
      throw error
    }
  }

  /**
   * Stop the Slack Socket Mode connection
   */
  async stop(): Promise<void> {
    if (!this.isRunning && !this.socketClient) {
      return
    }

    console.log("[SlackTrigger] Stopping Socket Mode...")

    try {
      if (this.socketClient) {
        await this.socketClient.disconnect()
        this.socketClient = null
      }
      this.webClient = null
      this.isRunning = false

      // Update settings to reflect disabled state
      await this.updateConnectionStatus(false)

      console.log("[SlackTrigger] Socket Mode stopped")
    } catch (error) {
      console.error("[SlackTrigger] Error stopping:", error)
      throw error
    }
  }

  /**
   * Handle incoming Slack message events
   */
  private async handleMessage(event: any): Promise<void> {
    const userText = event.text || ""
    const channelId = event.channel
    const userId = event.user
    const threadTs = event.thread_ts || event.ts

    console.log(`[SlackTrigger] Received message from ${userId}: ${userText.substring(0, 100)}`)

    try {
      // Find all claws configured for Slack trigger
      const db = getDatabase()
      const claws = db
        .select()
        .from(headlessClaws)
        .where(eq(headlessClaws.triggerType, "slack_mention"))
        .all()
        .filter(claw => claw.isEnabled)

      if (claws.length === 0) {
        // No claws configured - send a helpful message
        await this.postMessage(channelId, "No Slack-triggered claws are configured. Create one in Claw settings!", threadTs)
        return
      }

      for (const claw of claws) {
        // Parse trigger config for channel filter (optional)
        const config = JSON.parse(claw.triggerConfig || "{}")
        const channelFilter = config.slackChannelFilter

        // If channel filter is set, check if this channel matches
        if (channelFilter && !this.matchesChannelFilter(channelId, channelFilter, event.channel_name)) {
          console.log(`[SlackTrigger] Channel ${channelId} doesn't match filter ${channelFilter}`)
          continue
        }

        // Send acknowledgment
        await this.postMessage(channelId, `🤖 *${claw.name}* is working on it...`, threadTs)

        // Execute the claw with Slack context
        const executionId = await clawDaemon.executeClaw(claw.id, {
          slackChannel: channelId,
          slackUser: userId,
          slackThreadTs: threadTs,
          originalMessage: userText,
          triggerSource: "slack",
        })

        // Monitor execution and post result
        this.monitorExecution(executionId, claw.name, channelId, threadTs)
      }
    } catch (error) {
      console.error("[SlackTrigger] Error handling message:", error)
      await this.postMessage(channelId, "❌ Error processing your request. Please try again.", threadTs)
    }
  }

  /**
   * Check if a channel matches the filter
   */
  private matchesChannelFilter(channelId: string, filter: string, channelName?: string): boolean {
    // Filter can be a channel ID (C...) or channel name (#general)
    const normalizedFilter = filter.startsWith("#") ? filter.slice(1) : filter
    const normalizedName = channelName?.startsWith("#") ? channelName.slice(1) : channelName

    return channelId === filter ||
           channelId === normalizedFilter ||
           normalizedName === normalizedFilter
  }

  /**
   * Post a message to a Slack channel
   */
  private async postMessage(channelId: string, text: string, threadTs?: string): Promise<void> {
    if (!this.webClient) {
      console.error("[SlackTrigger] Web client not available")
      return
    }

    try {
      await this.webClient.chat.postMessage({
        channel: channelId,
        text,
        thread_ts: threadTs,
        mrkdwn: true,
      })
    } catch (error) {
      console.error("[SlackTrigger] Failed to post message:", error)
    }
  }

  /**
   * Monitor a claw execution and post the result when complete
   */
  private monitorExecution(executionId: string, clawName: string, channelId: string, threadTs?: string): void {
    const checkInterval = setInterval(async () => {
      try {
        const db = getDatabase()
        const execution = db
          .select()
          .from(clawExecutions)
          .where(eq(clawExecutions.id, executionId))
          .get()

        if (!execution || execution.status === "running") {
          // Still running, check again later
          return
        }

        // Execution complete
        clearInterval(checkInterval)

        // Limit logs to last 2000 characters to avoid message size limits
        const logs = execution.logs || ""
        const truncatedLogs = logs.length > 2000 ? "..." + logs.slice(-2000) : logs

        // Format the response
        const statusEmoji = execution.status === "success" ? "✅" : "❌"
        const statusText = execution.status === "success" ? "completed successfully" : `failed (exit code ${execution.exitCode})`

        const message = `${statusEmoji} *${clawName}* ${statusText}\n\n\`\`\`${truncatedLogs}\`\`\``

        await this.postMessage(channelId, message, threadTs)
      } catch (error) {
        console.error("[SlackTrigger] Error monitoring execution:", error)
        clearInterval(checkInterval)
      }
    }, 2000) // Check every 2 seconds

    // Stop checking after 10 minutes (300 checks)
    setTimeout(() => {
      clearInterval(checkInterval)
    }, 10 * 60 * 1000)
  }

  /**
   * Get decrypted Slack tokens from the database
   */
  private async getDecryptedTokens(): Promise<{ appToken: string | null; botToken: string | null }> {
    const db = getDatabase()
    const settings = db.select().from(slackSettings).where(eq(slackSettings.id, "default")).get()

    if (!settings) {
      return { appToken: null, botToken: null }
    }

    const appToken = settings.encryptedAppToken ? this.decryptText(settings.encryptedAppToken) : null
    const botToken = settings.encryptedBotToken ? this.decryptText(settings.encryptedBotToken) : null

    return { appToken, botToken }
  }

  /**
   * Decrypt text using Electron's safeStorage
   */
  private decryptText(encrypted: string): string | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return Buffer.from(encrypted, "base64").toString("utf-8")
      }
      const buffer = Buffer.from(encrypted, "base64")
      return safeStorage.decryptString(buffer)
    } catch (error) {
      console.error("[SlackTrigger] Failed to decrypt text:", error)
      return null
    }
  }

  /**
   * Update the connection status in the database
   */
  private async updateConnectionStatus(enabled: boolean): Promise<void> {
    const db = getDatabase()
    db.update(slackSettings)
      .set({ isSocketModeEnabled: enabled, updatedAt: new Date() })
      .where(eq(slackSettings.id, "default"))
      .run()
  }

  /**
   * Test the Slack connection
   */
  async testConnection(): Promise<{ success: boolean; team?: string; error?: string }> {
    try {
      const tokens = await this.getDecryptedTokens()

      if (!tokens.botToken) {
        return { success: false, error: "No bot token configured" }
      }

      const client = new WebClient(tokens.botToken)
      const auth = await client.auth.test()

      return {
        success: true,
        team: auth.team || undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
