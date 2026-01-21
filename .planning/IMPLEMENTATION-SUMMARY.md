# Workflow Invocation Visualization - Implementation Summary

## What Was Implemented

Successfully implemented visual distinction between **static dependencies** and **runtime invocations** in the workflow visualizer.

### Key Features

1. **Enhanced Pattern Detection**
   - Detects 5+ patterns of agent spawning (spawn, launch, fresh agent, etc.)
   - Detects command calls (including namespaced `/gsd:command` format)
   - Detects skill invocations via Skill tool

2. **Categorized Dependency Graph**
   - Separate tracking of static (frontmatter) vs runtime (body) dependencies
   - Built-in tools, MCP tools, and skills properly categorized
   - Clear type system with backward compatibility

3. **Visual Distinction in ReactFlow**
   - **Solid edges** → Static dependencies (declared in frontmatter)
   - **Dashed animated edges** → Runtime invocations (detected in body)
   - **Color coding** → Different colors for different resource types
   - **Edge labels** → Contextual labels explain relationship types

## How It Works

### Backend Detection Pipeline

```
1. Parse Frontmatter
   ├─ Extract tools array
   ├─ Categorize: builtinTools, mcpTools, skills
   └─ Store in DependencyGraph

2. Scan Body Content
   ├─ Apply regex patterns for agents
   ├─ Apply regex patterns for commands
   ├─ Apply regex patterns for skills
   └─ Store in DependencyGraph

3. Build Complete Graph
   └─ Return comprehensive DependencyGraph
```

### Frontend Visualization Pipeline

```
1. Receive DependencyGraph from backend
   ↓
2. Convert to ReactFlow nodes
   ├─ Create node for each dependency
   └─ Apply appropriate node type
   ↓
3. Create styled edges
   ├─ Static → Solid, no animation
   └─ Runtime → Dashed, animated
   ↓
4. Apply ELK auto-layout
   ↓
5. Render interactive graph
```

## Visual Style Guide

### Static Dependencies (Solid Edges)

```
Agent → Tool
  ├─ Style: Solid line, no animation
  ├─ Label: "built-in" or "declared"
  └─ Color: Blue (builtin), Pink (MCP), Green (skill)

Example: Agent declares [Read, Write] in frontmatter
```

### Runtime Invocations (Dashed Animated Edges)

```
Agent → Other Agent/Command/Skill
  ├─ Style: Dashed line (5,5), animated
  ├─ Label: "spawns" or "invokes"
  └─ Color: Purple (agent), Orange (command), Green (skill)

Example: Agent spawns `gsd-executor` in body content
```

## Example Visualization

### Simple Agent

**Input**:
```yaml
---
name: file-processor
tools: [Read, Write, Grep]
---
Process files using built-in tools.
```

**Output**:
```
file-processor
      |
  +---+---+
  |   |   |
Read Write Grep
(solid blue edges)
"built-in" labels
```

### Orchestrator Agent

**Input**:
```yaml
---
name: orchestrator
tools: [Task]
---
Spawn `executor` agent when ready.
Call `/notify` when complete.
```

**Output**:
```
orchestrator
      |
  +---+---+---+
  |   |       |
Task executor /notify
(solid) (dashed) (dashed)
"built-in" "spawns" "invokes"
```

## Files Modified

### Backend
- **File**: `src/main/lib/trpc/routers/workflows.ts`
- **Changes**:
  - Updated `DependencyGraph` interface (7 fields now)
  - Added `extractSkillInvocations()` function
  - Enhanced `extractAgentInvocations()` with 5 patterns
  - Enhanced `extractCommandInvocations()` for namespaced commands
  - Updated both `buildAgentDependencies()` and `buildCommandDependencies()`

### Frontend
- **File**: `src/renderer/features/workflows/ui/workflow-reactflow-view.tsx`
- **Changes**:
  - Updated `AgentWithDependencies` interface
  - Updated `CommandWithDependencies` interface
  - Enhanced `convertAgentToReactFlow()` with edge styling
  - Added builtin tool and MCP tool specific rendering
  - Implemented visual distinction logic

## Detection Patterns

### Agent Spawns (5 patterns)

