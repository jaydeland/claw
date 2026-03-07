"use client"

import { useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import {
  syncMessagesWithStatusAtom,
  type Message,
} from "../stores/message-store"

interface WhatsAppBridgeMessage {
  bridgeId: string
  chatId: string
  subChatId: string
  whatsappJid: string
  sender: string
  text: string
  timestamp: number
  messageId: string
  fromMe: boolean
}

interface WhatsAppBridgeHandlerProps {
  chatId: string | null
}

/**
 * Component that handles WhatsApp bridge messages
 * Adds them to the chat message store so they appear in the UI
 */
export function WhatsAppBridgeHandler({ chatId }: WhatsAppBridgeHandlerProps) {
  // Use the sync atom for atomic message updates
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)

  // Subscribe to bridge messages
  trpc.whatsapp.onBridgeMessage.useSubscription(undefined, {
    onData: (message: WhatsAppBridgeMessage) => {
      console.log("[WhatsAppBridgeHandler] Received bridge message:", message)

      // Only process messages for the current chat/subChat
      if (chatId && message.chatId === chatId) {
        // Create unique message ID
        const messageId = `wa_${message.messageId}_${Date.now()}`

        // Create the message object
        const msg: Message = {
          id: messageId,
          role: "user",
          parts: [
            {
              type: "text",
              text: `**📱 WhatsApp** (${message.sender}):\n\n${message.text}`,
            },
          ],
          metadata: {
            source: "whatsapp",
            bridgeId: message.bridgeId,
            whatsappJid: message.whatsappJid,
            sender: message.sender,
            fromMe: message.fromMe,
          },
          createdAt: new Date(message.timestamp),
        }

        // Sync the message using the proper store method
        // This handles all atom updates atomically (message, IDs, roles)
        // Use the subChatId from the bridge message for proper isolation
        syncMessages({
          messages: [msg],
          status: "ready", // WhatsApp messages are complete (not streaming)
          subChatId: message.subChatId,
        })

        // Show toast notification
        const sender = message.fromMe ? "You (WhatsApp)" : message.sender
        toast.info(`📱 WhatsApp: ${sender}`, {
          description: message.text.substring(0, 100) + (message.text.length > 100 ? "..." : ""),
        })
      }
    },
    onError: (error) => {
      console.error("[WhatsAppBridgeHandler] Subscription error:", error)
    },
  })

  return null // This is a logic-only component
}
