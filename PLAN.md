# Discord Integration Plan

Add Discord as a third messaging platform alongside WhatsApp and Slack, enabling 2-way sync between Discord channels and Claw chats.

## Overview

Follow the existing WhatsApp/Slack patterns exactly:
- **Backend trigger** (singleton class with start/stop/sendMessage)
- **tRPC router** (credentials, connection, channel management)
- **Database tables** (settings + bridges)
- **UI** (settings tab + new-chat-form connection option)

Discord uses a **bot token** approach (like Slack), stored encrypted via `safeStorage`. Uses `discord.js` library for both incoming messages (Gateway events) and outgoing messages (REST API).

---

## Phase 1: Database Schema & Migrations

### Files to create/modify:
- `src/main/lib/db/schema/index.ts` — Add table definitions
- `drizzle/0075_add_discord_settings.sql` — Settings table
- `drizzle/0076_add_discord_bridges.sql` — Bridges table

### Changes:

**1a. `discordSettings` table** (mirrors `slackSettings`):
```sql
CREATE TABLE discord_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  encrypted_bot_token TEXT,
  guild_id TEXT,
  guild_name TEXT,
  is_connected INTEGER DEFAULT 0,
  updated_at INTEGER
);
```

**1b. `discordBridges` table** (mirrors `whatsappBridges`):
```sql
CREATE TABLE discord_bridges (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  sub_chat_id TEXT REFERENCES sub_chats(id),
  discord_guild_id TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  discord_channel_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

**1c. Update schema/index.ts** — Add Drizzle table exports for `discordSettings` and `discordBridges`, plus TypeScript types (`DiscordSettings`, `DiscordBridge`).

**1d. Update `chatSessions` platform enum** — Add `"discord"` alongside existing `"whatsapp"` and `"slack"` values.

---

## Phase 2: Backend Trigger

### Files to create:
- `src/main/lib/claws/discord-trigger.ts`

### Design:

Singleton class following the WhatsApp/Slack trigger patterns:

```typescript
class DiscordTrigger {
  private client: Client | null = null;
  private status: "disconnected" | "connecting" | "connected" | "error";

  // Lifecycle
  async start(botToken: string): Promise<void>   // Login, register event handlers
  async stop(): Promise<void>                      // Disconnect, cleanup
  getStatus(): string

  // Messaging
  async sendMessage(channelId: string, text: string): Promise<void>
  async createChannel(guildId: string, name: string): Promise<{id, name}>

  // Discovery
  async getGuilds(): Promise<Array<{id, name}>>
  async getChannels(guildId: string): Promise<Array<{id, name, type}>>

  // Events
  private handleMessage(message: Message): Promise<void>  // Filter + dispatch to claws
}
```

**Key behaviors:**
- Uses `discord.js` library (`bun add discord.js`)
- Intents: `Guilds`, `GuildMessages`, `MessageContent`
- On `messageCreate`: filter out bot's own messages, look up matching headless claws with `triggerType: "discord_message"` and matching `discordChannelFilter`, execute them
- Forward to bridges via event emitter (like WhatsApp pattern)
- Singleton getter: `getDiscordTrigger()` exported for use in routers

---

## Phase 3: tRPC Router

### Files to create:
- `src/main/lib/trpc/routers/discord.ts`

### Files to modify:
- `src/main/lib/trpc/routers/index.ts` — Register discord router
- `src/main/lib/trpc/routers/claude.ts` — Add Discord message forwarding
- `src/main/lib/trpc/routers/chats.ts` — Add Discord to `updateConnection`

### Router procedures:

| Procedure | Type | Description |
|-----------|------|-------------|
| `saveCredentials` | mutation | Encrypt bot token via safeStorage, store in discordSettings |
| `clearCredentials` | mutation | Remove token, disconnect |
| `hasCredentials` | query | Check if bot token configured |
| `testConnection` | mutation | Verify bot can connect to Discord API |
| `connect` | mutation | Start DiscordTrigger with stored token |
| `disconnect` | mutation | Stop DiscordTrigger |
| `getStatus` | query | Return connection status |
| `listGuilds` | query | Get servers the bot is in |
| `listChannels` | query | Get text channels in a guild |
| `setupChannelClaw` | mutation | Create channel + headless claw (one-shot) |
| `sendToChannel` | mutation | Send message to a channel |
| `createBridge` | mutation | Link Discord channel <-> Claw chat |
| `deleteBridge` | mutation | Remove bridge |
| `getBridges` | query | List bridges for a chat |
| `onStatusChange` | subscription | Status change events |

### claude.ts changes (message forwarding):

Add Discord case alongside existing WhatsApp/Slack in two places:
1. **Question forwarding** (~line 1220): Forward `AskUserQuestion` text to Discord channel
2. **Response forwarding** (~line 2260): Forward final Claude response to Discord channel

```typescript
else if (parentChat.connectionType === "discord") {
  getDiscordTrigger().sendMessage(parentChat.connectionTarget, text);
}
```

### chats.ts changes (updateConnection):

Add Discord case in `updateConnection` mutation (~line 500):
- Auto-create headless claw with `triggerType: "discord_message"` and `triggerConfig: { discordChannelFilter: channelId }`
- Auto-create Discord bridge entry

---

## Phase 4: Settings UI

### Files to create:
- `src/renderer/components/dialogs/settings-tabs/agents-discord-tab.tsx`

### Files to modify:
- Settings dialog that renders the tabs (add Discord tab alongside WhatsApp/Slack)

### UI design (mirrors Slack tab):

```
Discord Integration
---------------------
Bot Token:  [************] [Save] [Clear]
Status:     * Connected to "My Server"  [Disconnect]

