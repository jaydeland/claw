import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { messageIdsAtom, messageAtomFamily } from "../agents/stores/message-store"

// Display mode for session flow - matches changes/diff view pattern
export const sessionFlowDisplayModeAtom = atomWithStorage<"side-peek" | "center-peek" | "full-page">(
  "session-flow-display-mode",
  "side-peek",
  undefined,
  { getOnInit: true },
)

export const sessionFlowSidebarOpenAtom = atomWithStorage<boolean>(
  "session-flow-sidebar-open",
  true,
  undefined,
  { getOnInit: true },
)

// Runtime-only open state for dialog and fullscreen modes (not persisted)
export const sessionFlowSidebarOpenRuntimeAtom = atom<boolean>(false)

// Live mode toggle - when off, flow chart freezes; when on, catches up and auto-follows
export const sessionFlowLiveAtom = atomWithStorage<boolean>(
  "session-flow-live",
  true,
  undefined,
  { getOnInit: true },
)

export const sessionFlowSidebarWidthAtom = atomWithStorage<number>(
  "session-flow-sidebar-width",
  320,
  undefined,
  { getOnInit: true },
)

// Vertical split position (percentage for top panel, 0-100)
// Default 60% diagram / 40% todos
export const sessionFlowTodosSplitAtom = atomWithStorage<number>(
  "session-flow-todos-split",
  60,
  undefined,
  { getOnInit: true },
)

// Track if user has manually scrolled in the session flow
export const sessionFlowUserScrolledAtom = atom<boolean>(false)

// Track expanded node details (nodeId -> true/false)
export const sessionFlowExpandedNodesAtom = atom<Set<string>>(new Set<string>())

// Dialog/modal view state
export const sessionFlowDialogOpenAtom = atom<boolean>(false)
export const sessionFlowFullScreenAtom = atom<boolean>(false)

// Todo item type from TodoWrite tool
export interface SessionTodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

// Extracted todos from messages with message context for navigation
export interface ExtractedTodos {
  todos: SessionTodoItem[]
  messageId: string | null
  partIndex: number | null
}

// Derive current todos from messages
// Finds the latest TodoWrite tool call and extracts its todos
export const sessionFlowTodosAtom = atom<ExtractedTodos>((get) => {
  const messageIds = get(messageIdsAtom)

  // Search from most recent messages backwards to find latest TodoWrite
  for (let i = messageIds.length - 1; i >= 0; i--) {
    const msgId = messageIds[i]
    if (!msgId) continue

    const message = get(messageAtomFamily(msgId))
    if (!message || !message.parts) continue

    // Search parts backwards to find the most recent TodoWrite in this message
    for (let partIdx = message.parts.length - 1; partIdx >= 0; partIdx--) {
      const part = message.parts[partIdx]
      if (!part) continue

      // Check if this is a TodoWrite tool call
      if (
        part.type === "tool-TodoWrite" ||
        (part.type === "tool-invocation" && part.toolName === "TodoWrite")
      ) {
        // Extract todos from input or output
        const todos = part.input?.todos || part.output?.newTodos || []
        if (todos.length > 0) {
          return {
            todos,
            messageId: msgId,
            partIndex: partIdx,
          }
        }
      }
    }
  }

  return { todos: [], messageId: null, partIndex: null }
})

// Tab selection atom for bottom panel
export const sessionFlowBottomTabAtom = atomWithStorage<"todos" | "subAgents" | "tasks">(
  "session-flow-bottom-tab",
  "todos",
  undefined,
  { getOnInit: true },
)

// Swarm worker types - agents that are part of the swarm system
export const SWARM_WORKER_TYPES = ["coordinator", "coder", "reviewer", "tester"] as const
export type SwarmWorkerType = (typeof SWARM_WORKER_TYPES)[number]

// Check if an agent type is a swarm worker
export function isSwarmWorker(type: string): boolean {
  return SWARM_WORKER_TYPES.includes(type as SwarmWorkerType)
}

// Nested tool call used by a sub-agent
export interface SessionNestedTool {
  toolCallId: string
  toolName: string
  input?: Record<string, unknown>
  output?: unknown
  status: "pending" | "completed" | "error"
}

// Sub-agent from Task tool
export interface SessionSubAgent {
  agentId: string
  type: string // subagent_type
  description: string
  status: "running" | "completed" | "failed"
  output?: string
  error?: string
  duration?: number
  messageId: string
  partIndex: number
  // Tools used by this sub-agent (extracted from nested tool calls)
  nestedTools?: SessionNestedTool[]
  // Swarm-specific: whether this is a swarm worker
  isSwarmWorker?: boolean
  // Swarm-specific: parent agent ID (for hierarchy visualization)
  parentAgentId?: string
  // Depth level for hierarchy (0 = top level, 1 = spawned by coordinator, etc.)
  depth?: number
}

