# Workflow Visualization Enhancements

**Date:** 2026-01-20
**Goal:** Add detailed information to workflow flowchart for CLI apps, background tasks, and background agents

---

## Problem Statement

Currently, the workflow flowchart shows:
- **CLI Apps (Binaries):** Just tool names like "aws", "kubectl", "gh"
- **Background Tasks:** Just task types like "background-agent", "async-operation"
- **Background Agents:** Shows as "background-agent" in the Background Tasks node

**Users need to answer questions like:**
1. What command would the binary run if defined?
2. What does the background task do?
3. What does the background-agent do?

---

## Solution Overview

Enhance the visualization to extract and display:

### 1. CLI Apps - Show Actual Commands
Extract command examples from bash blocks:
- `aws s3 ls s3://bucket`
- `kubectl get pods -n production`
- `gh pr list --state open`

### 2. Background Tasks - Show Purpose/Description
Extract surrounding context to explain what the task does:
- "background-agent" → "Monitors logs continuously"
- "async-task" → "Deploys application to production"
- "parallel-agents" → "Processes multiple files concurrently"

### 3. Enhanced UI - Expandable Details
- Collapsed by default (show just names)
- Click to expand and see commands/descriptions
- Prevent flowchart clutter

---

## Implementation Plan

## Phase 1: Enhanced Backend Detection Functions

### 1.1 Update TypeScript Types

**File:** `src/main/lib/trpc/routers/workflows.ts` (lines 46-60)

Add new metadata interfaces:

```typescript
interface CliAppMetadata {
  name: string           // e.g., "aws"
  commands: string[]     // e.g., ["aws s3 ls", "aws eks describe-cluster"]
}

interface BackgroundTaskMetadata {
  type: string           // e.g., "background-agent", "async-task"
  description: string    // Extracted context about what the task does
  agentName?: string     // If it's a background agent, which agent
}

interface DependencyGraph {
  // ... existing fields ...

  // Replace simple string arrays with metadata objects
  cliApps: CliAppMetadata[]              // Was: string[]
  backgroundTasks: BackgroundTaskMetadata[]  // Was: string[]
}
```

### 1.2 Enhance `extractCliApps()` Function

**File:** `src/main/lib/trpc/routers/workflows.ts` (lines 556-599)

**Current:** Returns `string[]` of CLI app names (e.g., `["aws", "kubectl"]`)
**Enhanced:** Returns `CliAppMetadata[]` with actual command examples

**Implementation:**

```typescript
function extractCliApps(content: string, allowedTools: string[]): CliAppMetadata[] {
  const cliAppsMap = new Map<string, Set<string>>()

  // Extract from Bash(tool:*) declarations
  allowedTools.forEach((tool) => {
    const bashMatch = tool.match(/Bash\(([a-z][a-z0-9-]*):/)
    if (bashMatch) {
      const toolName = bashMatch[1]
      if (!cliAppsMap.has(toolName)) {
        cliAppsMap.set(toolName, new Set())
      }
    }
  })

  // Extract command examples from bash code blocks
  const bashBlockPattern = /```bash\n([\s\S]*?)```/g
  let match
  while ((match = bashBlockPattern.exec(content)) !== null) {
    const bashCode = match[1]
    const lines = bashCode.split('\n').filter(line => line.trim())

    lines.forEach(line => {
      const trimmedLine = line.trim()
      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || !trimmedLine) return

      // Match CLI tools at start of line
      const cliPatterns = [
        { pattern: /^(aws)\s+(.+)/, name: 'aws' },
        { pattern: /^(kubectl)\s+(.+)/, name: 'kubectl' },
        { pattern: /^(gh)\s+(.+)/, name: 'gh' },
        { pattern: /^(docker)\s+(.+)/, name: 'docker' },
        { pattern: /^(terraform)\s+(.+)/, name: 'terraform' },
        { pattern: /^(helm)\s+(.+)/, name: 'helm' },
        { pattern: /^(git)\s+(.+)/, name: 'git' },
        { pattern: /^(npm)\s+(.+)/, name: 'npm' },
        { pattern: /^(yarn)\s+(.+)/, name: 'yarn' },
        { pattern: /^(bun)\s+(.+)/, name: 'bun' },
        { pattern: /^(curl)\s+(.+)/, name: 'curl' },
        { pattern: /^(dy)\s+(.+)/, name: 'dy' },
      ]

      for (const { pattern, name } of cliPatterns) {
        const cliMatch = trimmedLine.match(pattern)
        if (cliMatch) {
          if (!cliAppsMap.has(name)) {
            cliAppsMap.set(name, new Set())
          }
          // Store the full command (truncated for display)
          const fullCommand = trimmedLine.substring(0, 60) + (trimmedLine.length > 60 ? '...' : '')
          cliAppsMap.get(name)!.add(fullCommand)
          break
        }
      }
    })
  }

  // Convert to array of metadata objects
  return Array.from(cliAppsMap.entries())
    .map(([name, commands]) => ({
      name,
      commands: Array.from(commands).slice(0, 5) // Limit to 5 examples
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
```

