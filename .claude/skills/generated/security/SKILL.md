---
name: security
description: "Skill for the Security area of claw. 42 symbols across 12 files."
---

# Security

42 symbols | 12 files | Cohesion: 73%

## When to Use

- Working with code in `src/`
- Understanding how createStagingRouter, createGit, createGitForLongOperation work
- Modifying security-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/git/security/secure-fs.ts` | isPathWithinWorktree, assertRealpathInWorktree, readFileBuffer, writeFile, delete (+6) |
| `src/main/lib/git/security/git-commands.ts` | gitSwitchBranch, gitCheckoutFile, gitStageFile, gitStageAll, gitStageFiles (+3) |
| `src/main/lib/git/git-factory.ts` | createGit, createGitForLongOperation, cleanStaleLockFiles, isLockFileError, withLockRetry (+1) |
| `src/main/lib/git/security/path-validation.ts` | assertValidGitPath, assertRegisteredWorktree, resolvePathInWorktree, PathValidationError, getRegisteredChat (+1) |
| `src/renderer/features/workflows/ui/workflow-detail.tsx` | handleCreate, handleReset |
| `src/renderer/features/shared/hooks/use-contextual-chat.ts` | create, reset |
| `src/main/lib/git/file-contents.ts` | isBinaryContent, createFileContentsRouter |
| `src/main/lib/messaging/discord-adapter.ts` | createChannel |
| `src/main/lib/git/staging.ts` | createStagingRouter |
| `src/shared/detect-language.ts` | detectLanguage |

## Entry Points

Start here when exploring this area:

- **`createStagingRouter`** (Function) — `src/main/lib/git/staging.ts:13`
- **`createGit`** (Function) — `src/main/lib/git/git-factory.ts:28`
- **`createGitForLongOperation`** (Function) — `src/main/lib/git/git-factory.ts:56`
- **`cleanStaleLockFiles`** (Function) — `src/main/lib/git/git-factory.ts:116`
- **`isLockFileError`** (Function) — `src/main/lib/git/git-factory.ts:150`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PathValidationError` | Class | `src/main/lib/git/security/path-validation.ts` | 41 |
| `createStagingRouter` | Function | `src/main/lib/git/staging.ts` | 13 |
| `createGit` | Function | `src/main/lib/git/git-factory.ts` | 28 |
| `createGitForLongOperation` | Function | `src/main/lib/git/git-factory.ts` | 56 |
| `cleanStaleLockFiles` | Function | `src/main/lib/git/git-factory.ts` | 116 |
| `isLockFileError` | Function | `src/main/lib/git/git-factory.ts` | 150 |
| `withLockRetry` | Function | `src/main/lib/git/git-factory.ts` | 170 |
| `getUncommittedChanges` | Function | `src/main/lib/git/git-factory.ts` | 217 |
| `handleCreate` | Function | `src/renderer/features/workflows/ui/workflow-detail.tsx` | 37 |
| `handleReset` | Function | `src/renderer/features/workflows/ui/workflow-detail.tsx` | 38 |
| `create` | Function | `src/renderer/features/shared/hooks/use-contextual-chat.ts` | 79 |
| `reset` | Function | `src/renderer/features/shared/hooks/use-contextual-chat.ts` | 90 |
| `assertValidGitPath` | Function | `src/main/lib/git/security/path-validation.ts` | 192 |
| `gitSwitchBranch` | Function | `src/main/lib/git/security/git-commands.ts` | 26 |
| `gitCheckoutFile` | Function | `src/main/lib/git/security/git-commands.ts` | 69 |
| `gitStageFile` | Function | `src/main/lib/git/security/git-commands.ts` | 87 |
| `gitStageAll` | Function | `src/main/lib/git/security/git-commands.ts` | 103 |
| `gitStageFiles` | Function | `src/main/lib/git/security/git-commands.ts` | 119 |
| `gitUnstageFile` | Function | `src/main/lib/git/security/git-commands.ts` | 145 |
| `gitUnstageAll` | Function | `src/main/lib/git/security/git-commands.ts` | 162 |

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
| `RefreshTask → GetDatabasePath` | cross_community | 7 |
| `RefreshTask → GetMigrationsPath` | cross_community | 7 |
| `RefreshTask → EnsureDefaultHomeWorkspace` | cross_community | 7 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Routers | 2 calls |
| Git | 1 calls |

## How to Explore

1. `gitnexus_context({name: "createStagingRouter"})` — see callers and callees
2. `gitnexus_query({query: "security"})` — find related execution flows
3. Read key files listed above for implementation details
