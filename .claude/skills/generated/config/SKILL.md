---
name: config
description: "Skill for the Config area of claw. 16 symbols across 5 files."
---

# Config

16 symbols | 5 files | Cohesion: 65%

## When to Use

- Working with code in `src/`
- Understanding how getMcpConfigPaths, parseMcpConfigFile, mergeMcpServers work
- Modifying config-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/config/consolidator.ts` | getCustomEnvVars, getCustomMcpConfigsFromDb, getMcpConfigPaths, parseMcpConfigFile, mergeMcpServers (+4) |
| `src/main/lib/trpc/routers/loaded-context.ts` | isPlaceholder, getMcpServers |
| `src/main/lib/config/types.ts` | toSdkMcpConfig, toSdkMcpConfigs |
| `src/main/lib/trpc/routers/openui.ts` | generateComponentName, generateOpenUIComponent |
| `src/main/lib/config/test-consolidator.ts` | main |

## Entry Points

Start here when exploring this area:

- **`getMcpConfigPaths`** (Function) — `src/main/lib/config/consolidator.ts:77`
- **`parseMcpConfigFile`** (Function) — `src/main/lib/config/consolidator.ts:130`
- **`mergeMcpServers`** (Function) — `src/main/lib/config/consolidator.ts:191`
- **`detectConflicts`** (Function) — `src/main/lib/config/consolidator.ts:224`
- **`getConsolidatedConfig`** (Function) — `src/main/lib/config/consolidator.ts:264`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getMcpConfigPaths` | Function | `src/main/lib/config/consolidator.ts` | 77 |
| `parseMcpConfigFile` | Function | `src/main/lib/config/consolidator.ts` | 130 |
| `mergeMcpServers` | Function | `src/main/lib/config/consolidator.ts` | 191 |
| `detectConflicts` | Function | `src/main/lib/config/consolidator.ts` | 224 |
| `getConsolidatedConfig` | Function | `src/main/lib/config/consolidator.ts` | 264 |
| `getMergedMcpConfig` | Function | `src/main/lib/config/consolidator.ts` | 320 |
| `getConfigSummary` | Function | `src/main/lib/config/consolidator.ts` | 334 |
| `toSdkMcpConfig` | Function | `src/main/lib/config/types.ts` | 54 |
| `toSdkMcpConfigs` | Function | `src/main/lib/config/types.ts` | 89 |
| `main` | Function | `src/main/lib/config/test-consolidator.ts` | 6 |
| `getCustomEnvVars` | Function | `src/main/lib/config/consolidator.ts` | 24 |
| `getCustomMcpConfigsFromDb` | Function | `src/main/lib/config/consolidator.ts` | 46 |
| `isPlaceholder` | Function | `src/main/lib/trpc/routers/loaded-context.ts` | 138 |
| `getMcpServers` | Function | `src/main/lib/trpc/routers/loaded-context.ts` | 195 |
| `generateComponentName` | Function | `src/main/lib/trpc/routers/openui.ts` | 62 |
| `generateOpenUIComponent` | Function | `src/main/lib/trpc/routers/openui.ts` | 142 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `WarmupMcpCache → MergeMcpServers` | cross_community | 4 |
| `WarmupMcpCache → GetShellEnvironment` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Routers | 5 calls |
| Ui | 2 calls |
| Terminal | 2 calls |
| Mcp | 2 calls |
| Git | 1 calls |
| Claude | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getMcpConfigPaths"})` — see callers and callees
2. `gitnexus_query({query: "config"})` — find related execution flows
3. Read key files listed above for implementation details
