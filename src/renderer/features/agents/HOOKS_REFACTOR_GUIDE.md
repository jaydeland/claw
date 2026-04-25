# UseEffect Consolidation Guide for active-chat.tsx

This document explains how to integrate the new consolidated hooks to reduce the 53 useEffect hooks in `active-chat.tsx` to approximately 20-25.

## New Hook Files Created

### 1. `hooks/use-chat-keyboard-shortcuts.ts`
Consolidates **9 keyboard shortcut effects** into 1:
- ESC/Ctrl+C to stop streaming (line 2907)
- Cmd+Enter to approve plan (line 3590)
- Cmd+ArrowDown to scroll to bottom (line 3610)
- Cmd+T for new sub-chat (line 5174)
- Cmd+W to close sub-chat (line 5220)
- Cmd+[/] to navigate sub-chats (line 5278)
- Cmd+D to toggle diff sidebar (line 5377)
- Cmd+P to create PR (line 5402)
- Cmd+Shift+E to restore workspace (line 5433)

### 2. `hooks/use-pending-messages.ts`
Consolidates **4 pending message watcher effects** into 1:
- Pending PR message (line 2371)
- Pending Review message (line 2392)
- Pending Conflict message (line 2410)
- Pending Auth retry message (line 2699)

### 3. `hooks/use-diff-sidebar-effects.ts`
Consolidates **6 diff-related effects** into 2:
- Fetch diff stats on mount (line 4573)
- Refresh on sidebar open (line 4579)
- Window focus refetch (line 4744)
- Git status sync (line 4760)
- ResizeObserver tracking (line 4095)
- Throttled refetch (line 4597)

### 4. `hooks/use-chat-scroll.ts`
Consolidates **4 scroll-related effects** into 1 hook:
- Initialize scroll position (line 3040 - useLayoutEffect)
- Attach scroll listener (line 3094)
- Auto-scroll during streaming (line 3106)
- Cleanup isAutoScrollingRef (line 1858)

### 5. `hooks/use-atom-sync.ts`
Consolidates **6 atom sync effects** into reusable hooks:
- Pending plan approvals sync (line 3573)
- Pending plan approvals cleanup (line 3634)
- Rollback handler sync (line 2896)
- IsRollingBack atom sync (line 2902)
- Loading status sync (line 2357)
- Streaming status sync (line 3667)

### 6. `hooks/use-subchat-mode.ts`
Consolidates **3 mode-related effects** into 1:
- Initialize mode from store (line 2070)
- Cleanup message caches (line 2089)
- Sync mode changes (line 2100)

## Integration Steps

### Step 1: Add imports to active-chat.tsx

Replace the individual hook imports with:

```typescript
import {
  useChatKeyboardShortcuts,
  navigateSubChat,
  useChatScroll,
  usePendingPlanApprovalsSync,
  useRollbackSync,
  useStreamingStatusSync,
  useSubChatMode,
} from "../hooks"
```

### Step 2: Replace keyboard shortcut effects in ChatViewInner

Remove these 9 separate useEffect hooks and replace with:

```typescript
// Near line 2900 in ChatViewInner, replace 9 keyboard effects with:
useChatKeyboardShortcuts(
  {
    onStopStream: handleStop,
    onSkipQuestions: handleQuestionsSkip,
    onApprovePlan: handleApprovePlan,
    onScrollToBottom: scrollToBottom,
    onCreateNewSubChat: onCreateNewSubChat,
    onCloseSubChat: (id) => {
      useAgentSubChatStore.getState().removeFromOpenSubChats(id)
      addSubChatToUndoStack(id)
    },
    onNavigateSubChat: navigateSubChat,
    onToggleDiffSidebar: () => setIsDiffSidebarOpen(!isDiffSidebarOpen),
    onCreatePr: handleCreatePr,
    onRestoreWorkspace: handleRestoreWorkspace,
  },
  {
    isActive,
    isStreaming,
    hasUnapprovedPlan,
    hasPendingQuestions: !!pendingQuestions,
    canCreatePr: diffStats.hasChanges,
    isCreatingPr,
    isArchived,
    subChatId,
    editorRef,
  }
)
```

