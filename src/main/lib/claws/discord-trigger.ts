/**
 * DiscordTrigger - Discord bot integration for Claw
 *
 * Uses discord.js to receive messages via Gateway (WebSocket) and send messages via REST API.
 * Handles channel messages to trigger claws, following the same singleton pattern as SlackTrigger.
 */

import { Client, GatewayIntentBits, Events, type Message, type TextChannel } from "discord.js"
import { getDatabase, headlessClaws, discordSettings, clawExecutions } from "../db"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { clawDaemon, getOrCreateSession, updateSessionStatus, addMessageToSession } from "./index"

// Singleton instance
let discordTriggerInstance: DiscordTrigger | null = null

/**
 * Get the DiscordTrigger singleton instance
 */
export function getDiscordTrigger(): DiscordTrigger {
  if (!discordTriggerInstance) {
    discordTriggerInstance = new DiscordTrigger()
  }
  return discordTriggerInstance
}

/**
 * Destroy the DiscordTrigger instance (for testing/cleanup)
 */
export function destroyDiscordTrigger(): void {
  if (discordTriggerInstance) {
    discordTriggerInstance.stop().catch(console.error)
    discordTriggerInstance = null
  }
}

export class DiscordTrigger {
  private client: Client | null = null
  private status: "disconnected" | "connecting" | "connected" | "error" = "disconnected"
  private botUserId: string | null = null

  /**
   * Check if the bot is connected
   */
  isActive(): boolean {
    return this.status === "connected"
  }

  /**
   * Get current connection status
   */
  getStatus(): string {
    return this.status
  }

  /**
   * Start the Discord bot connection
   */
  async start(botToken?: string): Promise<void> {
    if (this.status === "connected" || this.status === "connecting") {
      console.log("[DiscordTrigger] Already running or connecting")
      return
    }

    this.status = "connecting"

    try {
      const token = botToken || await this.getDecryptedToken()
      if (!token) {
        console.log("[DiscordTrigger] No bot token configured, skipping start")
        this.status = "disconnected"
        return
      }

      console.log("[DiscordTrigger] Starting bot...")

      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      })

      // Handle ready
      this.client.once(Events.ClientReady, (readyClient) => {
        this.status = "connected"
        this.botUserId = readyClient.user.id
        console.log(`[DiscordTrigger] Bot connected as ${readyClient.user.tag}`)
        this.updateConnectionStatus(true)
      })

      // Handle messages
      this.client.on(Events.MessageCreate, async (message: Message) => {
        // Ignore bot's own messages
        if (message.author.id === this.botUserId) return
        // Ignore other bot messages
        if (message.author.bot) return

        await this.handleMessage(message)
      })

      // Handle errors
      this.client.on(Events.Error, (error) => {
        console.error("[DiscordTrigger] Client error:", error)
        this.status = "error"
      })

      // Handle disconnect
      this.client.on(Events.ShardDisconnect, () => {
        console.log("[DiscordTrigger] Disconnected from Discord")
        this.status = "disconnected"
      })

