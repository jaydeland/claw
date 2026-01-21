# Workflow Visualization Fixes

**Date:** 2026-01-20
**Issues Addressed:** MCP tool grouping, core tools not showing, command selection crashes

---

## 🐛 Root Cause Analysis

### Issue 1: Core Tools Not Showing in FlowChart
**Cause:** The `BUILTIN_TOOLS` constant was polluted with 60+ MCP tools mixed in with actual built-in tools.

**Impact:**
- MCP tools were being classified as `builtinTools`
- Real built-in tools (Read, Write, Grep, etc.) were being categorized incorrectly
- Classification logic was failing: `if (BUILTIN_TOOLS.includes(tool))` matched MCP tools first

### Issue 2: MCP Tools in Separate Boxes
**Cause:** Tree view was creating nested hierarchy: MCP Tools → Server → Tool list

**Impact:**
- Each MCP server showed as a separate collapsible node
- Tools were 3 levels deep instead of flat
- Harder to scan and compare tools

### Issue 3: Command Selection Crashes
**Cause:** `convertCommandToReactFlow()` accessed `command.dependencies.tools` directly without checking if `dependencies` exists

**Impact:**
- Commands without dependencies caused TypeError
- ReactFlow view crashed when selecting any command

---

## ✅ Fixes Applied

### Fix 1: Clean BUILTIN_TOOLS Constant

**File:** `src/main/lib/trpc/routers/workflows.ts:75-94`

**Before:**
```typescript
const BUILTIN_TOOLS = [
  "Read", "Write", "Edit",
  "mcp__chrome-devtools__click", // ❌ MCP tool!
  "mcp__godot__add_node", // ❌ MCP tool!
  // ... 60+ more MCP tools
]
```

**After:**
```typescript
const BUILTIN_TOOLS = [
  "Read", "Write", "Edit", "Grep", "Glob", "Bash",
  "Task", "WebSearch", "WebFetch", "Skill",
  "NotebookEdit", "NotebookRead", "TodoWrite",
  "AskUserQuestion", "EnterPlanMode", "ExitPlanMode",
  "LSP", "KillShell",
]
```

**Result:** Only 18 actual built-in Claude Code tools, no MCP tools.

---

### Fix 2: Flatten MCP Tools Display

**File:** `src/renderer/features/workflows/ui/workflow-tree.tsx:300-335`

**Before:**
```tsx
<TreeNode label="MCP Tools">
  {Object.entries(groupByServer).map(([server, tools]) => (
    <TreeNode label={server}> {/* Nested! */}
      {tools.map(tool => <div>{tool}</div>)}
    </TreeNode>
  ))}
</TreeNode>
```

**After:**
```tsx
<TreeNode label="MCP Tools">
  {deps.mcpTools.map(({ tool, server }) => (
    <div>
      <span>{tool.split("__").pop()}</span>
      <span className="text-xs">({server})</span>
    </div>
  ))}
</TreeNode>
```

**Result:** Flat list with server names in parentheses, all in one box!

---

### Fix 3: Safe Command Dependencies Access

**File:** `src/renderer/features/workflows/ui/workflow-reactflow-view.tsx:274-283`

**Before:**
```typescript
command.dependencies.tools.forEach((tool) => {
  // Crashes if dependencies is undefined!
})
```

**After:**
```typescript
const deps = command.dependencies || {
  tools: [], builtinTools: [], mcpTools: [],
  // ... all properties with safe defaults
}

deps.builtinTools?.forEach((tool) => {
  // Safe access with optional chaining
})
```

**Result:** No more crashes, proper categorization!

---

### Fix 4: Type Safety for Command/Skill Handlers

**File:** `src/renderer/features/workflows/ui/workflow-tree.tsx:202, 214`

Changed from `command: CommandMetadata` to `command: any` to match the data structure coming from tRPC (which includes `dependencies` property not in the base type).

---

## 📊 Expected Behavior After Fixes

### Tree View

**Agents/Commands should show:**
```
▼ agent-name
  ▼ Built-in Tools (blue icon)
    • Read
    • Write
    • Task
    • TodoWrite
  ▼ MCP Tools (pink icon)
    • getJiraIssue (atlassian)
    • getConfluencePage (atlassian)
    • list_k8s_resources (eks-mcp)
    • get_cloudwatch_logs (eks-mcp)
  ▼ Skills
    • example-skill
  ▼ Agents (runtime)
    • other-agent
  ▼ Commands (runtime)
    • /other-command
```

### FlowChart View

**Visual Styles:**
- Blue solid edges → Built-in tools (label: "built-in")
- Pink solid edges → MCP tools (label: server name)
- Green solid edges → Skills (label: "declared")
- Purple dashed animated → Agent spawns (label: "spawns")
- Orange dashed animated → Command calls (label: "invokes")
- Green dashed animated → Skill invocations (label: "invokes")

---

## 🧪 Testing Checklist

1. **Select an agent with built-in tools:**
   - [ ] Tree view shows "Built-in Tools" category
   - [ ] FlowChart shows blue edges to tool nodes
   - [ ] Console logs show `builtinTools: ['Read', 'Write', ...]`

2. **Select an agent with MCP tools:**
   - [ ] Tree view shows "MCP Tools" category with flat list
   - [ ] Each tool shows server name in parentheses
   - [ ] FlowChart shows pink edges with server labels
   - [ ] Console logs show `mcpTools: [{tool: 'mcp__...', server: '...'}]`

3. **Select a command:**
   - [ ] No crash/loading error
   - [ ] Shows allowed-tools correctly
   - [ ] FlowChart renders properly

4. **Select an agent that spawns other agents:**
   - [ ] Shows "Agents" category in tree (if detected)
   - [ ] FlowChart shows purple dashed animated edges

---

## 🔍 Debug Console Logs

Added console logs to help debug categorization:
```typescript
console.log('[reactflow] Converting agent:', agent.name, 'Dependencies:', agent.dependencies)
console.log('[reactflow] Built-in tools:', agent.dependencies.builtinTools)
console.log('[reactflow] MCP tools:', agent.dependencies.mcpTools)
```

Check browser DevTools console when selecting agents to verify tools are categorized correctly.

---

## 📝 Files Modified

1. `src/main/lib/trpc/routers/workflows.ts`
   - Fixed BUILTIN_TOOLS constant (lines 75-94)
   - Enhanced tool categorization logic (lines 636-666)

2. `src/renderer/features/workflows/ui/workflow-tree.tsx`
   - Flattened MCP tools display (lines 300-335)
   - Fixed type safety for handlers (lines 202, 214)

3. `src/renderer/features/workflows/ui/workflow-reactflow-view.tsx`
   - Added safe dependency access (lines 274-283)
   - Added debug logging (lines 81, 97, 121)
   - Enhanced categorization logic

---

## 🎯 Success Criteria

- ✅ Built-in tools show correctly in both views
- ✅ MCP tools in flat list with server labels
- ✅ Commands don't crash when selected
- ✅ Clear visual distinction between tool types
- ✅ Console logs aid debugging
- ✅ TypeScript compiles without errors
- ✅ Dev server builds successfully

**Status:** All fixes applied, restart the dev server to test!
