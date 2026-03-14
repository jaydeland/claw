# Claws UI Restructure - Implementation Checklist

## Phase 1: Foundation & Database

### Database Schema
- [ ] ~~Create migration file for `claw_files` table~~ (Not needed - files stored on disk)
- [ ] ~~Add `claw_files` to schema/index.ts~~ (Not needed)
- [ ] ~~Add relations to `headlessClaws` relations~~ (Not needed)
- [ ] **Add `clawsSoul` field to `headlessClaws` table** (system prompt for SDK injection)
- [ ] Ensure `headlessClaws` table has `worktreePath` field for file storage location
- [ ] Optional: Add `claw_groups` table for organizing claws

### Filesystem Setup
- [ ] Create utility to ensure `.claw/` directory exists in worktree
- [ ] Create default file templates (SOUL.md, MEMORY.md, etc.)
- [ ] Add file watcher utility (optional) for detecting external changes

### Directory Structure
- [ ] Create `src/renderer/features/claws/` directory
- [ ] Create `src/renderer/features/claws/ui/`
- [ ] Create `src/renderer/features/claws/components/`
- [ ] Create `src/renderer/features/claws/atoms/`
- [ ] Create `src/renderer/features/claws/hooks/`
- [ ] Create `src/renderer/features/claws/lib/`

### State Management (Atoms)
- [ ] Create `src/renderer/features/claws/atoms/index.ts`
- [ ] Define `selectedClawIdAtom`
- [ ] Define `selectedClawDetailIdAtom`
- [ ] Define `expandedClawIdsAtom` (with storage)
- [ ] Define `clawDetailActiveTabAtom` (with storage)
- [ ] Define `selectedClawExecutionAtom`
- [ ] Define `clawFilesRefreshAtom`
- [ ] Define `clawSearchQueryAtom`
- [ ] Export all from `src/renderer/lib/atoms/index.ts`

## Phase 2: Sidebar Tree View

### ClawsTabContent Rewrite
- [ ] Backup existing `claws-tab-content.tsx`
- [ ] Create new tree-view based `ClawsTabContent`
- [ ] Add search functionality
- [ ] Add "New Claw" button
- [ ] Implement expandable claw items
- [ ] Show claw status indicator
- [ ] Show trigger type icon
- [ ] Show last execution status
- [ ] Add context menu (Edit, History, Run, Delete, Settings)
- [ ] Show recent executions under each claw
- [ ] Add empty state

### Supporting Components
- [ ] Create `ClawTreeItem` component
- [ ] Create `ClawExecutionPreview` component
- [ ] Create `ClawContextMenu` component
- [ ] Create `ClawStatusBadge` component

## Phase 3: Detail Page

### Main Components
- [ ] Create `ClawDetailPage` component
- [ ] Create tab navigation (General, Trigger, History, Files)
- [ ] Add header with back button, name, status toggle, run button
- [ ] Implement tab content switching

### General Settings Tab
- [ ] Create `ClawGeneralSettings` component
- [ ] Name field
- [ ] Purpose field
- [ ] Instruction textarea
- [ ] **Claws-Soul textarea** (system prompt injected via SDK)
- [ ] Worktree path display
- [ ] Sandbox mode selector
- [ ] Save/Cancel buttons

### Trigger Settings Tab
- [ ] Create `ClawTriggerSettings` component
- [ ] Trigger type selector
- [ ] Cron expression input (for cron trigger)
- [ ] GitHub repo/label inputs (for github_poll)
- [ ] Slack channel filter (for slack_mention)
- [ ] WhatsApp chat filter (for whatsapp_message)

### Permissions Settings Tab
- [ ] Create `ClawPermissionsSettings` component
- [ ] Allowed directories list
- [ ] Allowed MCP servers list
- [ ] Add/remove functionality

## Phase 4: History & Files

### History Tab
- [ ] Create `ClawHistoryTab` component
- [ ] Execution list with filtering
- [ ] Status badges
- [ ] Duration calculation
- [ ] Pagination or infinite scroll
- [ ] Link to chat view

