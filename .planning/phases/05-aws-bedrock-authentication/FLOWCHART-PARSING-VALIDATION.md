# Flow Chart Parsing Algorithm Validation

**Date:** 2026-01-20
**Purpose:** Validate parsing expectations against actual Claude Code agent/command markdown formats

---

## Summary

The research made **partially accurate assumptions** about Claude Code file formats. There are **three distinct format families** with different structures:

1. **Official Claude Agents** - Simple frontmatter + markdown sections
2. **Official Claude Commands** - Simple frontmatter + markdown sections with phases
3. **GSD Workflows (Custom)** - Complex XML-like structured format with execution steps

---

## Format Families

### 1. Official Claude Agents

**Examples:** `code-architect.md`, `code-explorer.md`, `code-reviewer.md`

**Structure:**
```markdown
---
name: agent-name
description: What the agent does
tools: Glob, Grep, Read, Write
model: sonnet
color: green
---

Plain markdown content with ## headings for sections.
No XML-like tags. No structured execution flow.
```

**Frontmatter Fields:**
- `name` (required) - Agent identifier
- `description` (required) - What the agent does
- `tools` (optional) - Comma-separated tool list
- `model` (optional) - sonnet, opus, haiku
- `color` (optional) - Visual indicator

**Content Pattern:**
- Standard markdown with `##` headings
- Prose instructions, not structured steps
- No `<step>`, `<process>`, or `<execution_flow>` tags

---

### 2. Official Claude Commands

**Examples:** `feature-dev.md`, `review-pr.md`

**Structure:**
```markdown
---
description: Command description
argument-hint: [arg1] [arg2]
allowed-tools: Read, Write
model: sonnet
disable-model-invocation: false
---

# Command Name

Markdown content organized by phases.

## Phase 1: Discovery

**Goal**: What this phase achieves

**Actions**:
1. First action
2. Second action
3. Third action

---

## Phase 2: Next Phase

(same pattern)
```

**Frontmatter Fields:**
- `description` (optional) - Brief description (~60 chars)
- `argument-hint` (optional) - Expected arguments like `[pr-number]`
- `allowed-tools` (optional) - Tool restrictions
- `model` (optional) - sonnet, opus, haiku
- `disable-model-invocation` (optional) - Prevent auto-invocation

**Content Pattern:**
- Phases marked with `## Phase N: Name`
- `**Goal**:` subsection stating objective
- `**Actions**:` subsection with numbered steps (1., 2., 3.)
- Horizontal rules (`---`) separate phases
- Uses markdown emphasis, not XML tags

---

### 3. GSD Workflows (Custom Format)

**Examples:** `execute-phase.md`, `execute-plan.md`, `plan-phase.md`

**Structure:**
```markdown
<purpose>
High-level purpose statement
</purpose>

<core_principle>
Guiding principle for this workflow
</core_principle>

<required_reading>
Files to read before starting
</required_reading>

<process>

<step name="step_identifier" priority="first">
Step content with bash code blocks, instructions.

**Actions:**
1. Do this
2. Do that

```bash
command here
```
</step>

<step name="another_step">
More content
</step>

</process>

<deviation_rules>
Conditional logic and exception handling
</deviation_rules>

<success_criteria>
- [ ] Criterion 1
- [ ] Criterion 2
</success_criteria>
```

**XML-like Tags Used:**
- `<purpose>` - Workflow purpose
- `<core_principle>` - Guiding principle
- `<required_reading>` - Prerequisites
- `<process>` - Main execution wrapper
- `<step name="X" priority="Y">` - Individual steps
- `<deviation_rules>` - Exception handling
- `<success_criteria>` - Completion checklist
- `<objective>`, `<context>`, `<execution_context>` - Nested sections
- Many others (40+ tags found)

**NOT Used (Research Assumptions):**
- ❌ `<execution_flow>` - Use `<process>` instead
- ❌ `<offer_next>` - Not used in structure

---

## Parsing Algorithm Validation

### ✅ Accurate Assumptions

