# Agent Teams for Claws - Implementation Plan

## Context

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) supports a native `agents` option that allows defining specialized subagents within a single query. This enables multi-agent workflows where:

- A **main agent** orchestrates the workflow
- **Subagents** handle specialized tasks (research, review, execution)
- Subagents are invoked via the `Task` tool with restricted capabilities
- Each subagent can have custom prompts, tool restrictions, and model overrides

This plan implements agent teams for the **claws feature** with a focus on **GitHub Issue Triage** as the example use case.

## Current State

- Claws execute single-agent workflows via `claudeQuery()` in `src/main/lib/claws/index.ts`
- Each claw has: instruction, target worktree, trigger type, allowed directories/MCPs
- Executions track status (running/success/failed) and logs
- No multi-agent or peer review capabilities exist

## Proposed Implementation

### Phase 1: Database Schema Updates

**File:** `src/main/lib/db/schema/index.ts`

Add tables for subagent definitions and team configurations:

```typescript
// Subagent definitions for a claw
export const clawSubagents = sqliteTable("claw_subagents", {
  id: text("id").primaryKey(),
  clawId: text("claw_id").notNull().references(() => headlessClaws.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "security-reviewer", "triage-analyzer"
  description: text("description").notNull(), // When to use this subagent
  prompt: text("prompt").notNull(), // System prompt for the subagent
  tools: text("tools").notNull().default("[]"), // JSON string[] - allowed tools
  model: text("model"), // "sonnet", "opus", "haiku", "inherit", or null
  orderIndex: integer("order_index").notNull().default(0), // Execution order
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }),
})

// Team workflows (for complex multi-stage processes)
export const clawWorkflows = sqliteTable("claw_workflows", {
  id: text("id").primaryKey(),
  clawId: text("claw_id").notNull().references(() => headlessClaws.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  stages: text("stages").notNull(), // JSON array of workflow stages
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }),
})

// Workflow stages reference subagents
export const clawWorkflowStages = sqliteTable("claw_workflow_stages", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull().references(() => clawWorkflows.id, { onDelete: "cascade" }),
  subagentId: text("subagent_id").notNull().references(() => clawSubagents.id),
  stageName: text("stage_name").notNull(), // e.g., "analyze", "classify", "route"
  stageOrder: integer("stage_order").notNull(),
  outputKey: text("output_key"), // Key to store output in context
  condition: text("condition"), // JSON condition for proceeding to next stage
})
```

Add indexes:
- `claw_subagents.claw_id_idx` on `clawId`
- `claw_workflows.claw_id_idx` on `clawId`
- `claw_workflow_stages.workflow_id_idx` on `workflowId`

### Phase 2: Update Execution Engine

**File:** `src/main/lib/claws/index.ts`

Modify `executeClaudeSDK()` to support agent teams:

1. **Fetch subagents** for the claw from database
2. **Build AgentDefinitions** from subagent records
3. **Ensure `Task` tool is included** in allowedTools when subagents exist
4. **Pass agents option** to `claudeQuery()`

```typescript
private async executeClaudeSDK(
  claw: HeadlessClaw,
  executionId: string,
  instruction: string,
  context?: ExecutionContext
): Promise<void> {
  // ... existing setup ...

  // Fetch subagents if this is a team claw
  const db = getDatabase()
  const subagents = db
    .select()
    .from(clawSubagents)
    .where(eq(clawSubagents.clawId, claw.id))
    .where(eq(clawSubagents.isEnabled, true))
    .orderBy(clawSubagents.orderIndex)
    .all()

  // Build agent definitions
  const agents: Record<string, AgentDefinition> = {}
  if (subagents.length > 0) {
    for (const subagent of subagents) {
      agents[subagent.name] = {
        description: subagent.description,
        prompt: subagent.prompt,
        tools: JSON.parse(subagent.tools),
        model: subagent.model || undefined,
      }
    }
  }

  // Build allowed tools - MUST include Task for subagent invocation
  const baseTools = ["Read", "Grep", "Glob", "Bash", "Write", "Edit"]
  const allowedTools = subagents.length > 0
    ? [...baseTools, "Task"] // Task required for subagent invocation
    : baseTools

  const stream = claudeQuery({
    prompt: instruction,
    options: {
      abortController,
      cwd: claw.targetWorktree,
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
      },
      env: finalEnv,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      allowedDirectories: allowedDirs,
      allowedTools, // Now includes Task when needed
      pathToClaudeCodeExecutable: claudeBinaryPath,
      persistSession: false,
      // NEW: Pass subagents to SDK
      ...(subagents.length > 0 && { agents }),
    } as any,
  })

  // ... rest of streaming logic ...
}
```

### Phase 3: Example - GitHub Issue Triage Team

**Use Case:** Automatically triage incoming GitHub issues

**Team Structure:**

