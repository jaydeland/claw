---
name: mcp
description: "Skill for the Mcp area of claw. 32 symbols across 5 files."
---

# Mcp

32 symbols | 5 files | Cohesion: 60%

## When to Use

- Working with code in `src/`
- Understanding how expandEnvVars, expandConfigEnvVars, setCachedMcpTools work
- Modifying mcp-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/mcp/tool-query.ts` | expandEnvVars, expandConfigEnvVars, queryHttpMcpServerTools, buildHeaders, createSendRequest (+12) |
| `src/main/lib/mcp/cache.ts` | setCachedMcpTools, setMcpServerStatusCache, saveMcpStatusToDisk, getAllMcpServerStatusCaches, clearMcpCaches |
| `src/main/lib/mcp/oauth-window.ts` | startOAuthFlow, updateViewBounds, cleanup, handleCallback |
| `src/main/lib/mcp/credential-injection.ts` | decryptCredential, parseJsonSafely, injectStoredCredentials, injectAllStoredCredentials |
| `src/main/lib/trpc/routers/claude.ts` | warmupMcpCache, clearClaudeCaches |

## Entry Points

Start here when exploring this area:

- **`expandEnvVars`** (Function) — `src/main/lib/mcp/tool-query.ts:33`
- **`expandConfigEnvVars`** (Function) — `src/main/lib/mcp/tool-query.ts:60`
- **`setCachedMcpTools`** (Function) — `src/main/lib/mcp/cache.ts:72`
- **`setMcpServerStatusCache`** (Function) — `src/main/lib/mcp/cache.ts:86`
- **`saveMcpStatusToDisk`** (Function) — `src/main/lib/mcp/cache.ts:157`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `expandEnvVars` | Function | `src/main/lib/mcp/tool-query.ts` | 33 |
| `expandConfigEnvVars` | Function | `src/main/lib/mcp/tool-query.ts` | 60 |
| `setCachedMcpTools` | Function | `src/main/lib/mcp/cache.ts` | 72 |
| `setMcpServerStatusCache` | Function | `src/main/lib/mcp/cache.ts` | 86 |
| `saveMcpStatusToDisk` | Function | `src/main/lib/mcp/cache.ts` | 157 |
| `getAllMcpServerStatusCaches` | Function | `src/main/lib/mcp/cache.ts` | 223 |
| `warmupMcpCache` | Function | `src/main/lib/trpc/routers/claude.ts` | 257 |
| `queryMcpServerTools` | Function | `src/main/lib/mcp/tool-query.ts` | 1278 |
| `startOAuthFlow` | Function | `src/main/lib/mcp/oauth-window.ts` | 41 |
| `updateViewBounds` | Function | `src/main/lib/mcp/oauth-window.ts` | 93 |
| `cleanup` | Function | `src/main/lib/mcp/oauth-window.ts` | 113 |
| `handleCallback` | Function | `src/main/lib/mcp/oauth-window.ts` | 150 |
| `injectAllStoredCredentials` | Function | `src/main/lib/mcp/credential-injection.ts` | 77 |
| `clearMcpCaches` | Function | `src/main/lib/mcp/cache.ts` | 197 |
| `clearClaudeCaches` | Function | `src/main/lib/trpc/routers/claude.ts` | 246 |
| `McpClient` | Class | `src/main/lib/mcp/tool-query.ts` | 133 |
| `queryHttpMcpServerTools` | Function | `src/main/lib/mcp/tool-query.ts` | 1000 |
| `buildHeaders` | Function | `src/main/lib/mcp/tool-query.ts` | 1031 |
| `createSendRequest` | Function | `src/main/lib/mcp/tool-query.ts` | 1058 |
| `createSendNotification` | Function | `src/main/lib/mcp/tool-query.ts` | 1150 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `QueryMcpServerTools → Flush` | cross_community | 6 |
| `QueryMcpServerTools → GetDatabasePath` | cross_community | 5 |
| `QueryMcpServerTools → GetMigrationsPath` | cross_community | 5 |
| `QueryMcpServerTools → EnsureDefaultHomeWorkspace` | cross_community | 5 |
| `WarmupMcpCache → MergeMcpServers` | cross_community | 4 |
| `WarmupMcpCache → GetShellEnvironment` | cross_community | 4 |
| `WarmupMcpCache → ReadFromCredentialsFile` | cross_community | 4 |
| `WarmupMcpCache → WriteToCredentialsFile` | cross_community | 4 |
| `WarmupMcpCache → Decrypt` | cross_community | 4 |
| `WarmupMcpCache → Encrypt` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Terminal | 6 calls |
| Ui | 6 calls |
| Claude | 3 calls |
| Routers | 2 calls |
| Hooks | 2 calls |
| Scripts | 2 calls |
| Config | 2 calls |
| Git | 1 calls |

## How to Explore

1. `gitnexus_context({name: "expandEnvVars"})` — see callers and callees
2. `gitnexus_query({query: "mcp"})` — find related execution flows
3. Read key files listed above for implementation details
