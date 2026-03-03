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
import { clawDaemon, getOrCreateSession, updateSessionStatus, addMessageToSession } from "./index"

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
  // Cache: channelId -> channelName, to avoid repeated API calls for name-based filters
  private channelNameCache: Map<string, string> = new Map()

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
        // Parse trigger config for channel filter (required)
        const config = JSON.parse(claw.triggerConfig || "{}")
        const channelFilter = config.slackChannelFilter

        // Claws without a channel filter are skipped — responding to all channels is not allowed
        if (!channelFilter) {
          console.log(`[SlackTrigger] Claw ${claw.name} has no channel filter — skipping`)
          continue
        }

        const matches = await this.resolveChannelFilter(channelId, channelFilter)
        if (!matches) {
          console.log(`[SlackTrigger] Channel ${channelId} doesn't match filter ${channelFilter}`)
          continue
        }

        // Get or create session for this thread (use thread if available, otherwise channel)
        const externalId = threadTs || channelId
        const session = await getOrCreateSession(claw.id, externalId, "slack", {
          metadata: { channel: channelId, user: userId, threadTs },
        })

        // Check if there's already an active execution for this session
        if (session.status === "active") {
          console.log(`[SlackTrigger] Session ${session.id} already has an active execution, skipping`)
          await this.postMessage(channelId, `⏳ *${claw.name}* is still processing your previous request. Please wait for it to complete.`, threadTs)
          continue
        }

        // Send acknowledgment
        await this.postMessage(channelId, `🤖 *${claw.name}* is working on it...`, threadTs)

        // Update session with user message
        await addMessageToSession(session.id, "user", userText)
        await updateSessionStatus(session.id, "active")

        // Execute the claw with Slack context
        const executionId = await clawDaemon.executeClaw(claw.id, {
          slackChannel: channelId,
          slackUser: userId,
          slackThreadTs: threadTs,
          originalMessage: userText,
          triggerSource: "slack",
          sessionId: session.id, // Pass session ID for persistence
        })

        // Monitor execution and post result
        this.monitorExecution(executionId, claw.name, channelId, threadTs, session.id)
      }
    } catch (error) {
      console.error("[SlackTrigger] Error handling message:", error)
      await this.postMessage(channelId, "❌ Error processing your request. Please try again.", threadTs)
    }
  }

  /**
   * Resolve whether an incoming channelId matches a stored filter.
   *
   * Filters stored as Slack channel IDs (all-caps alphanumeric, e.g. C08ABC123)
   * are compared directly — fast and always reliable.
   *
   * Filters stored as names (#general or general) require resolving the incoming
   * channel's name via conversations.info, cached to avoid repeated API calls.
   */
  private async resolveChannelFilter(channelId: string, filter: string): Promise<boolean> {
    // Channel IDs are all uppercase alphanumeric (C..., G..., D...)
    if (/^[A-Z0-9]+$/.test(filter)) {
      return channelId === filter
    }

    // Name-based filter — look up the channel's actual name
    const normalizedFilter = filter.startsWith("#") ? filter.slice(1) : filter

    if (!this.channelNameCache.has(channelId)) {
      try {
        const result = await this.webClient!.conversations.info({ channel: channelId })
        const name = (result.channel as any)?.name ?? ""
        this.channelNameCache.set(channelId, name)
      } catch (err) {
        console.error("[SlackTrigger] Failed to resolve channel name for filter comparison:", err)
        return false
      }
    }

    return this.channelNameCache.get(channelId) === normalizedFilter
  }

  /**
   * List all channels the bot is currently a member of.
   * Falls back to creating a temporary WebClient from stored tokens if Socket Mode isn't running.
   */
  async listBotChannels(): Promise<Array<{ id: string; name: string }>> {
    const tokens = await this.getDecryptedTokens()
    if (!tokens.botToken) return []

    const client = this.webClient ?? new WebClient(tokens.botToken)
    try {
      const result = await client.users.conversations({
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 200,
      })
      return (result.channels ?? [])
        .filter((c: any) => c.id && c.name)
        .map((c: any) => ({ id: c.id as string, name: c.name as string }))
    } catch (err) {
      console.error("[SlackTrigger] Failed to list bot channels:", err)
      return []
    }
  }

  /**
   * Create a dedicated private Slack channel, invite the bot and an optional user, and post a welcome message.
   * Returns the resolved channelId and channelName for the caller to persist.
   *
   * @param inviteUserIdOrEmail  Slack user ID (U...) or email address to add to the channel.
   *                             Email lookup requires the `users:read.email` scope on the bot token.
   */
  async setupDedicatedChannel(channelName: string, inviteUserIdOrEmail?: string): Promise<{
    channelId: string
    channelName: string
    alreadyExisted: boolean
    invitedUserId?: string
    inviteWarning?: string
  }> {
    const tokens = await this.getDecryptedTokens()
    if (!tokens.botToken) throw new Error("No bot token configured")

    const client = this.webClient ?? new WebClient(tokens.botToken)
    const cleanName = channelName.toLowerCase().replace(/^#/, "").replace(/\s+/g, "-")

    let channelId: string
    let resolvedName: string
    let alreadyExisted = false

    try {
      const result = await client.conversations.create({ name: cleanName, is_private: true })
      channelId = result.channel!.id!
      resolvedName = result.channel!.name!
    } catch (err: any) {
      const slackErr = err?.data?.error
      if (slackErr === "name_taken") {
        // Find the existing channel by listing and matching name
        const list = await client.conversations.list({ types: "private_channel", limit: 1000, exclude_archived: true })
        const existing = list.channels?.find((c: any) => c.name === cleanName)
        if (!existing?.id) throw new Error(`Channel #${cleanName} already exists but could not be found in the list`)
        channelId = existing.id
        resolvedName = existing.name
        alreadyExisted = true
      } else if (slackErr === "missing_scope") {
        throw new Error(
          "Bot needs the 'groups:write' scope to create private channels. " +
          "Add it in your Slack app's OAuth & Permissions page, then reinstall the app to your workspace."
        )
      } else {
        throw err
      }
    }

    // Get bot's own user ID and invite it to the channel
    const auth = await client.auth.test()
    const botUserId = auth.user_id!
    try {
      await client.conversations.invite({ channel: channelId, users: botUserId })
    } catch (err: any) {
      if (err?.data?.error !== "already_in_channel") throw err
    }

    // Resolve and invite the requesting user if provided
    let invitedUserId: string | undefined
    let inviteWarning: string | undefined

    if (inviteUserIdOrEmail) {
      try {
        if (inviteUserIdOrEmail.includes("@")) {
          // Email → look up user ID
          const lookup = await client.users.lookupByEmail({ email: inviteUserIdOrEmail })
          invitedUserId = lookup.user?.id
          if (!invitedUserId) throw new Error("User not found for email: " + inviteUserIdOrEmail)
        } else {
          invitedUserId = inviteUserIdOrEmail.trim()
        }

        await client.conversations.invite({ channel: channelId, users: invitedUserId })
      } catch (err: any) {
        const slackErr = err?.data?.error
        if (slackErr === "already_in_channel") {
          // Fine — they're already there
        } else if (slackErr === "users_not_found") {
          inviteWarning = `Could not find Slack user "${inviteUserIdOrEmail}". Check the ID or email and add them manually.`
        } else if (slackErr === "missing_scope") {
          inviteWarning = "Bot needs 'users:read.email' scope to look up users by email. Add the user manually or use their Slack user ID instead."
        } else {
          inviteWarning = `Could not invite user: ${err?.message ?? slackErr}`
        }
      }
    }

    // Cache the resolved name
    this.channelNameCache.set(channelId, resolvedName)

    // Post a welcome message
    await client.chat.postMessage({
      channel: channelId,
      text: `👋 I'm your Claw AI assistant. Mention me or send a message here to trigger the claw for this channel.`,
    })

    return { channelId, channelName: resolvedName, alreadyExisted, invitedUserId, inviteWarning }
  }

  /**
   * Send a message to a Slack channel (public — used for chat connection bridging)
   */
  async sendToChannel(channelId: string, text: string): Promise<void> {
    await this.postMessage(channelId, text)
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
  private monitorExecution(executionId: string, clawName: string, channelId: string, threadTs?: string, sessionId?: string): void {
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

        // Update session status if provided
        if (sessionId) {
          const sessionStatus = execution.status === "success" ? "completed" : "error"
          await updateSessionStatus(sessionId, sessionStatus)
        }

        // Limit logs to last 2000 characters to avoid message size limits
        const logs = execution.logs || ""
        const truncatedLogs = logs.length > 2000 ? "..." + logs.slice(-2000) : logs

        // Format the response
        const statusEmoji = execution.status === "success" ? "✅" : "❌"
        const statusText = execution.status === "success" ? "completed successfully" : `failed (exit code ${execution.exitCode})`

        const message = `${statusEmoji} *${clawName}* ${statusText}\n\n\`\`\`${truncatedLogs}\`\`\``

        await this.postMessage(channelId, message, threadTs)

        // Add response to session history
        if (sessionId) {
          await addMessageToSession(sessionId, "assistant", `${clawName} ${statusText}\n\n${truncatedLogs}`)
        }
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
