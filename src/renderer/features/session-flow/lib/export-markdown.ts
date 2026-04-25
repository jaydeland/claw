import type { Message } from "../../agents/stores/message-store"

/**
 * Export session flow as a structured Markdown document
 */
export function exportSessionFlowAsMarkdown(messages: Message[]): string {
  const lines: string[] = []

  lines.push("# Session Flow")
  lines.push("")
  lines.push(`Generated: ${new Date().toLocaleString()}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  let messageIndex = 1

  for (const message of messages) {
    if (message.role === "user") {
      lines.push(`## ${messageIndex}. User Message`)
      lines.push("")
      const text = getFirstTextContent(message.parts)
      lines.push(text || "_No text content_")
      lines.push("")
      messageIndex++
    } else if (message.role === "assistant") {
      lines.push(`## ${messageIndex}. Assistant Response`)
      lines.push("")

      // Extract text content
      const text = getFirstTextContent(message.parts)
      if (text) {
        lines.push(text)
        lines.push("")
      }

      // Extract token counts
      const metadata = message.metadata as { inputTokens?: number; outputTokens?: number } | undefined
      if (metadata?.inputTokens || metadata?.outputTokens) {
        lines.push(`**Tokens:** ${metadata.inputTokens || 0} in / ${metadata.outputTokens || 0} out`)
        lines.push("")
      }

      // List tool invocations
      const tools = extractToolInvocations(message.parts)
      if (tools.length > 0) {
        lines.push("### Tool Invocations")
        lines.push("")
        for (const tool of tools) {
          lines.push(`- **${tool.name}** (${tool.state})`)
          if (tool.count && tool.count > 1) {
            lines.push(`  - Invoked ${tool.count} times`)
          }
        }
        lines.push("")
      }

      messageIndex++
    }
  }

  return lines.join("\n")
}

/**
 * Get first text content from message parts
 */
function getFirstTextContent(parts: any[] | undefined): string {
  if (!parts) return ""
  const textPart = parts.find((p: any) => p.type === "text" && p.text?.trim())
  return textPart?.text || ""
}

/**
 * Extract tool invocations from message parts
 */
function extractToolInvocations(parts: any[] | undefined): Array<{
  name: string
  state: string
  count?: number
}> {
  if (!parts) return []

  const toolMap = new Map<string, { name: string; state: string; count: number }>()

  for (const part of parts) {
    if (part.type?.startsWith("tool-")) {
      const toolName = part.type.replace("tool-", "")
      const state = getToolState(part)

      if (toolMap.has(toolName)) {
        const existing = toolMap.get(toolName)!
        existing.count++
        // Update state priority: error > result > call
        if (state === "error") existing.state = "error"
        else if (state === "result" && existing.state !== "error") existing.state = "result"
      } else {
        toolMap.set(toolName, { name: toolName, state, count: 1 })
      }
    }
  }

  return Array.from(toolMap.values())
}

/**
 * Get tool state from part
 */
function getToolState(part: any): string {
  if (part.error || part.errorText) return "error"
  if (part.output !== undefined || part.result !== undefined) return "result"
  return "call"
}
