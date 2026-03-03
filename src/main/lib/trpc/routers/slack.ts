import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, slackSettings, headlessClaws } from "../../db"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { getSlackTrigger } from "../../claws/slack-trigger"
import { clawDaemon } from "../../claws"
import { createId } from "../../db/utils"

/**
 * Encrypt text using Electron's safeStorage
 */
function encryptText(text: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[slack] Encryption not available, storing as base64")
    return Buffer.from(text).toString("base64")
  }
  return safeStorage.encryptString(text).toString("base64")
}

/**
 * Decrypt text using Electron's safeStorage
 */
function decryptText(encrypted: string): string | null {
  if (!encrypted) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    const buffer = Buffer.from(encrypted, "base64")
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error("[slack] Failed to decrypt text:", error)
    return null
  }
}

/**
 * Slack router for managing Slack integration
 */
export const slackRouter = router({
  /**
   * Check if Slack credentials are configured
   */
  hasCredentials: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(slackSettings).where(eq(slackSettings.id, "default")).get()

    return {
      hasAppToken: !!settings?.encryptedAppToken,
      hasBotToken: !!settings?.encryptedBotToken,
      isEnabled: settings?.isSocketModeEnabled ?? false,
    }
  }),

  /**
   * Save Slack credentials (encrypted)
   */
  saveCredentials: publicProcedure
    .input(
      z.object({
        appToken: z.string().min(1),
        botToken: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const encryptedApp = encryptText(input.appToken)
      const encryptedBot = encryptText(input.botToken)

      const existing = db.select().from(slackSettings).where(eq(slackSettings.id, "default")).get()

      if (existing) {
        db.update(slackSettings)
          .set({
            encryptedAppToken: encryptedApp,
            encryptedBotToken: encryptedBot,
            updatedAt: new Date(),
          })
          .where(eq(slackSettings.id, "default"))
          .run()
      } else {
        db.insert(slackSettings).values({
          id: "default",
          encryptedAppToken: encryptedApp,
          encryptedBotToken: encryptedBot,
          isSocketModeEnabled: false,
        }).run()
      }

      return { success: true }
    }),

  /**
   * Toggle Socket Mode on/off
   */
  toggleSocketMode: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const slackTrigger = getSlackTrigger()

      if (input.enabled) {
        await slackTrigger.start()
      } else {
        await slackTrigger.stop()
      }

      return { success: true, isEnabled: input.enabled }
    }),

  /**
   * Test Slack connection
   */
  testConnection: publicProcedure.query(async () => {
    const slackTrigger = getSlackTrigger()
    return slackTrigger.testConnection()
  }),

  /**
   * List all claws configured with a slack_mention trigger
   */
  listSlackClaws: publicProcedure.query(() => {
    const db = getDatabase()
    const claws = db
      .select()
      .from(headlessClaws)
      .where(eq(headlessClaws.triggerType, "slack_mention"))
      .all()
    return claws.map(c => {
      const config = (() => { try { return JSON.parse(c.triggerConfig || "{}") } catch { return {} } })()
      return { id: c.id, name: c.name, isEnabled: c.isEnabled, channelFilter: config.slackChannelFilter ?? null }
    })
  }),

  /**
   * One-shot setup: create a Slack channel, invite the bot, create a claw, enable Socket Mode.
   */
  setupChannelClaw: publicProcedure
    .input(z.object({
      channelName: z.string().min(1),
      projectPath: z.string().min(1),
      projectName: z.string().min(1),
      inviteUserIdOrEmail: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const slackTrigger = getSlackTrigger()

      // Create the channel and invite the bot via Slack API
      const { channelId, channelName, alreadyExisted } = await slackTrigger.setupDedicatedChannel(input.channelName, input.inviteUserIdOrEmail)

      // Check if a claw already exists for this channel
      const allSlackClaws = db.select().from(headlessClaws).where(eq(headlessClaws.triggerType, "slack_mention")).all()
      const existingClaw = allSlackClaws.find(c => {
        try { return JSON.parse(c.triggerConfig || "{}").slackChannelFilter === channelId } catch { return false }
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
          name: `Slack: #${channelName}`,
          instruction:
            `You are a helpful AI assistant responding to messages in the #${channelName} Slack channel. ` +
            `Help users with their questions and tasks related to the project at ${input.projectPath}.`,
          targetWorktree: input.projectPath,
          triggerType: "slack_mention",
          triggerConfig: JSON.stringify({ slackChannelFilter: channelId }),
          isEnabled: true,
        }).run()
      }

      // Enable Socket Mode if it isn't running yet
      if (!slackTrigger.isActive()) {
        await slackTrigger.start()
      }

      // Reload daemon so the new trigger is registered
      await clawDaemon.reload()

      return { channelId, channelName, clawId, alreadyExisted, clawAlreadyExisted }
    }),

  /**
   * List all channels the bot is a member of
   */
  listBotChannels: publicProcedure.query(async () => {
    const slackTrigger = getSlackTrigger()
    return slackTrigger.listBotChannels()
  }),

  /**
   * Create a dedicated Slack channel and invite the bot (without creating a claw)
   */
  createDedicatedChannel: publicProcedure
    .input(z.object({
      channelName: z.string().min(1),
      inviteUserIdOrEmail: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const slackTrigger = getSlackTrigger()
      return slackTrigger.setupDedicatedChannel(input.channelName, input.inviteUserIdOrEmail)
    }),

  /**
   * Send a message to a Slack channel (used for chat connection bridging)
   */
  sendToChannel: publicProcedure
    .input(z.object({ channelId: z.string().min(1), text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const trigger = getSlackTrigger()
        await trigger.sendToChannel(input.channelId, input.text)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Clear Slack credentials
   */
  clearCredentials: publicProcedure.mutation(async () => {
    const db = getDatabase()

    // Stop Socket Mode first
    const slackTrigger = getSlackTrigger()
    await slackTrigger.stop()

    // Clear credentials from database
    db.update(slackSettings)
      .set({
        encryptedAppToken: null,
        encryptedBotToken: null,
        isSocketModeEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(slackSettings.id, "default"))
      .run()

    return { success: true }
  }),
})
