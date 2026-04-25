# Refactoring Plan: Remove Claws Abstraction Layer

## Overview
This plan documents the removal of the Claws feature from the codebase. Claws (headless agent orchestration) added unnecessary complexity. We now use a simpler model: **chat sessions connected directly to WhatsApp/Discord**.

## Current Architecture (To Be Removed)
```
WhatsApp/Discord Message → Claw Daemon → Session Manager → Claw Execution → Bridge Forward → UI
```

## Target Architecture
```
WhatsApp/Discord Message → Direct Chat Session → Claude Response → Back to Platform
```

## Phase-by-Phase Execution

### Phase 1: Database Schema Changes
**Goal**: Prepare database for direct chat session connections

**Changes**:
1. Add columns to `whatsappBridges` table:
   - `isTwoWaySync`: boolean for bidirectional message sync
   - `settings`: JSON for bridge-specific settings

2. Add columns to `discordBridges` table:
   - `isTwoWaySync`: boolean for bidirectional message sync
   - `settings`: JSON for bridge-specific settings

3. Deprecate (keep tables, stop using):
   - `headlessClaws` - no new entries
   - `clawExecutions` - no new entries
   - `chatSessions` - no new entries (use existing `chats` table with connection fields)

**Migration File**: `drizzle/00XX_deprecate_claws.sql`

---

### Phase 2: Refactor WhatsApp Trigger
**Goal**: Direct WhatsApp messages to chat sessions

**Files to Modify**:
- `src/main/lib/claws/whatsapp-trigger.ts`

**Changes**:
1. Remove `clawDaemon` dependency
2. Remove session manager dependency for Claws sessions
3. Update `forwardToBridges()` to:
   - Find active `whatsappBridges` by `whatsappJid`
   - Emit bridge message directly to the chat's subChat
   - No Claw execution needed

4. Simplify `handleMessage()`:
   - Skip Claws lookup entirely
   - Only forward to bridges (bidirectional sync)
   - Remove queue-based processing for bridges

5. Keep essential functions:
   - `sendMessage()` - for sending responses back to WhatsApp
   - `createGroup()` - for creating WhatsApp groups
   - `getGroups()` - for listing groups
   - Connection management (start/stop)

---

### Phase 3: Refactor Discord Trigger
**Goal**: Direct Discord messages to chat sessions

**Files to Modify**:
- `src/main/lib/claws/discord-trigger.ts`

**Changes**:
1. Remove `clawDaemon` dependency
2. Remove Claws lookup in `handleMessage()`
3. Update to forward directly to `discordBridges`
4. Keep essential Discord bot functionality

---

### Phase 4: Remove Claws tRPC Router
**Goal**: Remove API endpoints for Claws

**Files to Remove**:
- `src/main/lib/trpc/routers/claws.ts`

**Files to Modify**:
- `src/main/lib/trpc/routers/index.ts` - remove claws router import and registration

**Remove Procedures**:
- `list` - listing claws
- `get` - getting single claw
- `create` - creating claws
- `update` - updating claws
- `delete` - deleting claws
- `execute` - executing claws manually
- `listExecutions` - listing execution history
- `createSession` - creating chat sessions
- `getSession` - getting sessions
- `listSessions` - listing sessions
- `updateSession` - updating sessions
- `deleteSession` - deleting sessions
- `testCronExpression` - cron testing
- `checkExecutionStatus` - execution status

---

### Phase 5: Remove Claws UI Components
**Goal**: Remove all Claws-related UI

**Files to Remove**:
1. `src/renderer/features/claws/` - entire directory
   - `atoms/index.ts` - claw-specific atoms
   - `ui/claw-detail-page.tsx` - detail page
   - `components/claw-chat-view.tsx` - chat view
   - `lib/claw-file-utils.ts` - file utilities

2. `src/renderer/features/sidebar/components/claws-tab-content.tsx`
3. `src/renderer/features/sidebar/components/claw-form.tsx`
4. `src/renderer/features/sidebar/components/claw-edit-view.tsx`
5. `src/renderer/features/sidebar/components/create-claw-modal.tsx`
6. `src/renderer/features/sidebar/components/execution-history-viewer.tsx`

