# Workflow Dependency Types - Detailed Explanation

**Date:** 2026-01-20
**Context:** Workflow visualization system for Claude agents and commands

---

## Overview

The workflow visualizer categorizes dependencies into several types to show what resources an agent or command uses. This document provides detailed explanations of CLI apps (binaries), background tasks, and background agents.

---

## 1. CLI Applications (Binaries)

### What Are They?

CLI applications are command-line tools that agents/commands invoke via the `Bash` tool to interact with external systems like AWS, Kubernetes, GitHub, Docker, etc.

### How Are They Detected?

**Detection Method 1: Frontmatter `tools` Array**

Agents declare specific Bash tool access using a restricted syntax:

```yaml
tools: [Read, Write, Bash(aws:*), Bash(kubectl:*), Bash(gh:*)]
```

Pattern: `Bash(command:*)`
- `aws:*` → extracts "aws" CLI app
- `kubectl:*` → extracts "kubectl" CLI app
- `gh:*` → extracts "gh" CLI app

**Detection Method 2: Bash Code Blocks in Content**

The system scans bash code blocks in the agent/command body for common CLI tools:

```markdown
You should run these commands:

\`\`\`bash
aws s3 ls s3://my-bucket
kubectl get pods -n production
gh pr list --state open
\`\`\`
```

**Patterns Searched:**
- `/\b(aws)\s+/g` → AWS CLI
- `/\b(kubectl)\s+/g` → Kubernetes CLI
- `/\b(gh)\s+/g` → GitHub CLI
- `/\b(docker)\s+/g` → Docker CLI
- `/\b(terraform)\s+/g` → Terraform CLI
- `/\b(npm)\s+/g` → NPM
- `/\b(yarn)\s+/g` → Yarn
- `/\b(bun)\s+/g` → Bun
- `/\b(curl)\s+/g` → curl
- `/\b(jq)\s+/g` → jq

### What Commands Would a Binary Run?

**Example 1: AWS CLI**

If an agent declares `Bash(aws:*)` or has this in its content:

```bash
aws s3 ls s3://my-bucket
aws eks describe-cluster --name my-cluster
aws sso login --profile my-profile
```

**Visualization:**
- Node: "CLI Apps" (cyan box)
- Contains: "aws"
- Edge: Solid cyan line from agent → CLI Apps node
- Label: "invokes"

**Meaning:** This agent can execute any AWS CLI command. The specific commands depend on the agent's purpose (S3 operations, EKS management, SSO authentication, etc.)

**Example 2: Kubernetes kubectl**

If an agent has:

```yaml
tools: [Bash(kubectl:*)]
```

And content like:

```bash
kubectl get pods -n production
kubectl describe deployment my-app
kubectl logs -f deployment/my-app
```

**Visualization:**
- Node: "CLI Apps" (cyan box)
- Contains: "kubectl"
- Meaning: This agent manages Kubernetes resources

**Example 3: Multiple CLI Apps**

An orchestrator agent might use multiple tools:

```yaml
tools: [Bash(aws:*), Bash(kubectl:*), Bash(gh:*)]
```

**Visualization:**
- Node: "CLI Apps" (cyan box)
- Contains: "aws", "kubectl", "gh"
- Meaning: This agent can:
  - Manage AWS resources via aws CLI
  - Deploy to Kubernetes via kubectl
  - Create PRs and issues via gh CLI

### Implementation Details

**Code Location:** `src/main/lib/trpc/routers/workflows.ts:556-599`