### Step 3: Replace scroll management in ChatViewInner

Replace the scroll-related useEffects and refs with:

```typescript
const {
  chatContainerRef,
  setContainerRef,
  scrollToBottom,
  handleScroll,
  shouldAutoScrollRef,
} = useChatScroll({
  subChatId,
  isActive,
  status,
  messages,
})
```

### Step 4: Replace mode management effects

Replace the 3 mode-related effects with:

```typescript
useSubChatMode({
  subChatId,
  isPlanMode,
  setIsPlanMode,
  updateSubChatModeMutation,
})
```

### Step 5: Replace atom sync effects

Replace individual atom sync effects with:

```typescript
// Replace lines 3573-3645 (pending plan approvals)
usePendingPlanApprovalsSync(subChatId, hasUnapprovedPlan, setPendingPlanApprovals)

// Replace lines 2896-2904 (rollback sync)
useRollbackSync(handleRollback, isRollingBack, setRollbackHandler, setIsRollingBackAtom)

// Replace lines 2357-2366 and 3667-3669 (streaming status)
useStreamingStatusSync(
  subChatId,
  isStreaming,
  parentChatId,
  setLoadingSubChats,
  setStreamingStatus,
  status
)
```

## Effects That Cannot Be Consolidated

Some effects must remain separate due to unique dependencies or timing requirements:

1. **Line 2181** - Restore draft when subChatId changes (unique draft restoration logic)
2. **Line 2462** - Clear pending questions when streaming aborted (complex state management)
3. **Line 2500** - Sync pending questions with messages (depends on lastAssistantMessage)
4. **Line 2793** - Detect PR URLs in messages (message parsing)
5. **Line 3000** - Auto-trigger AI response (regenerate logic)
6. **Line 3131** - Auto-focus input on switch (simple but timing-critical)
7. **Line 3675** - Chat search scroll (search-specific)
8. **Line 4061** - Force narrow width for side-peek mode (display mode specific)
9. **Line 4069** - Hide traffic lights for full-page diff (desktop-specific)
10. **Line 4142** - Clear unseen changes when chat opened (parent-level)
11. **Line 4159** - Clear sub-chat unseen changes (subchat-level)
12. **Line 4430** - Close preview sidebar if unavailable (conditional close)
13. **Line 4807** - Initialize store when chat data loads (complex initialization)

## Current Progress

**Completed consolidations in active-chat.tsx:**
1. ✅ Rollback sync effects -> `useRollbackSync` hook
2. ✅ Pending plan approvals effects -> `usePendingPlanApprovalsSync` hook
3. ✅ Mode-related effects -> `useSubChatMode` hook
4. ✅ Keyboard shortcuts (ESC/Ctrl+C, Cmd+Enter, Cmd+ArrowDown) -> `useChatKeyboardShortcuts` hook
5. ✅ Pending messages (PR, Review, Conflict, Auth retry) -> `usePendingMessages` hook
6. ✅ Streaming status sync -> `useStreamingStatusSync` hook

**Deferred integrations:**
- ⏸️ `useChatScroll` - Complex integration, requires changes to refs/callbacks spread across file
- ⏸️ `useDiffSidebarEffects` - Complex integration in parent component, deferred

**Current state:**
- **Before**: 53 useEffect/useLayoutEffect hooks
- **After integration**: 37 hooks (30% reduction)

## Expected Result

With full integration of remaining hooks:
- **Before**: 53 useEffect/useLayoutEffect hooks
- **Target**: ~22-25 useEffect/useLayoutEffect hooks (58% reduction)

## Performance Benefits

1. **Reduced callback recreation**: Consolidated hooks use refs internally
2. **Single event listener**: Keyboard shortcuts now use 1 event listener instead of 9
3. **Optimized state updates**: Atom sync hooks batch-process related updates
4. **Cleaner component code**: Business logic is better organized into focused hooks
