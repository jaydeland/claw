# Workflow Invocation Visualization

## Overview

This document describes the implementation of visual distinction between static dependencies and runtime invocations in the workflow visualizer.

## Problem Statement

Previously, the workflow visualizer showed all dependencies (tools, skills, agents, commands) with identical visual styling. Users couldn't distinguish between:
- **Static dependencies**: Resources declared in frontmatter (e.g., tools array in agent.md)
- **Runtime invocations**: Resources called during execution (e.g., spawned agents, invoked commands)

## Solution Design

We implemented a hybrid approach combining enhanced backend detection with frontend visual distinction:

### Backend Changes (`src/main/lib/trpc/routers/workflows.ts`)

#### 1. Enhanced Type System

Updated `DependencyGraph` interface to categorize dependencies:

```typescript
interface DependencyGraph {
  // Static dependencies (declared in frontmatter tools array)
  tools: string[]              // All tools (backward compatibility)
  builtinTools: string[]       // Built-in Claude tools (Read, Write, etc.)
  mcpTools: Array<{ tool: string; server: string }> // MCP tools with server
  skills: string[]             // Skills declared in tools
  mcpServers: string[]         // MCP servers used

  // Runtime invocations (detected in body content)
  agents: string[]             // Agents spawned during execution
  commands: string[]           // Commands called during execution
  skillInvocations: string[]   // Skills invoked via Skill tool at runtime
}
```

#### 2. Enhanced Pattern Detection

Added comprehensive regex patterns to detect agent spawns:

**Pattern 1**: `use the {agent-name} agent` or `use {agent-name} agent`
**Pattern 2**: `spawn {agent-name}` or `spawned by {agent-name}`
**Pattern 3**: `launch {agent-name} agent`
**Pattern 4**: Task tool with agent - `Task.*agent.*\`agent-name\``
**Pattern 5**: `fresh {agent-name} agent`

Enhanced command detection to support namespaced commands:
- Pattern: `/command-name` or `/gsd:command-name`

Added skill invocation detection:
- Pattern: `skill: "skill-name"` (Skill tool invocations)
- Pattern: `invoke skill-name skill` or `use skill-name skill`

#### 3. Dependency Analysis

Both `buildAgentDependencies()` and `buildCommandDependencies()` now:
1. Parse frontmatter tools → categorize into builtinTools, mcpTools, skills
2. Scan file body → detect agent spawns, command calls, skill invocations
3. Return comprehensive dependency graph with clear categorization

### Frontend Changes (`src/renderer/features/workflows/ui/workflow-reactflow-view.tsx`)

#### Visual Distinction Strategy

**Static Dependencies (Solid Edges)**:
- Built-in tools: Blue solid edge, label "built-in"
- MCP tools: Pink solid edge, label shows server name
- Skills: Green solid edge, label "declared"
- MCP servers: Pink solid edge, label "uses"

**Runtime Invocations (Dashed Animated Edges)**:
- Commands: Orange dashed animated edge, label "invokes"
- Agents: Purple dashed animated edge, label "spawns"
- Skill invocations: Green dashed animated edge, label "invokes"

#### Edge Styling

```typescript
// Static dependency example
{
  animated: false,
  style: { stroke: "#3b82f6", strokeWidth: 2 },
  label: "built-in",
  labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
  labelStyle: { fill: "#94a3b8", fontSize: 10 },
}

// Runtime invocation example
{
  animated: true,
  style: { stroke: "#9333ea", strokeWidth: 2, strokeDasharray: "5,5" },
  label: "spawns",
  labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
  labelStyle: { fill: "#c084fc", fontSize: 10 },
}
```

## User Experience

### ReactFlow Visualization

Users can now visually distinguish:
1. **Solid edges**: Static dependencies declared in frontmatter
   - Indicates what the agent/command *declares* it needs
   - Example: Agent declares `Read`, `Write` tools in frontmatter

2. **Dashed animated edges**: Runtime invocations detected in body
   - Indicates what the agent/command *actually calls* during execution
   - Example: Agent spawns `gsd-executor` agent, calls `/gsd:execute-phase` command

3. **Edge labels**: Contextual labels explain the relationship
   - "built-in" - Built-in Claude tool
   - "declared" - Declared in frontmatter
   - "spawns" - Agent spawning
   - "invokes" - Command/skill invocation
   - Server name for MCP tools

