---
name: ui
description: "Skill for the Ui area of claw. 434 symbols across 176 files."
---

# Ui

434 symbols | 176 files | Cohesion: 83%

## When to Use

- Working with code in `src/`
- Understanding how cn, NextjsIcon, ViteIcon work
- Modifying ui-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/icons/framework-icons.tsx` | NextjsIcon, ViteIcon, ReactIcon, VueIcon, AngularIcon (+35) |
| `src/renderer/features/workflows/ui/workflow-reactflow-view.tsx` | normalizeCliApps, normalizeBackgroundTasks, buildTransitiveGraph, getNodeId, createDepNode (+7) |
| `src/renderer/features/settings/ui/cc-settings-content.tsx` | OverviewSection, HooksSection, addHook, removeHook, PermissionsSection (+4) |
| `src/renderer/features/agents/main/active-chat.tsx` | CopyButton, PlayButton, RollbackButton, CollapsibleSteps, handlePlay (+4) |
| `src/renderer/features/mcp/ui/mcp-server-list.tsx` | getStatusIcon, getStatusText, getSourceIcon, getFileNameFromPath, getShortPath (+4) |
| `src/renderer/features/gsd/ui/gsd-planning-right-panel.tsx` | FileTreeItem, GsdPanelTabs, NextTabContent, PlanTabContent, PhaseTabContent (+3) |
| `src/renderer/features/agents/ui/agent-tool-utils.ts` | areAskUserQuestionPropsEqual, getToolStateSnapshot, hasToolStateChanged, arePartsEqual, isToolCompleted (+3) |
| `src/renderer/components/ui/prompt-input.tsx` | PromptInput, PromptInputActions, usePromptInput, PromptInputTextareaInner, PromptInputAction (+2) |
| `src/renderer/features/gsd/ui/gsd-content.tsx` | GsdContent, handleSelectGsdDoc, BranchSelector, handleBranchSelect, FileTreeItem (+2) |
| `src/renderer/features/agents/ui/agents-content.tsx` | useSearchParams, useRouter, useUser, useClerk, useCombinedAuth (+2) |

## Entry Points

Start here when exploring this area:

- **`cn`** (Function) — `src/renderer/lib/utils.ts:4`
- **`NextjsIcon`** (Function) — `src/renderer/icons/framework-icons.tsx:13`
- **`ViteIcon`** (Function) — `src/renderer/icons/framework-icons.tsx:70`
- **`ReactIcon`** (Function) — `src/renderer/icons/framework-icons.tsx:113`
- **`VueIcon`** (Function) — `src/renderer/icons/framework-icons.tsx:136`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `cn` | Function | `src/renderer/lib/utils.ts` | 4 |
| `NextjsIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 13 |
| `ViteIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 70 |
| `ReactIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 113 |
| `VueIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 136 |
| `AngularIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 160 |
| `SvelteIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 204 |
| `AstroIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 224 |
| `RemixIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 236 |
| `GatsbyIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 248 |
| `NuxtIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 260 |
| `TurboIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 276 |
| `TypeScriptIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 307 |
| `JavaScriptIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 323 |
| `PythonIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 350 |
| `GoIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 390 |
| `MarkdownInfoIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 410 |
| `MarkdownIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 437 |
| `RustIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 456 |
| `CSSIcon` | Function | `src/renderer/icons/framework-icons.tsx` | 468 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandlePlay → GetDatabasePath` | cross_community | 9 |
| `HandlePlay → PathValidationError` | cross_community | 8 |
| `HandlePlay → IsPathWithinWorktree` | cross_community | 7 |
| `MessageStoreProvider → Set` | cross_community | 6 |
| `SetupExitHandler → IsAllowedVar` | cross_community | 6 |
| `SetupExitHandler → HasAllowedPrefix` | cross_community | 6 |
| `CreateStatusRouter → Set` | cross_community | 5 |
| `RegisterGitWatcherIPC → Set` | cross_community | 5 |
| `SetupExitHandler → DetectShellAsync` | cross_community | 5 |
| `SetupExitHandler → SanitizeEnv` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Terminal | 35 calls |
| Themes | 3 calls |
| Cluster_226 | 2 calls |
| Cluster_224 | 1 calls |
| Hooks | 1 calls |
| Routers | 1 calls |

## How to Explore

1. `gitnexus_context({name: "cn"})` — see callers and callees
2. `gitnexus_query({query: "ui"})` — find related execution flows
3. Read key files listed above for implementation details
