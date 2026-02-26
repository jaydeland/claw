import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, whatsappSettings } from "../../db"
import { eq } from "drizzle-orm"
import { getWhatsAppTrigger, whatsAppQREmitter, whatsAppStatusEmitter } from "../../claws/whatsapp-trigger"
import { observable } from "@trpc/server/observable"

/**
 * WhatsApp router for managing WhatsApp integration
 */
export const whatsappRouter = router({
  /**
   * Get WhatsApp connection status
   * Also checks actual socket state for more accurate status
   */
  getStatus: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(whatsappSettings).where(eq(whatsappSettings.id, "default")).get()

    const trigger = getWhatsAppTrigger()
    const isActive = trigger.isActive()

    // If socket reports active but DB doesn't, update DB to match reality
    const isConnected = isActive || (settings?.isConnected ?? false)

    if (isActive && !settings?.isConnected) {
      // Socket is connected but DB says disconnected - sync DB
      console.log("[WhatsAppRouter] Syncing DB status to connected")
      db.update(whatsappSettings)
        .set({ isConnected: true, updatedAt: new Date() })
        .where(eq(whatsappSettings.id, "default"))
        .run()
    }

    return {
      isConnected,
      isActive,
    }
  }),

  /**
   * Connect to WhatsApp (generates QR code)
   */
  connect: publicProcedure.mutation(async () => {
    try {
      const trigger = getWhatsAppTrigger()
      await trigger.start()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }),

  /**
   * Disconnect from WhatsApp (keep session)
   */
  disconnect: publicProcedure.mutation(async () => {
    try {
      const trigger = getWhatsAppTrigger()
      await trigger.stop()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }),

  /**
   * Logout and clear session
   */
  logout: publicProcedure.mutation(async () => {
    try {
      const trigger = getWhatsAppTrigger()
      await trigger.logout()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }),

  /**
   * Subscribe to QR code updates
   * This is a tRPC subscription that emits QR codes when generated
   */
  onQRCode: publicProcedure.subscription(() => {
    return observable<string | null>((emit) => {
      const handler = (qr: string | null) => {
        emit.next(qr)
      }

      whatsAppQREmitter.on("qr", handler)

      // Cleanup when subscription ends
      return () => {
        whatsAppQREmitter.off("qr", handler)
      }
    })
  }),

  /**
   * Subscribe to connection status changes
   * Emits when WhatsApp connection status changes
   */
  onStatusChange: publicProcedure.subscription(() => {
    return observable<{ isConnected: boolean }>((emit) => {
      const handler = (status: { isConnected: boolean }) => {
        emit.next(status)
      }

      whatsAppStatusEmitter.on("statusChange", handler)

      // Cleanup when subscription ends
      return () => {
        whatsAppStatusEmitter.off("statusChange", handler)
      }
    })
  }),

  /**
   * Create a WhatsApp group for Claw notifications
   * Returns the group ID that can be used in claw configuration
   */
  createGroup: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const trigger = getWhatsAppTrigger()
        const result = await trigger.createGroup(input.name, input.description)
        return {
          success: true,
          groupId: result.groupId,
          inviteUrl: result.inviteUrl,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Get the user's own WhatsApp JID (phone number)
   * Useful for configuring claws to message yourself for testing
   */
  getOwnJid: publicProcedure.query(async () => {
    try {
      const trigger = getWhatsAppTrigger()
      const jid = await trigger.getOwnJid()
      return {
        success: true,
        jid,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }),

  /**
   * Send a test message to a chat/group
   */
  sendTestMessage: publicProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const trigger = getWhatsAppTrigger()
        await trigger.sendTestMessage(input.chatId)
        return {
          success: true,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Get list of groups the user is participating in
   */
  getGroups: publicProcedure.query(async () => {
    try {
      const trigger = getWhatsAppTrigger()
      const groups = await trigger.getGroups()
      return {
        success: true,
        groups,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }),
})