### Color Coding

- **Blue**: Built-in tools
- **Pink**: MCP tools/servers
- **Green**: Skills (both static and runtime)
- **Orange**: Commands
- **Purple**: Agents

## Example Scenarios

### Scenario 1: Simple Agent with Tools

Agent frontmatter:
```yaml
tools: [Read, Write, Grep, Bash]
```

Visualization:
- 4 solid blue edges to tool nodes
- Labels: "built-in"

### Scenario 2: Orchestrator Agent

Agent frontmatter:
```yaml
tools: [Skill, Task]
```

Agent body:
```markdown
You spawn `gsd-executor` agent when ready.
Call `/gsd:execute-phase` to start execution.
```

Visualization:
- 2 solid blue edges to Skill and Task tools (static)
- 1 dashed purple edge to gsd-executor (runtime spawn)
- 1 dashed orange edge to /gsd:execute-phase (runtime invocation)

### Scenario 3: Command with Skills

Command frontmatter:
```yaml
allowed-tools: [Read, mcp__eks-mcp__list_eks_resources]
```

Visualization:
- 1 solid blue edge to Read tool
- 1 solid pink edge to mcp tool (label shows "eks-mcp")

## Technical Details

### Detection Flow

1. **Parse Phase** (Frontmatter)
   - Read YAML frontmatter
   - Extract `tools` array (agents) or `allowed-tools` array (commands)
   - Categorize tools into builtinTools, mcpTools, skills

2. **Scan Phase** (Body Content)
   - Read full file content
   - Apply regex patterns for agent spawns
   - Apply regex patterns for command calls
   - Apply regex patterns for skill invocations
   - Cross-reference with known agent/command/skill IDs

3. **Build Phase** (Dependency Graph)
   - Combine parsed frontmatter + scanned body results
   - Return structured DependencyGraph with categorized dependencies

4. **Render Phase** (ReactFlow)
   - Convert dependencies to ReactFlow nodes
   - Create edges with appropriate styling based on category
   - Apply ELK auto-layout algorithm
   - Render interactive graph

### Pattern Matching Considerations

**False Positives**: Minimized by:
- Only matching known agent/command/skill IDs
- Case-insensitive matching with ID validation
- Context-aware patterns (e.g., "use X agent" not just "X")

**False Negatives**: Possible for:
- Unusual phrasings not covered by patterns
- Dynamic agent names (e.g., constructed from variables)
- Comments or documentation text (acceptable trade-off)

## Future Enhancements

Possible improvements:
1. **Tree View Enhancement**: Add dependency tree in markdown view
2. **Interactive Filtering**: Toggle static vs runtime dependencies
3. **Hover Details**: Show example lines where invocations were detected
4. **Confidence Scores**: Indicate pattern match confidence
5. **Custom Patterns**: Allow users to define additional detection patterns
6. **Call Graph**: Multi-level visualization showing full execution chain

## Files Modified

### Backend
- `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/workflows.ts`
  - Enhanced `DependencyGraph` interface
  - Added `extractSkillInvocations()` function
  - Enhanced `extractAgentInvocations()` with 5 patterns
  - Enhanced `extractCommandInvocations()` for namespaced commands
  - Updated `buildAgentDependencies()` and `buildCommandDependencies()`

### Frontend
- `/Users/jdeland/dev/vidyard/1code/src/renderer/features/workflows/ui/workflow-reactflow-view.tsx`
  - Updated `AgentWithDependencies` and `CommandWithDependencies` interfaces
  - Enhanced `convertAgentToReactFlow()` with edge styling logic
  - Added builtin tool and MCP tool specific rendering
  - Implemented visual distinction for static vs runtime dependencies

## Testing Checklist

- [x] TypeScript compilation succeeds
- [x] Backend detection patterns work for common cases
- [ ] Frontend visualization renders correctly
- [ ] Edge labels are readable at default zoom
- [ ] Auto-layout handles complex graphs
- [ ] Performance acceptable for large workflows (50+ nodes)

## Status

**Implementation**: ✅ Complete
**Testing**: 🟡 Partial (needs runtime verification)
**Documentation**: ✅ Complete
