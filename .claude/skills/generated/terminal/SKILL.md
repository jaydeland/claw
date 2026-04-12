---
name: terminal
description: "Skill for the Terminal area of claw. 112 symbols across 36 files."
---

# Terminal

112 symbols | 36 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how getSession, getSessionQuery, abortSession work
- Modifying terminal-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/terminal/manager.ts` | createOrAttach, write, resize, signal, kill (+10) |
| `src/main/lib/terminal/port-manager.ts` | constructor, startPeriodicScan, scanAllSessions, updatePortsForPane, makeKey (+5) |
| `src/main/lib/terminal/env.ts` | getDefaultShell, detectShellAsync, getLocale, detectLocaleAsync, prewarmEnvCaches (+5) |
| `src/renderer/features/terminal/helpers.ts` | setupKeyboardHandler, setupPasteHandler, setupFocusListener, setupClickToMoveCursor, getDefaultTerminalBg (+2) |
| `src/renderer/features/terminal/terminal.tsx` | Terminal, applySerializedState, restartTerminal, handleTerminalInput, handleWrite (+1) |
| `src/main/lib/terminal/session.ts` | getShellArgs, validateAndResolveCwd, resolveShellPath, spawnPty, createSession (+1) |
| `src/main/lib/session/session-registry.ts` | getSession, getSessionQuery, abortSession, updateSessionQuery, updateSessionId |
| `src/renderer/features/terminal/terminal-dialog.tsx` | generateTerminalId, generatePaneId, getNextTerminalName, TerminalDialog |
| `src/renderer/features/terminal/terminal-sidebar.tsx` | generateTerminalId, generatePaneId, getNextTerminalName, TerminalSidebar |
| `src/renderer/features/terminal/terminal-main-view.tsx` | generateTerminalId, generatePaneId, getNextTerminalName, TerminalMainView |

## Entry Points

Start here when exploring this area:

- **`getSession`** (Function) — `src/main/lib/session/session-registry.ts:18`
- **`getSessionQuery`** (Function) — `src/main/lib/session/session-registry.ts:39`
- **`abortSession`** (Function) — `src/main/lib/session/session-registry.ts:47`
- **`updateSessionQuery`** (Function) — `src/main/lib/session/session-registry.ts:58`
- **`updateSessionId`** (Function) — `src/main/lib/session/session-registry.ts:69`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getSession` | Function | `src/main/lib/session/session-registry.ts` | 18 |
| `getSessionQuery` | Function | `src/main/lib/session/session-registry.ts` | 39 |
| `abortSession` | Function | `src/main/lib/session/session-registry.ts` | 47 |
| `updateSessionQuery` | Function | `src/main/lib/session/session-registry.ts` | 58 |
| `updateSessionId` | Function | `src/main/lib/session/session-registry.ts` | 69 |
| `hasActiveOAuthWindow` | Function | `src/main/lib/mcp/oauth-window.ts` | 241 |
| `getCachedMcpTools` | Function | `src/main/lib/mcp/cache.ts` | 56 |
| `getMcpServerStatusCache` | Function | `src/main/lib/mcp/cache.ts` | 79 |
| `clearPendingRetry` | Function | `src/renderer/components/dialogs/claude-login-modal.tsx` | 42 |
| `handleOpenChange` | Function | `src/renderer/components/dialogs/claude-login-modal.tsx` | 75 |
| `handleOpenModelsSettings` | Function | `src/renderer/components/dialogs/claude-login-modal.tsx` | 85 |
| `cancelBackgroundTask` | Function | `src/main/lib/claude/background-session.ts` | 1053 |
| `useChatStatus` | Function | `src/renderer/features/sidebar/hooks/use-chat-status.ts` | 17 |
| `HistoryTabContent` | Function | `src/renderer/features/sidebar/components/history-tab-content.tsx` | 200 |
| `applyDiagramLayout` | Function | `src/renderer/features/github/lib/diagram-layout.ts` | 23 |
| `toggleServer` | Function | `src/renderer/features/agents/ui/mcp-servers-indicator.tsx` | 106 |
| `handleKeyDown` | Function | `src/renderer/features/agents/ui/mcp-servers-indicator.tsx` | 174 |
| `setLoading` | Function | `src/renderer/features/agents/atoms/index.ts` | 107 |
| `SubChatsQuickSwitchDialog` | Function | `src/renderer/features/agents/components/subchats-quick-switch-dialog.tsx` | 180 |
| `AgentsQuickSwitchDialog` | Function | `src/renderer/features/agents/components/agents-quick-switch-dialog.tsx` | 24 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `MessageStoreProvider → Set` | cross_community | 6 |
| `SetupExitHandler → IsAllowedVar` | cross_community | 6 |
| `SetupExitHandler → HasAllowedPrefix` | cross_community | 6 |
| `RegisterGitWatcherIPC → Set` | cross_community | 5 |
| `SetupExitHandler → DetectShellAsync` | cross_community | 5 |
| `SetupExitHandler → SanitizeEnv` | cross_community | 5 |
| `SetupExitHandler → GetShellArgs` | cross_community | 5 |
| `SetupExitHandler → ValidateAndResolveCwd` | cross_community | 5 |
| `SetupExitHandler → ResolveShellPath` | cross_community | 5 |
| `CreateOrAttach → DetectShellAsync` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 13 calls |
| Hooks | 2 calls |
| Themes | 1 calls |
| Link-providers | 1 calls |
| Mcp | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getSession"})` — see callers and callees
2. `gitnexus_query({query: "terminal"})` — find related execution flows
3. Read key files listed above for implementation details
