---
name: routers
description: "Skill for the Routers area of claw. 122 symbols across 31 files."
---

# Routers

122 symbols | 31 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how getDatabase, handleTest, handleTest work
- Modifying routers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/trpc/routers/workflows.ts` | getClaudeConfigDir, getCustomPluginDirectories, parseCommandMd, scanCommandsDir, extractMcpServers (+17) |
| `src/main/lib/trpc/routers/loaded-context.ts` | discoverClaudeMdFiles, parseSkillMd, getScanLocations, getCustomPluginDirectories, scanSkillsDirectory (+5) |
| `src/main/lib/messaging/discord-adapter.ts` | start, handleMessage, getGuilds, getDecryptedToken, updateConnectionStatus (+1) |
| `src/main/lib/background-tasks/watcher.ts` | getPendingTaskCount, checkAllTasks, checkTaskStatus, parseExitCode, refreshTask (+1) |
| `src/main/lib/trpc/routers/skills.ts` | getCustomPluginDirectories, parseSkillMd, parseCommandMd, isValidEntryName, scanSkillsDirectory (+1) |
| `src/main/lib/trpc/routers/openui.ts` | validateComponentCode, getProjectComponents, installComponent, getRegisteredClawComponents, scanComponentsDir (+1) |
| `src/main/lib/trpc/routers/claude.ts` | decryptToken, getClaudeCodeToken, safeEmit, safeComplete, emitError (+1) |
| `src/main/lib/trpc/routers/gsd.ts` | getBundledGsdPath, hasBundledGsd, parseGsdCommandMd, scanBundledGsdCommands, scanDir (+1) |
| `src/main/lib/background-tasks/watcher-v2.ts` | start, checkAllTasks, checkTaskWithBashOutput, processTaskOutput, refreshTask |
| `src/main/lib/trpc/routers/tasks.ts` | getTaskDataFromMessages, parseExitCode, getCachedLineCount, readFileLines, getDerivedStatus |

## Entry Points

Start here when exploring this area:

- **`getDatabase`** (Function) — `src/main/lib/db/index.ts:183`
- **`handleTest`** (Function) — `src/renderer/components/dialogs/settings-tabs/agents-slack-tab.tsx:132`
- **`handleTest`** (Function) — `src/renderer/components/dialogs/settings-tabs/agents-discord-tab.tsx:166`
- **`handler`** (Function) — `src/main/lib/trpc/routers/whatsapp.ts:60`
- **`parseAgentMd`** (Function) — `src/main/lib/trpc/routers/agent-utils.ts:87`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `EksService` | Class | `src/main/lib/aws/eks-service.ts` | 44 |
| `getDatabase` | Function | `src/main/lib/db/index.ts` | 183 |
| `handleTest` | Function | `src/renderer/components/dialogs/settings-tabs/agents-slack-tab.tsx` | 132 |
| `handleTest` | Function | `src/renderer/components/dialogs/settings-tabs/agents-discord-tab.tsx` | 166 |
| `handler` | Function | `src/main/lib/trpc/routers/whatsapp.ts` | 60 |
| `parseAgentMd` | Function | `src/main/lib/trpc/routers/agent-utils.ts` | 87 |
| `loadAgent` | Function | `src/main/lib/trpc/routers/agent-utils.ts` | 173 |
| `scanAgentsDirectory` | Function | `src/main/lib/trpc/routers/agent-utils.ts` | 214 |
| `buildAgentsOption` | Function | `src/main/lib/trpc/routers/agent-utils.ts` | 287 |
| `ensureSymlinks` | Function | `src/main/lib/session/symlink-manager.ts` | 14 |
| `pathExists` | Function | `src/main/lib/session/symlink-manager.ts` | 23 |
| `getBundledGsdPath` | Function | `src/main/lib/trpc/routers/gsd.ts` | 66 |
| `autoStartGitNexusIfNeeded` | Function | `src/main/lib/trpc/routers/gitnexus.ts` | 157 |
| `safeEmit` | Function | `src/main/lib/trpc/routers/claude.ts` | 745 |
| `safeComplete` | Function | `src/main/lib/trpc/routers/claude.ts` | 757 |
| `emitError` | Function | `src/main/lib/trpc/routers/claude.ts` | 766 |
| `resetStreamTimeout` | Function | `src/main/lib/trpc/routers/claude.ts` | 1517 |
| `expandEnvVars` | Function | `src/main/lib/path-utils.ts` | 15 |
| `getStatus` | Method | `src/main/lib/messaging/whatsapp-adapter.ts` | 569 |
| `start` | Method | `src/main/lib/messaging/discord-adapter.ts` | 51 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandlePlay → GetDatabasePath` | cross_community | 9 |
| `HandlePlay → PathValidationError` | cross_community | 8 |
| `HandlePlay → IsPathWithinWorktree` | cross_community | 7 |
| `CreateMainWindow → GetDatabasePath` | cross_community | 7 |
| `CreateMainWindow → GetMigrationsPath` | cross_community | 7 |
| `CreateMainWindow → EnsureDefaultHomeWorkspace` | cross_community | 7 |
| `CreateMainWindow → IsPathWithinWorktree` | cross_community | 7 |
| `InitMessaging → Flush` | cross_community | 7 |
| `InitMessaging → GetDatabasePath` | cross_community | 7 |
| `ShutdownMessaging → Flush` | cross_community | 7 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Analysis | 5 calls |
| Ui | 4 calls |
| Terminal | 3 calls |
| Security | 3 calls |
| Claude | 2 calls |
| Scripts | 2 calls |
| Db | 1 calls |
| Background-tasks | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getDatabase"})` — see callers and callees
2. `gitnexus_query({query: "routers"})` — find related execution flows
3. Read key files listed above for implementation details
