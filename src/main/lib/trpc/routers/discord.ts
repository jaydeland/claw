import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, discordSettings, headlessClaws } from "../../db"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { getDiscordTrigger } from "../../claws/discord-trigger"
import { clawDaemon } from "../../claws"
import { createId } from "../../db/utils"

/**
 * Encrypt text using Electron's safeStorage
 */
function encryptText(text: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[discord] Encryption not available, storing as base64")
    return Buffer.from(text).toString("base64")
  }
  return safeStorage.encryptString(text).toString("base64")
}

/**
 * Discord router for managing Discord integration
 */
export const discordRouter = router({
  /**
   * Check if Discord credentials are configured
   */
  hasCredentials: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(discordSettings).where(eq(discordSettings.id, "default")).get()

    return {
      hasBotToken: !!settings?.encryptedBotToken,
      isConnected: settings?.isConnected ?? false,
      guildId: settings?.guildId ?? null,
      guildName: settings?.guildName ?? null,
    }
  }),

  /**
   * Save Discord bot token (encrypted)
   */
  saveCredentials: publicProcedure
    .input(z.object({ botToken: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const encryptedToken = encryptText(input.botToken)

      const existing = db.select().from(discordSettings).where(eq(discordSettings.id, "default")).get()

      if (existing) {
        db.update(discordSettings)
          .set({
            encryptedBotToken: encryptedToken,
            updatedAt: new Date(),
          })
          .where(eq(discordSettings.id, "default"))
          .run()
      } else {
        db.insert(discordSettings).values({
          id: "default",
          encryptedBotToken: encryptedToken,
          isConnected: false,
        }).run()
      }

      return { success: true }
    }),

  /**
   * Clear Discord credentials
   */
  clearCredentials: publicProcedure.mutation(async () => {
    const db = getDatabase()

    // Stop bot first
    const discordTrigger = getDiscordTrigger()
    await discordTrigger.stop()

    db.update(discordSettings)
      .set({
        encryptedBotToken: null,
        guildId: null,
        guildName: null,
        isConnected: false,
        updatedAt: new Date(),
      })
      .where(eq(discordSettings.id, "default"))
      .run()

    return { success: true }
  }),

  /**
   * Test Discord bot connection
   */
  testConnection: publicProcedure.query(async () => {
    const discordTrigger = getDiscordTrigger()
    return discordTrigger.testConnection()
  }),

  /**
   * Connect the Discord bot
   */
  connect: publicProcedure.mutation(async () => {
    const discordTrigger = getDiscordTrigger()
    await discordTrigger.start()
    return { success: true }
  }),

  /**
   * Disconnect the Discord bot
   */
  disconnect: publicProcedure.mutation(async () => {
    const discordTrigger = getDiscordTrigger()
    await discordTrigger.stop()
    return { success: true }
  }),

  /**
   * Get connection status
   */
  getStatus: publicProcedure.query(() => {
    const discordTrigger = getDiscordTrigger()
    return {
      status: discordTrigger.getStatus(),
      isActive: discordTrigger.isActive(),
    }
  }),

  /**
   * List guilds the bot is in
   */
  listGuilds: publicProcedure.query(async () => {
    const discordTrigger = getDiscordTrigger()
    return discordTrigger.getGuilds()
  }),

  /**
   * Select a guild and save it to settings
   */
  selectGuild: publicProcedure
    .input(z.object({ guildId: z.string(), guildName: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      db.update(discordSettings)
        .set({
          guildId: input.guildId,
          guildName: input.guildName,
          updatedAt: new Date(),
        })
        .where(eq(discordSettings.id, "default"))
        .run()
      return { success: true }
    }),

  /**
   * List text channels in a guild
   */
  listChannels: publicProcedure
    .input(z.object({ guildId: z.string() }))
    .query(async ({ input }) => {
      const discordTrigger = getDiscordTrigger()
      return discordTrigger.getChannels(input.guildId)
    }),

  /**
   * One-shot setup: create a channel, create a claw, start bot
   */
  setupChannelClaw: publicProcedure
    .input(z.object({
      guildId: z.string().min(1),
      channelName: z.string().min(1),
      projectPath: z.string().min(1),
      projectName: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const discordTrigger = getDiscordTrigger()

      // Create the channel
      const { id: channelId, name: channelName } = await discordTrigger.createChannel(input.guildId, input.channelName)

      // Check if a claw already exists for this channel
      const allDiscordClaws = db.select().from(headlessClaws).where(eq(headlessClaws.triggerType, "discord_message")).all()
      const existingClaw = allDiscordClaws.find(c => {
        try { return JSON.parse(c.triggerConfig || "{}").discordChannelFilter === channelId } catch { return false }
      })

      let clawId: string
      let clawAlreadyExisted = false
      if (existingClaw) {
        clawId = existingClaw.id
        clawAlreadyExisted = true
      } else {
        clawId = createId()
        db.insert(headlessClaws).values({
          id: clawId,
          name: `Discord: #${channelName}`,
          purpose: `Respond to messages in #${channelName} Discord channel`,
          instruction:
            `You are a helpful AI assistant responding to messages in the #${channelName} Discord channel. ` +
            `Help users with their questions and tasks related to the project at ${input.projectPath}.`,
          targetWorktree: input.projectPath,
          triggerType: "discord_message",
          triggerConfig: JSON.stringify({ discordChannelFilter: channelId }),
          isEnabled: true,
        }).run()
      }

      // Ensure bot is running
      if (!discordTrigger.isActive()) {
        await discordTrigger.start()
      }

      // Reload daemon so the new trigger is registered
      await clawDaemon.reload()

      return { channelId, channelName, clawId, clawAlreadyExisted }
    }),

  /**
   * Send a message to a Discord channel (used for chat connection bridging)
   */
  sendToChannel: publicProcedure
    .input(z.object({ channelId: z.string().min(1), text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const trigger = getDiscordTrigger()
        await trigger.sendMessage(input.channelId, input.text)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * List all claws configured with a discord_message trigger
   */
  listDiscordClaws: publicProcedure.query(() => {
    const db = getDatabase()
    const claws = db
      .select()
      .from(headlessClaws)
      .where(eq(headlessClaws.triggerType, "discord_message"))
      .all()
    return claws.map(c => {
      const config = (() => { try { return JSON.parse(c.triggerConfig || "{}") } catch { return {} } })()
      return { id: c.id, name: c.name, isEnabled: c.isEnabled, channelFilter: config.discordChannelFilter ?? null }
    })
  }),
})
