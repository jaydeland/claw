---
name: messaging
description: "Skill for the Messaging area of claw. 27 symbols across 4 files."
---

# Messaging

27 symbols | 4 files | Cohesion: 74%

## When to Use

- Working with code in `src/`
- Understanding how handleSignOut, getWhatsAppAdapter, initMessaging work
- Modifying messaging-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/messaging/whatsapp-adapter.ts` | loadBaileys, startIfSessionExists, start, connect, stop (+12) |
| `src/main/lib/messaging/discord-adapter.ts` | getDiscordAdapter, DiscordAdapter, startIfTokenExists, stop, isActive (+1) |
| `src/main/lib/messaging/index.ts` | initMessaging, shutdownMessaging, sendToPlatform |
| `src/renderer/features/agents/ui/agents-content.tsx` | handleSignOut |

## Entry Points

Start here when exploring this area:

- **`handleSignOut`** (Function) — `src/renderer/features/agents/ui/agents-content.tsx:722`
- **`getWhatsAppAdapter`** (Function) — `src/main/lib/messaging/whatsapp-adapter.ts:60`
- **`initMessaging`** (Function) — `src/main/lib/messaging/index.ts:79`
- **`shutdownMessaging`** (Function) — `src/main/lib/messaging/index.ts:104`
- **`getDiscordAdapter`** (Function) — `src/main/lib/messaging/discord-adapter.ts:20`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `WhatsAppAdapter` | Class | `src/main/lib/messaging/whatsapp-adapter.ts` | 67 |
| `DiscordAdapter` | Class | `src/main/lib/messaging/discord-adapter.ts` | 27 |
| `handleSignOut` | Function | `src/renderer/features/agents/ui/agents-content.tsx` | 722 |
| `getWhatsAppAdapter` | Function | `src/main/lib/messaging/whatsapp-adapter.ts` | 60 |
| `initMessaging` | Function | `src/main/lib/messaging/index.ts` | 79 |
| `shutdownMessaging` | Function | `src/main/lib/messaging/index.ts` | 104 |
| `getDiscordAdapter` | Function | `src/main/lib/messaging/discord-adapter.ts` | 20 |
| `sendToPlatform` | Function | `src/main/lib/messaging/index.ts` | 43 |
| `startIfSessionExists` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 88 |
| `start` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 98 |
| `connect` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 129 |
| `stop` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 539 |
| `logout` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 554 |
| `updateConnectionStatus` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 575 |
| `startIfTokenExists` | Method | `src/main/lib/messaging/discord-adapter.ts` | 43 |
| `stop` | Method | `src/main/lib/messaging/discord-adapter.ts` | 113 |
| `isActive` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 81 |
| `sendMessage` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 497 |
| `createGroup` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 591 |
| `getOwnJid` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 633 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `InitMessaging → On` | cross_community | 7 |
| `InitMessaging → DownloadMedia` | cross_community | 7 |
| `InitMessaging → Flush` | cross_community | 7 |
| `InitMessaging → GetDatabasePath` | cross_community | 7 |
| `ShutdownMessaging → Flush` | cross_community | 7 |
| `InitMessaging → StoreMedia` | cross_community | 6 |
| `InitMessaging → GetMigrationsPath` | cross_community | 6 |
| `InitMessaging → EnsureDefaultHomeWorkspace` | cross_community | 6 |
| `ShutdownMessaging → GetDatabasePath` | cross_community | 6 |
| `ShutdownMessaging → GetMigrationsPath` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Routers | 6 calls |
| Analysis | 2 calls |

## How to Explore

1. `gitnexus_context({name: "handleSignOut"})` — see callers and callees
2. `gitnexus_query({query: "messaging"})` — find related execution flows
3. Read key files listed above for implementation details