      await this.client.login(token)
    } catch (error) {
      this.status = "error"
      console.error("[DiscordTrigger] Failed to start:", error)
      throw error
    }
  }

  /**
   * Stop the Discord bot connection
   */
  async stop(): Promise<void> {
    if (this.status === "disconnected" && !this.client) {
      return
    }

    console.log("[DiscordTrigger] Stopping bot...")

    try {
      if (this.client) {
        this.client.destroy()
        this.client = null
      }
      this.botUserId = null
      this.status = "disconnected"

      await this.updateConnectionStatus(false)

      console.log("[DiscordTrigger] Bot stopped")
    } catch (error) {
      console.error("[DiscordTrigger] Error stopping:", error)
      throw error
    }
  }

  /**
   * Handle incoming Discord messages
   */
  private async handleMessage(message: Message): Promise<void> {
    const userText = message.content || ""
    const channelId = message.channelId
    const userId = message.author.id
    const guildId = message.guildId

    console.log(`[DiscordTrigger] Received message from ${message.author.tag}: ${userText.substring(0, 100)}`)

    try {
      // Find all claws configured for Discord trigger
      const db = getDatabase()
      const claws = db
        .select()
        .from(headlessClaws)
        .where(eq(headlessClaws.triggerType, "discord_message"))
        .all()
        .filter(claw => claw.isEnabled)

      if (claws.length === 0) {
        return
      }

      for (const claw of claws) {
        // Parse trigger config for channel filter
        const config = JSON.parse(claw.triggerConfig || "{}")
        const channelFilter = config.discordChannelFilter

        // Claws without a channel filter are skipped
        if (!channelFilter) {
          console.log(`[DiscordTrigger] Claw ${claw.name} has no channel filter — skipping`)
          continue
        }

        // Direct channel ID comparison
        if (channelId !== channelFilter) {
          continue
        }

        // Get or create session for this channel
        const session = await getOrCreateSession(claw.id, channelId, "discord", {
          metadata: { channel: channelId, user: userId, guild: guildId },
        })

        // Check if there's already an active execution for this session
        if (session.status === "active") {
          console.log(`[DiscordTrigger] Session ${session.id} already has an active execution, skipping`)
          await this.sendMessage(channelId, `⏳ **${claw.name}** is still processing your previous request. Please wait for it to complete.`)
          continue
        }

        // Send acknowledgment
        await this.sendMessage(channelId, `🤖 **${claw.name}** is working on it...`)

        // Update session with user message
        await addMessageToSession(session.id, "user", userText)
        await updateSessionStatus(session.id, "active")

        // Execute the claw with Discord context
        const executionId = await clawDaemon.executeClaw(claw.id, {
          originalMessage: userText,
          triggerSource: "discord" as any,
          sessionId: session.id,
        })

        // Monitor execution and post result
        this.monitorExecution(executionId, claw.name, channelId, session.id)
      }
    } catch (error) {
      console.error("[DiscordTrigger] Error handling message:", error)
      await this.sendMessage(channelId, "❌ Error processing your request. Please try again.")
    }
  }

  /**
   * Send a message to a Discord channel
   */
  async sendMessage(channelId: string, text: string): Promise<void> {
    if (!this.client) {
      console.error("[DiscordTrigger] Client not available")
      return
    }

    try {
      const channel = await this.client.channels.fetch(channelId)
      if (channel && channel.isTextBased() && "send" in channel) {
        // Discord has a 2000 character limit per message
        if (text.length > 2000) {
          // Split into chunks
          const chunks = text.match(/[\s\S]{1,1990}/g) || []
          for (const chunk of chunks) {
            await (channel as TextChannel).send(chunk)
          }
        } else {
          await (channel as TextChannel).send(text)
        }
      }
    } catch (error) {
      console.error("[DiscordTrigger] Failed to send message:", error)
    }
  }

  /**
   * Create a text channel in a guild
   */
  async createChannel(guildId: string, name: string): Promise<{ id: string; name: string }> {
    if (!this.client) {
      throw new Error("Discord client not available")
    }

    const guild = await this.client.guilds.fetch(guildId)
    const channel = await guild.channels.create({
      name: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      type: 0, // GuildText
    })

    return { id: channel.id, name: channel.name }
  }

  /**
   * Get all guilds the bot is in
   */
  async getGuilds(): Promise<Array<{ id: string; name: string }>> {
    if (!this.client) {
      // Try using a temporary client with stored token
      const token = await this.getDecryptedToken()
      if (!token) return []

      const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] })
      try {
        await tempClient.login(token)
        // Wait a moment for guilds to be cached
        await new Promise(resolve => setTimeout(resolve, 2000))
        const guilds = tempClient.guilds.cache.map(g => ({ id: g.id, name: g.name }))
        tempClient.destroy()
        return guilds
      } catch {
        tempClient.destroy()
        return []
      }
    }

    return this.client.guilds.cache.map(g => ({ id: g.id, name: g.name }))
  }

  /**
   * Get text channels in a guild
   */
  async getChannels(guildId: string): Promise<Array<{ id: string; name: string; type: number }>> {
    if (!this.client) {
      return []
    }

    try {
      const guild = await this.client.guilds.fetch(guildId)
      const channels = await guild.channels.fetch()
      return channels
        .filter(ch => ch !== null && ch.isTextBased() && "name" in ch)
        .map(ch => ({ id: ch!.id, name: (ch as any).name, type: (ch as any).type }))
    } catch (error) {
      console.error("[DiscordTrigger] Failed to fetch channels:", error)
      return []
    }
  }

  /**
   * Monitor a claw execution and post the result when complete
   */
  private monitorExecution(executionId: string, clawName: string, channelId: string, sessionId?: string): void {
    const checkInterval = setInterval(async () => {
      try {
        const db = getDatabase()
        const execution = db
          .select()
          .from(clawExecutions)
          .where(eq(clawExecutions.id, executionId))
          .get()

        if (!execution || execution.status === "running") {
          return
        }

        clearInterval(checkInterval)

        // Update session status if provided
        if (sessionId) {
          const sessionStatus = execution.status === "success" ? "completed" : "error"
          await updateSessionStatus(sessionId, sessionStatus)
        }

        // Limit logs to last 1800 characters (Discord has 2000 char limit)
        const logs = execution.logs || ""
        const truncatedLogs = logs.length > 1800 ? "..." + logs.slice(-1800) : logs

        const statusEmoji = execution.status === "success" ? "✅" : "❌"
        const statusText = execution.status === "success" ? "completed successfully" : `failed (exit code ${execution.exitCode})`

        const message = `${statusEmoji} **${clawName}** ${statusText}\n\n\`\`\`${truncatedLogs}\`\`\``
        await this.sendMessage(channelId, message)

        if (sessionId) {
          await addMessageToSession(sessionId, "assistant", `${clawName} ${statusText}\n\n${truncatedLogs}`)
        }
      } catch (error) {
        console.error("[DiscordTrigger] Error monitoring execution:", error)
        clearInterval(checkInterval)
      }
    }, 2000)

    // Stop checking after 10 minutes
    setTimeout(() => {
      clearInterval(checkInterval)
    }, 10 * 60 * 1000)
  }

  /**
   * Get decrypted bot token from the database
   */
  private async getDecryptedToken(): Promise<string | null> {
    const db = getDatabase()
    const settings = db.select().from(discordSettings).where(eq(discordSettings.id, "default")).get()

    if (!settings?.encryptedBotToken) {
      return null
    }

    return this.decryptText(settings.encryptedBotToken)
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
      console.error("[DiscordTrigger] Failed to decrypt text:", error)
      return null
    }
  }

  /**
   * Update the connection status in the database
   */
  private async updateConnectionStatus(connected: boolean): Promise<void> {
    const db = getDatabase()
    db.update(discordSettings)
      .set({ isConnected: connected, updatedAt: new Date() })
      .where(eq(discordSettings.id, "default"))
      .run()
  }

  /**
   * Test the Discord bot connection
   */
  async testConnection(): Promise<{ success: boolean; username?: string; guildCount?: number; error?: string }> {
    try {
      const token = await this.getDecryptedToken()
      if (!token) {
        return { success: false, error: "No bot token configured" }
      }

      const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] })
      try {
        await tempClient.login(token)
        // Wait for ready event
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000)
          tempClient.once(Events.ClientReady, () => {
            clearTimeout(timeout)
            resolve()
          })
        })

        const username = tempClient.user?.tag || "Unknown"
        const guildCount = tempClient.guilds.cache.size

        tempClient.destroy()

        return { success: true, username, guildCount }
      } catch (error) {
        tempClient.destroy()
        throw error
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