```typescript
function extractCliApps(content: string, allowedTools: string[]): string[] {
  const cliApps = new Set<string>()

  // Extract from Bash(tool:*) declarations
  allowedTools.forEach((tool) => {
    const bashMatch = tool.match(/Bash\(([a-z][a-z0-9-]*):/)
    if (bashMatch) {
      cliApps.add(bashMatch[1]) // Extracts "aws" from "Bash(aws:*)"
    }
  })

  // Extract from bash code blocks
  const bashBlockPattern = /```bash\n([\s\S]*?)```/g
  let match
  while ((match = bashBlockPattern.exec(content)) !== null) {
    const bashCode = match[1]

    // Check for common CLI patterns
    const cliPatterns = [
      /\b(aws)\s+/g,
      /\b(kubectl)\s+/g,
      // ... more patterns
    ]

    cliPatterns.forEach((pattern) => {
      const cliMatch = bashCode.match(pattern)
      if (cliMatch) {
        cliApps.add(cliMatch[1]) // Extracts "aws" from "aws s3 ls"
      }
    })
  }

  return Array.from(cliApps).sort()
}
```

### Visualization

**ReactFlow Node:** `CliAppNode` (cyan box)

**Location:** `src/renderer/features/workflows/components/workflow-nodes.tsx:89-103`

```typescript
export function CliAppNode({ data }: { data: { apps: string[] } }) {
  return (
    <div className="bg-cyan-500 border-cyan-600 border-2 rounded-lg p-3 shadow-lg min-w-[180px] text-white">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-sm mb-2 border-b border-white/30 pb-2">CLI Apps</div>
      <div className="space-y-1 mt-2">
        {data.apps.map((app, idx) => (
          <div key={idx} className="text-xs font-mono opacity-90">
            {app}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Visual Style:**
- Color: Cyan background (`bg-cyan-500`)
- Border: Darker cyan (`border-cyan-600`)
- Icon: Shows list of CLI tool names in monospace font
- Edge: Solid cyan line with label "invokes"

---

## 2. Background Tasks

### What Are They?

Background tasks represent async operations, long-running processes, or non-blocking operations that an agent/command initiates but doesn't wait for completion.

### How Are They Detected?

**Detection Patterns:**

```typescript
function extractBackgroundTasks(content: string): string[] {
  const tasks = new Set<string>()

  // Pattern 1: Explicit "background-agent" mention
  if (/background[- ]agent/gi.test(content)) {
    tasks.add("background-agent")
  }

  // Pattern 2: Generic async/background patterns
  if (/long[- ]running|async\s+task|background\s+task/gi.test(content)) {
    tasks.add("async-operation")
  }

  return Array.from(tasks)
}
```

### Example Use Cases

**Example 1: Background Agent Pattern**

```markdown
# Orchestrator Agent

When ready to execute, spawn the executor agent in the background
while you continue monitoring progress.

Background-agent: gsd-executor runs continuously to process tasks
from the queue.
```

**Detection Result:**
- Background task: "background-agent"

**Meaning:** This agent spawns another agent that runs continuously or persistently, not just for a single request-response cycle.

**Example 2: Async Operation Pattern**

```markdown
# Deployment Agent

Start the deployment process as a long-running task:

1. Trigger deployment pipeline (async task)
2. Continue monitoring deployment status
3. Report completion when done
```

**Detection Result:**
- Background task: "async-operation"

**Meaning:** This agent initiates operations that complete asynchronously, allowing the agent to continue other work.

**Example 3: No Background Tasks**

```markdown
# File Processor Agent

Read input file, process contents, write output file.
All operations are synchronous and blocking.
```

**Detection Result:**
- No background tasks detected

**Meaning:** This agent performs all work synchronously in a single execution flow.

### What Do Background Tasks Do?

Background tasks represent operational patterns, not specific commands:

**1. Background Agent Pattern:**
- **What:** Another agent running continuously/persistently
- **Why:** Handle ongoing monitoring, queue processing, or reactive tasks
- **Example:**
  - A monitoring agent that watches for file changes
  - A queue processor that handles async jobs
  - A daemon-like agent that responds to events

**2. Async Operation Pattern:**
- **What:** Non-blocking operations that complete later
- **Why:** Allow agent to continue other work while waiting
- **Example:**
  - Triggering a long deployment pipeline
  - Starting a build process
  - Initiating a backup operation

### Implementation Details

**Code Location:** `src/main/lib/trpc/routers/workflows.ts:602-620`

```typescript
/**
 * Extract background task patterns
 * Detects async operations, background agents, or long-running tasks
 */
