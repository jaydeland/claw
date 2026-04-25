/**
 * Messaging Module - Simplified 2-way chat-to-platform messaging
 *
 * This module provides direct integration between Claw chats and external
 * messaging platforms (WhatsApp, Discord) without the Claws abstraction.
 *
 * Architecture:
 * - Chat has connectionType/Target/Name fields
 * - Platform adapters handle incoming/outgoing messages
 * - Messages are forwarded bidirectionally between chat and platform
 */

import { EventEmitter } from "events"
import { getWhatsAppAdapter, type WhatsAppAdapter } from "./whatsapp-adapter"
import { getDiscordAdapter, type DiscordAdapter } from "./discord-adapter"

// Re-export types
export type { WhatsAppAdapter, DiscordAdapter }

// Global event emitter for incoming messages
export const incomingMessageEmitter = new EventEmitter()

// Incoming message type
export interface IncomingPlatformMessage {
  platform: "whatsapp" | "discord"
  chatId: string // Target chat ID (mapped via connectionTarget)
  sender: string
  text: string
  timestamp: number
  messageId: string
  metadata?: Record<string, unknown>
}

// Outgoing message type
export interface OutgoingPlatformMessage {
  platform: "whatsapp" | "discord"
  target: string // WhatsApp JID or Discord channel ID
  text: string
}

/**
 * Send a message to an external platform
 */
export async function sendToPlatform(
  platform: "whatsapp" | "discord",
  target: string,
  text: string
): Promise<boolean> {
  try {
    if (platform === "whatsapp") {
      const adapter = getWhatsAppAdapter()
      if (!adapter.isActive()) {
        console.log("[Messaging] WhatsApp not connected, cannot send message")
        return false
      }
      return await adapter.sendMessage(target, text)
    }

    if (platform === "discord") {
      const adapter = getDiscordAdapter()
      if (!adapter.isActive()) {
        console.log("[Messaging] Discord not connected, cannot send message")
        return false
      }
      await adapter.sendMessage(target, text)
      return true
    }

    return false
  } catch (error) {
    console.error(`[Messaging] Failed to send message to ${platform}:`, error)
    return false
  }
}

/**
 * Initialize the messaging module
 * - Starts platform adapters if they have saved credentials
 */
export async function initMessaging(): Promise<void> {
  console.log("[Messaging] Initializing messaging module...")

  // Initialize WhatsApp adapter (will auto-connect if session exists)
  try {
    const whatsappAdapter = getWhatsAppAdapter()
    await whatsappAdapter.startIfSessionExists()
  } catch (error) {
    console.error("[Messaging] Failed to initialize WhatsApp:", error)
  }

  // Initialize Discord adapter (will auto-connect if token exists)
  try {
    const discordAdapter = getDiscordAdapter()
    await discordAdapter.startIfTokenExists()
  } catch (error) {
    console.error("[Messaging] Failed to initialize Discord:", error)
  }

  console.log("[Messaging] Messaging module initialized")
}

/**
 * Shutdown the messaging module
 */
export async function shutdownMessaging(): Promise<void> {
  console.log("[Messaging] Shutting down messaging module...")

  try {
    const whatsappAdapter = getWhatsAppAdapter()
    await whatsappAdapter.stop()
  } catch (error) {
    console.error("[Messaging] Error stopping WhatsApp:", error)
  }

  try {
    const discordAdapter = getDiscordAdapter()
    await discordAdapter.stop()
  } catch (error) {
    console.error("[Messaging] Error stopping Discord:", error)
  }

  console.log("[Messaging] Messaging module shut down")
}
