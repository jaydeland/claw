# Image Attachment Support Plan for Claw

## Overview

To enable image attachment support in Claw (WhatsApp integration), we need to modify the message handling pipeline to:
1. Detect and extract media attachments from incoming WhatsApp messages
2. Download and process the media files
3. Pass media context to Claude sessions
4. Optionally support sending images back via WhatsApp

## Current Architecture

### Message Flow (Text Only)
```
WhatsApp Message → whatsapp-trigger.ts → handleMessage()
  → extractMessageText() → Queue Item → Session → Claude
```

### Key Files
- `src/main/lib/trpc/routers/whatsapp.ts` - tRPC API for WhatsApp controls
- `src/main/lib/claws/whatsapp-trigger.ts` - Baileys socket, message handling
- `src/main/lib/claws/queue-types.ts` - Queue item schema (text only)
- `src/main/lib/claws/session-manager.ts` - Session context storage
- `src/main/lib/claws/queue-manager.ts` - Message queue processing

## Required Changes

### 1. Database Schema Updates

**File:** `src/main/lib/db/schema/index.ts`

Add media attachment tables and update existing schemas:

```typescript
// New table for message attachments
export const messageAttachments = sqliteTable("message_attachments", {
  id: text("id").primaryKey(),
  sessionId: text("sessionId").notNull(),
  messageId: text("messageId").notNull(),
  type: text("type").notNull(), // "image", "video", "audio", "document"
  mimeType: text("mimeType").notNull(),
  fileSize: integer("fileSize"),
  filename: text("filename"),
  caption: text("caption"),
  localPath: text("localPath"), // Path to downloaded file
  whatsappMediaUrl: text("whatsappMediaUrl"), // Original media URL from WA
  downloadedAt: text("downloadedAt"),
  createdAt: text("createdAt").notNull(),
})

// Update chatSessions to track attachment count
// (already has JSON context field - no schema change needed)
```

### 2. Queue Item Schema Update

**File:** `src/main/lib/claws/queue-types.ts`

Extend `WhatsAppQueueItem` to include attachments:

```typescript
export interface WhatsAppQueueItem {
  id: string
  clawId: string
  clawName: string
  externalId: string      // WhatsApp JID (group or user)
  sender: string
  messageText: string
  attachments?: MediaAttachment[]  // NEW: Array of attachments
  timestamp: Date
  status: "pending" | "processing" | "completed" | "failed"
  sessionId: string
  executionId?: string
  exitCode?: number
  logs?: string
  errorMessage?: string
}

export interface MediaAttachment {
  type: "image" | "video" | "audio" | "document"
  mimeType: string
  filename?: string
  caption?: string
  fileSize?: number
  localPath?: string
  base64Data?: string  // For small images, inline for Claude
}
```

### 3. Message Extraction Enhancement

**File:** `src/main/lib/claws/whatsapp-trigger.ts`

Update `extractMessageText()` to `extractMessageContent()`:

```typescript
private async extractMessageContent(msg: any): Promise<{
  text: string | null;
  attachments: MediaAttachment[];
}> {
  const message = msg.message
  if (!message) return { text: null, attachments: [] }

  const attachments: MediaAttachment[] = []

  // Extract text (existing logic)
  let text: string | null = null
  if (message.conversation) text = message.conversation
  else if (message.extendedTextMessage?.text) text = message.extendedTextMessage.text
  else if (message.buttonsResponseMessage?.selectedDisplayText) text = message.buttonsResponseMessage.selectedDisplayText
  else if (message.listResponseMessage?.title) text = message.listResponseMessage.title

  // Extract image attachments
  if (message.imageMessage) {
    const image = message.imageMessage
    const attachment = await this.downloadMedia(image)
    attachments.push({
      type: "image",
      mimeType: image.mimetype || "image/jpeg",
      filename: image.filename || `image_${Date.now()}.jpg`,
      caption: image.caption,
      fileSize: image.fileLength?.toNumber(),
      ...attachment,
    })
  }

  // Extract video attachments
  if (message.videoMessage) {
    const video = message.videoMessage
    const attachment = await this.downloadMedia(video)
    attachments.push({
      type: "video",
      mimeType: video.mimetype || "video/mp4",
      filename: video.filename || `video_${Date.now()}.mp4`,
      caption: video.caption,
      fileSize: video.fileLength?.toNumber(),
      ...attachment,
    })
  }

  // Extract document attachments
  if (message.documentMessage) {
    const doc = message.documentMessage
    const attachment = await this.downloadMedia(doc)
    attachments.push({
      type: "document",
      mimeType: doc.mimetype || "application/octet-stream",
      filename: doc.fileName || `document_${Date.now()}`,
      caption: doc.caption,
      fileSize: doc.fileLength?.toNumber(),
      ...attachment,
    })
  }

  // Extract audio attachments
  if (message.audioMessage) {
    const audio = message.audioMessage
    const attachment = await this.downloadMedia(audio)
    attachments.push({
      type: "audio",
      mimeType: audio.mimetype || "audio/ogg",
      filename: `audio_${Date.now()}.ogg`,
      fileSize: audio.fileLength?.toNumber(),
      ...attachment,
    })
  }

  return { text, attachments }
}

// New method to download media from WhatsApp
private async downloadMedia(mediaMessage: any): Promise<{ localPath: string; base64Data?: string }> {
  if (!this.sock) throw new Error("Socket not available")

  try {
    // Download media using Baileys
    const mediaBuffer = await downloadMediaMessage(
      { key: mediaMessage.key, message: { [mediaMessage.type]: mediaMessage } },
      "buffer",
      {},
      {
        logger: baileysLogger,
        reuploadRequest: this.sock.updateMediaMessage,
      }
    )

    // Generate unique filename
    const mediaDir = path.join(app.getPath("userData"), "claw-media")
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true })
    }

    const extension = this.getExtensionFromMime(mediaMessage.mimetype)
    const filename = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`
    const localPath = path.join(mediaDir, filename)

    // Save to disk
    fs.writeFileSync(localPath, mediaBuffer)

    // For images, also store base64 for inline Claude context
    if (mediaMessage.mimetype?.startsWith("image/")) {
      const base64Data = mediaBuffer.toString("base64")
      // Only include base64 if under size limit (prevent context bloat)
      if (base64Data.length < 500000) { // ~500KB limit
        return { localPath, base64Data: `data:${mediaMessage.mimetype};base64,${base64Data}` }
      }
    }

    return { localPath }
  } catch (error) {
    console.error("[WhatsAppTrigger] Media download failed:", error)
    throw error
  }
}