### Files Tab
- [ ] Create `ClawFilesTab` component
- [ ] Create `ClawFileCard` component
- [ ] Grid layout for file cards
- [ ] File type icons
- [ ] Last updated timestamp
- [ ] Auto-generated badge
- [ ] Click to edit functionality
- [ ] Create new file button

### File Editor
- [ ] Create `ClawFileEditor` component
- [ ] Markdown editor integration
- [ ] Save/Cancel buttons
- [ ] Auto-sync toggle

## Phase 5: Integration

### Content Router
- [ ] Update `agents-content.tsx`
- [ ] Add routing for `selectedClawDetailId`
- [ ] Add routing for `selectedClawExecution`
- [ ] Ensure backward compatibility

### tRPC Routers (Filesystem-based for Files tab)
- [ ] Add `getClawFiles` endpoint (reads `.claw/*.md` from disk)
- [ ] Add `getClawFile` endpoint (reads single file from disk)
- [ ] Add `saveClawFile` endpoint (writes file to `.claw/` directory)
- [ ] Add `deleteClawFile` endpoint (removes file from `.claw/` directory)
- [ ] Add `ensureClawDirectory` endpoint (creates `.claw/` with defaults)
- [ ] Add `getSettings` endpoint (database - includes clawsSoul)
- [ ] Add `updateSettings` endpoint (database - includes clawsSoul)
- [ ] Add `getExecutionsPaginated` endpoint (database)

### Migration & Cleanup
- [ ] Migrate existing `ClawEditView` functionality
- [ ] Migrate existing `CreateClawModal` functionality
- [ ] Update imports throughout codebase
- [ ] Remove deprecated components (if any)

## Phase 6: Testing & Documentation

### Testing
- [ ] Test creating new claws
- [ ] Test editing existing claws
- [ ] Test execution history
- [ ] Test file CRUD operations
- [ ] Test navigation between views
- [ ] Test search functionality
- [ ] Test context menus
- [ ] Test responsive layout

### Documentation
- [ ] Update CLAUDE.md with new architecture
- [ ] Add JSDoc comments to new components
- [ ] Update feature-to-component mapping table
- [ ] Update state management quick reference
- [ ] Update sidebar tab routing table

## File Checklist

### New Files to Create
```
src/renderer/features/claws/
├── atoms/
│   └── index.ts
├── components/
│   ├── claw-general-settings.tsx
│   ├── claw-trigger-settings.tsx
│   ├── claw-permissions-settings.tsx
│   ├── claw-execution-item.tsx
│   ├── claw-file-card.tsx
│   ├── claw-tree-item.tsx
│   ├── claw-context-menu.tsx
│   └── claw-create-dialog.tsx
├── hooks/
│   └── use-claw-files.ts
├── lib/
│   └── claw-file-utils.ts
└── ui/
    ├── claws-content.tsx
    ├── claw-detail-page.tsx
    ├── claw-executions-view.tsx
    └── claw-files-view.tsx

src/main/lib/trpc/routers/
└── claws.ts (add filesystem endpoints)

src/main/lib/claws/
└── file-utils.ts (filesystem utilities for .claw/ directory)
```

### Files to Modify
```
src/renderer/features/sidebar/components/claws-tab-content.tsx
src/renderer/features/agents/ui/agents-content.tsx
src/renderer/lib/atoms/index.ts
src/main/lib/db/schema/index.ts
src/main/lib/trpc/routers/claws.ts
src/main/lib/trpc/root.ts
CLAUDE.md
```

## Success Metrics

- [ ] All existing claw functionality preserved
- [ ] New tree view renders correctly
- [ ] Detail page accessible from sidebar
- [ ] Files can be created, read, updated, deleted
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] All tests pass (if applicable)

## Notes

- Keep backward compatibility with existing claws
- Follow existing code patterns from workspaces
- Use existing UI components from `components/ui/`
- Ensure proper error handling
- Add loading states for async operations
- Consider empty states for new claws without files