```typescript
1. /use\s+(?:the\s+)?([a-z][a-z0-9-]*)\s+agent/gi
   Example: "Use the gsd-executor agent"

2. /spawn(?:ed)?\s+(?:by\s+)?`?([a-z][a-z0-9-]*)`?/gi
   Example: "Spawn `gsd-executor`"

3. /launch(?:es)?\s+(?:the\s+)?([a-z][a-z0-9-]*)\s+agent/gi
   Example: "Launch the gsd-executor agent"

4. /Task.*?agent.*?`([a-z][a-z0-9-]*)`/gi
   Example: "Task tool with agent `gsd-executor`"

5. /fresh\s+([a-z][a-z0-9-]*)\s+agent/gi
   Example: "Fresh gsd-executor agent"
```

### Command Calls

```typescript
/\/([a-z][a-z0-9:-]*)/gi
Examples:
  - "/gsd:execute-phase"
  - "/notify-user"
  - "/help"
```

### Skill Invocations

```typescript
1. /skill:\s*["']([a-z][a-z0-9-]*)["']/gi
   Example: skill: "test-runner"

2. /(?:invoke|use)\s+(?:the\s+)?([a-z][a-z0-9-]*)\s+skill/gi
   Example: "Invoke the test-runner skill"
```

## Testing

### Quick Test

1. **Start the app**:
   ```bash
   bun run dev
   ```

2. **Navigate to Workflows tab**

3. **Select an agent** (e.g., gsd-executor)

4. **Toggle to flowchart view**

5. **Observe**:
   - Solid edges for declared tools
   - Dashed edges for spawned agents/commands
   - Edge labels showing relationship type
   - Color coding by resource type

### Test Cases

**Test 1: Static-only agent**
- Agent with only tools in frontmatter
- Expected: All solid edges, no dashed

**Test 2: Runtime-only agent**
- Agent with minimal tools, spawns other agents
- Expected: Few solid edges, many dashed

**Test 3: Hybrid agent**
- Agent with both tools and spawns
- Expected: Mix of solid and dashed edges

**Test 4: MCP integration**
- Agent with MCP tools
- Expected: Pink solid edges with server labels

## Success Criteria

✅ **Backend Detection**
- [x] Agent spawns detected (5+ patterns)
- [x] Command calls detected (including namespaced)
- [x] Skill invocations detected (2+ patterns)
- [x] Categorization works correctly
- [x] TypeScript types updated

✅ **Frontend Visualization**
- [x] Static dependencies show solid edges
- [x] Runtime invocations show dashed animated edges
- [x] Edge labels display correctly
- [x] Color coding matches design
- [x] TypeScript types updated

✅ **Build & Compilation**
- [x] TypeScript compiles without errors
- [x] Electron build succeeds
- [x] No runtime errors in console

## Known Limitations

1. **Pattern Matching**: May miss unusual phrasings not covered by regex
2. **Dynamic Names**: Cannot detect dynamically constructed agent/command names
3. **Comments**: May detect invocations in comments (acceptable trade-off)
4. **Performance**: Large graphs (100+ nodes) may have slight layout delay

## Future Enhancements

### Short-term
- [ ] Add tree view showing categorized dependencies
- [ ] Hover tooltips showing source lines
- [ ] Click to jump to source file

### Medium-term
- [ ] Interactive filtering (toggle static/runtime)
- [ ] Search functionality
- [ ] Export graph as image

### Long-term
- [ ] Multi-level call graph visualization
- [ ] Execution flow simulation
- [ ] Dependency impact analysis
- [ ] Custom pattern configuration

## Documentation

Created comprehensive documentation:
- `/Users/jdeland/dev/vidyard/1code/.planning/workflow-invocation-visualization.md` - Technical details
- `/Users/jdeland/dev/vidyard/1code/.planning/workflow-visualization-example.md` - Visual examples
- `/Users/jdeland/dev/vidyard/1code/.planning/IMPLEMENTATION-SUMMARY.md` - This file

## Questions?

For technical details, see:
- Backend logic: `src/main/lib/trpc/routers/workflows.ts`
- Frontend rendering: `src/renderer/features/workflows/ui/workflow-reactflow-view.tsx`
- Pattern examples: `.planning/workflow-visualization-example.md`
- Implementation notes: `.planning/workflow-invocation-visualization.md`
