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
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, delay, Browsers, fetchLatestBaileysVersion } = _baileys

// Minimal pino-compatible logger for Baileys internals.
// makeCacheableSignalKeyStore requires a logger as its second argument;
// passing undefined causes a TypeError when it tries to call logger.trace().
const baileysLogger = {
  trace: () => {},
  debug: () => {},
  info:  (...a: any[]) => console.log("[Baileys]", ...a),
  warn:  (...a: any[]) => console.warn("[Baileys]", ...a),
  error: (...a: any[]) => console.error("[Baileys]", ...a),
  fatal: (...a: any[]) => console.error("[Baileys FATAL]", ...a),
  child: () => baileysLogger,
  level: "silent",
}
type WASocket = ReturnType<typeof makeWASocket>

// Global event emitter for QR codes and status changes
export const whatsAppQREmitter = new EventEmitter()
export const whatsAppStatusEmitter = new EventEmitter()

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
  // Group metadata cache — keyed by group JID, required for Signal session resolution
  private groupMetadataCache = new Map<string, any>()
  // LID-to-phone JID translation — WhatsApp is migrating participants to opaque @lid identifiers
  private lidToPhoneMap: Record<string, string> = {}

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
      auth: {
        creds: state.creds,
        // Wrap the file-backed key store with an in-memory cache.
        // This prevents assertSessions from re-fetching Signal keys on every send,
        // which is the primary cause of the 406 "not-acceptable" error in group chats.
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      ...(waVersion ? { version: waVersion } : {}),
      // Use a known-good browser fingerprint — custom strings get rejected by WA's handshake
      browser: Browsers ? Browsers.macOS("Desktop") : ["Mac OS X", "Desktop", "10.15.7"],
      // Don't sync full history - we only care about new messages
      shouldSyncHistoryMessage: () => false,
      // Sync only groups where user is mentioned
      syncFullHistory: false,
      // Provide cached group metadata so relayMessage can resolve participant Signal sessions.
      // Without this, assertSessions fetches stale/incomplete data and the WA server returns 406.
      cachedGroupMetadata: async (jid: string) => this.groupMetadataCache.get(jid),
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

        // Build LID → phone JID map for own account.
        // WhatsApp is transitioning group participants to opaque @lid identifiers;
        // without this map, self-addressed messages in groups may be unresolvable.
        if (this.sock?.user) {
          const phoneUser = this.sock.user.id.split(":")[0]
          const lidUser = (this.sock.user as any).lid?.split(":")[0]
          if (lidUser && phoneUser) {
            this.lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`
            console.log(`[WhatsAppTrigger] LID mapping: ${lidUser}@lid -> ${phoneUser}@s.whatsapp.net`)
          }
        }

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

    // Keep group metadata cache warm so relayMessage can resolve participant sessions
    this.sock.ev.on("groups.upsert", (groups) => {
      for (const group of groups) {
        this.groupMetadataCache.set(group.id, group)
      }
    })

    this.sock.ev.on("groups.update", (updates) => {
      for (const update of updates) {
        if (update.id) {
          const existing = this.groupMetadataCache.get(update.id)
          if (existing) {
            this.groupMetadataCache.set(update.id, { ...existing, ...update })
          }
        }
      }
    })

    // Listen for incoming messages
    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // Only process new messages (not history sync)
      if (type !== "notify") return

      for (const msg of messages) {
        // Pre-warm group metadata cache before handling — this ensures assertSessions
        // has participant data available when we call sendMessage in the handler
        const jid = msg.key.remoteJid
        if (jid?.endsWith("@g.us") && this.sock && !this.groupMetadataCache.has(jid)) {
          try {
            const meta = await this.sock.groupMetadata(jid)
            this.groupMetadataCache.set(jid, meta)
          } catch {
            // Non-fatal — proceed without cache entry
          }
        }

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
   * Send a WhatsApp message with retry logic
   */
  async sendMessage(to: string, text: string, retries = 3): Promise<boolean> {
    if (!this.sock) {
      console.error("[WhatsAppTrigger] Socket not available")
      return false
    }

    // For group chats, ensure the metadata cache is populated before the first attempt.
    // relayMessage → assertSessions needs participant JIDs to fetch Signal keys from the server.
    if (to.endsWith("@g.us") && !this.groupMetadataCache.has(to)) {
      try {
        const meta = await this.sock.groupMetadata(to)
        this.groupMetadataCache.set(to, meta)
        console.log(`[WhatsAppTrigger] Pre-fetched group metadata for ${to} (${meta.participants?.length ?? 0} participants)`)
      } catch (err) {
        console.warn(`[WhatsAppTrigger] Could not pre-fetch group metadata for ${to}:`, err)
      }
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[WhatsAppTrigger] Sending message to ${to} (attempt ${attempt}/${retries})`)
        await this.sock.sendMessage(to, { text })
        console.log(`[WhatsAppTrigger] Message sent successfully to ${to}`)
        return true
      } catch (error: any) {
        console.error(`[WhatsAppTrigger] Failed to send message (attempt ${attempt}/${retries}):`, error)

        // If it's a "not-acceptable" error, wait and retry
        // This happens when Signal session isn't established yet
        if (error?.data === 406 || error?.message?.includes("not-acceptable")) {
          if (attempt < retries) {
            const delayMs = attempt * 2000 // 2s, 4s, 6s
            console.log(`[WhatsAppTrigger] Waiting ${delayMs}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, delayMs))
            continue
          }
        }

        // For other errors or if retries exhausted, throw
        if (attempt === retries) {
          throw error
        }
      }
    }

    return false
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

        const success = await this.sendMessage(chatId, message)
        if (!success) {
          console.error(`[WhatsAppTrigger] Failed to send execution result to ${chatId}`)
        }
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

    // Emit status change event for real-time UI updates
    console.log(`[WhatsAppTrigger] Emitting status change: ${connected}`)
    whatsAppStatusEmitter.emit("statusChange", { isConnected: connected })
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
    // Check connection state with detailed logging
    console.log(`[WhatsAppTrigger] createGroup called. sock=${!!this.sock}, isRunning=${this.isRunning}`)

    if (!this.sock) {
      throw new Error("WhatsApp not connected. Please connect WhatsApp in Settings first.")
    }

    if (!this.isRunning) {
      throw new Error("WhatsApp connection is not active. Please check the connection status.")
    }

    try {
      console.log(`[WhatsAppTrigger] Creating group: ${name}`)

      // Get user's own JID to add as initial participant
      // WhatsApp requires at least one participant to create a group
      const userJid = await this.getOwnJid()
      console.log(`[WhatsAppTrigger] getOwnJid result: ${userJid}`)
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

      // Fetch group metadata to establish Signal session
      // This is required before we can send messages to the group
      console.log(`[WhatsAppTrigger] Fetching group metadata to establish Signal session...`)
      try {
        await this.sock.groupMetadata(groupMetadata.id)
        console.log(`[WhatsAppTrigger] Group metadata fetched successfully`)
      } catch (metadataError) {
        console.warn(`[WhatsAppTrigger] Could not fetch group metadata:`, metadataError)
        // Non-fatal - continue even if metadata fetch fails
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

      // Send welcome message to verify group is working
      // Wait longer for the Signal session to be established
      console.log("[WhatsAppTrigger] Waiting 5 seconds for Signal session establishment...")
      await new Promise(resolve => setTimeout(resolve, 5000))

      try {
        const welcomeMessage = description
          ? `🤖 *Claw Automation Group*\n\n${description}\n\n_Group ID: ${groupMetadata.id}_`
          : `🤖 *Claw Automation Group*\n\nThis group has been created for Claw automation.\n\n_Group ID: ${groupMetadata.id}_`

        // Use retry logic for welcome message
        const success = await this.sendMessage(groupMetadata.id, welcomeMessage, 5) // 5 retries
        if (success) {
          console.log(`[WhatsAppTrigger] Welcome message sent to group`)
        } else {
          console.warn(`[WhatsAppTrigger] Welcome message could not be sent after retries`)
        }
      } catch (msgError) {
        console.warn("[WhatsAppTrigger] Could not send welcome message:", msgError)
        // Don't fail group creation if welcome message fails
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

      // Normalize JID: remove device suffix for cleaner format
      // Convert "15199099844:31@s.whatsapp.net" to "15199099844@s.whatsapp.net"
      const rawJid = userJid
      if (userJid) {
        const match = userJid.match(/^(\d+)(:\d+)?(@s\.whatsapp\.net)$/)
        if (match) {
          userJid = `${match[1]}${match[3]}`
          console.log(`[WhatsAppTrigger] Normalized JID: ${rawJid} -> ${userJid}`)
        } else {
          console.log(`[WhatsAppTrigger] JID did not match pattern: ${userJid}`)
        }
      }

      console.log(`[WhatsAppTrigger] getOwnJid: found=${!!userJid}, jid=${userJid}`)
      return userJid || null
    } catch (error) {
      console.error("[WhatsAppTrigger] Failed to get own JID:", error)
      return null
    }
  }

  /**
   * Send a test message to verify a group/chat is working
   */
  async sendTestMessage(chatId: string): Promise<void> {
    if (!this.sock) {
      throw new Error("WhatsApp not connected")
    }

    const testMessage = `🧪 *Test Message*\n\nThis is a test from Claw automation.\n\nIf you received this, the WhatsApp integration is working correctly!\n\n_Time: ${new Date().toLocaleString()}_`

    const success = await this.sendMessage(chatId, testMessage)
    if (!success) {
      throw new Error("Failed to send test message after retries")
    }
    console.log(`[WhatsAppTrigger] Test message sent to ${chatId}`)
  }

  /**
   * Get list of groups the user is in
   */
  async getGroups(): Promise<Array<{ id: string; name: string; participantCount: number }>> {
    if (!this.sock) {
      throw new Error("WhatsApp not connected")
    }

    try {
      console.log("[WhatsAppTrigger] Fetching groups...")
      const groups = await this.sock.groupFetchAllParticipating()

      if (!groups) {
        return []
      }

      const result = Object.entries(groups).map(([id, metadata]: [string, any]) => ({
        id,
        name: metadata.subject || "Unknown",
        participantCount: metadata.participants?.length || 0,
      }))

      console.log(`[WhatsAppTrigger] Found ${result.length} groups`)
      return result
    } catch (error) {
      console.error("[WhatsAppTrigger] Failed to fetch groups:", error)
      throw error
    }
  }
}