**Files to Modify**:
- `src/renderer/features/sidebar/components/index.ts` - remove exports
- `src/renderer/features/sidebar/agents-sidebar.tsx` - remove claw-related imports

---

### Phase 6: Update Sidebar Navigation
**Goal**: Remove claws tab from sidebar

**Files to Modify**:
- `src/renderer/features/agents/atoms/index.ts` - remove "claws" from SidebarTab type
- `src/renderer/features/sidebar/components/sidebar-tab-bar.tsx` - remove claws tab
- `src/renderer/features/agents/ui/agents-content.tsx` - remove claws content routing
- `src/renderer/features/layout/agents-layout.tsx` - remove claws layout handling

---

### Phase 7: Remove Claws Core Logic
**Goal**: Remove main claws module

**Files to Remove**:
- `src/main/lib/claws/index.ts` - ClawDaemon
- `src/main/lib/claws/session-manager.ts` - session management
- `src/main/lib/claws/file-utils.ts` - file utilities
- `src/main/lib/claws/queue-manager.ts` - queue management
- `src/main/lib/claws/queue-types.ts` - queue types
- `src/main/lib/claws/slack-trigger.ts` (if not needed - keep only if Slack is used)
- `src/main/lib/claws/whatsapp-queue.ts` (if not needed)

**Files to Keep** (but refactor):
- `src/main/lib/claws/whatsapp-trigger.ts` - keep for WhatsApp integration
- `src/main/lib/claws/discord-trigger.ts` - keep for Discord integration

**Move to new location**:
- Move WhatsApp trigger to: `src/main/lib/integrations/whatsapp.ts`
- Move Discord trigger to: `src/main/lib/integrations/discord.ts`

---

### Phase 8: Update Main Process
**Goal**: Remove ClawDaemon initialization

**Files to Modify**:
- `src/main/index.ts` - remove `clawDaemon.initialize()` and related imports
- `src/main/windows/main.ts` - remove any claw-related IPC handlers

---

### Phase 9: Update Claude Router
**Goal**: Remove Claws-related message forwarding

**Files to Modify**:
- `src/main/lib/trpc/routers/claude.ts`

**Changes**:
1. Remove `clawDaemon` usage
2. Remove `forwardResponseToConnection` function (or simplify to use bridges directly)
3. Keep bridge forwarding functionality but simplify

---

### Phase 10: Clean Up and Verification
**Goal**: Ensure build passes and no orphaned code

**Tasks**:
1. Remove unused imports across all modified files
2. Update `src/main/lib/db/index.ts` exports if needed
3. Run TypeScript compiler to check for errors: `bun run build`
4. Verify no runtime errors in development: `bun run dev`

**Files to Check for Orphaned Imports**:
- Any file importing from `claws` module
- Any file importing `clawDaemon`
- Any file importing session-manager functions

---

## Testing Strategy

### Unit Tests
1. Verify WhatsApp trigger correctly forwards to bridges
2. Verify Discord trigger correctly forwards to bridges
3. Verify chat creation with connection settings

### Integration Tests
1. Create chat with WhatsApp connection → verify group created
2. Send message from WhatsApp → verify appears in chat
3. Send message from Claw → verify appears in WhatsApp
4. Same tests for Discord

### Migration Tests
1. Run migration on existing database
2. Verify existing claws data remains (not deleted)
3. Verify new bridge columns work

---

## Rollback Plan
If issues occur:
1. Git revert to pre-refactor commit
2. Database tables remain (we're not dropping them)
3. Re-migration not needed (additive changes only)

---

## Post-Refactoring Cleanup (Future)
After successful deployment:
1. Create migration to drop `headlessClaws` table
2. Create migration to drop `clawExecutions` table
3. Create migration to drop `chatSessions` table
4. Remove any remaining dead code

---

## Summary
This refactoring simplifies the architecture from:
- **Complex**: Claws → Sessions → Executions → Bridges
- **Simple**: Bridges ↔ Chat Sessions (direct connection)

The result is a more maintainable, testable, and understandable codebase.
