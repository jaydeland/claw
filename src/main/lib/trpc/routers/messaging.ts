/**
 * Messaging Router - tRPC routes for platform messaging
 *
 * Provides endpoints for WhatsApp and Discord connection management
 * and message handling.
 */

import { z } from "zod"
import { router, publicProcedure } from "../index"
import {
  getWhatsAppAdapter,
  whatsAppQREmitter,
  whatsAppStatusEmitter,
} from "../../messaging/whatsapp-adapter"
import {
  getDiscordAdapter,
  discordStatusEmitter,
} from "../../messaging/discord-adapter"
import { incomingMessageEmitter } from "../../messaging"
import { getDatabase, chats, subChats, whatsappSettings, discordSettings } from "../../db"
import { eq, desc } from "drizzle-orm"
import { observable } from "@trpc/server/observable"
import { safeStorage } from "electron"

// ===== WHATSAPP ROUTES =====

export const messagingRouter = router({
  // Get WhatsApp connection status
  whatsappGetStatus: publicProcedure.query(async () => {
    const adapter = getWhatsAppAdapter()
    return adapter.getStatus()
  }),

  // Connect WhatsApp
  whatsappConnect: publicProcedure.mutation(async () => {
    const adapter = getWhatsAppAdapter()
    await adapter.start()
    return { success: true }
  }),

  // Disconnect WhatsApp
  whatsappDisconnect: publicProcedure.mutation(async () => {
    const adapter = getWhatsAppAdapter()
    await adapter.stop()
    return { success: true }
  }),

  // Logout WhatsApp (clear session)
  whatsappLogout: publicProcedure.mutation(async () => {
    const adapter = getWhatsAppAdapter()
    await adapter.logout()
    return { success: true }
  }),

  // Subscribe to QR code updates
  whatsappOnQRCode: publicProcedure.subscription(() => {
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
  whatsappOnStatusChange: publicProcedure.subscription(() => {
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

  // Create WhatsApp group for chat
  whatsappCreateGroup: publicProcedure
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
        console.error("[MessagingRouter] Failed to create WhatsApp group:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create WhatsApp group",
        }
      }
    }),

  // Get WhatsApp groups
  whatsappGetGroups: publicProcedure.query(async () => {
    const adapter = getWhatsAppAdapter()
    return adapter.getGroups()
  }),

  // Send test message
  whatsappSendTestMessage: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = getWhatsAppAdapter()
      const testMessage = `🧪 *Test Message*\n\nThis is a test from Claw.\n\n_Time: ${new Date().toLocaleString()}_`
      const success = await adapter.sendMessage(input.chatId, testMessage)
      return { success }
    }),

  // ===== DISCORD ROUTES =====

  // Check if Discord credentials exist
  discordHasCredentials: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(discordSettings).where(eq(discordSettings.id, "default")).get()
    return { hasCredentials: !!settings?.encryptedBotToken }
  }),

  // Save Discord credentials
  discordSaveCredentials: publicProcedure
    .input(z.object({ encryptedToken: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const existing = db.select().from(discordSettings).where(eq(discordSettings.id, "default")).get()

      if (existing) {
        db.update(discordSettings)
          .set({ encryptedBotToken: input.encryptedToken, updatedAt: new Date() })
          .where(eq(discordSettings.id, "default"))
          .run()
      } else {
        db.insert(discordSettings).values({
          id: "default",
          encryptedBotToken: input.encryptedToken,
          updatedAt: new Date(),
        }).run()
      }
      return { success: true }
    }),

  // Clear Discord credentials
  discordClearCredentials: publicProcedure.mutation(async () => {
    const db = getDatabase()
    db.update(discordSettings)
      .set({ encryptedBotToken: null, isConnected: false, updatedAt: new Date() })
      .where(eq(discordSettings.id, "default"))
      .run()
    return { success: true }
  }),

  // Test Discord connection
  discordTestConnection: publicProcedure.query(async () => {
    const adapter = getDiscordAdapter()
    return adapter.testConnection()
  }),

  // Connect Discord
  discordConnect: publicProcedure.mutation(async () => {
    const adapter = getDiscordAdapter()
    await adapter.start()
    return { success: true }
  }),

  // Disconnect Discord
  discordDisconnect: publicProcedure.mutation(async () => {
    const adapter = getDiscordAdapter()
    await adapter.stop()
    return { success: true }
  }),

  // Get Discord status
  discordGetStatus: publicProcedure.query(async () => {
    const adapter = getDiscordAdapter()
    return { status: adapter.getStatus() }
  }),

  // Subscribe to Discord status changes
  discordOnStatusChange: publicProcedure.subscription(() => {
    return observable<{ status: string; username?: string; error?: string }>((emit) => {
      const handler = (data: { status: string; username?: string; error?: string }) => {
        emit.next(data)
      }
      discordStatusEmitter.on("statusChange", handler)
      return () => {
        discordStatusEmitter.off("statusChange", handler)
      }
    })
  }),

  // List Discord guilds
  discordListGuilds: publicProcedure.query(async () => {
    const adapter = getDiscordAdapter()
    return adapter.getGuilds()
  }),

  // List Discord channels
  discordListChannels: publicProcedure
    .input(z.object({ guildId: z.string() }))
    .query(async ({ input }) => {
      const adapter = getDiscordAdapter()
      return adapter.getChannels(input.guildId)
    }),

  // Create Discord channel
  discordCreateChannel: publicProcedure
    .input(z.object({ guildId: z.string(), name: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = getDiscordAdapter()
      return adapter.createChannel(input.guildId, input.name)
    }),

  // ===== INCOMING MESSAGE SUBSCRIPTION =====

  // Subscribe to incoming messages from platforms
  onIncomingMessage: publicProcedure.subscription(() => {
    return observable<{
      platform: "whatsapp" | "discord"
      chatId: string
      sender: string
      text: string
      timestamp: number
      messageId: string
      metadata?: Record<string, unknown>
    }>((emit) => {
      const handler = (message: {
        platform: "whatsapp" | "discord"
        chatId: string
        sender: string
        text: string
        timestamp: number
        messageId: string
        metadata?: Record<string, unknown>
      }) => {
        emit.next(message)
      }
      incomingMessageEmitter.on("message", handler)
      return () => {
        incomingMessageEmitter.off("message", handler)
      }
    })
  }),

  // ===== CHAT CONNECTION MANAGEMENT =====

  // Get chats by connection type
  getConnectedChats: publicProcedure
    .input(z.object({ platform: z.enum(["whatsapp", "discord"]) }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const connectedChats = db
        .select()
        .from(chats)
        .where(eq(chats.connectionType, input.platform))
        .all()
      return connectedChats
    }),

  // Update chat connection
  updateChatConnection: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        connectionType: z.enum(["none", "whatsapp", "discord"]),
        connectionTarget: z.string().optional(),
        connectionName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      db.update(chats)
        .set({
          connectionType: input.connectionType,
          connectionTarget: input.connectionTarget,
          connectionName: input.connectionName,
          updatedAt: new Date(),
        })
        .where(eq(chats.id, input.chatId))
        .run()
      return { success: true }
    }),
})
