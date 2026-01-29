import type { Node, Edge } from "reactflow"
import type { Message, MessagePart } from "../../agents/stores/message-store"
import type {
  UserMessageNodeData,
  AssistantResponseNodeData,
  ToolCallNodeData,
  AgentSpawnNodeData,
  BackgroundTaskNodeData,
} from "../components/session-flow-nodes"

// Layout constants
const X_MAIN = 80 // Main chain x position
const X_BRANCH = 320 // Branch x position (tools to right) - increased spacing
const X_DETAIL = 500 // Detail nodes x position (expanded invocations)
const Y_SPACING = 80 // Vertical spacing between main nodes - increased for better separation
const Y_BRANCH_SPACING = 50 // Vertical spacing for branch nodes - increased
const Y_DETAIL_SPACING = 45 // Vertical spacing for detail nodes

// Tools that should branch to the right (opt-in list)
// Show: agents, bash (including background tasks), thinking, questions, and web research
const BRANCHING_TOOLS = new Set([
  "Task",              // Agent spawns (sub-agents)
  "Bash",              // Shell commands (regular + background tasks)
  "Thinking",          // Internal reasoning
  "AskUserQuestion",   // Questions to user
  "WebSearch",         // Web searches
  "WebFetch",          // Web page fetches
])

interface TransformOptions {
  onNodeClick: (messageId: string, partIndex?: number) => void
  expandedNodes?: Set<string>
  onToggleExpansion?: (nodeId: string) => void
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
  return parts.some((p) => {
    // New format: type is "tool-{toolName}" (e.g., "tool-Bash", "tool-Read")
    if (p.type?.startsWith("tool-")) {
      const toolName = p.type.replace("tool-", "")
      return BRANCHING_TOOLS.has(toolName)
    }
    return false
  })
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
      // Extract token data from message metadata (flat structure from transform.ts)
      const metadata = message.metadata as { inputTokens?: number; outputTokens?: number } | undefined

      // Debug logging to trace token data
      if (metadata) {
        console.log("[session-flow] Message metadata:", {
          messageId: message.id,
          inputTokens: metadata.inputTokens,
          outputTokens: metadata.outputTokens,
          fullMetadata: metadata
        })
      } else {
        console.log("[session-flow] No metadata for message:", message.id)
      }

      nodes.push({
        id: responseNodeId,
        type: "assistantResponse",
        position: { x: X_MAIN, y: currentMainY },
        data: {
          id: message.id,
          text: text || "...",
          hasTools,
          inputTokens: metadata?.inputTokens,
          outputTokens: metadata?.outputTokens,
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

      // Track bash and thinking invocations for consolidation
      let bashCount = 0
      let bashFirstPartIndex = -1
      let bashState: "call" | "result" | "error" = "call"
      let thinkingCount = 0
      let thinkingFirstPartIndex = -1
      let thinkingState: "call" | "result" | "error" = "call"

      // Track background tasks separately
      const backgroundTasks: Array<{
        partIndex: number
        part: MessagePart
        status: "running" | "completed" | "failed" | "unknown"
      }> = []

      // First pass: collect and count tools
      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex]

        if (part.type?.startsWith("tool-")) {
          const toolName = part.type.replace("tool-", "")

          if (toolName === "Thinking") {
            if (thinkingCount === 0) {
              thinkingFirstPartIndex = partIndex
            }
            thinkingCount++
            const state = getToolState(part)
            if (state === "error") thinkingState = "error"
            else if (state === "result" && thinkingState !== "error") thinkingState = "result"
          } else if (toolName === "Bash") {
            // Check if this is a background task
            if (part.input?.run_in_background === true) {
              // Determine background task status
              let status: "running" | "completed" | "failed" | "unknown" = "running"
              if (part.output !== undefined || part.result !== undefined) {
                const output = part.output || part.result
                if (part.error || part.errorText || output?.error) {
                  status = "failed"
                } else if (output?.exitCode !== undefined) {
                  status = output.exitCode === 0 ? "completed" : "failed"
                } else {
                  status = "unknown"
                }
              }
              backgroundTasks.push({ partIndex, part, status })
            } else {
              // Regular Bash command
              if (bashCount === 0) {
                bashFirstPartIndex = partIndex
              }
              bashCount++
              const state = getToolState(part)
              // Update state priority: error > result > call
              if (state === "error") bashState = "error"
              else if (state === "result" && bashState !== "error") bashState = "result"
            }
          }
        }
      }

      // Second pass: create nodes for non-consolidated tools
      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex]

