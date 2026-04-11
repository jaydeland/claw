/**
 * WhatsApp Adapter - Simplified WhatsApp integration
 *
 * Handles connection and messaging without Claws dependencies.
 * Messages are forwarded directly to connected chats.
 */

import { app } from "electron"
import { EventEmitter } from "events"
import * as path from "path"
import * as fs from "fs"
import { getDatabase, chats, whatsappSettings, projects } from "../db"
import { eq } from "drizzle-orm"
import { join } from "path"
import { incomingMessageEmitter } from "../messaging"

// Baileys exports (lazy loaded)
let makeWASocket: any
let DisconnectReason: any
let useMultiFileAuthState: any
let delay: any
let Browsers: any
let fetchLatestBaileysVersion: any
let downloadContentFromMessage: any
let proto: any

// Logger for Baileys internals
const baileysLogger = {
  trace: () => {},
  debug: () => {},
  info: (...a: any[]) => console.log("[Baileys]", ...a),
  warn: (...a: any[]) => console.warn("[Baileys]", ...a),
  error: (...a: any[]) => console.error("[Baileys]", ...a),
  fatal: (...a: any[]) => console.error("[Baileys FATAL]", ...a),
  child: () => baileysLogger,
  level: "silent",
}

async function loadBaileys(): Promise<void> {
  if (makeWASocket) return
  const b = await import("@whiskeysockets/baileys")
  makeWASocket = b.makeWASocket
  DisconnectReason = b.DisconnectReason
  useMultiFileAuthState = b.useMultiFileAuthState
  delay = b.delay
  Browsers = b.Browsers
  fetchLatestBaileysVersion = b.fetchLatestBaileysVersion
  downloadContentFromMessage = b.downloadContentFromMessage
  proto = b.proto
}

type WASocket = any

// Event emitters for UI
export const whatsAppQREmitter = new EventEmitter()
export const whatsAppStatusEmitter = new EventEmitter()

// Singleton instance
let whatsappAdapterInstance: WhatsAppAdapter | null = null

export function getWhatsAppAdapter(): WhatsAppAdapter {
  if (!whatsappAdapterInstance) {
    whatsappAdapterInstance = new WhatsAppAdapter()
  }
  return whatsappAdapterInstance
}

export class WhatsAppAdapter {
  private sock: WASocket | null = null
  private isRunning = false
  private isStarting = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private sessionPath: string
  private groupMetadataCache = new Map<string, any>()
  private lidToPhoneMap: Record<string, string> = {}
  private lastQRCode: string | null = null

  constructor() {
    this.sessionPath = path.join(app.getPath("userData"), "baileys_auth")
  }

  isActive(): boolean {
    return this.isRunning
  }

  getLastQRCode(): string | null {
    return this.lastQRCode
  }

  /**
   * Start WhatsApp connection if session exists
   */
  async startIfSessionExists(): Promise<void> {
    if (fs.existsSync(this.sessionPath)) {
      console.log("[WhatsAppAdapter] Session exists, auto-starting...")
      await this.start()
    }
  }

