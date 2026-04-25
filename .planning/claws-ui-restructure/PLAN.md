# Claws UI Restructure Plan

## Overview

Restructure the Claws UI to match the Workspace UI pattern, providing a consistent user experience across the application. This includes tree-view navigation, detailed settings pages, execution history, and support for auto-learned markdown files.

## Current State Analysis

### Existing Claws UI Structure
```
src/renderer/features/
├── claws/
│   └── components/
│       └── claw-chat-view.tsx          # Execution chat view
├── sidebar/components/
│   ├── claws-tab-content.tsx           # Simple list view
│   ├── claw-edit-view.tsx              # Edit form wrapper
│   ├── claw-form.tsx                   # Create/edit form
│   ├── create-claw-modal.tsx           # Creation modal
│   └── execution-history-viewer.tsx    # Execution logs view
```

### Workspace UI Structure (Target Pattern)
```
src/renderer/features/
├── sidebar/components/
│   └── workspaces-tab-content.tsx      # Tree view with expandable projects
├── agents/ui/
│   ├── agents-content.tsx              # Main content router
│   └── project-detail-page.tsx         # Settings tabs for projects
```

## Proposed New Structure

```
src/renderer/features/
├── claws/                              # NEW: Main claws feature directory
│   ├── ui/
│   │   ├── claws-content.tsx           # Main content area router
│   │   ├── claw-detail-page.tsx        # Settings tabs (General, Trigger, History, Files)
│   │   ├── claw-executions-view.tsx    # Execution history view
│   │   └── claw-files-view.tsx         # Auto-learned files view
│   ├── components/
│   │   ├── claw-general-settings.tsx   # General settings tab
│   │   ├── claw-trigger-settings.tsx   # Trigger configuration tab
│   │   ├── claw-permissions-settings.tsx # Permissions tab
│   │   ├── claw-execution-item.tsx     # Single execution row
│   │   ├── claw-file-card.tsx          # Markdown file card
│   │   └── claw-create-dialog.tsx      # Create new claw dialog
│   ├── atoms/
│   │   └── index.ts                    # Claw-specific Jotai atoms
│   ├── hooks/
│   │   └── use-claw-files.ts           # Hook for fetching claw files
│   └── lib/
│       └── claw-file-utils.ts          # Utils for SOUL.md, MEMORY.md, etc.
├── sidebar/components/
│   └── claws-tab-content.tsx           # UPDATED: Tree view with claw groups
```

## File Storage Architecture

### Living Documents Location
Claw living documents are stored **on disk** in each claw's worktree directory, isolated per claw:

```
/path/to/claw/worktree/
├── .claw/                          # Claw metadata directory
│   ├── SOUL.md                     # Agent identity and values
│   ├── MEMORY.md                   # Hot memory (≤100 lines)
│   ├── LEARNINGS.md                # Self-improvement entries
│   ├── ERRORS.md                   # Error patterns and solutions
│   ├── FEATURE_REQUESTS.md         # Capability gaps
│   ├── HEARTBEAT.md                # Periodic checklist
│   ├── IDENTITY.md                 # Agent persona
│   └── AGENTS.md                   # Multi-agent orchestration
├── src/                            # Claw's working files
└── ...
```

### File Access Pattern
- **Read**: tRPC endpoints use Node.js `fs` APIs to read files from disk
- **Write**: UI edits are saved back to disk via tRPC mutations
- **Watch**: Optional file watcher to detect external changes
- **Cache**: React Query caching for file content

### Standard Files
| File | Purpose | Auto-Generated |
|------|---------|----------------|
| SOUL.md | Agent identity, values, behavioral principles | Yes |
| MEMORY.md | Hot memory (≤100 lines), always loaded | Yes |
| LEARNINGS.md | Self-improvement entries from successes | Yes |
| ERRORS.md | Error patterns and solutions learned | Yes |
| FEATURE_REQUESTS.md | Capability gaps and user requests | Yes |
| HEARTBEAT.md | Periodic self-check checklist | Yes |
| IDENTITY.md | Agent persona definition | Optional |
| AGENTS.md | Multi-agent orchestration rules | Optional |

## Database Schema Changes

### Required: Add `clawsSoul` to `headlessClaws` Table
The claws-soul is a system prompt injected into each SDK session (separate from SOUL.md living document).

```typescript
// Add to headlessClaws table schema
clawsSoul: text("claws_soul").default(""), // System prompt injected via SDK
```

### No New Tables for Files
Since living documents are stored on disk in `.claw/` directory, no database migration is needed for file storage.

### Optional: `claw_groups` Table (for organizing claws)
```typescript
export const clawGroups = sqliteTable("claw_groups", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})
```

## State Management (Jotai Atoms)