        if (part.type?.startsWith("tool-")) {
          const toolName = part.type.replace("tool-", "")

          if (!BRANCHING_TOOLS.has(toolName)) continue

          // Skip Thinking and Bash - handled after loop
          if (toolName === "Thinking" || toolName === "Bash") continue

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
            // Other tools (AskUserQuestion, WebSearch, WebFetch)
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

      // Add consolidated Bash node if there were any
      if (bashCount > 0 && bashFirstPartIndex >= 0) {
        const toolNodeId = `tool-${message.id}-bash`
        const isExpanded = options.expandedNodes?.has(toolNodeId) || false

        console.log("[message-transformer] Creating Bash node:", {
          toolNodeId,
          bashCount,
          isExpanded,
          hasOnToggleExpansion: !!options.onToggleExpansion,
        })

        nodes.push({
          id: toolNodeId,
          type: "toolCall",
          position: { x: X_BRANCH, y: branchY },
          data: {
            toolCallId: "bash",
            toolName: "Bash",
            state: bashState,
            count: bashCount,
            isExpanded,
            // For single invocation: navigate directly. For multiple: no onClick (handled by onToggleExpansion)
            onClick: bashCount === 1
              ? () => options.onNodeClick(message.id, bashFirstPartIndex)
              : undefined,
            // For multiple invocations: provide expansion toggle
            onToggleExpansion: bashCount > 1 && options.onToggleExpansion
              ? () => {
                  console.log("[message-transformer] onToggleExpansion called for:", toolNodeId)
                  options.onToggleExpansion?.(toolNodeId)
                }
              : undefined,
          } as ToolCallNodeData,
        })

        // Connect bash node to response node
        edges.push({
          id: `${responseNodeId}-${toolNodeId}`,
          source: responseNodeId,
          sourceHandle: "tools",
          target: toolNodeId,
          animated: bashState === "call",
          style: {
            stroke: bashState === "error" ? "#ef4444" : "#ec4899",
            strokeWidth: 1.5,
          },
        })

        // Create detail nodes if expanded
        if (isExpanded && bashCount > 1) {
          console.log("[message-transformer] Creating detail nodes for Bash:", {
            toolNodeId,
            bashCount,
            partsLength: parts.length,
          })

          let detailY = branchY
          let detailIndex = 0

          for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (part.type === "tool-Bash") {
              const detailNodeId = `detail-${message.id}-bash-${partIndex}`
              const state = getToolState(part)

              // Extract input/output for detail display
              const input = part.input
              const output = part.output || part.result
              const error = part.error || part.errorText

              // Extract command preview from input
              const commandPreview = input?.command ? truncateText(input.command, 30) : undefined

              nodes.push({
                id: detailNodeId,
                type: "toolCall",
                position: { x: X_DETAIL, y: detailY },
                data: {
                  toolCallId: part.toolCallId || `bash-${partIndex}`,
                  toolName: "Bash",
                  state,
                  commandPreview,
                  input,
                  output,
                  error,
                  onClick: () => options.onNodeClick(message.id, partIndex),
                } as ToolCallNodeData,
              })

              // Connect detail node to consolidated node
              edges.push({
                id: `${toolNodeId}-${detailNodeId}`,
                source: toolNodeId,
                sourceHandle: "details",
                target: detailNodeId,
                style: {
                  stroke: state === "error" ? "#ef4444" : "#10b981",
                  strokeWidth: 1,
                },
              })

              detailY += Y_DETAIL_SPACING
              detailIndex++
            }
          }
        }

        branchY += Y_BRANCH_SPACING
        branchIndex++
      }

