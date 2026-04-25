---
name: components
description: "Skill for the Components area of claw. 66 symbols across 25 files."
---

# Components

66 symbols | 25 files | Cohesion: 87%

## When to Use

- Working with code in `src/`
- Understanding how parseWorkflowName, groupWorkflowsByNamespace, groupWorkflowsHierarchically work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/features/sidebar/components/terminal-tab-content.tsx` | generateTerminalId, generatePaneId, getNextTerminalName, getShortPath, TerminalTabContent |
| `src/renderer/features/sidebar/components/mcps-tab-content.tsx` | getSourceIcon, getFileNameFromPath, McpsTabContent, toggleGroup, handleAddServerToGroup |
| `src/renderer/features/agents/components/pinned-tabs-bar.tsx` | PinnedTabsBar, loadPinnedIds, handlePinChange, handleTabClick, handleUnpin |
| `src/renderer/features/workflows/lib/parse-workflow-name.ts` | parseWorkflowName, extractSubGroupPrefix, groupWorkflowsByNamespace, groupWorkflowsHierarchically |
| `src/renderer/features/sidebar/components/agents-tab-content.tsx` | AgentsTabContent, toggleGroup, handleAgentClick, renderAgentItem |
| `src/renderer/components/windows-title-bar.tsx` | WindowsTitleBar, checkFrameState, checkMaximized, handleFocus |
| `src/renderer/features/agents/components/gsd-chat-sidebar.tsx` | parseNextActions, getStatusColor, getStatusIcon, GsdChatSidebar |
| `src/renderer/features/agents/components/agent-send-button.tsx` | AgentSendButton, getIcon, getTooltipContent, getAriaLabel |
| `src/renderer/components/rename-dialog.tsx` | handleKeyDown, handleClose, handleSave |
| `src/renderer/features/github/components/github-tree-pane.tsx` | buildFileTree, sortNodes, sortTree |

## Entry Points

Start here when exploring this area:

- **`parseWorkflowName`** (Function) — `src/renderer/features/workflows/lib/parse-workflow-name.ts:42`
- **`groupWorkflowsByNamespace`** (Function) — `src/renderer/features/workflows/lib/parse-workflow-name.ts:144`
- **`groupWorkflowsHierarchically`** (Function) — `src/renderer/features/workflows/lib/parse-workflow-name.ts:190`
- **`SkillsTabContent`** (Function) — `src/renderer/features/sidebar/components/skills-tab-content.tsx:28`
- **`toggleGroup`** (Function) — `src/renderer/features/sidebar/components/skills-tab-content.tsx:57`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parseWorkflowName` | Function | `src/renderer/features/workflows/lib/parse-workflow-name.ts` | 42 |
| `groupWorkflowsByNamespace` | Function | `src/renderer/features/workflows/lib/parse-workflow-name.ts` | 144 |
| `groupWorkflowsHierarchically` | Function | `src/renderer/features/workflows/lib/parse-workflow-name.ts` | 190 |
| `SkillsTabContent` | Function | `src/renderer/features/sidebar/components/skills-tab-content.tsx` | 28 |
| `toggleGroup` | Function | `src/renderer/features/sidebar/components/skills-tab-content.tsx` | 57 |
| `AgentsTabContent` | Function | `src/renderer/features/sidebar/components/agents-tab-content.tsx` | 28 |
| `toggleGroup` | Function | `src/renderer/features/sidebar/components/agents-tab-content.tsx` | 72 |
| `useChatStatuses` | Function | `src/renderer/features/sidebar/hooks/use-chat-status.ts` | 84 |
| `WorkspacesTabContent` | Function | `src/renderer/features/sidebar/components/workspaces-tab-content.tsx` | 53 |
| `ContextualChatsSection` | Function | `src/renderer/features/sidebar/components/contextual-chats-section.tsx` | 78 |
| `handleChatClick` | Function | `src/renderer/features/sidebar/components/contextual-chats-section.tsx` | 111 |
| `handleNewChat` | Function | `src/renderer/features/agents/ui/project-detail-page.tsx` | 41 |
| `cleanupChatLocalStorage` | Function | `src/renderer/features/agents/atoms/index.ts` | 840 |
| `formatTimeAgo` | Function | `src/renderer/features/agents/utils/format-time-ago.ts` | 4 |
| `MobileChatHeader` | Function | `src/renderer/features/agents/ui/mobile-chat-header.tsx` | 46 |
| `formatRelativeTime` | Function | `src/renderer/features/agents/main/new-chat-form.tsx` | 679 |
| `CreateBranchDialog` | Function | `src/renderer/features/agents/components/create-branch-dialog.tsx` | 44 |
| `handleSubmit` | Function | `src/renderer/features/agents/components/create-branch-dialog.tsx` | 96 |
| `TerminalTabContent` | Function | `src/renderer/features/sidebar/components/terminal-tab-content.tsx` | 66 |
| `McpsTabContent` | Function | `src/renderer/features/sidebar/components/mcps-tab-content.tsx` | 106 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `WorkspacesTabContent → Set` | cross_community | 4 |
| `SkillsTabContent → Set` | cross_community | 4 |
| `AgentsTabContent → Set` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 14 calls |
| Terminal | 4 calls |

## How to Explore

1. `gitnexus_context({name: "parseWorkflowName"})` — see callers and callees
2. `gitnexus_query({query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
