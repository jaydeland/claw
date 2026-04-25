---
name: git
description: "Skill for the Git area of claw. 68 symbols across 15 files."
---

# Git

68 symbols | 15 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how createStatusRouter, parseGitStatus, parseGitLog work
- Modifying git-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/git/worktree.ts` | isExecFileException, getGitEnv, repoUsesLfs, isEnoent, createWorktree (+15) |
| `src/main/lib/git/utils/parse-status.ts` | mapGitStatus, toChangedFile, parseGitStatus, parseGitLog, parseDiffNumstat (+1) |
| `src/main/lib/git/file-contents.ts` | getFileVersions, safeGitShow, getAgainstBaseVersions, getCommittedVersions, getStagedVersions (+1) |
| `src/main/lib/git/worktree-config.ts` | fileExists, detectWorktreeConfig, getAvailableConfigPaths, getSetupCommands, executeWorktreeSetup |
| `src/main/lib/git/status.ts` | createStatusRouter, getBranchComparison, applyUntrackedLineCount, getTrackingBranchStatus |
| `src/main/lib/git/git-operations.ts` | hasUpstreamBranch, getBranchWorktreePath, canFastForward, createGitOperationsRouter |
| `src/main/lib/git/git-factory.ts` | hasUncommittedChanges, getRepositoryState, createGitForNetwork, withGitLock |
| `src/main/lib/git/branches.ts` | createBranchesRouter, getLocalBranchesWithDates, getDefaultBranch, getCheckedOutBranches |
| `src/main/lib/git/diff-parser.ts` | getFileLang, validateDiffHunk, splitUnifiedDiffByFile, pushCurrent |
| `src/main/lib/git/stash.ts` | sleep, parseCheckpointTrees, applyRollbackStash |

## Entry Points

Start here when exploring this area:

- **`createStatusRouter`** (Function) — `src/main/lib/git/status.ts:13`
- **`parseGitStatus`** (Function) — `src/main/lib/git/utils/parse-status.ts:30`
- **`parseGitLog`** (Function) — `src/main/lib/git/utils/parse-status.ts:75`
- **`parseDiffNumstat`** (Function) — `src/main/lib/git/utils/parse-status.ts:121`
- **`parseNameStatus`** (Function) — `src/main/lib/git/utils/parse-status.ts:153`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createStatusRouter` | Function | `src/main/lib/git/status.ts` | 13 |
| `parseGitStatus` | Function | `src/main/lib/git/utils/parse-status.ts` | 30 |
| `parseGitLog` | Function | `src/main/lib/git/utils/parse-status.ts` | 75 |
| `parseDiffNumstat` | Function | `src/main/lib/git/utils/parse-status.ts` | 121 |
| `parseNameStatus` | Function | `src/main/lib/git/utils/parse-status.ts` | 153 |
| `applyNumstatToFiles` | Function | `src/main/lib/git/utils/apply-numstat.ts` | 4 |
| `createWorktree` | Function | `src/main/lib/git/worktree.ts` | 128 |
| `removeWorktree` | Function | `src/main/lib/git/worktree.ts` | 211 |
| `branchExistsOnRemote` | Function | `src/main/lib/git/worktree.ts` | 515 |
| `getShellEnvironment` | Function | `src/main/lib/git/shell-env.ts` | 30 |
| `checkGitLfsAvailable` | Function | `src/main/lib/git/shell-env.ts` | 93 |
| `isUpstreamMissingError` | Function | `src/main/lib/git/git-utils.ts` | 3 |
| `getBranchWorktreePath` | Function | `src/main/lib/git/git-operations.ts` | 40 |
| `createGitOperationsRouter` | Function | `src/main/lib/git/git-operations.ts` | 102 |
| `hasUncommittedChanges` | Function | `src/main/lib/git/git-factory.ts` | 207 |
| `getRepositoryState` | Function | `src/main/lib/git/git-factory.ts` | 241 |
| `invalidateGitHubPRStatusCache` | Function | `src/main/lib/git/github/github.ts` | 66 |
| `createGitForNetwork` | Function | `src/main/lib/git/git-factory.ts` | 48 |
| `withGitLock` | Function | `src/main/lib/git/git-factory.ts` | 69 |
| `createBranchesRouter` | Function | `src/main/lib/git/branches.ts` | 17 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateGitOperationsRouter → Flush` | cross_community | 6 |
| `CreateBranchesRouter → Flush` | cross_community | 6 |
| `CreateStatusRouter → Flush` | cross_community | 6 |
| `CreateGitOperationsRouter → GetDatabasePath` | cross_community | 5 |
| `CreateGitOperationsRouter → GetMigrationsPath` | cross_community | 5 |
| `CreateGitOperationsRouter → EnsureDefaultHomeWorkspace` | cross_community | 5 |
| `CreateBranchesRouter → GetDatabasePath` | cross_community | 5 |
| `CreateBranchesRouter → GetMigrationsPath` | cross_community | 5 |
| `CreateBranchesRouter → EnsureDefaultHomeWorkspace` | cross_community | 5 |
| `CreateStatusRouter → GetDatabasePath` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Security | 15 calls |
| Routers | 4 calls |
| Terminal | 2 calls |
| Ui | 2 calls |
| Github | 1 calls |
| Analysis | 1 calls |

## How to Explore

1. `gitnexus_context({name: "createStatusRouter"})` — see callers and callees
2. `gitnexus_query({query: "git"})` — find related execution flows
3. Read key files listed above for implementation details