### New Atoms in `features/claws/atoms/index.ts`
```typescript
// Selected claw for detail view
export const selectedClawIdAtom = atom<string | null>(null)

// Selected claw for settings/detail page
export const selectedClawDetailIdAtom = atom<string | null>(null)

// Expanded claw groups in sidebar
export const expandedClawIdsAtom = atomWithStorage<Set<string>>(
  "claws:expandedIds",
  new Set(),
  undefined,
  { getOnInit: true }
)

// Active tab in claw detail page
export const clawDetailActiveTabAtom = atomWithStorage<string>(
  "claws:activeTab",
  "general"
)

// Selected execution for chat view
export const selectedClawExecutionAtom = atom<{
  executionId: string
  clawId: string
  clawName: string
  subChatName?: string
} | null>(null)

// Claw files refresh trigger
export const clawFilesRefreshAtom = atom<number>(0)
```

## UI Components Specification

### 1. Updated ClawsTabContent (Sidebar)
**Pattern:** Similar to WorkspacesTabContent

**Features:**
- Search bar for filtering claws
- "New Claw" button
- Expandable claw groups (optional) or flat list
- Each claw shows:
  - Status indicator (enabled/disabled)
  - Name
  - Trigger type icon (cron, GitHub, manual, etc.)
  - Last execution status
  - Execution count badge
- Context menu on each claw:
  - Edit
  - View History
  - Run Now
  - Duplicate
  - Delete
  - Settings (opens detail page)
- Nested executions under each claw (last 3-5)

### 2. ClawDetailPage (Main Content)
**Pattern:** Similar to ProjectDetailPage

**Header:**
- Back button
- Claw icon + name
- Status toggle (enabled/disabled)
- "Run Now" button
- "New Execution" button

**Tabs:**
1. **General** - Name, purpose, instruction, claws-soul, worktree path *(from database)*
2. **Trigger** - Trigger type specific settings *(from database)*
3. **History** - All executions list with status *(from database)*
4. **Files** - Living documents *(from filesystem `.claw/` directory)*

### Data Source by Tab

| Tab | Data Source | Storage Location |
|-----|-------------|------------------|
| **General** | `headlessClaws` table | SQLite database |
| **General → Claws-Soul** | `headlessClaws.clawsSoul` | SQLite database (injected as system message) |
| **Trigger** | `headlessClaws.triggerConfig` | SQLite database (JSON) |
| **History** | `clawExecutions` table | SQLite database |
| **Files** | `.claw/*.md` files | Filesystem in worktree |

### Claws-Soul vs SOUL.md

| | **Claws-Soul** | **SOUL.md** |
|---|---|---|
| **Purpose** | System prompt injected into SDK sessions | Living document for self-improvement |
| **Storage** | Database (`headlessClaws.clawsSoul`) | Filesystem (`.claw/SOUL.md`) |
| **When Used** | Injected as system message at session start | Read by claw during execution |
| **Updated By** | User via General settings tab | Auto-generated + editable via Files tab |
| **Content** | Static behavioral instructions | Dynamic learnings and identity |

**Example:**
- **Claws-Soul**: "You are a code review assistant. Be thorough and constructive..."
- **SOUL.md**: "I learn that users prefer concise reviews over detailed explanations..."

Since living documents are stored on disk:
- **Reading**: tRPC endpoint reads `.claw/*.md` files using Node.js `fs`
- **Writing**: Edits saved back to disk via tRPC mutation
- **UI**: Grid of file cards with edit capability
- **No database**: Files tab does not use `claw_files` table
- **Auto-create**: `.claw/` directory and default files created when claw is initialized

### 3. ClawExecutionsView
**Pattern:** Similar to execution-history-viewer but integrated

**Features:**
- Filter by status (running, success, failed)
- Sort by date
- Pagination or infinite scroll
- Each execution shows:
  - Status icon
  - Start time
  - Duration
  - Trigger source (manual, scheduled, webhook)
  - Link to chat view

### 4. ClawFilesView
**New Component**

**Features:**
- Grid of markdown file cards
- Each card shows:
  - File type icon
  - File name
  - Last updated
  - Auto-generated badge
  - Preview snippet
- Click to edit in markdown editor
- Auto-sync from worktree option

**Standard Files:**
- SOUL.md - Agent identity and values
- MEMORY.md - Hot memory (≤100 lines)
- LEARNINGS.md - Self-improvement entries
- ERRORS.md - Error patterns and solutions
- FEATURE_REQUESTS.md - Capability gaps
- HEARTBEAT.md - Periodic checklist
- IDENTITY.md - Agent persona
- AGENTS.md - Multi-agent orchestration

## File Structure Implementation

### Phase 1: Foundation
1. Create `features/claws/` directory structure
2. Create atoms for state management
3. Add database migration for `claw_files` table

### Phase 2: Sidebar
1. Rewrite `ClawsTabContent` with tree view
2. Add expandable sections
3. Add context menus

