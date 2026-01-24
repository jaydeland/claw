import type { Node, Edge } from "reactflow"
import type { Message, MessagePart } from "../../agents/stores/message-store"
import type {
  UserMessageNodeData,
  AssistantResponseNodeData,
  ToolCallNodeData,
  AgentSpawnNodeData,
} from "../components/session-flow-nodes"

// Layout constants
const X_MAIN = 80 // Main chain x position
const X_BRANCH = 240 // Branch x position (tools to right)
const Y_SPACING = 70 // Vertical spacing between main nodes
const Y_BRANCH_SPACING = 40 // Vertical spacing for branch nodes

// Tools that should branch to the right (execution tools)
const BRANCHING_TOOLS = new Set([
  "Bash",
  "Edit",
  "Write",
  "Read",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite",
  "NotebookEdit",
  "AskUserQuestion",
  "KillShell",
  "TaskOutput",
])

interface TransformOptions {
  onNodeClick: (messageId: string, partIndex?: number) => void
}

interface TransformResult {
  nodes: Node[]
  edges: Edge[]
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string | undefined, maxLength: number): string {
  if (!text) return ""
  const cleaned = text.replace(/\n/g, " ").trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.slice(0, maxLength - 3) + "..."
}

/**
 * Get the first text content from a message's parts
 */
function getFirstTextContent(parts: MessagePart[] | undefined): string {
  if (!parts) return ""
  const textPart = parts.find((p) => p.type === "text" && p.text?.trim())
  return textPart?.text || ""
}

/**
 * Check if message has any tool invocations that should branch
 */
function hasToolBranches(parts: MessagePart[] | undefined): boolean {
  if (!parts) return false
  return parts.some(
    (p) => p.type === "tool-invocation" && BRANCHING_TOOLS.has(p.toolName || ""),
  )
}

/**
 * Get tool state from part
 */
function getToolState(part: MessagePart): "call" | "result" | "error" {
  if (part.error || part.errorText) return "error"
  if (part.output !== undefined || part.result !== undefined) return "result"
  return "call"
}

/**
 * Transform messages to ReactFlow nodes and edges
 */
export function transformMessagesToFlow(
  messages: Message[],
  options: TransformOptions,
): TransformResult {
  const nodes: Node[] = []
  const edges: Edge[] = []

  let currentMainY = 0
  let lastMainNodeId: string | null = null

  for (const message of messages) {
    if (message.role === "user") {
      // User message node in main chain
      const nodeId = `user-${message.id}`
      const text = truncateText(getFirstTextContent(message.parts), 40)

      nodes.push({
        id: nodeId,
        type: "userMessage",
        position: { x: X_MAIN, y: currentMainY },
        data: {
          id: message.id,
          text: text || "...",
          onClick: () => options.onNodeClick(message.id),
        } as UserMessageNodeData,
      })

      // Connect to previous main node
      if (lastMainNodeId) {
        edges.push({
          id: `${lastMainNodeId}-${nodeId}`,
          source: lastMainNodeId,
          target: nodeId,
          style: { stroke: "#64748b", strokeWidth: 2 },
        })
      }

      lastMainNodeId = nodeId
      currentMainY += Y_SPACING
    } else if (message.role === "assistant") {
      // Process assistant message parts
      const parts = message.parts || []
      const hasTools = hasToolBranches(parts)

      // Find first text part for the response node
      const text = truncateText(getFirstTextContent(parts), 40)

      // Create assistant response node
      const responseNodeId = `response-${message.id}`
      nodes.push({
        id: responseNodeId,
        type: "assistantResponse",
        position: { x: X_MAIN, y: currentMainY },
        data: {
          id: message.id,
          text: text || "...",
          hasTools,
          onClick: () => options.onNodeClick(message.id),
        } as AssistantResponseNodeData,
      })

      // Connect to previous main node
      if (lastMainNodeId) {
        edges.push({
          id: `${lastMainNodeId}-${responseNodeId}`,
          source: lastMainNodeId,
          target: responseNodeId,
          style: { stroke: "#64748b", strokeWidth: 2 },
        })
      }

      lastMainNodeId = responseNodeId

      // Process tool invocations as branches to the right
      let branchY = currentMainY
      let branchIndex = 0

      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex]

        if (part.type === "tool-invocation") {
          const toolName = part.toolName || "Tool"

          if (BRANCHING_TOOLS.has(toolName)) {
            const toolNodeId = `tool-${message.id}-${part.toolCallId || partIndex}`
            const state = getToolState(part)

            // Check if this is a Task agent spawn
            if (toolName === "Task") {
              nodes.push({
                id: toolNodeId,
                type: "agentSpawn",
                position: { x: X_BRANCH, y: branchY },
                data: {
                  agentId: part.toolCallId || "",
                  description: truncateText(part.input?.description || part.input?.prompt, 20),
                  status: state === "error" ? "error" : state === "result" ? "completed" : "running",
                  onClick: () => options.onNodeClick(message.id, partIndex),
                } as AgentSpawnNodeData,
              })
            } else {
              nodes.push({
                id: toolNodeId,
                type: "toolCall",
                position: { x: X_BRANCH, y: branchY },
                data: {
                  toolCallId: part.toolCallId || "",
                  toolName,
                  state,
                  onClick: () => options.onNodeClick(message.id, partIndex),
                } as ToolCallNodeData,
              })
            }

            // Connect tool to response node (horizontal branch)
            edges.push({
              id: `${responseNodeId}-${toolNodeId}`,
              source: responseNodeId,
              sourceHandle: "tools",
              target: toolNodeId,
              animated: state === "call",
              style: {
                stroke: state === "error" ? "#ef4444" : "#ec4899",
                strokeWidth: 1.5,
              },
            })

            branchY += Y_BRANCH_SPACING
            branchIndex++
          }
        }
      }

      // Advance main Y position - account for tool branches
      const extraHeight = branchIndex > 0 ? Math.max(0, (branchIndex - 1) * Y_BRANCH_SPACING) : 0
      currentMainY += Y_SPACING + extraHeight * 0.5
    }
  }

  return { nodes, edges }
}
