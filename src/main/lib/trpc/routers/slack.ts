import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, slackSettings } from "../../db"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { getSlackTrigger } from "../../claws/slack-trigger"

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
