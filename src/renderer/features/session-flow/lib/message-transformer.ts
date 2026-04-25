import type { Node, Edge } from "reactflow"
import type { Message, MessagePart } from "../../agents/stores/message-store"
import type {
  UserMessageNodeData,
  AssistantResponseNodeData,
  ToolCallNodeData,
  AgentSpawnNodeData,
  BackgroundTaskNodeData,
  TeamGroupNodeData,
} from "../components/session-flow-nodes"

// Layout constants
const X_MAIN = 80 // Main chain x position
const X_BRANCH = 320 // Branch x position (tools to right) - increased spacing
const X_DETAIL = 500 // Detail nodes x position (expanded invocations)
const Y_SPACING = 80 // Vertical spacing between main nodes - increased for better separation
const Y_BRANCH_SPACING = 50 // Vertical spacing for branch nodes - increased
const Y_DETAIL_SPACING = 45 // Vertical spacing for detail nodes

// Tools that get their own node (not consolidated with others)
// These are significant enough to always show individually
const INDIVIDUAL_TOOLS = new Set([
  "Task",              // Agent spawns (sub-agents) - always individual
  "AskUserQuestion",   // Questions to user - always individual
])

// Tools to completely hide from the flow chart (internal/noise)
const HIDDEN_TOOLS = new Set([
  "TodoWrite",         // Internal task tracking - shown in todos panel instead
])

interface TransformOptions {
  onNodeClick: (messageId: string, partIndex?: number) => void
  expandedNodes?: Set<string>
  onToggleExpansion?: (nodeId: string) => void
  // Optional: nested tools data for sub-agents (keyed by agentId)
  nestedToolsMap?: Map<string, { toolName: string; status: "pending" | "completed" | "error"; input?: any; output?: any }>
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
    // Regular tools: type is "tool-{toolName}" (e.g., "tool-Bash", "tool-Read")
    if (p.type?.startsWith("tool-")) {
      const toolName = p.type.replace("tool-", "")
      return !HIDDEN_TOOLS.has(toolName)
    }
    // MCP tools: type is "mcp__servername__toolname"
    if (p.type?.startsWith("mcp__")) {
      return true
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
 * Check if a tool type represents an MCP tool
 * MCP tools use format: mcp__servername__toolname (in tool names)
 * Regular tools use format: tool-ToolName (in part types)
 * Part types are prefixed with "tool-", so MCP tools become: tool-mcp__servername__toolname
 */
function isMcpTool(partType: string | undefined): boolean {
  if (!partType) return false
  // Handle both formats: "mcp__server__tool" and "tool-mcp__server__tool"
  return partType.startsWith("mcp__") || partType.startsWith("tool-mcp__")
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

  // Add session start marker at the beginning
  if (messages.length > 0) {
    const firstMessage = messages[0]
    const sessionStartNodeId = `session-start`

    nodes.push({
      id: sessionStartNodeId,
      type: "userMessage",
      position: { x: X_MAIN, y: currentMainY },
      data: {
        id: "session-start",
        text: "Session Start",
        onClick: () => {},
      } as UserMessageNodeData,
      style: { background: "linear-gradient(to right, #10b981, #059669)", border: "2px solid #047857" },
    })

    lastMainNodeId = sessionStartNodeId
    currentMainY += Y_SPACING
  }

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
      // Extract token data and team mode from message metadata (flat structure from transform.ts)
      const metadata = message.metadata as { inputTokens?: number; outputTokens?: number; isTeamMode?: boolean } | undefined

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

      // Track background tasks separately (Bash with run_in_background: true)
      const backgroundTasks: Array<{
        partIndex: number
        part: MessagePart
        status: "running" | "completed" | "failed" | "unknown"
      }> = []

      // Track individual tools (Task, AskUserQuestion)
      const individualTools: Array<{
        partIndex: number
        part: MessagePart
        toolName: string
      }> = []

      // Track consolidated tools by name
      // Map<toolName, { parts: MessagePart[], partIndices: number[], state: "call" | "result" | "error" | "partial-error", errorCount: number, resultCount: number }>
      const consolidatedTools = new Map<string, {
        parts: MessagePart[]
        partIndices: number[]
        state: "call" | "result" | "error" | "partial-error"
        errorCount: number
        resultCount: number
      }>()

      // First pass: categorize all tools
      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex]

        // Extract tool name from either regular or MCP tool format
        let toolName: string | null = null
        if (part.type?.startsWith("tool-")) {
          toolName = part.type.replace("tool-", "")
        } else if (part.type?.startsWith("mcp__")) {
          // MCP format: mcp__servername__toolname -> extract toolname
          toolName = part.type.split("__").pop() || part.type
        }

        if (toolName) {
          // Skip hidden tools
          if (HIDDEN_TOOLS.has(toolName)) continue

          // Handle Bash with run_in_background separately
          if (toolName === "Bash" && part.input?.run_in_background === true) {
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
            continue
          }

          // Individual tools get their own nodes
          if (INDIVIDUAL_TOOLS.has(toolName)) {
            individualTools.push({ partIndex, part, toolName })
            continue
          }

          // All other tools get consolidated by name
          if (!consolidatedTools.has(toolName)) {
            consolidatedTools.set(toolName, { parts: [], partIndices: [], state: "call", errorCount: 0, resultCount: 0 })
          }
          const group = consolidatedTools.get(toolName)!
          group.parts.push(part)
          group.partIndices.push(partIndex)

          // Track state counts for determining overall state
          const state = getToolState(part)
          if (state === "error") group.errorCount++
          else if (state === "result") group.resultCount++
        }
      }