// Selected sub-agent for output dialog
export const selectedSubAgentAtom = atom<SessionSubAgent | null>(null)
export const subAgentOutputDialogOpenAtom = atom<boolean>(false)

// Session mode - can be set externally or derived from swarm presence
export type SessionMode = "plan" | "agent" | "swarm"
export const sessionModeAtom = atom<SessionMode>("agent")

// Derived: detect if swarm mode is active (has swarm workers)
export const isSwarmModeActiveAtom = atom<boolean>((get) => {
  const subAgents = get(sessionFlowSubAgentsAtom)
  return subAgents.some((agent) => agent.isSwarmWorker)
})

// Derived: get swarm stats for display
export interface SwarmStats {
  hasSwarmWorkers: boolean
  coordinatorCount: number
  coderCount: number
  reviewerCount: number
  testerCount: number
  totalWorkers: number
}

export const swarmStatsAtom = atom<SwarmStats>((get) => {
  const subAgents = get(sessionFlowSubAgentsAtom)
  const swarmAgents = subAgents.filter((a) => a.isSwarmWorker)

  return {
    hasSwarmWorkers: swarmAgents.length > 0,
    coordinatorCount: swarmAgents.filter((a) => a.type === "coordinator").length,
    coderCount: swarmAgents.filter((a) => a.type === "coder").length,
    reviewerCount: swarmAgents.filter((a) => a.type === "reviewer").length,
    testerCount: swarmAgents.filter((a) => a.type === "tester").length,
    totalWorkers: swarmAgents.length,
  }
})

// Background task from Bash tool with run_in_background: true
export interface SessionBackgroundTask {
  taskId: string
  toolCallId: string
  command: string
  description?: string
  status: "running" | "completed" | "failed" | "unknown"
  messageId: string
  partIndex: number
}

// Selected background task for output dialog
export const selectedBackgroundTaskAtom = atom<SessionBackgroundTask | null>(null)
export const backgroundTaskOutputDialogOpenAtom = atom<boolean>(false)

// Derive background tasks from messages
// Finds all Bash tool calls with run_in_background: true
export const sessionFlowBackgroundTasksAtom = atom<SessionBackgroundTask[]>((get) => {
  const messageIds = get(messageIdsAtom)
  const tasks: SessionBackgroundTask[] = []

  // Search through all messages to find background Bash tools
  for (let i = 0; i < messageIds.length; i++) {
    const msgId = messageIds[i]
    if (!msgId) continue

    const message = get(messageAtomFamily(msgId))
    if (!message || !message.parts) continue

    // Search all parts for Bash tools with run_in_background: true
    for (let partIdx = 0; partIdx < message.parts.length; partIdx++) {
      const part = message.parts[partIdx]
      if (!part) continue

      // Check if this is a Bash tool call with run_in_background
      if (
        part.type === "tool-Bash" ||
        (part.type === "tool-invocation" && part.toolName === "Bash")
      ) {
        // Check if run_in_background is true
        if (part.input?.run_in_background === true) {
          // Determine status based on output presence
          let status: "running" | "completed" | "failed" | "unknown" = "running"
          if (part.output !== undefined || part.result !== undefined) {
            const output = part.output || part.result
            // Check for error indicators
            if (part.error || part.errorText || output?.error) {
              status = "failed"
            } else if (output?.exitCode !== undefined) {
              status = output.exitCode === 0 ? "completed" : "failed"
            } else {
              // Has output but no exit code - could still be running or completed
              status = "unknown"
            }
          }

          tasks.push({
            taskId: part.toolCallId || `bg-task-${msgId}-${partIdx}`,
            toolCallId: part.toolCallId || "",
            command: part.input?.command || "",
            description: part.input?.description,
            status,
            messageId: msgId,
            partIndex: partIdx,
          })
        }
      }
    }
  }

  return tasks
})

// Helper to extract tool name from part type (e.g., "tool-Read" -> "Read")
function extractToolName(part: any): string {
  if (part.toolName) return part.toolName
  if (part.type?.startsWith("tool-")) return part.type.replace("tool-", "")
  return "Unknown"
}

// Helper to determine nested tool status
function getNestedToolStatus(part: any): "pending" | "completed" | "error" {
  if (part.error || part.errorText || part.output?.error) return "error"
  if (part.output !== undefined || part.result !== undefined) return "completed"
  return "pending"
}

