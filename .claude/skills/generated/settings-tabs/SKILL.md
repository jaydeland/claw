---
name: settings-tabs
description: "Skill for the Settings-tabs area of claw. 85 symbols across 19 files."
---

# Settings-tabs

85 symbols | 19 files | Cohesion: 97%

## When to Use

- Working with code in `src/`
- Understanding how useAiQuery, AgentsWorktreesTab, updateCommand work
- Modifying settings-tabs-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx` | useIsNarrowScreen, checkWidth, AgentsProjectWorktreeTab, updateStartCommand, removeStartCommand (+4) |
| `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | AgentsAdvancedSettingsTab, validateWorktreePath, handleViewMcpConfig, toggleSection, updateDefaultStartCommand (+3) |
| `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx` | useIsNarrowScreen, checkWidth, AgentsWorktreesTab, updateCommand, removeCommand (+2) |
| `src/renderer/components/dialogs/settings-tabs/agents-providers-tab.tsx` | ClaudeCodeProvider, handleSubmitCode, handleCopyUrl, OllamaProvider, applyOllamaPreset (+2) |
| `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` | useIsNarrowScreen, checkWidth, getProviderInfo, AgentsModelsTab, handleAddModel (+1) |
| `src/renderer/components/dialogs/settings-tabs/agents-debug-tab.tsx` | useIsNarrowScreen, checkWidth, loadReactScan, unloadReactScan, AgentsDebugTab (+1) |
| `src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx` | useIsNarrowScreen, checkWidth, AgentsSkillsTab, handleExpandSkill, handleOpenInFinder |
| `src/renderer/components/dialogs/settings-tabs/agents-custom-agents-tab.tsx` | useIsNarrowScreen, checkWidth, AgentsCustomAgentsTab, handleExpandAgent, handleOpenInFinder |
| `src/renderer/components/dialogs/settings-tabs/whatsapp-queue-status.tsx` | formatTimeElapsed, getStatusBadge, ClawQueueSection, WhatsAppQueueStatus |
| `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx` | useIsNarrowScreen, checkWidth, AgentsProfileTab, fetchUser |

## Entry Points

Start here when exploring this area:

- **`useAiQuery`** (Function) — `src/renderer/hooks/use-ai-query.ts:4`
- **`AgentsWorktreesTab`** (Function) — `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx:38`
- **`updateCommand`** (Function) — `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx:216`
- **`removeCommand`** (Function) — `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx:227`
- **`addCommand`** (Function) — `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx:236`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useAiQuery` | Function | `src/renderer/hooks/use-ai-query.ts` | 4 |
| `AgentsWorktreesTab` | Function | `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx` | 38 |
| `updateCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx` | 216 |
| `removeCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx` | 227 |
| `addCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-worktrees-tab.tsx` | 236 |
| `AgentsDevServerTab` | Function | `src/renderer/components/dialogs/settings-tabs/agents-dev-server-tab.tsx` | 30 |
| `AgentsProjectWorktreeTab` | Function | `src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx` | 55 |
| `updateStartCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx` | 259 |
| `removeStartCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx` | 265 |
| `updateCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx` | 274 |
| `removeCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx` | 285 |
| `addCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx` | 294 |
| `AgentsAdvancedSettingsTab` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 88 |
| `validateWorktreePath` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 205 |
| `handleViewMcpConfig` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 258 |
| `toggleSection` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 264 |
| `updateDefaultStartCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 269 |
| `removeDefaultStartCommand` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 275 |
| `updateEnvVar` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 285 |
| `removeEnvVar` | Function | `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 291 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 2 calls |

## How to Explore

1. `gitnexus_context({name: "useAiQuery"})` — see callers and callees
2. `gitnexus_query({query: "settings-tabs"})` — find related execution flows
3. Read key files listed above for implementation details