| Subagent | Role | Tools | Model |
|-----------|------|-------|-------|
| **analyzer** | Analyze issue content and extract key info | Read, Grep | sonnet |
| **classifier** | Classify severity (p0/p1/p2) and type (bug/feature) | Read | haiku |
| **router** | Route to appropriate team/person | Read, Bash | sonnet |
| **labeler** | Apply labels via GitHub CLI | Bash, Read | sonnet |

**Main Agent Prompt (claw.instruction):**

```markdown
You are an issue triage coordinator. When a new GitHub issue is assigned to you:

1. Use the **analyzer** subagent to extract key information from the issue
2. Use the **classifier** subagent to determine severity and issue type
3. Use the **router** subagent to determine the best assignee
4. Use the **labeler** subagent to apply appropriate labels

Combine all results and provide a triage summary with:
- Issue title and number
- Severity classification
- Recommended assignee
- Labels applied
- Any follow-up actions needed

Subagents have limited tool access and specialized prompts. Delegate specific tasks to them.
```

**Subagent Definitions:**

**analyzer:**
```typescript
{
  name: "analyzer",
  description: "Analyzes GitHub issue content to extract key information, reproduction steps, and impact assessment. Use for understanding what the issue is about.",
  prompt: `You are an expert at analyzing software issues. Your job is to read GitHub issues and extract:
- Clear summary of the problem
- Steps to reproduce (if provided)
- Expected vs actual behavior
- Impact assessment (who is affected, how severe)
- Any missing information that would help developers

Be thorough and structured in your analysis.`,
  tools: ["Read", "Grep"],
  model: "sonnet"
}
```

**classifier:**
```typescript
{
  name: "classifier",
  description: "Classifies issue severity and type based on analysis. Use after analyzing an issue to determine priority and category.",
  prompt: `You are an issue classification specialist. Based on the issue analysis, classify:

SEVERITY:
- p0: Critical - production outage, security vulnerability, data loss
- p1: High - major feature broken, significant user impact
- p2: Medium - minor bug, workaround available
- p3: Low - cosmetic, documentation, nice-to-have

TYPE:
- bug: Something is broken
- feature: New capability requested
- enhancement: Improvement to existing feature
- question: User needs help/clarification
- documentation: Docs need updating

Provide brief justification for your classification.`,
  tools: ["Read"], // Read-only, uses analysis from previous step
  model: "haiku"  // Fast classification
}
```

**router:**
```typescript
{
  name: "router",
  description: "Routes issues to appropriate team members based on content and classification. Use to determine the best assignee.",
  prompt: `You are a technical routing specialist. Based on the issue analysis and classification, determine the best assignee:

TEAM EXPERTISE:
- @frontend-team: UI components, React, CSS, user interactions
- @backend-team: APIs, databases, performance, infrastructure
- @security-team: Authentication, vulnerabilities, compliance
- @docs-team: Documentation, examples, guides
- @product-team: Feature requests, requirements clarification

Consider:
- Issue type and severity
- Code ownership (use Grep to find relevant files)
- Recent activity on similar issues
- Current workload (check open issues by assignee)

Output: Recommended assignee with reasoning.`,
  tools: ["Read", "Grep", "Bash"],
  model: "sonnet"
}
```

**labeler:**
```typescript
{
  name: "labeler",
  description: "Applies appropriate labels to GitHub issues using the GitHub CLI. Use after classification and routing.",
  prompt: `You are an issue labeling specialist. Use the GitHub CLI (gh) to apply appropriate labels.

COMMON LABELS:
- bug, feature, enhancement, question
- p0, p1, p2, p3 (priority)
- frontend, backend, security, docs
- good-first-issue, help-wanted
- duplicate, invalid, wontfix

Use these commands:
- gh issue edit <number> --add-label <label>
- gh label list (to see available labels)

Apply relevant labels based on classification.`,
  tools: ["Bash", "Read"],
  model: "sonnet"
}
```

### Phase 4: UI Components

**File:** `src/renderer/features/sidebar/components/create-claw-modal.tsx`

Add subagent configuration UI:

1. **"Agent Team" section** in create/edit claw modal
2. **Subagent list** with cards showing:
   - Name, description, model
   - Tool badges (Read, Write, Bash, etc.)
   - Edit/Delete actions
3. **"Add Subagent" modal** with:
   - Name input
   - Description textarea
   - Prompt editor (textarea with markdown)
   - Tools multi-select checkbox
   - Model dropdown (inherit/sonnet/opus/haiku)
   - Order/index for execution sequence
4. **Preset team templates**:
   - "Issue Triage" (analyzer, classifier, router, labeler)
   - "Code Review" (security-reviewer, style-reviewer, test-reviewer)
   - "Content Team" (researcher, writer, editor)

**File:** `src/renderer/features/sidebar/components/claw-team-editor.tsx` (new)

