"use client"

import { useEffect, useRef } from "react"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"

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

interface UseWhatsAppBridgeProps {
  chatId: string | null
  subChatId: string | null
  onBridgeMessage?: (message: WhatsAppBridgeMessage) => void
}

/**
 * Hook to subscribe to WhatsApp bridge messages
 * When a message arrives from a bridged WhatsApp group, it will be emitted
 * and can be handled by the chat UI
 */
export function useWhatsAppBridge({ chatId, subChatId, onBridgeMessage }: UseWhatsAppBridgeProps) {
  const onBridgeMessageRef = useRef(onBridgeMessage)
  onBridgeMessageRef.current = onBridgeMessage

  // Subscribe to bridge messages
  trpc.whatsapp.onBridgeMessage.useSubscription(undefined, {
    onData: (message: WhatsAppBridgeMessage) => {
      console.log("[useWhatsAppBridge] Received bridge message:", message)

      // Only process messages for the current chat/subChat
      if (chatId && message.chatId === chatId) {
        // Check if there's a custom handler
        if (onBridgeMessageRef.current) {
          onBridgeMessageRef.current(message)
        } else {
          // Default behavior: show toast notification
          const sender = message.fromMe ? "You (WhatsApp)" : message.sender
          toast.info(`📱 WhatsApp: ${sender}`, {
            description: message.text.substring(0, 100) + (message.text.length > 100 ? "..." : ""),
          })
        }
      }
    },
    onError: (error) => {
      console.error("[useWhatsAppBridge] Subscription error:", error)
    },
  })

  // Send message to WhatsApp function
  const sendToWhatsAppMutation = trpc.whatsapp.sendToGroup.useMutation()

  const sendToWhatsApp = async (jid: string, text: string) => {
    try {
      const result = await sendToWhatsAppMutation.mutateAsync({ jid, text })
      return result.success
    } catch (error) {
      console.error("[useWhatsAppBridge] Failed to send message:", error)
      return false
    }
  }

  return { sendToWhatsApp }
}