Server:     [Dropdown: select guild]
            > Test Connection

Channels:   [List of text channels in selected guild]
            > [Setup Claw] button per channel
```

**Key components:**
- Token input with show/hide toggle
- Connection status indicator (green/red dot)
- Guild selector dropdown (populated from `listGuilds`)
- Channel list (populated from `listChannels`)
- "Setup Channel Claw" button that calls `setupChannelClaw`

---

## Phase 5: New Chat Form Integration

### Files to modify:
- `src/renderer/features/agents/main/new-chat-form.tsx`

### Changes:

1. Add Discord radio option to the connection type selector (alongside None/WhatsApp/Slack)
2. Add `trpc.discord.hasCredentials.useQuery()` check — grey out option if not configured
3. Add `trpc.discord.getStatus.useQuery()` check — show warning if not connected
4. On form submit with Discord selected:
   - Call `setupChannelClaw` or `createChannel` to create a dedicated channel
   - Call `chats.updateConnection` with `connectionType: "discord"`, `connectionTarget: channelId`, `connectionName: "#channel-name"`

---

## Phase 6: App Lifecycle & Wiring

### Files to modify:
- `src/main/index.ts` — Auto-start Discord trigger on app launch if credentials exist
- `src/main/lib/claws/index.ts` — Register `"discord_message"` trigger type in daemon

### Changes:

**App startup:**
```typescript
// After existing WhatsApp/Slack auto-connect logic:
const discordSettings = db.select().from(discordSettings).get();
if (discordSettings?.encryptedBotToken && discordSettings?.isConnected) {
  const token = decryptText(discordSettings.encryptedBotToken);
  getDiscordTrigger().start(token);
}
```

**Claws daemon:**
- Add `"discord_message"` to the trigger type switch/case that processes incoming messages
- Route to the same `executeClawWithMessage()` pattern used by WhatsApp/Slack

---

## Dependencies

```bash
bun add discord.js
```

`discord.js` is the standard Discord bot library (~45k GitHub stars). It handles:
- Gateway WebSocket connection (incoming messages)
- REST API (sending messages, creating channels)
- Built-in caching, rate limiting, reconnection

---

## File Summary

| Action | File |
|--------|------|
| **Create** | `drizzle/0075_add_discord_settings.sql` |
| **Create** | `drizzle/0076_add_discord_bridges.sql` |
| **Create** | `src/main/lib/claws/discord-trigger.ts` |
| **Create** | `src/main/lib/trpc/routers/discord.ts` |
| **Create** | `src/renderer/components/dialogs/settings-tabs/agents-discord-tab.tsx` |
| **Modify** | `src/main/lib/db/schema/index.ts` (add tables) |
| **Modify** | `src/main/lib/trpc/routers/index.ts` (register router) |
| **Modify** | `src/main/lib/trpc/routers/claude.ts` (message forwarding) |
| **Modify** | `src/main/lib/trpc/routers/chats.ts` (updateConnection) |
| **Modify** | `src/main/index.ts` (auto-start on launch) |
| **Modify** | `src/main/lib/claws/index.ts` (register trigger type) |
| **Modify** | `src/renderer/features/agents/main/new-chat-form.tsx` (add Discord option) |
| **Modify** | Settings dialog component (add Discord tab) |

---

## Implementation Order

1. **Phase 1** (Database) — Foundation, no runtime deps
2. **Phase 2** (Trigger) — Core backend logic
3. **Phase 3** (Router) — API layer connecting trigger to UI
4. **Phase 4** (Settings UI) — Credential management
5. **Phase 5** (New Chat Form) — Chat creation flow
6. **Phase 6** (Lifecycle) — Auto-start, daemon wiring