1. **YAML Frontmatter** - All formats use YAML frontmatter
2. **Tool extraction** - Tools listed in frontmatter or content
3. **Agent spawn detection** - Patterns like "Spawn `agent-name`" are valid
4. **Command detection** - Patterns like `/command-name` are valid
5. **Numbered steps** - Format 2 and 3 use numbered steps
6. **Step structure** - GSD workflows DO use `<step>` tags
7. **Markdown compatibility** - All formats are markdown-based

### ❌ Inaccurate Assumptions

1. **Universal XML-like structure** - Only GSD workflows use XML tags
   - Official agents/commands use plain markdown
   - Cannot assume `<execution_flow>` or `<step>` in all files

2. **`<execution_flow>` tag** - Not standard
   - GSD uses `<process>`, not `<execution_flow>`
   - Official formats don't use XML tags at all

3. **`<offer_next>` tag** - Not found in any format
   - Research assumed this but it doesn't exist

4. **Uniform step structure** - Three different approaches:
   - Official agents: No explicit steps (prose instructions)
   - Official commands: Numbered actions within phases
   - GSD workflows: `<step>` XML tags with attributes

### ⚠️ Partial Assumptions

1. **Control flow detection** - Valid for GSD, not for official formats
   - GSD workflows have explicit conditionals and loops
   - Official formats use natural language ("If X, then Y")
   - Parser needs format detection first

2. **Nested sections** - Structure varies by format
   - GSD: XML nesting (`<objective>`, `<context>`, `<success_criteria>`)
   - Official: Markdown emphasis (**Goal**, **Actions**)

---

## Recommended Parser Architecture

### Phase 0: Format Detection (NEW)

Before parsing, detect which format family:

```typescript
function detectFormat(content: string): 'official-agent' | 'official-command' | 'gsd-workflow' {
  // Check for GSD XML tags
  if (/<process>|<step name=|<deviation_rules>/.test(content)) {
    return 'gsd-workflow'
  }

  // Check for command phase structure
  if (/## Phase \d+:/.test(content)) {
    return 'official-command'
  }

  // Default: official agent (simple markdown)
  return 'official-agent'
}
```

### Parsing Strategy by Format

**Format 1: Official Agents**
- Extract frontmatter (name, tools, model, color)
- Parse markdown sections by `##` headings
- Detect tool mentions in prose ("use Read", "call Grep")
- NO step-by-step flow (treat as single-phase agent description)

**Format 2: Official Commands**
- Extract frontmatter (description, allowed-tools, argument-hint)
- Parse phases: `## Phase N: Name`
- Extract **Goal** and **Actions** subsections
- Parse numbered actions (1., 2., 3.) as sequential steps
- Detect agent spawns: "Launch 2-3 code-explorer agents"
- Detect conditionals in natural language

**Format 3: GSD Workflows**
- Extract XML sections: `<purpose>`, `<process>`, `<deviation_rules>`
- Parse `<step name="X" priority="Y">` tags
- Extract step content, bash blocks, nested actions
- Build explicit execution graph with named steps
- Parse control flow from `<deviation_rules>`

---

## Updated Parsing Patterns

### Tool Detection (All Formats)

```typescript
// Frontmatter tools array
tools: ['Read', 'Write', 'Bash']

// Inline tool mentions
/\b(Read|Write|Edit|Bash|Grep|Glob|Task|TodoWrite)\b/g
```

### Agent Spawn Detection (All Formats)

```typescript
// Explicit spawn patterns
/[Ss]pawn\s+`?([a-z][a-z0-9-]*)`?/g
/[Ll]aunch\s+.*?\b([a-z][a-z0-9-]*)\s+agent/g
/Task\s+.*?`([a-z][a-z0-9-]*)`/g

// Examples:
// "Spawn `gsd-executor`"
// "Launch 2-3 code-explorer agents"
// "Task calls with gsd-planner"
```

### Command Invocation (All Formats)

```typescript
/\/([a-z][a-z0-9-]*)/g  // /command-name
/\/gsd:([a-z][a-z0-9-]*)/g  // /gsd:command-name
```

### Step Extraction (Format-Specific)

**Official Commands:**
```typescript
// Extract numbered actions within **Actions:** sections
const actionPattern = /\*\*Actions:\*\*\s*\n((?:\d+\..*\n?)+)/g
```

