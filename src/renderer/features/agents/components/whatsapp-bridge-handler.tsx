"use client"

import { useSetAtom } from "jotai"
import { useEffect, useRef } from "react"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import {
  appendMessageAtom,
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
   * Whether this tab is the active (visible) sub-chat tab.
   * Only the active tab should process incoming bridge messages
   * to prevent duplicate injection when multiple tabs are open.
   */
  isActive?: boolean
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
export function WhatsAppBridgeHandler({ chatId, subChatId, isActive = true, onTriggerResponse }: WhatsAppBridgeHandlerProps) {
  // Keep isActive in a ref so the subscription callback always sees the latest value
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  // Use append atom to add a single message without replacing existing messages
  const appendMessage = useSetAtom(appendMessageAtom)
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
        // Only the active tab should inject messages to prevent duplicates
        if (!isActiveRef.current) {
          console.log("[WhatsAppBridgeHandler] Skipping - not the active tab")
          return
        }
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

        // Show toast notification
        toast.info(`📱 WhatsApp message received`, {
          description: message.text.substring(0, 100) + (message.text.length > 100 ? "..." : ""),
        })

        if (onTriggerResponse) {
          // The message is already saved to the DB with proper attribution by the backend.
          // Pass message.text directly — it comes from the queue and is already the
          // attributed prompt (or raw text that matches what's in the DB).
          // Claude's duplicate check will match against the DB message.
          console.log("[WhatsAppBridgeHandler] Triggering Claw response for WhatsApp message")
          try {
            onTriggerResponse(message.text)
          } catch (error) {
            console.error("[WhatsAppBridgeHandler] Failed to trigger response:", error)
          }
        } else {
          // No auto-response — append the message to the UI directly.
          // Uses appendMessageAtom instead of syncMessagesWithStatusAtom because
          // syncMessages is a REPLACE operation that would overwrite all existing messages.
          const targetSubChatId = subChatId || message.subChatId
          appendMessage({
            message: msg,
            subChatId: targetSubChatId,
          })
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
