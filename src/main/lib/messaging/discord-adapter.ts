/**
 * Discord Adapter - Simplified Discord integration
 *
 * Handles connection and messaging without Claws dependencies.
 * Messages are forwarded directly to connected chats.
 */

import { Client, GatewayIntentBits, Events, type Message, type TextChannel } from "discord.js"
import { EventEmitter } from "events"
import { getDatabase, chats, discordSettings } from "../db"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { incomingMessageEmitter } from "../messaging"

// Event emitters for UI
export const discordStatusEmitter = new EventEmitter()

// Singleton instance
let discordAdapterInstance: DiscordAdapter | null = null

export function getDiscordAdapter(): DiscordAdapter {
  if (!discordAdapterInstance) {
    discordAdapterInstance = new DiscordAdapter()
  }
  return discordAdapterInstance
}

export class DiscordAdapter {
  private client: Client | null = null
  private status: "disconnected" | "connecting" | "connected" | "error" = "disconnected"
  private botUserId: string | null = null

  isActive(): boolean {
    return this.status === "connected"
  }

  getStatus(): string {
    return this.status
  }

  /**
   * Start Discord connection if token exists
   */
  async startIfTokenExists(): Promise<void> {
    const token = await this.getDecryptedToken()
    if (token) {
      console.log("[DiscordAdapter] Token exists, auto-starting...")
      await this.start(token)
    }
  }

  async start(botToken?: string): Promise<void> {
    if (this.status === "connected" || this.status === "connecting") {
      console.log("[DiscordAdapter] Already running or connecting")
      return
    }

    this.status = "connecting"

    try {
      const token = botToken || await this.getDecryptedToken()
      if (!token) {
        console.log("[DiscordAdapter] No bot token configured")
        this.status = "disconnected"
        return
      }

      console.log("[DiscordAdapter] Starting bot...")

      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      })

      this.client.once(Events.ClientReady, (readyClient) => {
        this.status = "connected"
        this.botUserId = readyClient.user.id
        console.log(`[DiscordAdapter] Bot connected as ${readyClient.user.tag}`)
        this.updateConnectionStatus(true)
        discordStatusEmitter.emit("statusChange", { status: "connected", username: readyClient.user.tag })
      })

      this.client.on(Events.MessageCreate, async (message: Message) => {
        if (message.author.id === this.botUserId) return
        if (message.author.bot) return

        await this.handleMessage(message)
      })

      this.client.on(Events.Error, (error) => {
        console.error("[DiscordAdapter] Client error:", error)
        this.status = "error"
        discordStatusEmitter.emit("statusChange", { status: "error", error: error.message })
      })

      this.client.on(Events.ShardDisconnect, () => {
        console.log("[DiscordAdapter] Disconnected from Discord")
        this.status = "disconnected"
        discordStatusEmitter.emit("statusChange", { status: "disconnected" })
      })