function extractBackgroundTasks(content: string): string[] {
  const tasks = new Set<string>()

  // Pattern 1: Background agent mentions
  if (/background[- ]agent/gi.test(content)) {
    tasks.add("background-agent")
  }

  // Pattern 2: Generic async/background patterns
  if (/long[- ]running|async\s+task|background\s+task/gi.test(content)) {
    tasks.add("async-operation")
  }

  return Array.from(tasks)
}
```

### Visualization

**ReactFlow Node:** `BackgroundTaskNode` (amber box)

**Location:** `src/renderer/features/workflows/components/workflow-nodes.tsx:105-119`

```typescript
export function BackgroundTaskNode({ data }: { data: { tasks: string[] } }) {
  return (
    <div className="bg-amber-500 border-amber-600 border-2 rounded-lg p-3 shadow-lg min-w-[180px] text-white">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-sm mb-2 border-b border-white/30 pb-2">Background</div>
      <div className="space-y-1 mt-2">
        {data.tasks.map((task, idx) => (
          <div key={idx} className="text-xs font-mono opacity-90">
            {task}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Visual Style:**
- Color: Amber background (`bg-amber-500`)
- Border: Darker amber (`border-amber-600`)
- Icon: Shows list of task types
- Edge: Solid amber line with label "spawns" or "initiates"

---

## 3. Background Agents

### What Are They?

A background agent is a **specific type of background task** representing an agent that runs continuously or persistently, rather than in a traditional request-response pattern.

### How Are They Detected?

**Pattern:** Content contains "background-agent" or "background agent"

```markdown
# Example 1: Explicit mention
This agent spawns a background-agent to monitor logs.

# Example 2: Descriptive pattern
The executor runs as a background agent, processing tasks continuously.
```

### Difference from Regular Agent Spawns

**Regular Agent Spawn (Task tool):**
```markdown
Spawn the gsd-executor agent to handle this phase.
```
- **Detection:** Adds "gsd-executor" to `agents` array
- **Meaning:** One-time agent invocation for a specific task
- **Visualization:** Purple dashed animated edge with "spawns" label

**Background Agent:**
```markdown
Use a background-agent to monitor the deployment continuously.
```
- **Detection:** Adds "background-agent" to `backgroundTasks` array
- **Meaning:** Persistent agent running continuously
- **Visualization:** Amber box showing "background-agent"

### Real-World Examples

**Example 1: Log Monitor Agent**

```markdown
# Deployment Monitor Agent

tools: [Task, Read, Bash(kubectl:*)]

## Instructions

1. Spawn a background-agent to watch pod logs continuously
2. Parse logs for error patterns
3. Alert on critical issues
4. The background agent runs until deployment completes
```

**Workflow Visualization:**
- Agent Node: "Deployment Monitor Agent"
- Connected to:
  - Built-in Tools: Task, Read
  - CLI Apps: kubectl
  - Background Tasks: background-agent
  - Agents: (might also spawn specific agents like log-parser)

**Meaning:**
- This agent starts a persistent monitoring process
- The background agent continues running independently
- Not just a one-time spawn, but an ongoing process

**Example 2: Queue Processor**

```markdown
# Job Orchestrator

## Behavior

Maintain a background agent that:
- Monitors job queue
- Spawns worker agents for each job
- Tracks completion status
- Runs until queue is empty
```

**Workflow Visualization:**
- Agent Node: "Job Orchestrator"
- Background Tasks: "background-agent"
- Agents: worker agents (spawned dynamically)

**Meaning:**
- Background agent = the queue monitoring loop itself
- Worker agents = individual job executors spawned by the background agent

---

## Comparison Table

| Feature | CLI Apps (Binaries) | Background Tasks | Background Agents |
|---------|-------------------|------------------|-------------------|
| **Type** | External tools | Operational pattern | Specific task type |
| **Detection** | `Bash(cmd:*)` or bash blocks | Regex patterns | "background-agent" text |
| **Represents** | Command-line executables | Async/long-running work | Persistent agents |
| **Example** | aws, kubectl, gh | async-operation | background-agent |
| **Execution** | Direct CLI commands | Pattern description | Continuous agent loop |
| **Visualization** | Cyan box | Amber box | Part of amber box |
| **Edge Style** | Solid cyan | Solid amber | Solid amber |
| **Duration** | Per-command execution | Variable | Continuous |

---

## Visual Layout in ReactFlow

**Column Structure** (from `reactflow-layout.ts`):

```
Column 1: Built-in Tools (blue)
Column 2: MCP Tools/Servers (pink)
Column 3: Skills/Agents/Commands (green/purple/orange)
Column 4: CLI apps & Background tasks (cyan/amber)
```

**Rationale for Column 4:**
- CLI apps and background tasks are "infrastructure concerns"
- They represent external dependencies (CLI tools) or operational patterns (background work)
- Grouped together to show the "outer layer" of dependencies
- Visually separated from core tools and runtime invocations

---

## Usage in Agent/Command Design

### When to Declare CLI Apps

**Declare explicitly in frontmatter:**
```yaml
tools: [Bash(aws:*), Bash(kubectl:*)]
```

**When:**
- Agent needs specific CLI tool access
- Want to document external dependencies upfront
- Tool is core to agent's purpose

**Mention in bash blocks:**
```bash
aws s3 cp file.txt s3://bucket/
kubectl apply -f deploy.yaml
```

**When:**
- Showing example commands
- Documenting usage patterns
- Auto-detection sufficient for visualization

### When to Use Background Tasks

**Use "background-agent" when:**
- Spawning an agent that runs continuously
- Monitoring or watching for events
- Queue processing or daemon-like behavior
- Example: "Spawn background-agent to monitor logs"

**Use "async task" when:**
- Initiating non-blocking operations
- Starting processes that complete later
- Parallel execution patterns
- Example: "Start deployment as async task"

**Don't use when:**
- All operations are synchronous
- Traditional request-response pattern
- Agent waits for completion before continuing

---

## Enhancement Opportunities

### Potential Future Features

**1. Binary Command Details**

Instead of just showing "aws", show specific subcommands:
```
CLI Apps:
  aws:
    - s3 ls
    - eks describe-cluster
    - sso login
```

**2. Background Task Lifecycle**

Show background task states:
```
Background Tasks:
  background-agent: [running]
  async-operation: [pending]
```

**3. CLI Tool Versioning**

Track required CLI versions:
```
CLI Apps:
  aws (>= 2.0)
  kubectl (>= 1.27)
```

**4. Background Task Dependencies**

Show what background tasks depend on:
```
Background Agent "log-monitor"
  → uses: kubectl logs -f
  → triggers: alert-notifier agent
```

---

## Summary

**CLI Apps (Binaries):**
- What: External command-line tools (aws, kubectl, gh, docker, etc.)
- Command: Whatever the agent specifies in bash blocks (e.g., `aws s3 ls`, `kubectl get pods`)
- Visualization: Cyan box with tool names

**Background Tasks:**
- What: Operational patterns for async/long-running work
- Types: "background-agent" (persistent agent) or "async-operation" (non-blocking work)
- Visualization: Amber box with task types

**Background Agents:**
- What: Subset of background tasks representing continuously-running agents
- Behavior: Persistent monitoring, queue processing, event handling
- Visualization: "background-agent" entry in amber Background Tasks box

These dependency types help users understand:
1. **External tools** their agent/command uses (CLI apps)
2. **Operational patterns** their agent/command follows (background tasks)
3. **Persistent processes** their agent/command maintains (background agents)
