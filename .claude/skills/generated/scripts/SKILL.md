---
name: scripts
description: "Skill for the Scripts area of claw. 34 symbols across 10 files."
---

# Scripts

34 symbols | 10 files | Cohesion: 83%

## When to Use

- Working with code in `scripts/`
- Understanding how startStreaming work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/download-claude-binary.mjs` | fetchJson, downloadFile, request, calculateSha256, getLatestVersion (+2) |
| `scripts/generate-update-manifest.mjs` | calculateSha512, getFileSize, findZipFile, generateManifest, objectToYaml (+1) |
| `scripts/fetch-gsd.mjs` | fetchJson, downloadFile, extractTarball, getCurrentVersion, main |
| `scripts/generate-icon.mjs` | createRoundedRectSVG, createRoundedSquircle, generateIconSize, main |
| `src/main/lib/trpc/routers/devspace.ts` | parseLogLine, getProcessWorkingDir, startStreaming |
| `scripts/generate-windows-icon.mjs` | generatePngSize, createIcoFromPngs, main |
| `src/main/lib/kubernetes/kubernetes-service.ts` | streamContainerLogs, parseLogLine |
| `resources/gsd/scripts/build-hooks.js` | validateSyntax, build |
| `src/main/lib/background-tasks/events.ts` | on |
| `src/main/lib/trpc/routers/gitnexus.ts` | fetchRepos |

## Entry Points

Start here when exploring this area:

- **`startStreaming`** (Function) — `src/main/lib/trpc/routers/devspace.ts:516`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `startStreaming` | Function | `src/main/lib/trpc/routers/devspace.ts` | 516 |
| `fetchJson` | Function | `scripts/download-claude-binary.mjs` | 36 |
| `downloadFile` | Function | `scripts/download-claude-binary.mjs` | 58 |
| `request` | Function | `scripts/download-claude-binary.mjs` | 62 |
| `calculateSha256` | Function | `scripts/download-claude-binary.mjs` | 118 |
| `getLatestVersion` | Function | `scripts/download-claude-binary.mjs` | 131 |
| `downloadPlatform` | Function | `scripts/download-claude-binary.mjs` | 159 |
| `main` | Function | `scripts/download-claude-binary.mjs` | 222 |
| `streamContainerLogs` | Function | `src/main/lib/kubernetes/kubernetes-service.ts` | 585 |
| `parseLogLine` | Function | `src/main/lib/kubernetes/kubernetes-service.ts` | 683 |
| `fetchRepos` | Function | `src/main/lib/trpc/routers/gitnexus.ts` | 32 |
| `parseLogLine` | Function | `src/main/lib/trpc/routers/devspace.ts` | 47 |
| `getProcessWorkingDir` | Function | `src/main/lib/trpc/routers/devspace.ts` | 92 |
| `calculateSha512` | Function | `scripts/generate-update-manifest.mjs` | 37 |
| `getFileSize` | Function | `scripts/generate-update-manifest.mjs` | 45 |
| `findZipFile` | Function | `scripts/generate-update-manifest.mjs` | 52 |
| `generateManifest` | Function | `scripts/generate-update-manifest.mjs` | 66 |
| `objectToYaml` | Function | `scripts/generate-update-manifest.mjs` | 122 |
| `formatBytes` | Function | `scripts/generate-update-manifest.mjs` | 156 |
| `fetchJson` | Function | `scripts/fetch-gsd.mjs` | 35 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `InitMessaging → On` | cross_community | 7 |
| `Start → On` | cross_community | 6 |
| `ShutdownMessaging → On` | cross_community | 5 |
| `RefreshTask → On` | cross_community | 5 |
| `RefreshTask → On` | cross_community | 5 |
| `Poll → On` | cross_community | 4 |
| `RunCleanupNow → On` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Terminal-history | 2 calls |
| Routers | 1 calls |

## How to Explore

1. `gitnexus_context({name: "startStreaming"})` — see callers and callees
2. `gitnexus_query({query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
