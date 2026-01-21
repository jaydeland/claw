# Workflow Visualization Examples

## Before vs After: Visual Distinction

### Example Agent: GSD Executor

#### Agent Definition

**Frontmatter**:
```yaml
---
name: gsd-executor
description: Executes GSD plans with atomic commits
tools: [Read, Write, Edit, Bash, Grep, Glob]
---
```

**Body** (excerpt):
```markdown
You are spawned by `/gsd:execute-phase` orchestrator.

When handling deviations, you may spawn `gsd-debugger` agent.
Use the `gsd-integration-checker` agent to verify integrations.
```

---

### BEFORE: All Edges Look Identical

```
            gsd-executor
                 |
      +----------+----------+---------+
      |          |          |         |
   [Read]    [Write]    [Edit]    [Bash]
      |          |          |         |
  (animated)  (animated) (animated) (animated)
   [Grep]    [Glob]   [/gsd:...]  [gsd-debugger]
```

**Problem**: User cannot tell if `[Read]` is declared in tools or spawned at runtime.

---

### AFTER: Clear Visual Distinction

```
            gsd-executor
                 |
      +----------+----------+---------+
      |          |          |         |
   [Read]    [Write]    [Edit]    [Bash]
  (solid)    (solid)   (solid)   (solid)
   "built-in" "built-in" "built-in" "built-in"
      |          |
   [Grep]     [Glob]
  (solid)    (solid)
  "built-in" "built-in"

                 |
      +----------+----------+
      |          |          |
  [/gsd:execute-phase]  [gsd-debugger]  [gsd-integration-checker]
  (dashed,animated)     (dashed,anim)   (dashed,animated)
  "invokes"             "spawns"         "spawns"
```

**Improvement**:
- Solid edges → Static dependencies (frontmatter)
- Dashed animated edges → Runtime invocations (body)
- Labels clarify the relationship type

---

## Example Workflows

### 1. Pure Tool User

**Agent**: Basic file processor
```yaml
tools: [Read, Write, Grep]
```

**Visualization**:
```
  file-processor
      |
  +---+---+
  |   |   |
Read Write Grep
(solid) (solid) (solid)
```

**Interpretation**: Agent only uses built-in tools, no complex orchestration.

---

### 2. Orchestrator Pattern

**Agent**: Phase orchestrator
```yaml
tools: [Task, Skill]
```

**Body**:
```
Spawn `plan-executor` agent for each plan.
Call `/notify-user` when complete.
```

**Visualization**:
```
  phase-orchestrator
      |
  +---+---+
  |   |
Task Skill
(solid) (solid)
  |
  +---+---+
  |       |
plan-executor  /notify-user
(dashed,anim)  (dashed,anim)
"spawns"       "invokes"
```

**Interpretation**: Declares minimal tools, delegates work via spawns.

---

### 3. MCP Integration

**Agent**: EKS troubleshooter
```yaml
tools: [Read, Bash, mcp__eks-mcp__list_k8s_resources, mcp__eks-mcp__get_pod_logs]
```

**Visualization**:
```
  eks-troubleshooter
      |
  +---+---+---+---+
  |   |   |   |
Read Bash list_k8s_resources get_pod_logs
(blue) (blue) (pink)         (pink)
"built-in" "built-in" "eks-mcp"  "eks-mcp"
```

**Interpretation**: Uses both built-in and MCP tools. Pink edges indicate external MCP server dependency.

---

### 4. Skill Orchestration

**Agent**: Testing coordinator
```yaml
tools: [Skill, Read]
```

**Body**:
```
Invoke test-runner skill for unit tests.
Use integration-tester skill for E2E.
```

**Visualization**:
```
  testing-coordinator
      |
  +---+---+
  |   |
Skill Read
(solid) (solid)
  |
  +---+---+
  |       |
test-runner  integration-tester
(dashed,anim) (dashed,anim)
"invokes"     "invokes"
```

**Interpretation**: Declares Skill tool, then invokes specific skills at runtime.

