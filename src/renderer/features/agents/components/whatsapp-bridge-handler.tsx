"use client"

import { useCallback, useEffect } from "react"
import { useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import {
  messageIdsAtom,
  messageAtomFamily,
  messageRolesAtom,
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
  subChatId: string | null
}

/**
 * Component that handles WhatsApp bridge messages
 * Adds them to the chat message store so they appear in the UI
 */
export function WhatsAppBridgeHandler({ chatId, subChatId }: WhatsAppBridgeHandlerProps) {
  const setMessageIds = useSetAtom(messageIdsAtom)
  const setMessageRole = useSetAtom(messageRolesAtom)

  // Subscribe to bridge messages
  trpc.whatsapp.onBridgeMessage.useSubscription(undefined, {
    onData: (message: WhatsAppBridgeMessage) => {
      console.log("[WhatsAppBridgeHandler] Received bridge message:", message)

      // Only process messages for the current chat/subChat
      if (subChatId && message.subChatId === subChatId) {
        // Add the message to the chat store
        const messageId = `wa_${message.messageId}_${Date.now()}`

        // Create the message object
        const msg = {
          id: messageId,
          role: "user" as const,
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

        // Add to message family
        messageAtomFamily(messageId).init(msg)

        // Add ID to list
        setMessageIds((prev) => [...prev, messageId])

        // Update roles cache
        setMessageRole((prev) => {
          const next = new Map(prev)
          next.set(messageId, "user")
          return next
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
