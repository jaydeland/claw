---
name: watcher
description: "Skill for the Watcher area of claw. 16 symbols across 5 files."
---

# Watcher

16 symbols | 5 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how getWindow, createMainWindow, notifyTaskCompleted work
- Modifying watcher-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/git/watcher/git-watcher.ts` | GitWatcher, waitForReady, getOrCreate, subscribe, has (+3) |
| `src/main/windows/main.ts` | registerIpcHandlers, getWindow, getUseNativeFramePreference, createMainWindow |
| `src/main/lib/git/watcher/ipc-bridge.ts` | registerGitWatcherIPC, cleanupGitWatchers |
| `src/main/lib/background-tasks/notifications.ts` | notifyTaskCompleted |
| `src/main/lib/trpc/routers/index.ts` | createAppRouter |

## Entry Points

Start here when exploring this area:

- **`getWindow`** (Function) — `src/main/windows/main.ts:271`
- **`createMainWindow`** (Function) — `src/main/windows/main.ts:297`
- **`notifyTaskCompleted`** (Function) — `src/main/lib/background-tasks/notifications.ts:6`
- **`registerGitWatcherIPC`** (Function) — `src/main/lib/git/watcher/ipc-bridge.ts:16`
- **`createAppRouter`** (Function) — `src/main/lib/trpc/routers/index.ts:43`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `GitWatcher` | Class | `src/main/lib/git/watcher/git-watcher.ts` | 82 |
| `getWindow` | Function | `src/main/windows/main.ts` | 271 |
| `createMainWindow` | Function | `src/main/windows/main.ts` | 297 |
| `notifyTaskCompleted` | Function | `src/main/lib/background-tasks/notifications.ts` | 6 |
| `registerGitWatcherIPC` | Function | `src/main/lib/git/watcher/ipc-bridge.ts` | 16 |
| `createAppRouter` | Function | `src/main/lib/trpc/routers/index.ts` | 43 |
| `cleanupGitWatchers` | Function | `src/main/lib/git/watcher/ipc-bridge.ts` | 80 |
| `waitForReady` | Method | `src/main/lib/git/watcher/git-watcher.ts` | 171 |
| `dispose` | Method | `src/main/lib/git/watcher/git-watcher.ts` | 179 |
| `registerIpcHandlers` | Function | `src/main/windows/main.ts` | 21 |
| `getUseNativeFramePreference` | Function | `src/main/windows/main.ts` | 279 |
| `getOrCreate` | Method | `src/main/lib/git/watcher/git-watcher.ts` | 206 |
| `subscribe` | Method | `src/main/lib/git/watcher/git-watcher.ts` | 247 |
| `has` | Method | `src/main/lib/git/watcher/git-watcher.ts` | 272 |
| `dispose` | Method | `src/main/lib/git/watcher/git-watcher.ts` | 279 |
| `disposeAll` | Method | `src/main/lib/git/watcher/git-watcher.ts` | 291 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateMainWindow → GetDatabasePath` | cross_community | 7 |
| `CreateMainWindow → GetMigrationsPath` | cross_community | 7 |
| `CreateMainWindow → EnsureDefaultHomeWorkspace` | cross_community | 7 |
| `CreateMainWindow → IsPathWithinWorktree` | cross_community | 7 |
| `CreateMainWindow → PathValidationError` | cross_community | 6 |
| `RegisterGitWatcherIPC → Set` | cross_community | 5 |
| `RegisterGitWatcherIPC → GitWatcher` | intra_community | 4 |
| `RegisterGitWatcherIPC → WaitForReady` | intra_community | 4 |
| `CreateMainWindow → Flush` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Terminal | 5 calls |
| Ui | 3 calls |
| Scripts | 2 calls |
| Terminal-history | 2 calls |
| Routers | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getWindow"})` — see callers and callees
2. `gitnexus_query({query: "watcher"})` — find related execution flows
3. Read key files listed above for implementation details