**GSD Workflows:**
```typescript
// Extract <step> tags with attributes
const stepPattern = /<step\s+name="([^"]+)"(?:\s+priority="([^"]+)")?>([\s\S]*?)<\/step>/g
```

---

## Data Structure Implications

### Original Assumption (Research)
```typescript
interface ExecutionStep {
  name: string
  priority?: string
  content: string
  actions: StepAction[]
}
```

### Revised Structure (Multi-Format)
```typescript
interface ParsedWorkflow {
  format: 'official-agent' | 'official-command' | 'gsd-workflow'
  frontmatter: FrontmatterData
  structure: AgentStructure | CommandStructure | GSDStructure
}

interface AgentStructure {
  sections: MarkdownSection[]  // No explicit steps
  toolMentions: string[]
}

interface CommandStructure {
  phases: CommandPhase[]
  actions: NumberedAction[]
}

interface GSDStructure {
  purpose: string
  steps: GSDStep[]
  deviationRules?: string
  successCriteria: string[]
}

interface GSDStep {
  name: string
  priority?: 'first' | 'last' | number
  content: string
  bashBlocks: string[]
  actions: StepAction[]
}
```

---

## Flow Chart Implications

### Visualization Strategy

**Official Agents:**
- Single node representing agent
- Dependency edges to tools/skills/MCP servers
- NO execution flow diagram (agent is atomic)

**Official Commands:**
- Phase nodes in sequence
- Action sub-nodes within phases
- Agent spawn edges from action nodes
- Conditional branches from natural language detection

**GSD Workflows:**
- Full execution flow diagram
- Named step nodes with `<step name="X">`
- Control flow from `<deviation_rules>`
- Loop-back edges for iteration
- Checkpoint nodes for user interaction

---

## Recommendations

### 1. Implement Format Detection First

Add format detection as Phase 0 before any parsing:
```typescript
const format = detectFormat(content)
switch (format) {
  case 'gsd-workflow': return parseGSDWorkflow(content)
  case 'official-command': return parseOfficialCommand(content)
  case 'official-agent': return parseOfficialAgent(content)
}
```

### 2. Update tRPC Endpoint

```typescript
// Current (from research)
getExecutionFlow(agentId: string)

// Revised
getWorkflowVisualization(itemId: string): {
  format: WorkflowFormat
  visualization: 'dependency-tree' | 'phase-flow' | 'execution-flow'
  nodes: FlowNode[]
  edges: FlowEdge[]
}
```

### 3. Conditional Visualization

- **Official agents**: Dependency tree only (current implementation)
- **Official commands**: Phase-based flow with action breakdown
- **GSD workflows**: Full execution flow with steps and control flow

### 4. Parser Complexity

| Format | Complexity | Reason |
|--------|------------|--------|
| Official Agent | O(n) | Simple markdown parsing |
| Official Command | O(n * m) | n phases, m actions per phase |
| GSD Workflow | O(n * p) | n steps, p patterns per step |

### 5. Documentation Gaps

The research document should note:
- Format detection is required before parsing
- Three format families with different structures
- Not all workflows have execution flow (agents are atomic)
- GSD workflows are custom, not standard Claude Code format

---

## Conclusion

**Overall Assessment:** Research is 70% accurate with critical gaps.

**What's Valid:**
- ✅ Frontmatter parsing approach
- ✅ Tool/agent/command detection patterns
- ✅ ReactFlow visualization strategy
- ✅ Graph construction concepts

**What Needs Correction:**
- ❌ Universal XML structure assumption
- ❌ `<execution_flow>` and `<offer_next>` tags
- ❌ Uniform step structure across all formats

**Next Steps:**
1. Add format detection logic to `workflows.ts`
2. Implement three separate parsers (agent, command, GSD)
3. Update ReactFlow view to handle three visualization modes
4. Test parser against all three format families
5. Document format detection in code comments

---

## Example File References

**Official Agent:**
- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/feature-dev/agents/code-architect.md`

**Official Command:**
- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/feature-dev/commands/feature-dev.md`

**GSD Workflow:**
- `~/.claude/get-shit-done/workflows/execute-phase.md`
- `~/.claude/get-shit-done/workflows/plan-phase.md`

**Official Documentation:**
- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/command-development/references/frontmatter-reference.md`