// Helper to get file extension from MIME type
private getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "application/pdf": "pdf",
    "text/plain": "txt",
  }
  return mimeToExt[mimeType?.toLowerCase()] || "bin"
}
```

### 4. Session Context Enhancement

**File:** `src/main/lib/claws/session-manager.ts`

Update context to include attachment metadata:

```typescript
export interface SessionContext {
  messageHistory: Array<{
    role: "user" | "assistant"
    content: string
    attachments?: MediaAttachment[]  // NEW
    timestamp: number
  }>
  metadata: Record<string, unknown>
}

// Update addMessageToSession signature
export async function addMessageToSession(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  attachments?: MediaAttachment[]  // NEW
): Promise<void> {
  // ... existing implementation, push attachments with message
}
```

### 5. Prompt Building for Claude

**File:** `src/main/lib/claude/index.ts` or system prompts config

When building the prompt for Claude, include attachment context:

```typescript
function buildPromptWithContext(session: ChatSession, newMessage: string, attachments?: MediaAttachment[]): string {
  const context = getSessionContext(session)

  // Build attachment description for context
  let attachmentContext = ""
  if (attachments?.length) {
    attachmentContext = `\n\nUser has attached ${attachments.length} file(s):\n`
    for (const att of attachments) {
      if (att.type === "image") {
        attachmentContext += `- Image: ${att.filename || "unnamed"} (${att.caption || "no caption"})\n`
        if (att.base64Data) {
          attachmentContext += `  [Image data available for analysis]\n`
        }
      } else if (att.type === "document") {
        attachmentContext += `- Document: ${att.filename} (${att.mimeType})\n`
      } else if (att.type === "video") {
        attachmentContext += `- Video: ${att.filename || "unnamed"} (${att.caption || "no caption"})\n`
      } else if (att.type === "audio") {
        attachmentContext += `- Audio: ${att.filename || "unnamed"}\n`
      }
    }
  }

  // For images with base64, Claude can "see" them via the API
  // This requires using the messages API with image blocks
  // See: https://docs.anthropic.com/claude/docs/vision

  return `${attachmentContext}\n\n${newMessage}`
}
```

### 6. tRPC Router Extensions

**File:** `src/main/lib/trpc/routers/whatsapp.ts`

Add new endpoints for media management:

```typescript
// Get attachments for a session
getAttachments: publicProcedure
  .input(z.object({ sessionId: z.string().min(1) }))
  .query(async ({ input }) => {
    const db = getDatabase()
    const attachments = db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.sessionId, input.sessionId))
      .all()
    return { success: true, attachments }
  }),

// Download media to local path (manual trigger)
downloadMedia: publicProcedure
  .input(z.object({ messageId: z.string(), attachmentIndex: z.number() }))
  .mutation(async ({ input }) => {
    const trigger = getWhatsAppTrigger()
    // Implementation would fetch from WhatsApp and save
    return { success: true, localPath: "..." }
  }),

// Preview image as base64
getImagePreview: publicProcedure
  .input(z.object({ attachmentId: z.string() }))
  .query(async ({ input }) => {
    const db = getDatabase()
    const attachment = db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.id, input.attachmentId))
      .get()

    if (!attachment || !attachment.localPath) {
      return { success: false, error: "Attachment not found" }
    }

    const data = fs.readFileSync(attachment.localPath)
    const base64 = data.toString("base64")
    const mimeType = attachment.mimeType || "image/jpeg"

    return {
      success: true,
      base64: `data:${mimeType};base64,${base64}`,
      mimeType,
      filename: attachment.filename,
    }
  }),