### 1.3 Enhance `extractBackgroundTasks()` Function

**File:** `src/main/lib/trpc/routers/workflows.ts` (lines 602-624)

**Current:** Returns `string[]` of task types (e.g., `["background-agent", "async-task"]`)
**Enhanced:** Returns `BackgroundTaskMetadata[]` with descriptions

**Implementation:**

```typescript
function extractBackgroundTasks(content: string): BackgroundTaskMetadata[] {
  const tasks: BackgroundTaskMetadata[] = []

  // Pattern 1: Background agent mentions with context extraction
  const backgroundAgentPatterns = [
    /(?:spawn|run|start|use|maintain)\s+(?:a\s+)?background[- ]agent\s+(?:to\s+)?([^.!?\n]+)/gi,
    /background[- ]agent\s+(?:that\s+|which\s+|to\s+)?([^.!?\n]+)/gi,
    /(?:as|in)\s+(?:a\s+)?background\s+agent[,.]?\s*([^.!?\n]*)/gi
  ]

  for (const pattern of backgroundAgentPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const description = match[1]?.trim() || 'Runs continuously in background'
      // Check if already added
      if (!tasks.some(t => t.type === 'background-agent' && t.description === description)) {
        tasks.push({
          type: 'background-agent',
          description: truncateDescription(description)
        })
      }
    }
  }

  // If we detected "background-agent" but couldn't extract description, add generic
  if (tasks.length === 0 && /background[- ]agent/gi.test(content)) {
    tasks.push({
      type: 'background-agent',
      description: 'Persistent agent running in background'
    })
  }

  // Pattern 2: Parallel agents with context
  const parallelPatterns = [
    /(?:launch|run|spawn)\s+(?:agents?\s+)?in\s+parallel\s+(?:to\s+)?([^.!?\n]+)/gi,
    /parallel\s+agents?\s+(?:for|to)\s+([^.!?\n]+)/gi
  ]

  for (const pattern of parallelPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const description = match[1]?.trim() || 'Multiple agents running concurrently'
      if (!tasks.some(t => t.type === 'parallel-agents')) {
        tasks.push({
          type: 'parallel-agents',
          description: truncateDescription(description)
        })
      }
    }
  }

  // Pattern 3: Async/long-running tasks with context
  const asyncPatterns = [
    /(?:start|trigger|initiate)\s+(?:a\s+)?(?:long[- ]running|async)\s+(?:task|operation|process)\s+(?:to\s+|for\s+)?([^.!?\n]+)/gi,
    /(?:as\s+)?(?:an?\s+)?async\s+(?:task|operation)\s*[,:]?\s*([^.!?\n]*)/gi,
    /run(?:s|ning)?\s+in\s+(?:the\s+)?background[,.]?\s*([^.!?\n]*)/gi
  ]

  for (const pattern of asyncPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const description = match[1]?.trim() || 'Non-blocking async operation'
      if (!tasks.some(t => t.type === 'async-task')) {
        tasks.push({
          type: 'async-task',
          description: truncateDescription(description)
        })
      }
    }
  }

  return tasks
}

function truncateDescription(desc: string): string {
  // Clean up and truncate description
  const cleaned = desc.replace(/\s+/g, ' ').trim()
  if (cleaned.length > 80) {
    return cleaned.substring(0, 77) + '...'
  }
  return cleaned
}
```

---

## Phase 2: Update ReactFlow Data Conversion

### 2.1 Update `convertAgentToReactFlow()` Function