  /**
   * Start the WhatsApp connection
   */
  async start(): Promise<void> {
    if (this.isRunning || this.isStarting) {
      console.log("[WhatsAppAdapter] Already running or starting")
      return
    }

    if (this.sock) {
      try {
        this.sock.end(undefined)
        this.sock = null
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    this.isStarting = true
    this.reconnectAttempts = 0

    try {
      console.log("[WhatsAppAdapter] Starting WhatsApp connection...")
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true })
      }
      await this.connect()
    } catch (error) {
      this.isStarting = false
      console.error("[WhatsAppAdapter] Failed to start:", error)
      throw error
    }
  }

  private async connect(): Promise<void> {
    await loadBaileys()

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath)

    const hasCreds = !!state.creds?.me?.id
    const syncKeys = Object.keys(state.creds?.accountSyncCounter || {}).length
    console.log(`[WhatsAppAdapter] Auth state: hasCreds=${hasCreds}, syncKeys=${syncKeys}`)

    if (hasCreds && syncKeys === 0) {
      console.log("[WhatsAppAdapter] Warning: Session has creds but no sync state")
    }

    let waVersion: [number, number, number] | undefined
    try {
      const { version } = await fetchLatestBaileysVersion()
      waVersion = version
      console.log(`[WhatsAppAdapter] Using WA version: ${version.join(".")}`)
    } catch (err) {
      console.warn("[WhatsAppAdapter] Could not fetch latest WA version:", err)
    }

    this.sock = makeWASocket({
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: state.keys,
      },
      ...(waVersion ? { version: waVersion } : {}),
      browser: Browsers ? Browsers.macOS("Chrome") : ["Mac OS X", "Chrome", "120.0.0.0"],
      shouldSyncHistoryMessage: () => false,
      syncFullHistory: false,
      cachedGroupMetadata: async (jid: string) => this.groupMetadataCache.get(jid),
    })

    this.sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        console.log("[WhatsAppAdapter] QR code generated")
        this.lastQRCode = qr
        whatsAppQREmitter.emit("qr", qr)
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
        const errorMessage = lastDisconnect?.error?.message
        const isNoiseHandshakeFailure = errorMessage === "Connection Failure"
        const isRestartRequired = statusCode === 515 || errorMessage?.includes("restart required")
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        this.isRunning = false
        this.isStarting = false

        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++

          const needsSessionReset = isNoiseHandshakeFailure
          if (needsSessionReset && fs.existsSync(this.sessionPath)) {
            console.log("[WhatsAppAdapter] Clearing stale session...")
            try {
              fs.rmSync(this.sessionPath, { recursive: true, force: true })
              fs.mkdirSync(this.sessionPath, { recursive: true })
            } catch (clearErr) {
              console.error("[WhatsAppAdapter] Failed to clear session:", clearErr)
            }
          }

          const retryDelay = isRestartRequired ? 3000 : needsSessionReset ? 10000 : 5000
          console.log(`[WhatsAppAdapter] Reconnecting (attempt ${this.reconnectAttempts}) in ${retryDelay / 1000}s...`)
          await delay(retryDelay)

          if (isRestartRequired) {
            await delay(1000)
          }

          await this.connect()
        } else {
          const isLoggedOut = statusCode === DisconnectReason?.loggedOut || statusCode === 401
          console.log(`[WhatsAppAdapter] Connection closed: loggedOut=${isLoggedOut}`)

          if (isLoggedOut && fs.existsSync(this.sessionPath)) {
            try {
              fs.rmSync(this.sessionPath, { recursive: true, force: true })
            } catch (clearErr) {
              console.error("[WhatsAppAdapter] Failed to clear session:", clearErr)
            }
          }

          await this.updateConnectionStatus(false)
          whatsAppQREmitter.emit("qr", null)
          this.lastQRCode = null
        }
      } else if (connection === "open") {
        console.log("[WhatsAppAdapter] Connected successfully")
        this.reconnectAttempts = 0
        this.isRunning = true
        this.isStarting = false
        await this.updateConnectionStatus(true)

        if (this.sock?.user) {
          const phoneUser = this.sock.user.id.split(":")[0]
          const lidUser = (this.sock.user as any).lid?.split(":")[0]
          if (lidUser && phoneUser) {
            this.lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`
          }
        }

        whatsAppQREmitter.emit("qr", null)
        this.lastQRCode = null
      }
    })

    this.sock.ev.on("app-state-sync.error", (error: any) => {
      console.log(`[WhatsAppAdapter] App state sync error: ${error.message || error}`)
    })

    this.sock.ev.on("groups.upsert", (groups: any) => {
      for (const group of groups) {
        this.groupMetadataCache.set(group.id, group)
      }
    })

    this.sock.ev.on("groups.update", (updates: any) => {
      for (const update of updates) {
        if (update.id) {
          const existing = this.groupMetadataCache.get(update.id)
          if (existing) {
            this.groupMetadataCache.set(update.id, { ...existing, ...update })
          }
        }
      }
    })

    this.sock.ev.on("messages.upsert", async ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== "notify") return

      for (const msg of messages) {
        const jid = msg.key.remoteJid
        if (jid?.endsWith("@g.us") && this.sock) {
          if (!this.groupMetadataCache.has(jid)) {
            try {
              const meta = await this.sock.groupMetadata(jid)
              this.groupMetadataCache.set(jid, meta)
            } catch (err) {
              console.warn(`[WhatsAppAdapter] Could not fetch group metadata for ${jid}:`)
            }
          }
        }
        await this.handleMessage(msg)
      }
    })

    this.sock.ev.on("error", (error: any) => {
      console.error("[WhatsAppAdapter] Socket error:", error?.message || error)
    })

    this.sock.ev.on("creds.update", (creds: any) => {
      saveCreds(creds)
    })
  }

  private async handleMessage(msg: any): Promise<void> {
    const from = msg.key.remoteJid
    const isGroup = from?.endsWith("@g.us")

    if (msg.key.fromMe && !isGroup) return

    const messageContent = await this.extractMessageContent(msg)
    if (!messageContent) return

    const sender = msg.pushName || "Unknown"
    console.log(`[WhatsAppAdapter] Message from ${sender} (${from}): ${messageContent.text?.substring(0, 100) || "[Media]"}`)

    try {
      // Find chats connected to this WhatsApp JID
      const db = getDatabase()
      const connectedChats = db
        .select()
        .from(chats)
        .where(eq(chats.connectionType, "whatsapp"))
        .all()
        .filter(chat => chat.connectionTarget === from)

      if (connectedChats.length === 0) {
        console.log(`[WhatsAppAdapter] No connected chats for ${from}`)
        console.log(`[WhatsAppAdapter] To connect this group, use JID: ${from}`)
        return
      }

      for (const chat of connectedChats) {
        // Get project info for this chat to determine storage path
        const project = db
          .select()
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()

        let mediaInfo = null
        if (messageContent.media) {
          // Store media in workspace .claw/data/ directory
          mediaInfo = await this.storeMedia(messageContent.media, chat.id, project?.path)
        }

        console.log(`[WhatsAppAdapter] Emitting message to ${connectedChats.length} connected chat(s), chatId: ${chat.id}`)
        incomingMessageEmitter.emit("message", {
          platform: "whatsapp",
          chatId: chat.id,
          sender,
          text: messageContent.text || "",
          timestamp: Date.now(),
          messageId: msg.key.id || `wa_${Date.now()}`,
          metadata: {
            whatsappJid: from,
            isGroup,
            fromMe: !!msg.key.fromMe,
            media: mediaInfo,
          },
        })
      }
    } catch (error) {
      console.error("[WhatsAppAdapter] Error handling message:", error)
    }
  }

  /**
   * Extract message content including text and media info
   */
  private async extractMessageContent(msg: any): Promise<{ text?: string; media?: { type: string; buffer: Buffer; filename: string; mimetype?: string } } | null> {
    const message = msg.message
    if (!message) return null

    let text: string | undefined
    let media: { type: string; buffer: Buffer; filename: string; mimetype?: string } | undefined

    // Extract text content
    if (message.conversation) {
      text = message.conversation
    } else if (message.extendedTextMessage?.text) {
      text = message.extendedTextMessage.text
    } else if (message.buttonsResponseMessage?.selectedDisplayText) {
      text = message.buttonsResponseMessage.selectedDisplayText
    } else if (message.listResponseMessage?.title) {
      text = message.listResponseMessage.title
    }

    // Check for media messages
    const mediaTypes = [
      { key: "imageMessage", type: "image", ext: "jpg" },
      { key: "documentMessage", type: "document", ext: null },
      { key: "videoMessage", type: "video", ext: "mp4" },
      { key: "audioMessage", type: "audio", ext: "mp3" },
      { key: "stickerMessage", type: "sticker", ext: "webp" },
    ]

    for (const mediaType of mediaTypes) {
      if (message[mediaType.key]) {
        const mediaData = message[mediaType.key]
        try {
          const buffer = await this.downloadMedia(msg, mediaType.key)
          if (buffer) {
            // Determine filename and extension
            let filename = mediaData.fileName || `${Date.now()}`
            let ext = mediaType.ext

            // For documents, use the original filename if available
            if (mediaType.key === "documentMessage" && mediaData.fileName) {
              // Keep original filename for documents
            } else if (ext && !filename.endsWith(`.${ext}`)) {
              filename = `${filename}.${ext}`
            }

            media = {
              type: mediaType.type,
              buffer,
              filename,
              mimetype: mediaData.mimetype,
            }

            // Add caption to text if present
            if (mediaData.caption && !text) {
              text = mediaData.caption
            } else if (mediaData.caption) {
              text = `${text}\n\n[${mediaType.type}: ${mediaData.caption}]`
            }
          }
        } catch (err) {
          console.error(`[WhatsAppAdapter] Failed to download ${mediaType.type}:`, err)
        }
        break // Only process first media type found
      }
    }

    if (!text && !media) return null

    return { text, media }
  }

  /**
   * Download media from a message
   */
  private async downloadMedia(msg: any, mediaType: string): Promise<Buffer | null> {
    if (!downloadContentFromMessage || !this.sock) return null

    try {
      const type = mediaType.replace("Message", "") // e.g., "imageMessage" -> "image"
      const buffer = await downloadContentFromMessage(msg.message, type, {}, this.sock.authState.creds.me?.id)
      return buffer
    } catch (error) {
      console.error(`[WhatsAppAdapter] Error downloading media (${mediaType}):`, error)
      return null
    }
  }

  /**
   * Store media file in workspace .claw/data/ directory
   */
  private async storeMedia(
    media: { type: string; buffer: Buffer; filename: string; mimetype?: string },
    chatId: string,
    projectPath?: string
  ): Promise<{ path: string; url: string; type: string; filename: string; size: number } | null> {
    try {
      // Determine storage path - prefer project path, fallback to app data
      let basePath: string
      if (projectPath) {
        basePath = join(projectPath, ".claw", "data")
      } else {
        basePath = join(app.getPath("userData"), "whatsapp_media", chatId)
      }

      const mediaDir = join(basePath, "whatsapp")
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true })
      }

      // Create a unique filename
      const timestamp = Date.now()
      const safeFilename = media.filename.replace(/[^a-zA-Z0-9.-]/g, "_")
      const finalFilename = `${timestamp}_${safeFilename}`
      const filePath = join(mediaDir, finalFilename)

      // Write file
      fs.writeFileSync(filePath, media.buffer)

      console.log(`[WhatsAppAdapter] Stored media: ${filePath} (${media.buffer.length} bytes)`)

      return {
        path: filePath,
        url: `.claw/data/whatsapp/${finalFilename}`,
        type: media.type,
        filename: media.filename,
        size: media.buffer.length,
      }
    } catch (error) {
      console.error("[WhatsAppAdapter] Failed to store media:", error)
      return null
    }
  }

  private extractMessageText(msg: any): string | null {
    const message = msg.message
    if (!message) return null

    if (message.conversation) return message.conversation
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text
    if (message.buttonsResponseMessage?.selectedDisplayText) return message.buttonsResponseMessage.selectedDisplayText
    if (message.listResponseMessage?.title) return message.listResponseMessage.title

    return null
  }

  async sendMessage(to: string, text: string, retries = 3): Promise<boolean> {
    if (!this.sock) {
      console.error("[WhatsAppAdapter] Socket not available")
      return false
    }

    if (!to || typeof to !== "string") {
      console.error("[WhatsAppAdapter] Invalid 'to' parameter:", to)
      return false
    }

    if (to.endsWith("@g.us") && !this.groupMetadataCache.has(to)) {
      try {
        const meta = await this.sock.groupMetadata(to)
        this.groupMetadataCache.set(to, meta)
      } catch (err) {
        console.warn(`[WhatsAppAdapter] Could not fetch group metadata for ${to}:`)
      }
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.sock.sendMessage(to, { text })
        return true
      } catch (error: any) {
        console.error(`[WhatsAppAdapter] Failed to send message (attempt ${attempt}/${retries}):`, error)

        if (error?.data === 406 || error?.message?.includes("not-acceptable")) {
          if (attempt < retries) {
            const delayMs = attempt * 2000
            await new Promise(resolve => setTimeout(resolve, delayMs))
            continue
          }
        }

        if (attempt === retries) return false
      }
    }

    return false
  }

  async stop(): Promise<void> {
    if (!this.isRunning && !this.sock) return

    console.log("[WhatsAppAdapter] Stopping...")
    try {
      this.sock?.end(undefined)
      this.sock = null
      this.isRunning = false
      this.isStarting = false
      this.lastQRCode = null
      await this.updateConnectionStatus(false)
    } catch (error) {
      console.error("[WhatsAppAdapter] Error stopping:", error)
    }
  }

  async logout(): Promise<void> {
    console.log("[WhatsAppAdapter] Logging out...")
    await this.stop()

    if (fs.existsSync(this.sessionPath)) {
      fs.rmSync(this.sessionPath, { recursive: true, force: true })
    }

    const db = getDatabase()
    db.update(whatsappSettings)
      .set({ isConnected: false, updatedAt: new Date() })
      .where(eq(whatsappSettings.id, "default"))
      .run()
  }

  async getStatus(): Promise<{ isConnected: boolean }> {
    const db = getDatabase()
    const settings = db.select().from(whatsappSettings).where(eq(whatsappSettings.id, "default")).get()
    return { isConnected: settings?.isConnected ?? false }
  }

  private async updateConnectionStatus(connected: boolean): Promise<void> {
    const db = getDatabase()
    const settings = db.select().from(whatsappSettings).where(eq(whatsappSettings.id, "default")).get()

    if (!settings) {
      db.insert(whatsappSettings).values({ id: "default", isConnected: connected, updatedAt: new Date() }).run()
    } else {
      db.update(whatsappSettings)
        .set({ isConnected: connected, updatedAt: new Date() })
        .where(eq(whatsappSettings.id, "default"))
        .run()
    }

    whatsAppStatusEmitter.emit("statusChange", { isConnected: connected })
  }

  async createGroup(name: string, description?: string): Promise<{ groupId: string; inviteUrl?: string }> {
    if (!this.sock || !this.isRunning) {
      throw new Error("WhatsApp not connected")
    }

    const userJid = await this.getOwnJid()
    if (!userJid) {
      throw new Error("Could not get user's JID")
    }

    const groupMetadata = await this.sock.groupCreate(name, [userJid])

    try {
      await this.sock.groupMetadata(groupMetadata.id)
    } catch (metadataError) {
      console.warn("[WhatsAppAdapter] Could not fetch group metadata:", metadataError)
    }

    let inviteUrl: string | undefined
    try {
      const inviteCode = await this.sock.groupInviteCode(groupMetadata.id)
      if (inviteCode) {
        inviteUrl = `https://chat.whatsapp.com/${inviteCode}`
      }
    } catch (err) {
      console.warn("[WhatsAppAdapter] Could not generate invite code:", err)
    }

    await new Promise(resolve => setTimeout(resolve, 5000))

    try {
      const welcomeMessage = description
        ? `🤖 *Claw Chat Group*\n\n${description}\n\n_Group ID: ${groupMetadata.id}_`
        : `🤖 *Claw Chat Group*\n\nThis group is connected to a Claw chat.\n\n_Group ID: ${groupMetadata.id}_`
      await this.sendMessage(groupMetadata.id, welcomeMessage, 5)
    } catch (msgError) {
      console.warn("[WhatsAppAdapter] Could not send welcome message:", msgError)
    }

    return { groupId: groupMetadata.id, inviteUrl }
  }

  async getOwnJid(): Promise<string | null> {
    if (!this.sock) return null

    try {
      const sockAny = this.sock as any
      let userJid = sockAny.user?.id

      if (!userJid && sockAny.authState?.creds?.me?.id) {
        userJid = sockAny.authState.creds.me.id
      }

      if (!userJid && sockAny.jid) {
        userJid = sockAny.jid
      }

      if (userJid) {
        const match = userJid.match(/^(\d+)(:\d+)?(@s\.whatsapp\.net)$/)
        if (match) {
          userJid = `${match[1]}${match[3]}`
        }
      }

      return userJid || null
    } catch (error) {
      console.error("[WhatsAppAdapter] Failed to get own JID:", error)
      return null
    }
  }

  async getGroups(): Promise<Array<{ id: string; name: string; participantCount: number }>> {
    if (!this.sock) {
      throw new Error("WhatsApp not connected")
    }

    const groups = await this.sock.groupFetchAllParticipating()
    if (!groups) return []

    return Object.entries(groups).map(([id, metadata]: [string, any]) => ({
      id,
      name: metadata.subject || "Unknown",
      participantCount: metadata.participants?.length || 0,
    }))
  }
}

export type { WhatsAppAdapter }