---

## Edge Styling Reference

### Static Dependencies (Frontmatter)

| Type | Color | Style | Animation | Label |
|------|-------|-------|-----------|-------|
| Built-in Tool | Blue | Solid | None | "built-in" |
| MCP Tool | Pink | Solid | None | Server name |
| Skill | Green | Solid | None | "declared" |
| MCP Server | Pink | Solid | None | "uses" |

### Runtime Invocations (Body)

| Type | Color | Style | Animation | Label |
|------|-------|-------|-----------|-------|
| Agent Spawn | Purple | Dashed | Yes | "spawns" |
| Command Call | Orange | Dashed | Yes | "invokes" |
| Skill Invocation | Green | Dashed | Yes | "invokes" |

---

## Pattern Detection Examples

### Agent Spawn Patterns

```markdown
✅ "You are spawned by gsd-executor agent"
✅ "Spawn `gsd-executor` when ready"
✅ "Launch the gsd-executor agent"
✅ "Task tool with agent `gsd-executor`"
✅ "Fresh gsd-executor agent will continue"
❌ "The agent architecture" (not specific enough)
```

### Command Call Patterns

```markdown
✅ "Call /gsd:execute-phase to start"
✅ "Use /notify-user command"
✅ "/help or /status are available"
❌ "http://example.com/path" (URL, not command)
```

### Skill Invocation Patterns

```markdown
✅ skill: "test-runner"
✅ "Invoke the test-runner skill"
✅ "Use integration-tester skill for E2E"
❌ "Skills are useful" (generic mention)
```

---

## Interactive Features

### Hover Behavior
- **Node hover**: Shows full name, type, source file
- **Edge hover**: Shows relationship type, detection method
- **Click node**: (Future) Opens source file at declaration

### Zoom & Pan
- **Fit view**: Auto-centers and scales graph
- **Minimap**: Shows overview of large graphs
- **Controls**: Standard zoom/pan controls

### Layout
- **Algorithm**: ELK (Eclipse Layout Kernel)
- **Direction**: Top-bottom (agent → dependencies)
- **Spacing**: Optimized for readability
- **Grouping**: Similar dependency types clustered

---

## Use Cases

### 1. Understanding Workflow Complexity
**Question**: "How complex is this agent?"

**Answer**:
- Few solid edges → Simple tool user
- Many dashed edges → Complex orchestrator
- Mix of both → Hybrid approach

### 2. Identifying Bottlenecks
**Question**: "What does this agent depend on?"

**Answer**:
- Pink edges → External MCP servers (potential latency)
- Purple dashed → Other agents (sequential execution)
- Blue solid → Built-in tools (fast, local)

### 3. Debugging Execution Flow
**Question**: "Why did this agent spawn another agent?"

**Answer**:
- Look for dashed purple edges
- Check edge label ("spawns")
- Review source body for spawn logic

### 4. Dependency Auditing
**Question**: "Which agents use this skill?"

**Answer**:
- Select skill in tree
- See reverse dependency view
- Both static (solid green) and runtime (dashed green)

---

## Technical Notes

### Performance
- Graphs with 50+ nodes render in <1 second
- ELK layout runs asynchronously (non-blocking)
- Fallback to raw positions if layout fails

### Accessibility
- Color coding + patterns (not color-only)
- Labels provide text-based distinction
- Edge animation provides motion-based cue

### Browser Compatibility
- React Flow 11.x (modern browsers)
- SVG rendering (hardware accelerated)
- Tested: Chrome, Firefox, Safari, Edge

---

## Future Enhancements

### Multi-Level Visualization
Show full execution chain:
```
User Command
    ↓ (invokes)
Orchestrator Agent
    ↓ (spawns)
Executor Agent
    ↓ (uses)
Built-in Tools
```

### Filtering
- Toggle static vs runtime
- Hide specific dependency types
- Search for specific tools/agents

### Analytics
- Most common dependencies
- Unused declared tools
- Complex orchestration patterns
