import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { messageIdsAtom, messageAtomFamily } from "../agents/stores/message-store"

export const sessionFlowSidebarOpenAtom = atomWithStorage<boolean>(
  "session-flow-sidebar-open",
  false,
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
export const sessionFlowExpandedNodesAtom = atom<Set<string>>(new Set())

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
export const sessionFlowBottomTabAtom = atomWithStorage<"todos" | "subAgents">(
  "session-flow-bottom-tab",
  "todos",
  undefined,
  { getOnInit: true },
)

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
}

// Selected sub-agent for output dialog
export const selectedSubAgentAtom = atom<SessionSubAgent | null>(null)
export const subAgentOutputDialogOpenAtom = atom<boolean>(false)

// Derive sub-agents from messages
// Finds all Task tool calls in the current session
export const sessionFlowSubAgentsAtom = atom<SessionSubAgent[]>((get) => {
  const messageIds = get(messageIdsAtom)
  const subAgents: SessionSubAgent[] = []

  // Search through all messages to find Task tools
  for (let i = 0; i < messageIds.length; i++) {
    const msgId = messageIds[i]
    if (!msgId) continue

    const message = get(messageAtomFamily(msgId))
    if (!message || !message.parts) continue

    // Search all parts for Task tools
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

        subAgents.push({
          agentId: part.toolCallId || `task-${msgId}-${partIdx}`,
          type: part.input?.subagent_type || "unknown-agent",
          description: part.input?.description || "Task",
          status,
          output: part.output?.result || part.output?.output,
          error: part.output?.error,
          duration: part.output?.duration || part.output?.duration_ms,
          messageId: msgId,
          partIndex: partIdx,
        })
      }
    }
  }

  return subAgents
})