### Phase 3: Detail Page
1. Create `ClawDetailPage` component
2. Implement tab navigation
3. Create settings tab components

### Phase 4: Files Support
1. Create `ClawFilesView`
2. Implement file cards
3. Add markdown editor integration
4. Create file sync mechanism

### Phase 5: Integration
1. Update `agents-content.tsx` routing
2. Migrate existing components
3. Update tRPC routers

## tRPC Router Updates

### New Endpoints in `claws.ts`
```typescript
// File management (filesystem-based)
.getFiles: proc.input(z.object({ clawId: z.string() })).query(
  // Reads all .claw/*.md files from the claw's worktree
  // Returns: { fileType, fileName, content, lastModified }[]
)
.getFile: proc.input(z.object({ clawId: z.string(), fileName: z.string() })).query(
  // Reads a specific file from .claw/ directory
)
.saveFile: proc.input(z.object({
  clawId: z.string(),
  fileName: z.string(),  // e.g., "SOUL.md"
  content: z.string()
})).mutation(
  // Writes file to .claw/ directory, creates if missing
)
.deleteFile: proc.input(z.object({ clawId: z.string(), fileName: z.string() })).mutation(
  // Deletes a file from .claw/ directory
)
.ensureClawDirectory: proc.input(z.object({ clawId: z.string() })).mutation(
  // Ensures .claw/ directory exists, creates default files if missing
)

// Enhanced settings (includes clawsSoul)
.getSettings: proc.input(z.object({ clawId: z.string() })).query(
  // Returns: { name, purpose, instruction, clawsSoul, worktreePath, ... }
)
.updateSettings: proc.input(clawSettingsSchema).mutation(
  // Updates: name, purpose, instruction, clawsSoul, etc.
)

// Execution management
.getExecutionsPaginated: proc.input(z.object({
  clawId: z.string(),
  page: z.number(),
  limit: z.number(),
  status: z.enum(["running", "success", "failed"]).optional()
})).query(/* ... */)
```

## Migration Strategy

### Backward Compatibility
- Keep existing `headlessClaws` table unchanged
- New `claw_files` table is additive
- Existing claws work without files

### Data Migration
- None required for initial rollout
- Optional: Create default SOUL.md for existing claws

## UI Mockup

```
┌─ Sidebar (Claws Tab) ──────────────────────────────┐
│  [Search...]                    [+ New Claw]         │
│                                                    │
│  ▼ Backend Agents                                  │
│    ┌─ ⚡ Code Review Bot              [●] [▶] [⚙] │
│    │   ├─ ✓ 2 hours ago (manual)                  │
│    │   ├─ ✓ 5 hours ago (cron)                     │
│    │   └─ ✗ 1 day ago (cron)                      │
│    │                                               │
│    └─ ⚡ Dependency Checker          [●] [▶] [⚙] │
│        ├─ ✓ 1 hour ago (github)                    │
│        └─ ✓ 3 hours ago (github)                   │
│                                                    │
│  ▶ Frontend Agents                                 │
│    └─ ⚡ UI Tester                     [○] [▶] [⚙] │
│                                                    │
└────────────────────────────────────────────────────┘

┌─ Main Content (Claw Detail) ───────────────────────┐
│  [←] ⚡ Code Review Bot    [Toggle] [Run] [New]   │
├────────────────────────────────────────────────────┤
│  [General] [Trigger] [History] [Files]             │
├────────────────────────────────────────────────────┤
│                                                    │
│  General Settings                                  │
│  ─────────────────                                 │
│  Name: [Code Review Bot                    ]       │
│  Purpose: [Reviews PRs for style issues... ]       │
│                                                    │
│  Instruction                                       │
│  ┌────────────────────────────────────────────┐    │
│  │ Review the provided code changes for:      │    │
│  │ - Style consistency                          │    │
│  │ - Potential bugs                             │    │
│  │ - Security issues                            │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  Claws-Soul (System Prompt)                        │
│  ┌────────────────────────────────────────────┐    │
│  │ You are a code review assistant. Be thorough │    │
│  │ but constructive. Focus on:                │    │
│  │ - Code quality                               │    │
│  │ - Best practices                             │    │
│  │ - Performance implications                   │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  Worktree: /Users/.../worktrees/code-review-bot    │
│                                                    │
└────────────────────────────────────────────────────┘
```

## Success Criteria

1. Claws UI matches Workspace UI pattern
2. Users can navigate claws via tree view
3. Each claw has a detailed settings page
4. Execution history is easily accessible
5. Auto-learned files are visible and editable
6. Existing functionality is preserved
7. Performance is maintained or improved

## Future Enhancements

1. Claw groups/categories
2. Claw templates
3. Claw cloning
4. Bulk operations
5. Execution analytics
6. File versioning
7. Collaborative editing
