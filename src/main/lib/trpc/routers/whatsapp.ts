/**
 * WhatsApp Router - Re-exports WhatsApp-related procedures from messaging router
 *
 * This router exists for backward compatibility with client code that expects
 * a separate "whatsapp" namespace rather than the consolidated "messaging" namespace.
 */

import { z } from "zod"
import { router, publicProcedure } from "../index"
import {
  getWhatsAppAdapter,
  whatsAppQREmitter,
  whatsAppStatusEmitter,
} from "../../messaging/whatsapp-adapter"
import { incomingMessageEmitter } from "../../messaging"
import { observable } from "@trpc/server/observable"
import { getDatabase, chats, subChats } from "../../db"
import { eq, and, desc } from "drizzle-orm"

// In-memory queue management for WhatsApp (simplified)
const messageQueue: Array<{
  id: string
  chatId: string
  clawId: string
  message: string
  status: "pending" | "sent" | "failed"
  createdAt: Date
}> = []

export const whatsappRouter = router({
  // Get WhatsApp connection status
  getStatus: publicProcedure.query(async () => {
    const adapter = getWhatsAppAdapter()
    return adapter.getStatus()
  }),

  // Connect WhatsApp
  connect: publicProcedure.mutation(async () => {
    const adapter = getWhatsAppAdapter()
    await adapter.start()
    return { success: true }
  }),

  // Disconnect WhatsApp
  disconnect: publicProcedure.mutation(async () => {
    const adapter = getWhatsAppAdapter()
    await adapter.stop()
    return { success: true }
  }),

  // Logout WhatsApp (clear session)
  logout: publicProcedure.mutation(async () => {
    const adapter = getWhatsAppAdapter()
    await adapter.logout()
    return { success: true }
  }),

  // Subscribe to QR code updates
  onQRCode: publicProcedure.subscription(() => {
    return observable<string | null>((emit) => {
      const handler = (qr: string | null) => {
        emit.next(qr)
      }
      whatsAppQREmitter.on("qr", handler)
      return () => {
        whatsAppQREmitter.off("qr", handler)
      }
    })
  }),

  // Subscribe to status changes
  onStatusChange: publicProcedure.subscription(() => {
    return observable<{ isConnected: boolean }>((emit) => {
      const handler = (status: { isConnected: boolean }) => {
        emit.next(status)
      }
      whatsAppStatusEmitter.on("statusChange", handler)
      return () => {
        whatsAppStatusEmitter.off("statusChange", handler)
      }
    })
  }),

  // Create WhatsApp group
  createGroup: publicProcedure
    .input(z.object({ name: z.string(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const adapter = getWhatsAppAdapter()
      try {
        const result = await adapter.createGroup(input.name, input.description)
        return {
          success: true,
          groupId: result.groupId,
          inviteUrl: result.inviteUrl,
        }
      } catch (error) {
        console.error("[WhatsAppRouter] Failed to create group:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create WhatsApp group",
        }
      }
    }),

  // Get WhatsApp groups
  getGroups: publicProcedure.query(async () => {
    const adapter = getWhatsAppAdapter()
    return adapter.getGroups()
  }),

  // Get own JID
  getOwnJid: publicProcedure.query(async () => {
    const adapter = getWhatsAppAdapter()
    return { jid: adapter.getOwnJid() }
  }),

  // Get connected chats (bridges)
  getBridges: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const connectedChats = db
        .select()
        .from(chats)
        .where(eq(chats.connectionType, "whatsapp"))
        .all()
      return {
        bridges: connectedChats.map((chat) => ({
          id: chat.id,
          chatId: chat.id,
          whatsappJid: chat.connectionTarget,
          whatsappGroupName: chat.connectionName,
          isEnabled: true,
        })),
      }
    }),

  // Create bridge (update chat connection)
  createBridge: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        subChatId: z.string(),
        whatsappJid: z.string(),
        whatsappGroupName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      // Normalize JID - ensure it has @g.us suffix for groups
      let normalizedJid = input.whatsappJid
      if (normalizedJid && !normalizedJid.includes("@")) {
        normalizedJid = `${normalizedJid}@g.us`
      }
      db.update(chats)
        .set({
          connectionType: "whatsapp",
          connectionTarget: normalizedJid,
          connectionName: input.whatsappGroupName,
          updatedAt: new Date(),
        })
        .where(eq(chats.id, input.chatId))
        .run()
      console.log(`[WhatsApp] Bridge created: chat ${input.chatId} -> ${normalizedJid}`)
      return { success: true, jid: normalizedJid }
    }),

  // Connect to existing WhatsApp group by JID
  connectToExistingGroup: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        whatsappJid: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      // Normalize JID
      let normalizedJid = input.whatsappJid.trim()
      if (!normalizedJid.includes("@")) {
        normalizedJid = `${normalizedJid}@g.us`
      }

      // Verify the group exists by fetching metadata
      const adapter = getWhatsAppAdapter()
      try {
        const groups = await adapter.getGroups()
        const group = groups.find((g) => g.id === normalizedJid)
        if (!group) {
          return { success: false, error: "Group not found. Make sure you're a member of this group." }
        }

        db.update(chats)
          .set({
            connectionType: "whatsapp",
            connectionTarget: normalizedJid,
            connectionName: group.name,
            updatedAt: new Date(),
          })
          .where(eq(chats.id, input.chatId))
          .run()

        console.log(`[WhatsApp] Connected to existing group: chat ${input.chatId} -> ${normalizedJid}`)
        return { success: true, jid: normalizedJid, name: group.name }
      } catch (error) {
        console.error("[WhatsApp] Failed to connect to group:", error)
        return { success: false, error: "Failed to verify group. Make sure WhatsApp is connected." }
      }
    }),

  // Delete bridge
  deleteBridge: publicProcedure
    .input(z.object({ bridgeId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      db.update(chats)
        .set({
          connectionType: "none",
          connectionTarget: null,
          connectionName: null,
          updatedAt: new Date(),
        })
        .where(eq(chats.id, input.bridgeId))
        .run()
      return { success: true }
    }),

  // Toggle bridge
  toggleBridge: publicProcedure
    .input(z.object({ bridgeId: z.string(), isEnabled: z.boolean() }))
    .mutation(async () => {
      // Bridge toggling is a no-op for now
      return { success: true }
    }),

  // Send message to group
  sendToGroup: publicProcedure
    .input(z.object({ groupId: z.string(), message: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = getWhatsAppAdapter()
      const success = await adapter.sendMessage(input.groupId, input.message)
      return { success }
    }),

  // Subscribe to bridge messages
  onBridgeMessage: publicProcedure.subscription(() => {
    return observable<{
      bridgeId: string
      chatId: string
      subChatId: string
      whatsappJid: string
      sender: string
      text: string
      timestamp: number
      messageId: string
      fromMe: boolean
    }>((emit) => {
      const handler = (message: any) => {
        // Only handle WhatsApp messages
        if (message.platform !== "whatsapp") return

        // Get the chat connection info to find bridgeId
        const db = getDatabase()
        const chat = db
          .select()
          .from(chats)
          .where(eq(chats.id, message.chatId))
          .get()

        if (!chat) {
          console.log(`[WhatsAppRouter] No chat found for ${message.chatId}`)
          return
        }

        // Find the most recent subChat for this chat to use as target
        const subChat = db
          .select()
          .from(subChats)
          .where(eq(subChats.chatId, message.chatId))
          .orderBy(desc(subChats.createdAt))
          .limit(1)
          .get()

        // If no subChat exists, we can't route the message
        if (!subChat) {
          console.log(`[WhatsAppRouter] No subChat found for chat ${message.chatId}`)
          return
        }

        // Transform to the format expected by frontend
        emit.next({
          bridgeId: chat.id,
          chatId: chat.id,
          subChatId: subChat.id,
          whatsappJid: message.metadata?.whatsappJid || "",
          sender: message.sender,
          text: message.text,
          timestamp: message.timestamp,
          messageId: message.messageId,
          fromMe: message.metadata?.fromMe || false,
        })
      }

      incomingMessageEmitter.on("message", handler)
      return () => {
        incomingMessageEmitter.off("message", handler)
      }
    })
  }),

  // Queue status (stub)
  getQueueStatus: publicProcedure.query(async () => {
    return {
      total: messageQueue.length,
      pending: messageQueue.filter((m) => m.status === "pending").length,
      sent: messageQueue.filter((m) => m.status === "sent").length,
      failed: messageQueue.filter((m) => m.status === "failed").length,
    }
  }),

  // Queue items (stub)
  getQueueItems: publicProcedure
    .input(z.object({ clawId: z.string().optional() }))
    .query(async ({ input }) => {
      let items = messageQueue
      if (input.clawId) {
        items = items.filter((m) => m.clawId === input.clawId)
      }
      return { items }
    }),

  // Get claw IDs (stub)
  getClawIds: publicProcedure.query(async () => {
    return { clawIds: [] }
  }),

  // Pause queue (stub)
  pauseQueue: publicProcedure.mutation(async () => {
    return { success: true }
  }),

  // Resume queue (stub)
  resumeQueue: publicProcedure.mutation(async () => {
    return { success: true }
  }),

  // Clear queue (stub)
  clearQueue: publicProcedure.mutation(async () => {
    messageQueue.length = 0
    return { success: true }
  }),

  // Clear stuck queue (stub)
  clearStuckQueue: publicProcedure.mutation(async () => {
    // Remove items older than 1 hour with pending status
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    for (let i = messageQueue.length - 1; i >= 0; i--) {
      if (
        messageQueue[i].status === "pending" &&
        messageQueue[i].createdAt < oneHourAgo
      ) {
        messageQueue.splice(i, 1)
      }
    }
    return { success: true }
  }),
})
