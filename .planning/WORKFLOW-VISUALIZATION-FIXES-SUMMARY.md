# Workflow Visualization Fixes - Implementation Summary

## Overview
Fixed three critical issues with the workflow visualization system that were causing incorrect data display and preventing Claude chats from accessing Devyard agents/commands.

## Issues Fixed

### Issue 1: "Background task" appearing in task list ✅

**Problem:** The devyard-start command was showing "Background task" as one of the items in the background tasks list, which was redundant and incorrect.

**Expected Behavior:** Should only show specific task names: stern, ktop, dy dev, devyard_monitor.sh

**Root Cause:** The regex pattern on line 749 of workflows.ts included `background\s+(?:process|task|script)` which was matching generic text like "Background Tasks" from the documentation rather than actual task names.

**Fix Applied:**
```typescript
// Before (line 749):
const taskNamesPattern = /(?:dy\s+dev|stern|ktop|devyard_monitor\.sh|background\s+(?:process|task|script))/gi

// After (line 749):
const taskNamesPattern = /(?:dy\s+dev|stern|ktop|devyard_monitor\.sh)/gi
```

**File:** `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/workflows.ts`
**Lines:** 743-755

---

### Issue 2: Parallel Execution needs more detail ✅

**Problem:** When "Parallel Execution" background task was detected, clicking to expand showed no description or a poor generic description.

**Expected Behavior:** Should show descriptive text like "Performs deep codebase research, spawns parallel investigation tasks, aggregates findings with web research" from the agent's frontmatter.

**Root Cause:** The parallel agents detection was trying to extract descriptions from body content patterns but wasn't prioritizing the frontmatter description field, which typically contains the most accurate and concise summary.

**Fix Applied:**
Rewrote the parallel agents detection logic (lines 696-748) to:
1. **First**, check if the frontmatter description contains "parallel" and use that
2. **Second**, try to extract descriptions from body content using improved patterns
3. **Third**, fall back to a generic description

New pattern priority:
- `spawns?\s+parallel\s+([^,.\n]+)` - Captures "spawns parallel X tasks/agents"
- Existing patterns for more specific context extraction
- Frontmatter description as the preferred source when it mentions parallel

**File:** `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/workflows.ts`
**Lines:** 696-748

**Example Results:**
- **tdd-researcher.md**: "Performs deep codebase research, spawns parallel investigation tasks..."
- **debug-prod-orchestrator.md**: "Orchestrates production debugging using Research -> Plan -> Analyze workflow with parallel Sonnet agents..."

---

### Issue 3: Claude chat doesn't load agents/commands from settings config ✅

**Problem:** When using `/command-name` or `@[agent:name]` in Claude chat prompts, the agents and commands weren't available because Claude wasn't using the correct config directory from settings when Devyard mode was active.

**Expected Behavior:** When Devyard auth mode is selected in settings, Claude should use `$VIDYARD_PATH/devyard/claude/plugin/` directly (where agents/, commands/, and skills/ are stored), not isolated per-subchat directories with symlinks.

**Root Cause:** The `getClaudeCodeSettings()` function was returning `claudeConfigDir` (`devyard/claude/`) instead of `claudePluginDir` (`devyard/claude/plugin/`) for Devyard mode. This caused Claude to look for agents/commands in the wrong directory.

**Comparison:**
- **Workflow viewer** (correct): Uses `claudePluginDir` via `getWorkflowConfigDir()`
- **Claude chat** (was incorrect): Used `claudeConfigDir` and created isolated directories with symlinks

**Fix Applied - Part 1:** Update `getClaudeCodeSettings()` to use plugin directory

```typescript
// Before (lines 166-173):
if (authMode === "devyard" && !configDir) {
  const devyardConfig = getDevyardConfig()
  if (devyardConfig.enabled && devyardConfig.claudeConfigDir) {
    configDir = devyardConfig.claudeConfigDir
    console.log(`[claude] Using Devyard Claude config: ${configDir}`)
  }
}

// After (lines 166-174):
// If Devyard mode is active, use Devyard's Claude plugin directory
// This is where agents/commands/skills are stored in Devyard
if (authMode === "devyard" && !configDir) {
  const devyardConfig = getDevyardConfig()
  if (devyardConfig.enabled && devyardConfig.claudePluginDir) {
    configDir = devyardConfig.claudePluginDir
    console.log(`[claude] Using Devyard Claude plugin dir: ${configDir}`)
  }
}
```