      // Add consolidated Thinking node if there were any
      if (thinkingCount > 0 && thinkingFirstPartIndex >= 0) {
        const toolNodeId = `tool-${message.id}-thinking`
        const isExpanded = options.expandedNodes?.has(toolNodeId) || false

        console.log("[message-transformer] Creating Thinking node:", {
          toolNodeId,
          thinkingCount,
          isExpanded,
          hasOnToggleExpansion: !!options.onToggleExpansion,
        })

        nodes.push({
          id: toolNodeId,
          type: "toolCall",
          position: { x: X_BRANCH, y: branchY },
          data: {
            toolCallId: "thinking",
            toolName: "Thinking",
            state: thinkingState,
            count: thinkingCount,
            isExpanded,
            // For single invocation: navigate directly. For multiple: no onClick (handled by onToggleExpansion)
            onClick: thinkingCount === 1
              ? () => options.onNodeClick(message.id, thinkingFirstPartIndex)
              : undefined,
            // For multiple invocations: provide expansion toggle
            onToggleExpansion: thinkingCount > 1 && options.onToggleExpansion
              ? () => {
                  console.log("[message-transformer] onToggleExpansion called for:", toolNodeId)
                  options.onToggleExpansion?.(toolNodeId)
                }
              : undefined,
          } as ToolCallNodeData,
        })

        // Connect thinking node to response node
        edges.push({
          id: `${responseNodeId}-${toolNodeId}`,
          source: responseNodeId,
          sourceHandle: "tools",
          target: toolNodeId,
          animated: thinkingState === "call",
          style: {
            stroke: thinkingState === "error" ? "#ef4444" : "#ec4899",
            strokeWidth: 1.5,
          },
        })

        // Create detail nodes if expanded
        if (isExpanded && thinkingCount > 1) {
          console.log("[message-transformer] Creating detail nodes for Thinking:", {
            toolNodeId,
            thinkingCount,
            partsLength: parts.length,
          })

          let detailY = branchY
          let detailIndex = 0

          for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (part.type === "tool-Thinking") {
              const detailNodeId = `detail-${message.id}-thinking-${partIndex}`
              const state = getToolState(part)

              // Extract input/output for detail display
              const input = part.input
              const output = part.output || part.result
              const error = part.error || part.errorText

              // Extract text preview from input
              const thinkingText = input?.text ? truncateText(input.text, 40) : undefined

              nodes.push({
                id: detailNodeId,
                type: "toolCall",
                position: { x: X_DETAIL, y: detailY },
                data: {
                  toolCallId: part.toolCallId || `thinking-${partIndex}`,
                  toolName: "Thinking",
                  state,
                  commandPreview: thinkingText,
                  input,
                  output,
                  error,
                  onClick: () => options.onNodeClick(message.id, partIndex),
                } as ToolCallNodeData,
              })

              // Connect detail node to consolidated node
              edges.push({
                id: `${toolNodeId}-${detailNodeId}`,
                source: toolNodeId,
                sourceHandle: "details",
                target: detailNodeId,
                style: {
                  stroke: state === "error" ? "#ef4444" : "#10b981",
                  strokeWidth: 1,
                },
              })

              detailY += Y_DETAIL_SPACING
              detailIndex++
            }
          }
        }

        branchY += Y_BRANCH_SPACING
        branchIndex++
      }

      // Add background task nodes
      for (const bgTask of backgroundTasks) {
        const toolNodeId = `bg-task-${message.id}-${bgTask.part.toolCallId || bgTask.partIndex}`
        const command = bgTask.part.input?.command || ""
        const description = bgTask.part.input?.description

        nodes.push({
          id: toolNodeId,
          type: "backgroundTask",
          position: { x: X_BRANCH, y: branchY },
          data: {
            taskId: bgTask.part.toolCallId || `task-${bgTask.partIndex}`,
            command: command,
            description: description,
            status: bgTask.status,
            onClick: () => options.onNodeClick(message.id, bgTask.partIndex),
          } as BackgroundTaskNodeData,
        })

        // Connect background task node to response node
        edges.push({
          id: `${responseNodeId}-${toolNodeId}`,
          source: responseNodeId,
          sourceHandle: "tools",
          target: toolNodeId,
          animated: bgTask.status === "running",
          style: {
            stroke:
              bgTask.status === "running"
                ? "#3b82f6" // blue
                : bgTask.status === "completed"
                  ? "#22c55e" // green
                  : bgTask.status === "failed"
                    ? "#ef4444" // red
                    : "#64748b", // slate
            strokeWidth: 1.5,
          },
        })

        branchY += Y_BRANCH_SPACING
        branchIndex++
      }

      // Advance main Y position - account for tool branches
      const extraHeight = branchIndex > 0 ? Math.max(0, (branchIndex - 1) * Y_BRANCH_SPACING) : 0
      currentMainY += Y_SPACING + extraHeight * 0.5
    }
  }

  return { nodes, edges }
}