      await this.client.login(token)
    } catch (error) {
      this.status = "error"
      console.error("[DiscordAdapter] Failed to start:", error)
      discordStatusEmitter.emit("statusChange", { status: "error", error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.status === "disconnected" && !this.client) return

    console.log("[DiscordAdapter] Stopping bot...")
    try {
      if (this.client) {
        this.client.destroy()
        this.client = null
      }
      this.botUserId = null
      this.status = "disconnected"
      await this.updateConnectionStatus(false)
      discordStatusEmitter.emit("statusChange", { status: "disconnected" })
    } catch (error) {
      console.error("[DiscordAdapter] Error stopping:", error)
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    const userText = message.content || ""
    const channelId = message.channelId
    const userId = message.author.id
    const guildId = message.guildId

    console.log(`[DiscordAdapter] Message from ${message.author.tag}: ${userText.substring(0, 100)}`)

    try {
      // Find chats connected to this Discord channel
      const db = getDatabase()
      const connectedChats = db
        .select()
        .from(chats)
        .where(eq(chats.connectionType, "discord"))
        .all()
        .filter(chat => chat.connectionTarget === channelId)

      if (connectedChats.length === 0) {
        console.log(`[DiscordAdapter] No connected chats for channel ${channelId}`)
        return
      }

      for (const chat of connectedChats) {
        incomingMessageEmitter.emit("message", {
          platform: "discord",
          chatId: chat.id,
          sender: message.author.tag,
          text: userText,
          timestamp: Date.now(),
          messageId: message.id,
          metadata: { channelId, userId, guildId },
        })
      }
    } catch (error) {
      console.error("[DiscordAdapter] Error handling message:", error)
    }
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    if (!this.client) {
      console.error("[DiscordAdapter] Client not available")
      return
    }

    try {
      const channel = await this.client.channels.fetch(channelId)
      if (channel && channel.isTextBased() && "send" in channel) {
        // Discord has 2000 character limit per message
        if (text.length > 2000) {
          const chunks = text.match(/[\s\S]{1,1990}/g) || []
          for (const chunk of chunks) {
            await (channel as TextChannel).send(chunk)
          }
        } else {
          await (channel as TextChannel).send(text)
        }
      }
    } catch (error) {
      console.error("[DiscordAdapter] Failed to send message:", error)
    }
  }

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

  async getGuilds(): Promise<Array<{ id: string; name: string }>> {
    if (!this.client) {
      const token = await this.getDecryptedToken()
      if (!token) return []

      const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] })
      try {
        await tempClient.login(token)
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

  async getChannels(guildId: string): Promise<Array<{ id: string; name: string; type: number }>> {
    if (!this.client) return []

    try {
      const guild = await this.client.guilds.fetch(guildId)
      const channels = await guild.channels.fetch()
      return channels
        .filter(ch => ch !== null && ch.isTextBased() && "name" in ch)
        .map(ch => ({ id: ch!.id, name: (ch as any).name, type: (ch as any).type }))
    } catch (error) {
      console.error("[DiscordAdapter] Failed to fetch channels:", error)
      return []
    }
  }

  private async getDecryptedToken(): Promise<string | null> {
    const db = getDatabase()
    const settings = db.select().from(discordSettings).where(eq(discordSettings.id, "default")).get()

    if (!settings?.encryptedBotToken) return null

    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return Buffer.from(settings.encryptedBotToken, "base64").toString("utf-8")
      }
      const buffer = Buffer.from(settings.encryptedBotToken, "base64")
      return safeStorage.decryptString(buffer)
    } catch (error) {
      console.error("[DiscordAdapter] Failed to decrypt token:", error)
      return null
    }
  }

  private async updateConnectionStatus(connected: boolean): Promise<void> {
    const db = getDatabase()
    db.update(discordSettings)
      .set({ isConnected: connected, updatedAt: new Date() })
      .where(eq(discordSettings.id, "default"))
      .run()
  }

  async testConnection(): Promise<{ success: boolean; username?: string; guildCount?: number; error?: string }> {
    try {
      const token = await this.getDecryptedToken()
      if (!token) {
        return { success: false, error: "No bot token configured" }
      }

      const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] })
      try {
        await tempClient.login(token)
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

  async saveCredentials(encryptedToken: string): Promise<void> {
    const db = getDatabase()
    const existing = db.select().from(discordSettings).where(eq(discordSettings.id, "default")).get()

    if (existing) {
      db.update(discordSettings)
        .set({ encryptedBotToken: encryptedToken, updatedAt: new Date() })
        .where(eq(discordSettings.id, "default"))
        .run()
    } else {
      db.insert(discordSettings).values({
        id: "default",
        encryptedBotToken: encryptedToken,
        updatedAt: new Date(),
      }).run()
    }
  }

  async clearCredentials(): Promise<void> {
    const db = getDatabase()
    db.update(discordSettings)
      .set({ encryptedBotToken: null, isConnected: false, updatedAt: new Date() })
      .where(eq(discordSettings.id, "default"))
      .run()
  }
}

export type { DiscordAdapter }