**Fix Applied - Part 2:** Skip symlink creation for Devyard mode

```typescript
// Before (line 504):
if (!customConfigDir) {
  // ... create symlinks from ~/.claude/ ...
}

// After (lines 502-537):
// If using isolated dir (not custom or devyard), symlink skills/agents from ~/.claude/
// Skip symlinking for Devyard mode since it uses the plugin directory directly
if (!customConfigDir && authMode !== "devyard") {
  // ... create symlinks from ~/.claude/ ...
} else if (authMode === "devyard") {
  console.log(`[claude] Devyard mode active - using plugin directory directly (no symlinks needed)`)
}
```

**Files:**
- `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/claude.ts` (lines 166-174, 502-537)

**Directory Structure Reference:**
```
$VIDYARD_PATH/devyard/
└── claude/
    ├── plugin/              ← This is claudePluginDir (now used by Claude chat)
    │   ├── agents/
    │   ├── commands/
    │   └── skills/
    ├── mcp.json
    └── settings.json
```

**Impact:**
- ✅ Claude chat can now find and execute `/vidyard.devyard-start` and other commands
- ✅ Claude chat can now spawn agents via `@[agent:name]` mentions
- ✅ Skills invocation works correctly in Devyard mode
- ✅ No duplicate symlink creation or isolated directories when using Devyard mode

---

## Testing Recommendations

### Test Case 1: Background tasks list
1. Open workflow viewer for `/vidyard.devyard-start` command
2. Expand "Background Tasks" section
3. **Verify:** Should see only: `dy dev`, `stern`, `ktop`, `devyard_monitor.sh`
4. **Verify:** Should NOT see: "background task", "background process", "background script"

### Test Case 2: Parallel execution description
1. Open workflow viewer for `tdd-researcher` agent
2. Locate "Parallel Execution" task in dependencies
3. **Verify:** Description should be: "Performs deep codebase research, spawns parallel investigation tasks, aggregates findings with web research"
4. Repeat for `debug-prod-orchestrator`
5. **Verify:** Should show a meaningful description, not "Multiple agents running concurrently"

### Test Case 3: Claude chat with Devyard commands
1. **Prerequisites:**
   - Devyard auth mode enabled in settings (Settings → Claude Settings → Authentication → Devyard)
   - `$VIDYARD_PATH` environment variable set
2. Create a new Claude chat in any project
3. Type `/vidyard.devyard-start` in the prompt
4. **Verify:** Command should be recognized (green checkmark or autocomplete)
5. Submit the prompt
6. **Verify:** Command executes successfully (no "command not found" errors)
7. Check console logs
8. **Verify:** Should see: `[claude] Using Devyard Claude plugin dir: /path/to/devyard/claude/plugin`
9. **Verify:** Should see: `[claude] Devyard mode active - using plugin directory directly (no symlinks needed)`
10. **Verify:** Should NOT see: `[claude] Symlinked agents: ...`

### Test Case 4: Agent mentions in Devyard mode
1. With Devyard mode enabled, create a new chat
2. Type `@[agent:tdd-researcher]` in prompt
3. **Verify:** Agent should be recognized and available
4. Submit and verify agent spawns successfully

---

## Related Files

**Modified:**
- `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/workflows.ts`
- `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/claude.ts`

**Related (unchanged):**
- `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/devyard-scan-helper.ts` (reference implementation)
- `/Users/jdeland/dev/vidyard/1code/src/main/lib/devyard-config.ts` (provides claudePluginDir)
- `/Users/jdeland/dev/vidyard/devyard/claude/plugin/commands/vidyard.devyard-start.md` (test file for Issue 1)
- `/Users/jdeland/dev/vidyard/devyard/claude/plugin/agents/tdd-researcher.md` (test file for Issue 2)

---

## Build Status

✅ TypeScript compilation successful
✅ No new TypeScript errors introduced
✅ Build completed: `bun run build`

---

## Date
2026-01-20
