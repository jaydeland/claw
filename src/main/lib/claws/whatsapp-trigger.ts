/**
 * WhatsAppTrigger - WhatsApp Web integration for Claw using Baileys
 *
 * Uses @whiskeysockets/baileys to connect to WhatsApp Web via WebSocket.
 * No public URL needed - user scans QR code with WhatsApp app to authenticate.
 */

// Use namespace import for CommonJS compatibility with externalized module
import * as baileys from "@whiskeysockets/baileys"
import { app } from "electron"
import { getDatabase, headlessClaws, whatsappSettings, clawExecutions } from "../db"
import { eq } from "drizzle-orm"
import { clawDaemon } from "./index"
import { EventEmitter } from "events"
import * as path from "path"
import * as fs from "fs"

// Extract needed exports from baileys namespace
// When bundled by esbuild, CJS module.exports becomes the namespace default,
// so makeWASocket lives at baileys.default.makeWASocket or baileys.makeWASocket
const _baileys = (baileys as any).default ?? baileys
const makeWASocket = _baileys.makeWASocket ?? _baileys
const { DisconnectReason, useMultiFileAuthState, delay, Browsers, fetchLatestBaileysVersion } = _baileys
type WASocket = ReturnType<typeof makeWASocket>

// Global event emitter for QR codes
export const whatsAppQREmitter = new EventEmitter()

// Singleton instance
let whatsappTriggerInstance: WhatsAppTrigger | null = null

/**
 * Get the WhatsAppTrigger singleton instance
 */
export function getWhatsAppTrigger(): WhatsAppTrigger {
  if (!whatsappTriggerInstance) {
    whatsappTriggerInstance = new WhatsAppTrigger()
  }
  return whatsappTriggerInstance
}

/**
 * Destroy the WhatsAppTrigger instance
 */
export function destroyWhatsAppTrigger(): void {
  if (whatsappTriggerInstance) {
    whatsappTriggerInstance.stop().catch(console.error)
    whatsappTriggerInstance = null
  }
}

export class WhatsAppTrigger {
  private sock: WASocket | null = null
  private isRunning = false
  private isStarting = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private sessionPath: string

  constructor() {
    // Store session in userData
    this.sessionPath = path.join(app.getPath("userData"), "baileys_auth")
  }

  /**
   * Check if WhatsApp is connected
   */
  isActive(): boolean {
    return this.isRunning
  }

