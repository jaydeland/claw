---
name: main
description: "Skill for the Main area of claw. 44 symbols across 9 files."
---

# Main

44 symbols | 9 files | Cohesion: 82%

## When to Use

- Working with code in `src/`
- Understanding how useGitWatcher, subscribe, generatePrMessage work
- Modifying main-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/features/agents/main/messages-list.tsx` | createMessageStore, getMessageSnapshot, hasMessageChanged, stabilizeMessages, initMessages (+15) |
| `src/renderer/features/agents/main/active-chat.tsx` | getFirstSubChatId, ChatView, checkRef, subscribe, getMessageTextContent (+5) |
| `src/renderer/features/agents/utils/pr-message.ts` | generatePrMessage, generateCommitToPrMessage, generateReviewMessage, generateMergeMessage |
| `src/renderer/features/agents/main/assistant-message-item.tsx` | groupExploringTools, groupTeamTasks, groupParts |
| `src/renderer/lib/hooks/use-file-change-listener.ts` | useGitWatcher, subscribe |
| `src/renderer/features/agents/utils/auto-rename.ts` | sleep, autoRenameAgentChat |
| `src/renderer/features/agents/lib/ipc-chat-transport.ts` | IPCChatTransport |
| `src/renderer/features/agents/hooks/use-desktop-notifications.ts` | useDesktopNotifications |
| `src/renderer/components/chat-markdown-renderer.tsx` | stripEmojis |

## Entry Points

Start here when exploring this area:

- **`useGitWatcher`** (Function) — `src/renderer/lib/hooks/use-file-change-listener.ts:34`
- **`subscribe`** (Function) — `src/renderer/lib/hooks/use-file-change-listener.ts:42`
- **`generatePrMessage`** (Function) — `src/renderer/features/agents/utils/pr-message.ts:10`
- **`generateCommitToPrMessage`** (Function) — `src/renderer/features/agents/utils/pr-message.ts:56`
- **`generateReviewMessage`** (Function) — `src/renderer/features/agents/utils/pr-message.ts:77`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `IPCChatTransport` | Class | `src/renderer/features/agents/lib/ipc-chat-transport.ts` | 134 |
| `useGitWatcher` | Function | `src/renderer/lib/hooks/use-file-change-listener.ts` | 34 |
| `subscribe` | Function | `src/renderer/lib/hooks/use-file-change-listener.ts` | 42 |
| `generatePrMessage` | Function | `src/renderer/features/agents/utils/pr-message.ts` | 10 |
| `generateCommitToPrMessage` | Function | `src/renderer/features/agents/utils/pr-message.ts` | 56 |
| `generateReviewMessage` | Function | `src/renderer/features/agents/utils/pr-message.ts` | 77 |
| `generateMergeMessage` | Function | `src/renderer/features/agents/utils/pr-message.ts` | 119 |
| `autoRenameAgentChat` | Function | `src/renderer/features/agents/utils/auto-rename.ts` | 21 |
| `useDesktopNotifications` | Function | `src/renderer/features/agents/hooks/use-desktop-notifications.ts` | 2 |
| `ChatView` | Function | `src/renderer/features/agents/main/active-chat.tsx` | 3851 |
| `checkRef` | Function | `src/renderer/features/agents/main/active-chat.tsx` | 4077 |
| `subscribe` | Function | `src/renderer/features/agents/main/active-chat.tsx` | 4367 |
| `MessageStoreProvider` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 225 |
| `useMessage` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 293 |
| `useStreamingStatus` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 364 |
| `useAllMessages` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 732 |
| `useMessageIds` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 327 |
| `useMessageGroups` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 767 |
| `useUserMessageIds` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 909 |
| `useUserMessageWithAssistants` | Function | `src/renderer/features/agents/main/messages-list.tsx` | 945 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `MessageStoreProvider → Set` | cross_community | 6 |
| `MessageStoreProvider → GetMessageSnapshot` | intra_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 5 calls |
| Terminal | 3 calls |
| Hooks | 2 calls |
| Changes | 1 calls |

## How to Explore

1. `gitnexus_context({name: "useGitWatcher"})` — see callers and callees
2. `gitnexus_query({query: "main"})` — find related execution flows
3. Read key files listed above for implementation details