// Derive sub-agents from messages
// Finds all Task tool calls in the current session and their nested tool usage
export const sessionFlowSubAgentsAtom = atom<SessionSubAgent[]>((get) => {
  const messageIds = get(messageIdsAtom)
  const subAgents: SessionSubAgent[] = []

  // Track all Task tool IDs globally for parent detection
  const allTaskToolIds = new Set<string>()
  // Map of agentId -> parent agentId (for hierarchy)
  const parentMap = new Map<string, string>()

  // First global pass: collect all Task tool IDs across all messages
  for (let i = 0; i < messageIds.length; i++) {
    const msgId = messageIds[i]
    if (!msgId) continue

    const message = get(messageAtomFamily(msgId))
    if (!message || !message.parts) continue

    for (const part of message.parts) {
      if (
        (part.type === "tool-Task" || (part.type === "tool-invocation" && part.toolName === "Task")) &&
        part.toolCallId
      ) {
        allTaskToolIds.add(part.toolCallId)

        // Check if this Task was spawned by another Task (nested ID format: "parentId:childId")
        if (part.toolCallId.includes(":")) {
          const parentId = part.toolCallId.split(":")[0]
          if (allTaskToolIds.has(parentId)) {
            parentMap.set(part.toolCallId, parentId)
          }
        }
      }
    }
  }

  // Search through all messages to find Task tools
  for (let i = 0; i < messageIds.length; i++) {
    const msgId = messageIds[i]
    if (!msgId) continue

    const message = get(messageAtomFamily(msgId))
    if (!message || !message.parts) continue

    // First pass: find all Task tool IDs in this message
    const taskToolIds = new Set<string>()
    for (const part of message.parts) {
      if (
        (part.type === "tool-Task" || (part.type === "tool-invocation" && part.toolName === "Task")) &&
        part.toolCallId
      ) {
        taskToolIds.add(part.toolCallId)
      }
    }

    // Second pass: build map of nested tools per Task
    // Nested tools have IDs in format "parentTaskId:childToolId"
    const nestedToolsMap = new Map<string, SessionNestedTool[]>()
    for (const part of message.parts) {
      if (part.toolCallId?.includes(":")) {
        const parentId = part.toolCallId.split(":")[0]
        // Only add non-Task tools as nested tools (Task tools are sub-agents)
        const isTaskTool = part.type === "tool-Task" || (part.type === "tool-invocation" && part.toolName === "Task")
        if (taskToolIds.has(parentId) && !isTaskTool) {
          if (!nestedToolsMap.has(parentId)) {
            nestedToolsMap.set(parentId, [])
          }
          nestedToolsMap.get(parentId)!.push({
            toolCallId: part.toolCallId,
            toolName: extractToolName(part),
            input: part.input,
            output: part.output || part.result,
            status: getNestedToolStatus(part),
          })
        }
      }
    }

    // Third pass: create SessionSubAgent entries with nested tools
    for (let partIdx = 0; partIdx < message.parts.length; partIdx++) {
      const part = message.parts[partIdx]
      if (!part) continue

      // Check if this is a Task tool call
      if (
        part.type === "tool-Task" ||
        (part.type === "tool-invocation" && part.toolName === "Task")
      ) {
        // Determine status based on output presence
        let status: "running" | "completed" | "failed" = "running"
        if (part.output) {
          status = part.output.error ? "failed" : "completed"
        }

        // Extract output from multiple possible locations
        // Task tool can have output in: part.output.result, part.output.output, or part.result
        const extractedOutput = part.output?.result || part.output?.output || part.result
        const extractedError = part.output?.error || part.error

        // Ensure output is a string (convert objects to JSON for display)
        const outputString = typeof extractedOutput === 'string'
          ? extractedOutput
          : extractedOutput
            ? JSON.stringify(extractedOutput, null, 2)
            : undefined

        const errorString = typeof extractedError === 'string'
          ? extractedError
          : extractedError
            ? JSON.stringify(extractedError, null, 2)
            : undefined

        const agentId = part.toolCallId || `task-${msgId}-${partIdx}`
        const agentType = part.input?.subagent_type || "unknown-agent"

        // Determine parent and depth for hierarchy
        const parentAgentId = parentMap.get(agentId)
        let depth = 0
        let currentId = agentId
        while (parentMap.has(currentId)) {
          depth++
          currentId = parentMap.get(currentId)!
        }

        subAgents.push({
          agentId,
          type: agentType,
          description: part.input?.description || "Task",
          status,
          output: outputString,
          error: errorString,
          duration: part.output?.duration || part.output?.duration_ms,
          messageId: msgId,
          partIndex: partIdx,
          // Include nested tools if any were found for this Task
          nestedTools: nestedToolsMap.get(agentId),
          // Swarm detection
          isSwarmWorker: isSwarmWorker(agentType),
          // Hierarchy
          parentAgentId,
          depth,
        })
      }
    }
  }

  return subAgents
})