      // Second pass (part 1): determine final state for consolidated tools
      for (const [toolName, group] of consolidatedTools) {
        const totalCount = group.parts.length
        if (group.errorCount > 0 && group.resultCount > 0) {
          // Mixed results: some failed, some succeeded = partial error (orange)
          group.state = "partial-error"
        } else if (group.errorCount === totalCount) {
          // All failed = complete error (red)
          group.state = "error"
        } else if (group.resultCount > 0) {
          // At least one succeeded and no errors = success (green)
          group.state = "result"
        }
        // else: state remains "call" (all are still pending)
      }

      // Second pass (part 2): create nodes for individual tools
      // Separate Task tools from other individual tools for team grouping
      const taskTools = individualTools.filter((t) => t.toolName === "Task")
      const otherIndividualTools = individualTools.filter((t) => t.toolName !== "Task")

      // Group Task tools into team when in team mode (via metadata) and has multiple tasks
      // This properly distinguishes team mode parallel agents from regular sub-agents
      if (metadata?.isTeamMode && taskTools.length >= 2) {
        // Create a team group node containing all Task agents
        const teamNodeId = `team-${message.id}`
        const agents = taskTools.map(({ partIndex, part }) => {
          const state = getToolState(part)
          return {
            agentId: part.toolCallId || "",
            description: truncateText(part.input?.description || part.input?.prompt, 20),
            status: state === "error" ? "error" : state === "result" ? "completed" : "running",
            partIndex,
          }
        })

        // Calculate height based on number of agents (each agent row ~24px + header ~28px + padding ~8px)
        const teamNodeHeight = 28 + (agents.length * 24) + 8

        nodes.push({
          id: teamNodeId,
          type: "teamGroup",
          position: { x: X_BRANCH, y: branchY },
          data: {
            agents,
            messageId: message.id,
            onAgentClick: (partIndex: number) => options.onNodeClick(message.id, partIndex),
          } as TeamGroupNodeData,
        })

        // Connect team to response node
        const hasAnyRunning = agents.some((a) => a.status === "running")
        edges.push({
          id: `${responseNodeId}-${teamNodeId}`,
          source: responseNodeId,
          sourceHandle: "tools",
          target: teamNodeId,
          animated: hasAnyRunning,
          style: {
            stroke: "#a855f7", // purple for team
            strokeWidth: 2,
          },
        })

        // Adjust branchY based on team node height
        branchY += Math.max(Y_BRANCH_SPACING, teamNodeHeight)
        branchIndex++
      } else {
        // Single Task or no Tasks - render individually
        for (const { partIndex, part, toolName } of taskTools) {
          const toolNodeId = `tool-${message.id}-${part.toolCallId || partIndex}`
          const state = getToolState(part)
          const agentId = part.toolCallId || ""
          // Get nested tools count for this sub-agent
          const nestedTools = options.nestedToolsMap?.get(agentId)
          const nestedToolsCount = nestedTools?.length ?? 0

          nodes.push({
            id: toolNodeId,
            type: "agentSpawn",
            position: { x: X_BRANCH, y: branchY },
            data: {
              agentId,
              description: truncateText(part.input?.description || part.input?.prompt, 20),
              status: state === "error" ? "error" : state === "result" ? "completed" : "running",
              onClick: () => options.onNodeClick(message.id, partIndex),
              nestedToolsCount,
            } as AgentSpawnNodeData,
          })

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

      // Process other individual tools (AskUserQuestion, etc.)
      for (const { partIndex, part, toolName } of otherIndividualTools) {
        const toolNodeId = `tool-${message.id}-${part.toolCallId || partIndex}`
        const state = getToolState(part)

        nodes.push({
          id: toolNodeId,
          type: "toolCall",
          position: { x: X_BRANCH, y: branchY },
          data: {
            toolCallId: part.toolCallId || "",
            toolName,
            state,
            isMcpTool: isMcpTool(part.type),
            onClick: () => options.onNodeClick(message.id, partIndex),
          } as ToolCallNodeData,
        })

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

      // Third pass: create consolidated nodes for grouped tools
      for (const [toolName, group] of consolidatedTools) {
        const toolNodeId = `tool-${message.id}-${toolName.toLowerCase()}`
        const isExpanded = options.expandedNodes?.has(toolNodeId) || false
        const count = group.parts.length
        const firstPartIndex = group.partIndices[0]

        nodes.push({
          id: toolNodeId,
          type: "toolCall",
          position: { x: X_BRANCH, y: branchY },
          data: {
            toolCallId: toolName.toLowerCase(),
            toolName,
            state: group.state,
            isMcpTool: isMcpTool(group.parts[0]?.type),
            count,
            isExpanded,
            // For single invocation: navigate directly. For multiple: no onClick (handled by onToggleExpansion)
            onClick: count === 1
              ? () => options.onNodeClick(message.id, firstPartIndex)
              : undefined,
            // For multiple invocations: provide expansion toggle
            onToggleExpansion: count > 1 && options.onToggleExpansion
              ? () => options.onToggleExpansion?.(toolNodeId)
              : undefined,
          } as ToolCallNodeData,
        })

        // Connect to response node
        edges.push({
          id: `${responseNodeId}-${toolNodeId}`,
          source: responseNodeId,
          sourceHandle: "tools",
          target: toolNodeId,
          animated: group.state === "call",
          style: {
            stroke: group.state === "error" ? "#ef4444" : "#ec4899",
            strokeWidth: 1.5,
          },
        })

        // Create detail nodes if expanded
        if (isExpanded && count > 1) {
          let detailY = branchY

          for (let i = 0; i < group.parts.length; i++) {
            const part = group.parts[i]
            const partIndex = group.partIndices[i]
            const detailNodeId = `detail-${message.id}-${toolName.toLowerCase()}-${partIndex}`
            const state = getToolState(part)

            // Extract input/output for detail display
            const input = part.input
            const output = part.output || part.result
            const error = part.error || part.errorText

            // Get a preview based on tool type
            let commandPreview: string | undefined
            if (toolName === "Bash" && input?.command) {
              commandPreview = truncateText(input.command, 30)
            } else if (toolName === "Thinking" && input?.text) {
              commandPreview = truncateText(input.text, 30)
            } else if (toolName === "Read" && input?.file_path) {
              commandPreview = truncateText(input.file_path, 30)
            } else if (toolName === "Edit" && input?.file_path) {
              commandPreview = truncateText(input.file_path, 30)
            } else if (toolName === "Write" && input?.file_path) {
              commandPreview = truncateText(input.file_path, 30)
            } else if (toolName === "Glob" && input?.pattern) {
              commandPreview = truncateText(input.pattern, 30)
            } else if (toolName === "Grep" && input?.pattern) {
              commandPreview = truncateText(input.pattern, 30)
            } else if ((toolName === "WebSearch" || toolName === "WebFetch") && input?.url) {
              commandPreview = truncateText(input.url, 30)
            } else if (input) {
              // Generic preview: show first string value from input
              const firstValue = Object.values(input).find(v => typeof v === "string")
              if (firstValue) commandPreview = truncateText(firstValue as string, 30)
            }

            nodes.push({
              id: detailNodeId,
              type: "toolCall",
              position: { x: X_DETAIL, y: detailY },
              data: {
                toolCallId: part.toolCallId || `${toolName.toLowerCase()}-${partIndex}`,
                toolName,
                state,
                isMcpTool: isMcpTool(part.type),
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
          }
        }

        branchY += Y_BRANCH_SPACING
        branchIndex++
      }

      // Fourth pass: add background task nodes
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
