---
name: hooks
description: "Skill for the Hooks area of claw. 57 symbols across 33 files."
---

# Hooks

57 symbols | 33 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how useOverflowDetection, measureOverflow, debounce work
- Modifying hooks-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/features/sidebar/hooks/use-desktop-notifications.ts` | showAgentNotification, generateBadgeIcon, useDesktopNotifications, handleFocus, handleBlur |
| `src/renderer/features/agents/hooks/use-chat-scroll.ts` | useChatScroll, easeInOutCubic, animateScroll |
| `src/renderer/features/agents/main/active-chat.tsx` | MessageGroup, updateHeight, handleKeyDown |
| `src/main/lib/auto-updater.ts` | registerIpcHandlers, checkForUpdates, downloadUpdate |
| `src/renderer/lib/utils/platform.ts` | isDesktopApp, getShortcutDisplay, getHotkey |
| `src/renderer/hooks/use-overflow-detection.ts` | useOverflowDetection, measureOverflow |
| `src/renderer/features/agents/hooks/use-diff-sidebar-effects.ts` | useDiffSidebarEffects, checkRef |
| `src/main/index.ts` | buildMenu, setUpdateAvailable |
| `src/renderer/components/update-banner.tsx` | UpdateBanner, handleUpdate |
| `src/renderer/lib/hooks/use-just-updated.ts` | useJustUpdated, checkForUpdate |

## Entry Points

Start here when exploring this area:

- **`useOverflowDetection`** (Function) — `src/renderer/hooks/use-overflow-detection.ts:28`
- **`measureOverflow`** (Function) — `src/renderer/hooks/use-overflow-detection.ts:42`
- **`debounce`** (Function) — `src/renderer/features/terminal/utils.ts:31`
- **`setupResizeHandlers`** (Function) — `src/renderer/features/terminal/helpers.ts:350`
- **`useDiffSidebarEffects`** (Function) — `src/renderer/features/agents/hooks/use-diff-sidebar-effects.ts:31`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useOverflowDetection` | Function | `src/renderer/hooks/use-overflow-detection.ts` | 28 |
| `measureOverflow` | Function | `src/renderer/hooks/use-overflow-detection.ts` | 42 |
| `debounce` | Function | `src/renderer/features/terminal/utils.ts` | 31 |
| `setupResizeHandlers` | Function | `src/renderer/features/terminal/helpers.ts` | 350 |
| `useDiffSidebarEffects` | Function | `src/renderer/features/agents/hooks/use-diff-sidebar-effects.ts` | 31 |
| `checkRef` | Function | `src/renderer/features/agents/hooks/use-diff-sidebar-effects.ts` | 111 |
| `useChatScroll` | Function | `src/renderer/features/agents/hooks/use-chat-scroll.ts` | 14 |
| `VirtualizedMessageGroup` | Function | `src/renderer/features/agents/main/virtualized-message-group.tsx` | 20 |
| `checkForUpdates` | Function | `src/main/lib/auto-updater.ts` | 188 |
| `downloadUpdate` | Function | `src/main/lib/auto-updater.ts` | 197 |
| `UpdateBanner` | Function | `src/renderer/components/update-banner.tsx` | 11 |
| `handleUpdate` | Function | `src/renderer/components/update-banner.tsx` | 116 |
| `useUpdateChecker` | Function | `src/renderer/lib/hooks/use-update-checker.ts` | 13 |
| `useJustUpdated` | Function | `src/renderer/lib/hooks/use-just-updated.ts` | 10 |
| `checkForUpdate` | Function | `src/renderer/lib/hooks/use-just-updated.ts` | 18 |
| `normalizeCustomClaudeConfig` | Function | `src/renderer/lib/atoms/index.ts` | 361 |
| `insertTextAtCursor` | Function | `src/renderer/features/agents/utils/paste-text.ts` | 7 |
| `handlePasteEvent` | Function | `src/renderer/features/agents/utils/paste-text.ts` | 38 |
| `generateDraftId` | Function | `src/renderer/features/agents/lib/drafts.ts` | 104 |
| `useToggleFocusOnCmdEsc` | Function | `src/renderer/features/agents/hooks/use-toggle-focus-on-cmd-esc.ts` | 10 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AgentsLayout → GetShortcutAction` | cross_community | 4 |
| `AgentsLayout → KeysToHotkeyString` | cross_community | 4 |
| `NewChatForm → FileToBase64` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 2 calls |
| Cluster_362 | 2 calls |
| Watcher | 1 calls |
| Hotkeys | 1 calls |
| Settings-tabs | 1 calls |
| Cluster_363 | 1 calls |
| Sidebar | 1 calls |
| Ai-assistant-dialog | 1 calls |

## How to Explore

1. `gitnexus_context({name: "useOverflowDetection"})` — see callers and callees
2. `gitnexus_query({query: "hooks"})` — find related execution flows
3. Read key files listed above for implementation details