```

### 7. UI Components (Renderer)

**New file:** `src/renderer/features/agents/components/attachment-viewer.tsx`

Component to display attachments in chat:

```typescript
interface AttachmentViewerProps {
  attachments: MediaAttachment[]
  onDownload?: (attachment: MediaAttachment) => void
}

export function AttachmentViewer({ attachments, onDownload }: AttachmentViewerProps) {
  return (
    <div className="attachment-grid">
      {attachments.map((att) => (
        <div key={att.filename} className="attachment-card">
          {att.type === "image" && att.base64Data && (
            <img src={att.base64Data} alt={att.caption || att.filename} />
          )}
          {att.type === "image" && !att.base64Data && (
            <div className="placeholder">Image (download to view)</div>
          )}
          {att.type === "document" && (
            <div className="document-icon">📄 {att.filename}</div>
          )}
          {att.type === "video" && (
            <div className="video-placeholder">🎬 {att.caption || att.filename}</div>
          )}
          {att.type === "audio" && (
            <div className="audio-placeholder">🎵 {att.filename}</div>
          )}
          <div className="attachment-meta">
            <span>{att.fileSize ? formatBytes(att.fileSize) : "Unknown size"}</span>
            {onDownload && <button onClick={() => onDownload(att)}>Download</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### 8. WhatsApp Bridge Message Extension

**File:** `src/main/lib/claws/whatsapp-trigger.ts`

Update `WhatsAppBridgeMessage` type:

```typescript
export interface WhatsAppBridgeMessage {
  bridgeId: string
  chatId: string
  subChatId: string
  whatsappJid: string
  sender: string
  text: string
  attachments?: MediaAttachment[]  // NEW
  timestamp: number
  messageId: string
  fromMe: boolean
}
```

Update `forwardToBridges()` to include attachments.

### 9. Import Required Baileys Function

**File:** `src/main/lib/claws/whatsapp-trigger.ts`

Add import for media download:

```typescript
// In loadBaileys(), also import downloadMediaMessage
let downloadMediaMessage: any

async function loadBaileys(): Promise<void> {
  if (makeWASocket) return
  const b = await import("@whiskeysockets/baileys")
  makeWASocket = b.makeWASocket
  DisconnectReason = b.DisconnectReason
  useMultiFileAuthState = b.useMultiFileAuthState
  delay = b.delay
  Browsers = b.Browsers
  fetchLatestBaileysVersion = b.fetchLatestBaileysVersion
  downloadMediaMessage = b.downloadMediaMessage  // NEW
}
```

### 10. System Prompt Update

**File:** `src/main/lib/db/seeds/system-prompts.ts`

Update system prompts to inform Claude about attachment handling:

```typescript
// Add to system prompt:
"You may receive messages with attached images, documents, or other media.
When an image is attached, you can analyze its contents.
Describe what you see in images when users ask about them.
For documents, acknowledge their presence and ask what the user wants to do with them."
```

## Implementation Phases

### Phase 1: Core Infrastructure (Backend Only)
1. Database schema migration
2. Queue item schema update
3. Media download implementation
4. Session context updates

### Phase 2: Message Pipeline Integration
1. Update `handleMessage()` to extract attachments
2. Update queue processing to pass attachments
3. Update prompt building for Claude API

### Phase 3: Claude Vision Integration
1. Use Anthropic Messages API with image blocks
2. Convert base64 to proper image content format
3. Test with various image types

### Phase 4: UI Components
1. Attachment viewer component
2. Chat message rendering with attachments
3. Download functionality

### Phase 5: Polish & Optimization
1. Media caching strategy
2. Size limits and cleanup jobs
3. Performance testing

## WhatsApp Media Considerations

### Media URL Expiration
- WhatsApp media URLs expire after ~5 minutes
- Always download immediately when message arrives
- Store locally for later access

### Size Limits
- WhatsApp: Images up to 20MB, Documents up to 2GB
- Claude: Image uploads up to ~10MB via base64
- Strategy: Download all media, inline small images (<500KB), reference larger files by path

### Group vs Individual Messages
- Groups: Media from any participant
- Individuals: Direct media exchange
- Bot should handle both uniformly

## Testing Checklist

- [ ] Single image message
- [ ] Multiple images in one message
- [ ] Image with caption
- [ ] Document attachment
- [ ] Video attachment
- [ ] Audio attachment
- [ ] Group chat with media
- [ ] Large image handling
- [ ] Media download failure handling
- [ ] Session persistence across restarts
- [ ] Claude vision responses
- [ ] UI rendering of attachments

## Security Considerations

1. **File type validation** - Verify MIME types match content
2. **Size limits** - Prevent DoS via large files
3. **Sandboxed storage** - Store media in isolated directory
4. **Cleanup jobs** - Remove old media periodically
5. **Access control** - Only session owners can access their media

## API Cost Implications

- Claude Vision API may have different pricing
- Image tokens count toward context limits
- Consider caching image analysis results

## References

- [Anthropic Vision API](https://docs.anthropic.com/claude/docs/vision)
- [Baileys Media Handling](https://github.com/WhiskeySockets/Baileys#media)
- [WhatsApp Media Types](https://developers.facebook.com/docs/whatsapp/api/media/)