**File:** `src/renderer/features/workflows/ui/workflow-reactflow-view.tsx` (lines 258-304)

```typescript
// CLI Apps node (if any detected) - ENHANCED VERSION
if (agent.dependencies.cliApps && agent.dependencies.cliApps.length > 0) {
  nodes.push({
    id: "cli-apps",
    type: "cli",
    position: { x: 0, y: 0 },
    data: {
      apps: agent.dependencies.cliApps,  // Now CliAppMetadata[]
      width: 220,
      height: Math.max(100, agent.dependencies.cliApps.length * 60 + 50),
    },
  })
  // ... edge creation unchanged
}

// Background Tasks node (if any detected) - ENHANCED VERSION
if (agent.dependencies.backgroundTasks && agent.dependencies.backgroundTasks.length > 0) {
  nodes.push({
    id: "background-tasks",
    type: "backgroundTask",
    position: { x: 0, y: 0 },
    data: {
      tasks: agent.dependencies.backgroundTasks,  // Now BackgroundTaskMetadata[]
      width: 220,
      height: Math.max(100, agent.dependencies.backgroundTasks.length * 60 + 50),
    },
  })
  // ... edge creation unchanged
}
```

### 2.2 Update Local Interfaces

**File:** `src/renderer/features/workflows/ui/workflow-reactflow-view.tsx` (lines 43-74)

```typescript
interface CliAppMetadata {
  name: string
  commands: string[]
}

interface BackgroundTaskMetadata {
  type: string
  description: string
  agentName?: string
}

interface AgentWithDependencies {
  // ... existing fields ...
  dependencies: {
    // ... existing fields ...
    cliApps: CliAppMetadata[]
    backgroundTasks: BackgroundTaskMetadata[]
  }
}
```

---

## Phase 3: Enhanced UI Components

### 3.1 Enhanced `CliAppNode` Component

**File:** `src/renderer/features/workflows/components/workflow-nodes.tsx` (lines 89-103)

