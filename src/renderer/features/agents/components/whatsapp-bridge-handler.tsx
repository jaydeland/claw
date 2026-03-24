"use client"

import { useSetAtom } from "jotai"
import { useEffect, useRef } from "react"
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
  subChatId: string | null
  /**
   * Optional function to trigger a Claw response.
   * If not provided, the message will only be displayed in the UI.
   */
  onTriggerResponse?: (text: string) => void
}

/**
 * Component that handles WhatsApp bridge messages
 * Adds them to the chat message store so they appear in the UI
 * and optionally triggers a Claw response via the provided callback
 */
export function WhatsAppBridgeHandler({ chatId, subChatId, onTriggerResponse }: WhatsAppBridgeHandlerProps) {
  const mountCountRef = useRef(0)
  mountCountRef.current++
  console.log("[WhatsAppBridgeHandler] Component render:", { chatId, subChatId, mountCount: mountCountRef.current, hasTriggerCallback: !!onTriggerResponse })

  useEffect(() => {
    console.log("[WhatsAppBridgeHandler] Component MOUNTED:", { chatId, subChatId })
    return () => {
      console.log("[WhatsAppBridgeHandler] Component UNMOUNTED:", { chatId, subChatId })
    }
  }, [])

  // Use the sync atom for atomic message updates
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)

  // Subscribe to bridge messages
  console.log("[WhatsAppBridgeHandler] Setting up tRPC subscription...", { chatId })
  trpc.whatsapp.onBridgeMessage.useSubscription(undefined, {
    onStarted: () => {
      console.log("[WhatsAppBridgeHandler] Subscription STARTED successfully")
    },
    onData: (message: WhatsAppBridgeMessage) => {
      console.log("[WhatsAppBridgeHandler] Received bridge message:", {
        messageChatId: message.chatId,
        currentChatId: chatId,
        messageSubChatId: message.subChatId,
        currentSubChatId: subChatId,
        sender: message.sender,
        textPreview: message.text?.substring(0, 50),
      })

      // Only process messages for the current chat/subChat
      if (chatId && message.chatId === chatId) {
        console.log("[WhatsAppBridgeHandler] ChatId matches, processing message")
        // Skip messages sent by the user from Claw (to avoid loops)
        if (message.fromMe) {
          console.log("[WhatsAppBridgeHandler] Skipping message from self")
          return
        }

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
        toast.info(`📱 WhatsApp: ${message.sender}`, {
          description: message.text.substring(0, 100) + (message.text.length > 100 ? "..." : ""),
        })

        // Trigger a Claw response if handler is provided
        if (onTriggerResponse && subChatId === message.subChatId) {
          console.log("[WhatsAppBridgeHandler] Triggering Claw response for WhatsApp message")
          try {
            onTriggerResponse(message.text)
          } catch (error) {
            console.error("[WhatsAppBridgeHandler] Failed to trigger response:", error)
          }
        }
      }
    },
    onError: (error) => {
      console.error("[WhatsAppBridgeHandler] Subscription error:", error)
      console.error("[WhatsAppBridgeHandler] Error details:", {
        message: error.message,
        name: error.name,
        cause: error.cause,
        stack: error.stack,
      })
    },
  })

  return null // This is a logic-only component
}