Dedicated component for managing subagents:

```typescript
interface SubagentEditorProps {
  clawId: string
  subagents: Subagent[]
  onChange: (subagents: Subagent[]) => void
}

// Drag-and-drop reordering
// Inline editing of prompts
// Tool permission visualization
// Model selection with cost indicator
```

### Phase 5: Execution Visualization

**File:** `src/renderer/features/sidebar/components/execution-history-viewer.tsx`

Enhance execution logs to show subagent activity:

1. **Parse subagent invocations** from logs
2. **Show subagent timeline**:
   ```
   [Main Agent] Started triage for issue #123
   └── [analyzer] Analyzing issue content... (2.3s)
   └── [classifier] Classifying severity... (0.8s) → p1, bug
   └── [router] Determining assignee... (1.2s) → @backend-team
   └── [labeler] Applying labels... (0.5s) → bug, p1, backend
   [Main Agent] Triage complete
   ```
3. **Filter by subagent** in logs view
4. **Cost breakdown** per subagent (token usage)

### Phase 6: Migration

**File:** `drizzle/0050_claw_subagents.sql`

```sql
-- Create subagents table
CREATE TABLE claw_subagents (
  id TEXT PRIMARY KEY,
  claw_id TEXT NOT NULL REFERENCES headless_claws(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt TEXT NOT NULL,
  tools TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER
);

CREATE INDEX claw_subagents_claw_id_idx ON claw_subagents(claw_id);

-- Create workflows table
CREATE TABLE claw_workflows (
  id TEXT PRIMARY KEY,
  claw_id TEXT NOT NULL REFERENCES headless_claws(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  stages TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER
);

CREATE INDEX claw_workflows_claw_id_idx ON claw_workflows(claw_id);

-- Create workflow stages table
CREATE TABLE claw_workflow_stages (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES claw_workflows(id) ON DELETE CASCADE,
  subagent_id TEXT NOT NULL REFERENCES claw_subagents(id),
  stage_name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  output_key TEXT,
  condition TEXT
);

CREATE INDEX claw_workflow_stages_workflow_id_idx ON claw_workflow_stages(workflow_id);
```

## Verification

### Test Cases

1. **Single subagent execution:**
   - Create claw with one subagent
   - Execute and verify subagent is invoked
   - Check logs show subagent activity

2. **Multi-subagent workflow:**
   - Create "Issue Triage" team
   - Trigger with GitHub issue
   - Verify all 4 subagents execute in sequence
   - Check final output combines all results

3. **Tool restriction enforcement:**
   - Create subagent with only Read tools
   - Try to invoke Write operation
   - Verify SDK blocks the operation

4. **Model override:**
   - Create subagent with "haiku" model
   - Execute and verify faster/cheaper processing

### Manual Testing Steps

1. Open Claw creation modal
2. Select "GitHub Poll" trigger
3. Click "Configure Agent Team"
4. Select "Issue Triage" preset
5. Review subagent configurations
6. Save claw
7. Create test GitHub issue with label
8. Wait for poll (or trigger manually)
9. Check execution logs for subagent activity
10. Verify GitHub issue has labels applied

## Success Criteria

- [ ] Subagents can be defined in claw configuration
- [ ] Subagents are passed to `claudeQuery()` as `agents` option
- [ ] `Task` tool is automatically included when subagents exist
- [ ] Main agent can invoke subagents by name
- [ ] Subagent tool restrictions are enforced
- [ ] Execution logs show subagent invocations
- [ ] UI allows creating and managing subagents
- [ ] Issue Triage preset works end-to-end

## Files to Modify

| File | Changes |
|------|---------|
| `src/main/lib/db/schema/index.ts` | Add clawSubagents, clawWorkflows, clawWorkflowStages tables |
| `src/main/lib/db/index.ts` | Export new tables and types |
| `src/main/lib/claws/index.ts` | Update executeClaudeSDK to support agents option |
| `src/main/lib/trpc/routers/claws.ts` | Add CRUD endpoints for subagents |
| `src/renderer/features/sidebar/components/create-claw-modal.tsx` | Add subagent configuration UI |
| `src/renderer/features/sidebar/components/claw-team-editor.tsx` | New: Subagent management component |
| `src/renderer/features/sidebar/components/execution-history-viewer.tsx` | Enhance to show subagent activity |
| `drizzle/0050_claw_subagents.sql` | Migration for new tables |

## Notes

- The SDK handles subagent orchestration - no custom multi-agent logic needed
- Subagents are invoked via the `Task` tool, which must be in allowedTools
- Each subagent invocation is a separate LLM call with its own cost
- Subagents can only use tools explicitly listed in their definition
- The main agent decides when to invoke subagents based on the prompt
- This is different from the Reddit article's custom heartbeat system - SDK native