```typescript
import { useState } from "react"
import { Handle, Position } from "reactflow"
import { ChevronRight, Terminal } from "lucide-react"

interface CliAppMetadata {
  name: string
  commands: string[]
}

export function CliAppNode({ data }: { data: { apps: CliAppMetadata[] } }) {
  const [expandedApp, setExpandedApp] = useState<string | null>(null)

  return (
    <div className="bg-cyan-500 border-cyan-600 border-2 rounded-lg p-3 shadow-lg min-w-[200px] max-w-[280px] text-white">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-sm mb-2 border-b border-white/30 pb-2 flex items-center gap-2">
        <Terminal className="h-4 w-4" />
        CLI Apps
      </div>
      <div className="space-y-2 mt-2">
        {data.apps.map((app, idx) => (
          <div key={idx} className="group">
            <button
              onClick={() => setExpandedApp(expandedApp === app.name ? null : app.name)}
              className="w-full text-left flex items-center justify-between text-sm font-mono opacity-90 hover:opacity-100"
            >
              <span className="flex items-center gap-1">
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${expandedApp === app.name ? 'rotate-90' : ''}`}
                />
                {app.name}
              </span>
              {app.commands.length > 0 && (
                <span className="text-xs opacity-60">{app.commands.length}</span>
              )}
            </button>

            {/* Expandable command examples */}
            {expandedApp === app.name && app.commands.length > 0 && (
              <div className="ml-4 mt-1 space-y-1 border-l border-white/20 pl-2">
                {app.commands.map((cmd, cmdIdx) => (
                  <div
                    key={cmdIdx}
                    className="text-xs font-mono opacity-70 truncate"
                    title={cmd}
                  >
                    $ {cmd}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 3.2 Enhanced `BackgroundTaskNode` Component

**File:** `src/renderer/features/workflows/components/workflow-nodes.tsx` (lines 105-119)

```typescript
import { useState } from "react"
import { Handle, Position } from "reactflow"
import { ChevronRight, Zap } from "lucide-react"

interface BackgroundTaskMetadata {
  type: string
  description: string
  agentName?: string
}

export function BackgroundTaskNode({ data }: { data: { tasks: BackgroundTaskMetadata[] } }) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  // Map task types to readable labels and icons
  const taskLabels: Record<string, { label: string; icon: string }> = {
    'background-agent': { label: 'Background Agent', icon: '🔄' },
    'parallel-agents': { label: 'Parallel Execution', icon: '⚡' },
    'async-task': { label: 'Async Task', icon: '⏳' },
  }

  return (
    <div className="bg-amber-500 border-amber-600 border-2 rounded-lg p-3 shadow-lg min-w-[200px] max-w-[280px] text-white">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-sm mb-2 border-b border-white/30 pb-2 flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Background Tasks
      </div>
      <div className="space-y-2 mt-2">
        {data.tasks.map((task, idx) => {
          const taskInfo = taskLabels[task.type] || { label: task.type, icon: '📋' }
          const isExpanded = expandedTask === `${task.type}-${idx}`

          return (
            <div key={idx} className="group">
              <button
                onClick={() => setExpandedTask(isExpanded ? null : `${task.type}-${idx}`)}
                className="w-full text-left flex items-center gap-2 text-sm hover:opacity-100 opacity-90"
              >
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
                <span>{taskInfo.icon}</span>
                <span>{taskInfo.label}</span>
              </button>

              {/* Expandable description */}
              {isExpanded && task.description && (
                <div className="ml-6 mt-1 text-xs opacity-75 italic border-l border-white/20 pl-2">
                  {task.description}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Phase 4: Backwards Compatibility

### 4.1 Handle Mixed Data Types

Since the codebase may have existing data or cached responses, ensure the components handle both old (`string[]`) and new (`Metadata[]`) formats:

```typescript
// In CliAppNode
function normalizeCliApps(apps: (string | CliAppMetadata)[]): CliAppMetadata[] {
  return apps.map(app => {
    if (typeof app === 'string') {
      return { name: app, commands: [] }
    }
    return app
  })
}

// In BackgroundTaskNode
function normalizeBackgroundTasks(tasks: (string | BackgroundTaskMetadata)[]): BackgroundTaskMetadata[] {
  return tasks.map(task => {
    if (typeof task === 'string') {
      return { type: task, description: '' }
    }
    return task
  })
}
```

---

## Testing Strategy

### CLI App Extraction Test Cases

1. **Single CLI tool in bash block**: Verify `aws s3 ls` extracts as `{ name: "aws", commands: ["aws s3 ls"] }`
2. **Multiple commands for same tool**: Verify multiple aws commands are grouped together
3. **Mixed CLI tools**: Verify `aws`, `kubectl`, `gh` in same file are separated
4. **Bash(tool:*) in frontmatter**: Verify tool is detected even without bash blocks
5. **Long commands**: Verify truncation works correctly (60 chars + "...")
6. **Comments in bash blocks**: Verify comments are skipped

### Background Task Extraction Test Cases

1. **"background-agent" with context**: Verify description is extracted
2. **"parallel agents" pattern**: Verify parallel-agents type is detected
3. **"async task" pattern**: Verify async-task type is detected
4. **No background patterns**: Verify empty array returned
5. **Multiple background patterns**: Verify all are detected

### Visual Testing

1. Verify CliAppNode displays collapsed state correctly
2. Verify CliAppNode expands to show commands
3. Verify BackgroundTaskNode displays task types with icons
4. Verify BackgroundTaskNode shows descriptions when expanded
5. Verify node heights calculate correctly for varying content

---

## Implementation Order

1. **Step 1**: Update TypeScript types in `workflows.ts` (DependencyGraph interface)
2. **Step 2**: Update `extractCliApps()` function to return enhanced metadata
3. **Step 3**: Add `truncateDescription()` helper function
4. **Step 4**: Update `extractBackgroundTasks()` function to return enhanced metadata
5. **Step 5**: Update `buildAgentDependencies()` to use new extraction functions
6. **Step 6**: Update `buildCommandDependencies()` to use new extraction functions
7. **Step 7**: Update local interfaces in `workflow-reactflow-view.tsx`
8. **Step 8**: Update `convertAgentToReactFlow()` to pass new data structure
9. **Step 9**: Update `convertCommandToReactFlow()` to pass new data structure
10. **Step 10**: Update `CliAppNode` component with expandable command display
11. **Step 11**: Update `BackgroundTaskNode` component with expandable descriptions
12. **Step 12**: Add backwards compatibility normalization functions
13. **Step 13**: Test with real agent/command files

---

## UI/UX Design Principles

### Keeping the Flowchart Clean

1. **Default collapsed state**: Command examples and descriptions are hidden by default
2. **Click to expand**: Users can click individual items to see details
3. **Compact display**: Only show first word (tool name) until expanded
4. **Truncation**: Long commands/descriptions truncated with ellipsis and full text in tooltip
5. **Fixed max-width**: Prevent nodes from becoming too wide (280px max)

### Visual Hierarchy

1. **Node header**: Bold, with icon, border separator
2. **Tool/task names**: Medium weight, slightly transparent
3. **Details (expanded)**: Smaller font, indented, more transparent
4. **Chevron icon**: Indicates expandability

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Regex extraction fails on edge cases | Use defensive extraction with fallbacks to simple detection |
| Performance impact from deeper parsing | Limit command extraction to 5 examples per tool |
| Breaking changes to existing visualizations | Add backwards compatibility normalization |
| Node height calculation incorrect | Recalculate height based on expanded state |

---

## Files to Modify

### Backend (Main Process)
- **`src/main/lib/trpc/routers/workflows.ts`**
  - Lines 46-60: Add new interface types
  - Lines 556-599: Update `extractCliApps()` function
  - Lines 602-624: Update `extractBackgroundTasks()` function
  - Add: `truncateDescription()` helper function

### Frontend (Renderer Process)
- **`src/renderer/features/workflows/ui/workflow-reactflow-view.tsx`**
  - Lines 43-74: Update local interfaces
  - Lines 258-304: Update node data passing in `convertAgentToReactFlow()`
  - Similar updates in `convertCommandToReactFlow()`

- **`src/renderer/features/workflows/components/workflow-nodes.tsx`**
  - Lines 89-103: Replace `CliAppNode` with enhanced version
  - Lines 105-119: Replace `BackgroundTaskNode` with enhanced version
  - Add: React state hooks for expand/collapse
  - Add: Icon imports from lucide-react

### Documentation
- **`.planning/WORKFLOW-DEPENDENCY-TYPES-EXPLAINED.md`**
  - Update with new enhanced visualization features
  - Add screenshots of expanded nodes

---

## Expected User Experience

**Before Enhancement:**
```
CLI Apps
  aws
  kubectl
  gh
```

**After Enhancement (Collapsed):**
```
CLI Apps
  > aws (3)
  > kubectl (2)
  > gh (1)
```

**After Enhancement (Expanded):**
```
CLI Apps
  ∨ aws (3)
      $ aws s3 ls s3://my-bucket
      $ aws eks describe-cluster --name my-cluster
      $ aws sso login --profile operations
  > kubectl (2)
  > gh (1)
```

---

**Before Enhancement:**
```
Background Tasks
  background-agent
  async-task
```

**After Enhancement (Collapsed):**
```
Background Tasks
  > 🔄 Background Agent
  > ⏳ Async Task
```

**After Enhancement (Expanded):**
```
Background Tasks
  ∨ 🔄 Background Agent
      Monitors deployment logs continuously
  > ⏳ Async Task
```

---

## Success Criteria

1. ✅ Users can see actual CLI commands that would be executed
2. ✅ Users can see descriptions of what background tasks do
3. ✅ Flowchart remains clean and uncluttered in default state
4. ✅ Details are accessible via simple click interaction
5. ✅ No breaking changes to existing workflow visualizations
6. ✅ Performance impact is negligible (< 100ms parsing time)

---

## Future Enhancements

Possible future improvements beyond this plan:

1. **Binary Command Details**: Show subcommands grouped by operation (s3, eks, etc.)
2. **Background Task Lifecycle**: Show task states (running, pending, completed)
3. **CLI Tool Versioning**: Track required CLI versions
4. **Background Task Dependencies**: Show what background tasks depend on
5. **Interactive Tooltips**: Hover to see full command without expanding
6. **Search/Filter**: Filter visible dependencies by type or keyword

---

## References

- Current dependency detection: `.planning/WORKFLOW-DEPENDENCY-TYPES-EXPLAINED.md`
- Invocation visualization: `.planning/workflow-invocation-visualization.md`
- Workflow graph types: `src/main/lib/trpc/routers/workflows.ts:46-74`
- ReactFlow nodes: `src/renderer/features/workflows/components/workflow-nodes.tsx`