  /**
   * Start the WhatsApp connection
   */
  async start(): Promise<void> {
    if (this.isRunning || this.isStarting) {
      console.log("[WhatsAppTrigger] Already running or starting")
      return
    }

    this.isStarting = true
    this.reconnectAttempts = 0

    try {
      console.log("[WhatsAppTrigger] Starting WhatsApp connection...")

      // Ensure session directory exists
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true })
      }

      await this.connect()
    } catch (error) {
      this.isStarting = false
      console.error("[WhatsAppTrigger] Failed to start:", error)
      throw error
    }
  }

  /**
   * Connect to WhatsApp Web
   */
  private async connect(): Promise<void> {
    // Load auth state from filesystem
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath)

    // Fetch the latest WA Web version so we don't get rejected for running a stale version
    let waVersion: [number, number, number] | undefined
    try {
      const { version } = await fetchLatestBaileysVersion()
      waVersion = version
      console.log(`[WhatsAppTrigger] Using WA version: ${version.join(".")}`)
    } catch (err) {
      console.warn("[WhatsAppTrigger] Could not fetch latest WA version, using bundled default:", err)
    }

    this.sock = makeWASocket({
      printQRInTerminal: false, // We'll handle QR display via UI
      auth: state,
      ...(waVersion ? { version: waVersion } : {}),
      // Use a known-good browser fingerprint — custom strings get rejected by WA's handshake
      browser: Browsers ? Browsers.macOS("Desktop") : ["Mac OS X", "Desktop", "10.15.7"],
      // Don't sync full history - we only care about new messages
      shouldSyncHistoryMessage: () => false,
      // Sync only groups where user is mentioned
      syncFullHistory: false,
    })

    // Listen for connection updates
    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update

      // QR code generated - emit to renderer
      if (qr) {
        console.log("[WhatsAppTrigger] QR code generated")
        whatsAppQREmitter.emit("qr", qr)
      }

      // Connection status changed
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
        const errorMessage = lastDisconnect?.error?.message
        const isNoiseHandshakeFailure = errorMessage === "Connection Failure"
        // 515 = restart required, usually due to sync key corruption
        const isRestartRequired = statusCode === 515 || errorMessage?.includes("restart required")
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        this.isRunning = false
        this.isStarting = false

        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++

          // Noise handshake failures and restart-required errors are caused by stale/corrupt auth files.
          // Clear them so the next connect() generates fresh keys.
          const needsSessionReset = isNoiseHandshakeFailure || isRestartRequired
          if (needsSessionReset && fs.existsSync(this.sessionPath)) {
            console.log("[WhatsAppTrigger] Session error detected — clearing stale session files before retry")
            try {
              fs.rmSync(this.sessionPath, { recursive: true, force: true })
              fs.mkdirSync(this.sessionPath, { recursive: true })
            } catch (clearErr) {
              console.error("[WhatsAppTrigger] Failed to clear session files:", clearErr)
            }
          }

          // Use a longer delay for session reset scenarios to avoid server-side rate limiting
          const retryDelay = needsSessionReset ? 10000 : 5000
          console.log(`[WhatsAppTrigger] Reconnecting (attempt ${this.reconnectAttempts}) in ${retryDelay / 1000}s...`)
          await delay(retryDelay)
          await this.connect()
        } else {
          console.log("[WhatsAppTrigger] Connection closed permanently")
          await this.updateConnectionStatus(false)
          // Reset QR UI — the connection failed before a QR was shown or used
          whatsAppQREmitter.emit("qr", null)
        }
      } else if (connection === "open") {
        console.log("[WhatsAppTrigger] Connected successfully")
        this.reconnectAttempts = 0
        this.isRunning = true
        this.isStarting = false
        await this.updateConnectionStatus(true)

        // Clear any pending QR code
        whatsAppQREmitter.emit("qr", null)
      }
    })

    // Listen for errors that may require session cleanup
    this.sock.ev.on("connection.update", async (update) => {
      // Check for stream errors that indicate corrupted session state
      const streamError = (update as any).streamError
      if (streamError) {
        const errorMsg = String(streamError.message || streamError)
        const isSyncError = errorMsg.includes("BAD_DECRYPT") ||
                           errorMsg.includes("failed to find key") ||
                           errorMsg.includes("Stream Errored")

        if (isSyncError && this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log("[WhatsAppTrigger] Sync/decryption error detected — clearing session files")
          if (fs.existsSync(this.sessionPath)) {
            try {
              fs.rmSync(this.sessionPath, { recursive: true, force: true })
              fs.mkdirSync(this.sessionPath, { recursive: true })
            } catch (clearErr) {
              console.error("[WhatsAppTrigger] Failed to clear session files:", clearErr)
            }
          }
        }
      }
    })

    // Listen for incoming messages
    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // Only process new messages (not history sync)
      if (type !== "notify") return

      for (const msg of messages) {
        await this.handleMessage(msg)
      }
    })

    // Save credentials when updated
    this.sock.ev.on("creds.update", saveCreds)
  }

  /**
   * Handle incoming WhatsApp messages
   */
  private async handleMessage(msg: any): Promise<void> {
    // Skip messages from self
    if (msg.key.fromMe) return

    // Extract message text
    const messageText = this.extractMessageText(msg)
    if (!messageText) return

    const from = msg.key.remoteJid // phone number or group ID
    const sender = msg.pushName || "Unknown"

    console.log(`[WhatsAppTrigger] Message from ${sender} (${from}): ${messageText.substring(0, 100)}`)

    try {
      // Find all claws configured for WhatsApp trigger
      const db = getDatabase()
      const claws = db
        .select()
        .from(headlessClaws)
        .where(eq(headlessClaws.triggerType, "whatsapp_message"))
        .all()
        .filter(claw => claw.isEnabled)

      if (claws.length === 0) {
        // No claws configured - send a helpful message
        await this.sendMessage(from, "🤖 No WhatsApp-triggered claws are configured. Create one in Claw settings!")
        return
      }

      for (const claw of claws) {
        // Parse trigger config for chat filter (optional)
        const config = JSON.parse(claw.triggerConfig || "{}")
        const chatFilter = config.whatsappChatFilter

        // If chat filter is set, check if this chat matches
        if (chatFilter && !this.matchesChatFilter(from, chatFilter)) {
          console.log(`[WhatsAppTrigger] Chat ${from} doesn't match filter ${chatFilter}`)
          continue
        }

        // Send acknowledgment
        await this.sendMessage(from, `🤖 *${claw.name}* is working on it...`)

        // Execute the claw with WhatsApp context
        const executionId = await clawDaemon.executeClaw(claw.id, {
          whatsappFrom: from,
          whatsappSender: sender,
          originalMessage: messageText,
          triggerSource: "whatsapp",
        })

        // Monitor execution and send result
        this.monitorExecution(executionId, claw.name, from)
      }
    } catch (error) {
      console.error("[WhatsAppTrigger] Error handling message:", error)
      await this.sendMessage(from, "❌ Error processing your request. Please try again.")
    }
  }

  /**
   * Extract text content from a WhatsApp message
   */
  private extractMessageText(msg: any): string | null {
    // Handle different message types
    const message = msg.message
    if (!message) return null

    // Text conversation
    if (message.conversation) {
      return message.conversation
    }

    // Extended text message (includes formatting, links, etc.)
    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text
    }

    // Button response
    if (message.buttonsResponseMessage?.selectedDisplayText) {
      return message.buttonsResponseMessage.selectedDisplayText
    }

    // List response
    if (message.listResponseMessage?.title) {
      return message.listResponseMessage.title
    }

    return null
  }

  /**
   * Check if a chat matches the filter
   */
  private matchesChatFilter(chatId: string, filter: string): boolean {
    // Filter can be:
    // - A phone number (e.g., "1234567890")
    // - A group name or ID
    // - "group" to match only groups
    // - "individual" to match only individual chats

    const normalizedFilter = filter.trim().toLowerCase()
    const normalizedChatId = chatId.toLowerCase()

    // Check for special filters
    if (normalizedFilter === "group") {
      return normalizedChatId.endsWith("@g.us")
    }
    if (normalizedFilter === "individual" || normalizedFilter === "personal") {
      return normalizedChatId.endsWith("@s.whatsapp.net")
    }

    // Direct match on chat ID or phone number
    return normalizedChatId.includes(normalizedFilter) ||
           normalizedChatId.replace(/\D/g, "").includes(normalizedFilter.replace(/\D/g, ""))
  }

  /**
   * Send a WhatsApp message
   */
  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.sock) {
      console.error("[WhatsAppTrigger] Socket not available")
      return
    }

    try {
      await this.sock.sendMessage(to, { text })
    } catch (error) {
      console.error("[WhatsAppTrigger] Failed to send message:", error)
    }
  }

  /**
   * Monitor a claw execution and send the result when complete
   */
  private monitorExecution(executionId: string, clawName: string, chatId: string): void {
    const checkInterval = setInterval(async () => {
      try {
        const db = getDatabase()
        const execution = db
          .select()
          .from(clawExecutions)
          .where(eq(clawExecutions.id, executionId))
          .get()

        if (!execution || execution.status === "running") {
          // Still running, check again later
          return
        }

        // Execution complete
        clearInterval(checkInterval)

        // Limit logs to avoid message size limits
        const logs = execution.logs || ""
        const truncatedLogs = logs.length > 1500 ? "..." + logs.slice(-1500) : logs

        // Format the response
        const statusEmoji = execution.status === "success" ? "✅" : "❌"
        const statusText = execution.status === "success" ? "completed successfully" : `failed (exit code ${execution.exitCode})`

        const message = `${statusEmoji} *${clawName}* ${statusText}\n\n\`\`\`${truncatedLogs}\`\`\``

        await this.sendMessage(chatId, message)
      } catch (error) {
        console.error("[WhatsAppTrigger] Error monitoring execution:", error)
        clearInterval(checkInterval)
      }
    }, 2000) // Check every 2 seconds

    // Stop checking after 10 minutes
    setTimeout(() => {
      clearInterval(checkInterval)
    }, 10 * 60 * 1000)
  }

  /**
   * Stop the WhatsApp connection
   */
  async stop(): Promise<void> {
    if (!this.isRunning && !this.sock) {
      return
    }

    console.log("[WhatsAppTrigger] Stopping...")

    try {
      this.sock?.end(undefined)
      this.sock = null
      this.isRunning = false
      this.isStarting = false

      await this.updateConnectionStatus(false)

      console.log("[WhatsAppTrigger] Stopped")
    } catch (error) {
      console.error("[WhatsAppTrigger] Error stopping:", error)
      throw error
    }
  }

  /**
   * Logout and clear session
   */
  async logout(): Promise<void> {
    console.log("[WhatsAppTrigger] Logging out...")

    try {
      // Stop connection
      await this.stop()

      // Remove session files
      if (fs.existsSync(this.sessionPath)) {
        fs.rmSync(this.sessionPath, { recursive: true, force: true })
      }

      // Clear connection status
      const db = getDatabase()
      db.update(whatsappSettings)
        .set({ isConnected: false, updatedAt: new Date() })
        .where(eq(whatsappSettings.id, "default"))
        .run()

      console.log("[WhatsAppTrigger] Logged out and session cleared")
    } catch (error) {
      console.error("[WhatsAppTrigger] Error logging out:", error)
      throw error
    }
  }

  /**
   * Update the connection status in the database
   */
  private async updateConnectionStatus(connected: boolean): Promise<void> {
    const db = getDatabase()
    db.update(whatsappSettings)
      .set({ isConnected: connected, updatedAt: new Date() })
      .where(eq(whatsappSettings.id, "default"))
      .run()
  }

  /**
   * Get current connection status
   */
  async getStatus(): Promise<{ isConnected: boolean }> {
    const db = getDatabase()
    const settings = db.select().from(whatsappSettings).where(eq(whatsappSettings.id, "default")).get()

    return {
      isConnected: settings?.isConnected ?? false,
    }
  }

  /**
   * Create a WhatsApp group for Claw notifications
   * Returns the group ID (jid) that can be used as a chat filter
   */
  async createGroup(name: string, description?: string): Promise<{ groupId: string; inviteUrl?: string }> {
    if (!this.sock) {
      throw new Error("WhatsApp not connected")
    }

    if (!this.isRunning) {
      throw new Error("WhatsApp connection is not active")
    }

    try {
      console.log(`[WhatsAppTrigger] Creating group: ${name}`)

      // Get user's own JID to add as initial participant
      // WhatsApp requires at least one participant to create a group
      const userJid = await this.getOwnJid()
      console.log(`[WhatsAppTrigger] User JID for group creation: ${userJid}`)

      if (!userJid) {
        throw new Error("Could not get user's JID - WhatsApp connection may not be fully established")
      }

      // Create the group with user's own JID as initial participant
      // Baileys groupCreate expects: subject, participants (array of JIDs)
      const participants = [userJid]
      console.log(`[WhatsAppTrigger] Creating group with ${participants.length} participant(s):`, participants)

      let groupMetadata
      try {
        groupMetadata = await this.sock.groupCreate(name, participants)
        console.log(`[WhatsAppTrigger] Group created successfully:`, groupMetadata)
      } catch (groupError) {
        console.error(`[WhatsAppTrigger] groupCreate failed:`, groupError)
        throw groupError
      }

      // Generate invite link if possible
      let inviteUrl: string | undefined
      try {
        const inviteCode = await this.sock.groupInviteCode(groupMetadata.id)
        if (inviteCode) {
          inviteUrl = `https://chat.whatsapp.com/${inviteCode}`
        }
      } catch (err) {
        console.warn("[WhatsAppTrigger] Could not generate invite code:", err)
      }

      // Send description as a message if provided
      if (description) {
        await this.sendMessage(
          groupMetadata.id,
          `🤖 *Claw Automation Group*\n\n${description}\n\n_Add this group ID to your claw config to receive notifications here._`
        )
      }

      return {
        groupId: groupMetadata.id,
        inviteUrl,
      }
    } catch (error) {
      console.error("[WhatsAppTrigger] Failed to create group:", error)
      throw error
    }
  }

  /**
   * Get user's own phone number (jid) that can be used for testing
   */
  async getOwnJid(): Promise<string | null> {
    if (!this.sock) {
      console.log("[WhatsAppTrigger] getOwnJid: socket not available")
      return null
    }

    try {
      // Try multiple ways to get the user's JID from Baileys
      // Method 1: Direct user object (most common in Baileys)
      const sockAny = this.sock as any
      let userJid = sockAny.user?.id

      // Method 2: Try auth state if available
      if (!userJid && sockAny.authState?.creds?.me?.id) {
        userJid = sockAny.authState.creds.me.id
      }

      // Method 3: Check if jid is available directly on socket
      if (!userJid && sockAny.jid) {
        userJid = sockAny.jid
      }

      console.log(`[WhatsAppTrigger] getOwnJid: found=${!!userJid}, jid=${userJid}`)
      return userJid || null
    } catch (error) {
      console.error("[WhatsAppTrigger] Failed to get own JID:", error)
      return null
    }
  }
}
