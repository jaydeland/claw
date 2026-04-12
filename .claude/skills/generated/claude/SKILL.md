---
name: claude
description: "Skill for the Claude area of claw. 57 symbols across 11 files."
---

# Claude

57 symbols | 11 files | Cohesion: 85%

## When to Use

- Working with code in `src/`
- Understanding how getExistingClaudeCredentials, refreshClaudeToken, isTokenExpired work
- Modifying claude-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/claude/background-session.ts` | getClaudeQuery, decryptToken, getClaudeCodeToken, initBackgroundSession, getBackgroundSessionState (+12) |
| `src/main/lib/claude-token.ts` | readFromCredentialsFile, getExistingClaudeCredentials, refreshClaudeToken, isTokenExpired, writeToKeychain (+2) |
| `src/main/lib/claude/text-delta-buffer.ts` | write, bufferTextDelta, bufferToolInputDelta, bufferReasoningDelta, scheduleFlush (+2) |
| `src/main/lib/background-tasks/watcher-bashoutput.ts` | start, checkAllTasks, checkTaskStatus, parseTaskResponse, refreshTask |
| `src/main/lib/claude/transform.ts` | createTransformer, makeCompositeId, genId, resetState, isKnownInternalError |
| `src/main/lib/claude/raw-logger.ts` | isEnabled, ensureLogsDir, shouldRotateLog, cleanupOldLogs, logRawClaudeMessage |
| `src/main/lib/claude/env.ts` | getBundledClaudeBinaryPath, parseEnvOutput, getClaudeShellEnvironment, buildClaudeEnv |
| `src/main/lib/prompts/prompt-service.ts` | getPromptByKey, getPromptByKeyWithFallback |
| `src/main/lib/analysis/background-analysis-runner.ts` | ensureBackgroundSession, poll |
| `src/main/lib/trpc/routers/transient-chat.ts` | getSystemPrompt, buildQueryOptions |

## Entry Points

Start here when exploring this area:

- **`getExistingClaudeCredentials`** (Function) — `src/main/lib/claude-token.ts:169`
- **`refreshClaudeToken`** (Function) — `src/main/lib/claude-token.ts:193`
- **`isTokenExpired`** (Function) — `src/main/lib/claude-token.ts:232`
- **`ensureValidOAuthToken`** (Function) — `src/main/lib/claude-token.ts:296`
- **`getPromptByKey`** (Function) — `src/main/lib/prompts/prompt-service.ts:28`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getExistingClaudeCredentials` | Function | `src/main/lib/claude-token.ts` | 169 |
| `refreshClaudeToken` | Function | `src/main/lib/claude-token.ts` | 193 |
| `isTokenExpired` | Function | `src/main/lib/claude-token.ts` | 232 |
| `ensureValidOAuthToken` | Function | `src/main/lib/claude-token.ts` | 296 |
| `getPromptByKey` | Function | `src/main/lib/prompts/prompt-service.ts` | 28 |
| `getPromptByKeyWithFallback` | Function | `src/main/lib/prompts/prompt-service.ts` | 54 |
| `getBundledClaudeBinaryPath` | Function | `src/main/lib/claude/env.ts` | 267 |
| `getClaudeShellEnvironment` | Function | `src/main/lib/claude/env.ts` | 353 |
| `buildClaudeEnv` | Function | `src/main/lib/claude/env.ts` | 423 |
| `initBackgroundSession` | Function | `src/main/lib/claude/background-session.ts` | 124 |
| `getBackgroundSessionState` | Function | `src/main/lib/claude/background-session.ts` | 335 |
| `isBackgroundSessionReady` | Function | `src/main/lib/claude/background-session.ts` | 342 |
| `queryBackgroundSession` | Function | `src/main/lib/claude/background-session.ts` | 353 |
| `checkBackgroundTaskStatus` | Function | `src/main/lib/claude/background-session.ts` | 549 |
| `generateChatTitle` | Function | `src/main/lib/claude/background-session.ts` | 674 |
| `executeBackgroundTask` | Function | `src/main/lib/claude/background-session.ts` | 769 |
| `fixLintErrors` | Function | `src/main/lib/claude/background-session.ts` | 1122 |
| `buildQueryOptions` | Function | `src/main/lib/trpc/routers/transient-chat.ts` | 318 |
| `createTransformer` | Function | `src/main/lib/claude/transform.ts` | 8 |
| `makeCompositeId` | Function | `src/main/lib/claude/transform.ts` | 44 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Start → ReadFromCredentialsFile` | intra_community | 7 |
| `Start → WriteToCredentialsFile` | intra_community | 7 |
| `Start → Flush` | cross_community | 6 |
| `Start → IsTokenExpired` | intra_community | 6 |
| `Start → RefreshClaudeToken` | intra_community | 6 |
| `Start → DecryptToken` | intra_community | 6 |
| `Start → On` | cross_community | 6 |
| `Poll → Flush` | cross_community | 6 |
| `RefreshTask → GetDatabasePath` | cross_community | 6 |
| `RefreshTask → GetMigrationsPath` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Routers | 7 calls |
| Terminal | 4 calls |
| Ui | 4 calls |
| Aws | 3 calls |
| Analysis | 3 calls |
| ReadFrom | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getExistingClaudeCredentials"})` — see callers and callees
2. `gitnexus_query({query: "claude"})` — find related execution flows
3. Read key files listed above for implementation details
