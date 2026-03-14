import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, whatsappSettings, whatsappBridges, clawExecutions } from "../../db"
import { eq, and } from "drizzle-orm"
import { getWhatsAppTrigger, whatsAppQREmitter, whatsAppStatusEmitter, whatsAppBridgeEmitter, type WhatsAppBridgeMessage } from "../../claws/whatsapp-trigger"
import { getQueueStatus, processPendingQueue, cleanupStaleExecutions } from "../../claws/whatsapp-queue"
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
    let settings = db.select().from(whatsappSettings).where(eq(whatsappSettings.id, "default")).get()

    // Insert default row if it doesn't exist
    if (!settings) {
      console.log("[WhatsAppRouter] Inserting default whatsapp_settings row")
      db.insert(whatsappSettings).values({ id: "default", isConnected: false }).run()
      settings = db.select().from(whatsappSettings).where(eq(whatsappSettings.id, "default")).get()
    }

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
   * Send a message to a WhatsApp group JID (used for chat connection bridging)
   */
  sendToGroup: publicProcedure
    .input(z.object({ jid: z.string().min(1), text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const trigger = getWhatsAppTrigger()
        const success = await trigger.sendMessage(input.jid, input.text)
        return { success }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
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

  /**
   * Get WhatsApp bridges for a chat
   */
  getBridges: publicProcedure
    .input(z.object({ chatId: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const db = getDatabase()
        const bridges = db
          .select()
          .from(whatsappBridges)
          .where(eq(whatsappBridges.chatId, input.chatId))
          .all()
        return {
          success: true,
          bridges,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Create a WhatsApp bridge for a chat
   */
  createBridge: publicProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        subChatId: z.string().min(1),
        whatsappJid: z.string().min(1),
        whatsappGroupName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = getDatabase()

        // Check if bridge already exists
        const existing = db
          .select()
          .from(whatsappBridges)
          .where(
            and(
              eq(whatsappBridges.chatId, input.chatId),
              eq(whatsappBridges.whatsappJid, input.whatsappJid)
            )
          )
          .get()

        if (existing) {
          return {
            success: false,
            error: "Bridge already exists for this chat and WhatsApp group",
          }
        }

        const bridge = db
          .insert(whatsappBridges)
          .values({
            chatId: input.chatId,
            subChatId: input.subChatId,
            whatsappJid: input.whatsappJid,
            whatsappGroupName: input.whatsappGroupName,
            isActive: true,
          })
          .returning()
          .get()

        return {
          success: true,
          bridge,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Delete a WhatsApp bridge
   */
  deleteBridge: publicProcedure
    .input(z.object({ bridgeId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const db = getDatabase()
        db.delete(whatsappBridges).where(eq(whatsappBridges.id, input.bridgeId)).run()
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
   * Toggle bridge active status
   */
  toggleBridge: publicProcedure
    .input(z.object({ bridgeId: z.string().min(1), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      try {
        const db = getDatabase()
        db
          .update(whatsappBridges)
          .set({ isActive: input.isActive, updatedAt: new Date() })
          .where(eq(whatsappBridges.id, input.bridgeId))
          .run()
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
   * Subscribe to WhatsApp bridge messages
   * Emits messages from bridged WhatsApp groups to the chat UI
   */
  onBridgeMessage: publicProcedure.subscription(() => {
    return observable<WhatsAppBridgeMessage>((emit) => {
      const handler = (message: WhatsAppBridgeMessage) => {
        emit.next(message)
      }

      whatsAppBridgeEmitter.on("message", handler)

      // Cleanup when subscription ends
      return () => {
        whatsAppBridgeEmitter.off("message", handler)
      }
    })
  }),

  /**
   * Get WhatsApp queue status (DB-backed)
   */
  getQueueStatus: publicProcedure.query(async () => {
    return getQueueStatus()
  }),

  /**
   * Get pending executions from database
   */
  getQueueItems: publicProcedure
    .input(z.object({ clawId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDatabase()
      const where = input?.clawId ? eq(clawExecutions.clawId, input.clawId) : undefined
      const executions = db
        .select()
        .from(clawExecutions)
        .where(where)
        .orderBy(desc(clawExecutions.startedAt))
        .limit(50)
        .all()
      return executions
    }),

  /**
   * Get all claw IDs with pending executions
   */
  getClawIds: publicProcedure.query(async () => {
    const db = getDatabase()
    const result = db
      .select({ clawId: clawExecutions.clawId })
      .from(clawExecutions)
      .where(eq(clawExecutions.status, "pending"))
      .groupBy(clawExecutions.clawId)
      .all()
    return result.map(r => r.clawId).filter(Boolean) as string[]
  }),

  /**
   * Pause queue processing
   */
  pauseQueue: publicProcedure.mutation(async () => {
    // For DB-backed queue, just clear pending executions
    const db = getDatabase()
    db.update(clawExecutions)
      .set({ status: "failed", logs: "Paused by user", completedAt: new Date() })
      .where(eq(clawExecutions.status, "pending"))
      .run()
    return { success: true }
  }),

  /**
   * Resume queue processing - triggers immediate processing
   */
  resumeQueue: publicProcedure.mutation(async () => {
    await processPendingQueue()
    return { success: true }
  }),

  /**
   * Clear all pending queue items
   */
  clearQueue: publicProcedure
    .input(z.object({ clawId: z.string().optional() }).optional())
    .mutation(async ({ input }) => {
      const db = getDatabase()
      if (input?.clawId) {
        db.delete(clawExecutions)
          .where(and(eq(clawExecutions.clawId, input.clawId), eq(clawExecutions.status, "pending")))
          .run()
      } else {
        db.delete(clawExecutions)
          .where(eq(clawExecutions.status, "pending"))
          .run()
      }
      return { success: true }
  }),

  /**
   * Clear stuck running executions (older than 10 minutes)
   */
  clearStuckQueue: publicProcedure.mutation(async () => {
    const cleaned = await cleanupStaleExecutions()
    return { success: true, cleaned }
  }),

  /**
   * Subscribe to queue status updates
   */
  onQueueUpdate: publicProcedure.subscription(() => {
    return observable<{ pending: number; running: number; recentExecutions: any[] }>((emit) => {
      const emitUpdate = () => {
        emit.next(getQueueStatus())
      }

      // Emit every 3 seconds
      const interval = setInterval(emitUpdate, 3000)

      // Cleanup
      return () => {
        clearInterval(interval)
      }
    })
  }),
})
