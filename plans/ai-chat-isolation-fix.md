# Workflow AI Chat Isolation Fix Plan

## Context

The AI chat panel in workflow visualizations (Agents, Skills, Commands, MCPs) is not properly isolated between workspaces. When switching between different projects/workspaces, the chat history from one workspace appears in another if they have workflow items with the same name.

## Problem Analysis

**Root Cause**: The `sourceContext` used to identify chats only includes `name` and `type`, not the `projectId`. This means:
- Workspace A with "my-agent" shares chat history with Workspace B's "my-agent"
- The `contextKey` (which is `JSON.stringify(sourceContext)`) is identical across workspaces

**Files Involved**:
- `src/renderer/features/shared/hooks/use-contextual-chat.ts` - Frontend hook that creates `contextKey`
- `src/main/lib/trpc/routers/chats.ts` - Backend router (already filters by projectId correctly)
- `src/renderer/features/shared/components/contextual-chat-pane.tsx` - UI component (already has reset button)

## Current Behavior vs Expected

### Current (Broken) in use-contextual-chat.ts line 45
```typescript
// sourceContext only has name+type from props
const contextKey = useMemo(() => JSON.stringify(sourceContext), [sourceContext])
// Result: contextKey = '{"name":"my-agent","type":"agent"}' - same for ALL workspaces
```

### Expected (Fixed)
```typescript
// Include projectId in the context for true isolation
const contextWithProject = useMemo(
  () => ({ ...sourceContext, projectId }),
  [sourceContext, projectId]
)
const contextKey = useMemo(() => JSON.stringify(contextWithProject), [contextWithProject])
// Result: contextKey = '{"name":"my-agent","type":"agent","projectId":"ws-a"}' - unique per workspace
```

## Implementation

### Change: Frontend Hook Fix

**File**: `src/renderer/features/shared/hooks/use-contextual-chat.ts`

**Location**: Lines 44-45

**Current Code**:
```typescript
export function useContextualChat({
  sourceView,
  sourceContext,
  projectId,
  chatName,
  mode = "agent",
  model = "sonnet",
  enabled = true,
}: UseContextualChatOptions): UseContextualChatResult {
  // Stable JSON string used as the DB lookup key
  const contextKey = useMemo(() => JSON.stringify(sourceContext), [sourceContext])
```

**Fixed Code**:
```typescript
export function useContextualChat({
  sourceView,
  sourceContext,
  projectId,
  chatName,
  mode = "agent",
  model = "sonnet",
  enabled = true,
}: UseContextualChatOptions): UseContextualChatResult {
  // Include projectId in the context for proper workspace isolation
  // This ensures "my-agent" in Workspace A has a different key than "my-agent" in Workspace B
  const contextWithProject = useMemo(
    () => ({ ...sourceContext, projectId }),
    [sourceContext, projectId]
  )

  // Stable JSON string used as the DB lookup key
  const contextKey = useMemo(() => JSON.stringify(contextWithProject), [contextWithProject])
```

**Backend Already Correct**: The `getBySource` procedure in `src/main/lib/trpc/routers/chats.ts` (lines 69-99) already properly filters by `projectId` in addition to `sourceView` and `sourceContext`:
```typescript
const chat = db
  .select()
  .from(chats)
  .where(and(
    eq(chats.sourceView, input.sourceView),
    eq(chats.sourceContext, input.sourceContext),
    eq(chats.projectId, input.projectId),  // <-- Already filtering by projectId
    isNull(chats.archivedAt),
  ))
```

## Verification Steps

### Test Case 1: Chat Isolation
1. Open Workspace A, go to Workflows > Agents
2. Select "test-agent" and send a message "Hello from Workspace A"
3. Switch to Workspace B
4. Select "test-agent" in Workspace B
5. **Expected**: Chat history should be empty (no "Hello from Workspace A" message)
6. Send message "Hello from Workspace B"
7. Switch back to Workspace A
8. **Expected**: Should see "Hello from Workspace A" (NOT "Hello from Workspace B")

### Test Case 2: Chat Reset (Already Works)
1. Open any workspace, select an agent
2. Send messages to build history
3. Click "New Chat" button in chat header
4. **Expected**: Chat history clears, new empty session starts
5. Old chat is archived (still in DB but not shown)

### Test Case 3: Multiple Nodes in Same Workspace
1. In same workspace, select Agent A, send message "Message A"
2. Select Agent B, send different message "Message B"
3. Switch back to Agent A
4. **Expected**: Agent A shows "Message A" (persistence within workspace works)

## Critical Files

| File | Purpose | Change |
|------|---------|--------|
| `src/renderer/features/shared/hooks/use-contextual-chat.ts` | Frontend contextKey generation | Add projectId to contextKey |

## Notes

- **Single File Change**: Only the frontend hook needs modification - backend already filters correctly
- **No Migration Needed**: Existing chats will naturally be orphaned (they have old context without projectId), which is fine - new chats will be properly isolated
- **Chat Reset Button**: Already exists and works correctly (creates new subChat)
- **Backwards Compatibility**: Old chats without projectId in sourceContext will be orphaned and new isolated chats will be created
