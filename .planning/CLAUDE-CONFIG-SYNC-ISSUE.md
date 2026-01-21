# Claude Config Sync Issue - Analysis & Solution

**Date:** 2026-01-20
**Issue:** Agents and commands not appearing in workflow viewer after changing settings

---

## Problem Statement

When the user changes authentication mode or custom config directory in the settings panel, the workflow viewer doesn't automatically update to show agents/commands from the new config directory.

**Example Scenario:**
1. User switches from "OAuth" to "Devyard" auth mode
2. Settings are saved successfully
3. Workflow viewer still shows empty or old agents/commands
4. User expects to see agents/commands from `$VIDYARD_PATH/devyard/claude/plugin/`

---

## Root Cause Analysis

### How Config Directory Is Determined

#### Workflow Viewer (`workflows.ts:104-107`)

```typescript
async function getClaudeConfigDir(): Promise<string> {
  const { baseDir } = getWorkflowConfigDir()
  return baseDir
}
```

Calls `getWorkflowConfigDir()` from `devyard-scan-helper.ts:75-105`:

```typescript
export function getWorkflowConfigDir(): { baseDir: string; isDevyard: boolean } {
  // 1. Check for customConfigDir in settings
  if (settings?.customConfigDir) {
    return { baseDir: settings.customConfigDir, isDevyard: false }
  }

  // 2. Devyard mode: use plugin/ directory
  if (settings?.authMode === "devyard") {
    const config = getDevyardConfig()
    if (config.enabled && config.claudePluginDir) {
      return { baseDir: config.claudePluginDir, isDevyard: true }
    }
  }

  // 3. Default: ~/.claude
  return { baseDir: path.join(os.homedir(), ".claude"), isDevyard: false }
}
```

#### Claude Chat Sessions (`claude.ts:491-496`)

```typescript
const { customConfigDir, authMode } = getClaudeCodeSettings()
const claudeConfigDir = customConfigDir || path.join(
  app.getPath("userData"),
  "claude-sessions",
  input.subChatId
)
```

**Key Insight:** Both systems read from the same settings database, so they should be in sync. The issue is likely caching.

---

## Identified Issues

### Issue 1: React Query Caching

The workflow graph query is fetched via tRPC with React Query:

```typescript
const { data: workflowGraph } = trpc.workflows.getWorkflowGraph.useQuery()
```

React Query caches the result and doesn't refetch when settings change.

### Issue 2: No Invalidation Trigger

When settings are saved, there's no mechanism to tell the workflow viewer to refetch agents/commands.

### Issue 3: Backend Query Has No Dependencies

The `getWorkflowGraph` tRPC procedure has no input parameters, so React Query sees it as a static query that rarely needs refetching.

---

## Solution Options

### Option 1: Manual Refresh (Immediate Workaround)

**User Action:** Refresh the workflow view after changing settings

**How:**
- Click away from workflows tab and back
- Or add a "Refresh" button to the workflow viewer

**Pros:** Simple, no code changes needed
**Cons:** Poor UX, not automatic

### Option 2: Invalidate Query on Settings Change (Recommended)

**Implementation:**
1. When settings are saved, emit an event or call invalidation
2. Workflow viewer listens for settings changes
3. Calls `trpc.utils.workflows.getWorkflowGraph.invalidate()` to refetch

**Code Changes:**

**In settings router (where settings are saved):**
```typescript
// After settings save
await ctx.trpc.workflows.getWorkflowGraph.invalidate()
```

**Or in workflow viewer component:**
```typescript
// Listen for settings changes
const settingsQuery = trpc.settings.get.useQuery()

useEffect(() => {
  // Invalidate workflow graph when settings change
  if (settingsQuery.data) {
    trpc.utils.workflows.getWorkflowGraph.invalidate()
  }
}, [settingsQuery.data?.authMode, settingsQuery.data?.customConfigDir])
```

### Option 3: Add Polling or Refresh Interval

**Implementation:**
```typescript
const { data: workflowGraph } = trpc.workflows.getWorkflowGraph.useQuery(undefined, {
  refetchInterval: 60000, // Refetch every 60 seconds
})
```

**Pros:** Automatic updates
**Cons:** Wasteful if settings don't change often

### Option 4: Make Query Dependent on Settings

**Implementation:**
Change the workflow query to accept settings as input, making React Query treat each settings combination as a different query:

```typescript
// Backend
getWorkflowGraph: publicProcedure
  .input(z.object({
    authMode: z.string().optional(),
    customConfigDir: z.string().optional(),
  }))
  .query(async ({ input }) => {
    // Use input to determine config dir
    const baseDir = await getClaudeConfigDir()
    // ... rest of logic
  })

// Frontend
const settings = trpc.settings.get.useQuery()
const { data: workflowGraph } = trpc.workflows.getWorkflowGraph.useQuery({
  authMode: settings.data?.authMode,
  customConfigDir: settings.data?.customConfigDir,
})
```

**Pros:** Automatic cache invalidation when settings change
**Cons:** More complex, changes API contract

---

## Recommended Solution

**Hybrid Approach: Option 2 + Manual Refresh Button**

### Part A: Add Refresh Button (Immediate)

Add a refresh button to the workflow viewer header:

```typescript
// In workflow-detail.tsx
<Button onClick={() => trpc.utils.workflows.getWorkflowGraph.invalidate()}>
  <RefreshCw className="h-4 w-4" />
  Refresh
</Button>
```

### Part B: Auto-Invalidate on Settings Save (Better UX)

In the settings save handler, invalidate workflow queries:

```typescript
// In settings router after successful save
const utils = ctx.trpc.useUtils()
await utils.workflows.getWorkflowGraph.invalidate()
```

---

## Implementation Steps for Auto-Invalidation

### Step 1: Find Settings Save Handler

Location: TBD - need to find where settings are saved in the tRPC router

### Step 2: Add Invalidation Call

After settings save:
```typescript
// Invalidate workflow graph so it refetches with new config
await ctx.trpc.workflows.getWorkflowGraph.invalidate()
```

### Step 3: Test

1. Open workflow viewer with current config
2. Change authMode in settings panel (e.g., OAuth → Devyard)
3. Verify workflow viewer automatically refetches and shows new agents/commands

---

## Alternative: Settings Change Notification

If auto-invalidation is complex, add a notification system:

```typescript
// When settings saved successfully
showNotification({
  title: "Settings Updated",
  message: "Please refresh the workflow viewer to see changes",
  action: "Refresh Workflows"
})
```

---

## Testing Checklist

- [ ] Verify workflow viewer shows agents from ~/.claude/ (default)
- [ ] Switch to Devyard mode in settings
- [ ] Verify workflow viewer updates to show agents from devyard/claude/plugin/
- [ ] Switch to custom config dir
- [ ] Verify workflow viewer shows agents from custom directory
- [ ] Confirm Claude chat sessions use the same config directory

---

## Current Behavior Analysis

### What's Working ✅

1. **Settings Storage:** `claudeCodeSettings` table stores authMode and customConfigDir
2. **Config Resolution:** `getWorkflowConfigDir()` correctly reads settings and returns appropriate directory
3. **Claude Chat:** Uses `getClaudeCodeSettings()` to get config directory for each message
4. **Devyard Integration:** Properly detects and uses `claudePluginDir` when authMode is "devyard"

### What's Not Working ❌

1. **Automatic Refresh:** Workflow viewer doesn't automatically refetch when settings change
2. **Cache Invalidation:** No mechanism to invalidate React Query cache on settings change
3. **User Feedback:** No indication that workflow viewer needs refresh after settings change

---

## Debugging Commands

### Check Current Settings

```typescript
// In main process console
const db = getDatabase()
const settings = db.select().from(claudeCodeSettings).get()
console.log('Current settings:', settings)
```

### Check Workflow Config Directory

```typescript
import { getWorkflowConfigDir } from './devyard-scan-helper'
const { baseDir, isDevyard } = getWorkflowConfigDir()
console.log('Workflow config dir:', baseDir)
console.log('Is Devyard:', isDevyard)
```

### List Agents in Directory

```bash
# Check what's actually in the directory
ls -la ~/.claude/agents/
# or
ls -la $VIDYARD_PATH/devyard/claude/plugin/agents/
```

---

## Conclusion

The config loading system is **working correctly** - both Claude chats and workflow viewer read from the same settings database. The issue is **React Query caching** preventing automatic updates when settings change.

**Immediate Solution:** Add a refresh button to manually refetch workflow graph

**Better Solution:** Auto-invalidate workflow graph query when settings are saved

**Best Solution:** Implement both for good UX
