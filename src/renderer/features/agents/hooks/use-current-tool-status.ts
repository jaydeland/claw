import { useMemo } from "react"
import type { Message, MessagePart } from "../stores/message-store"

export interface CurrentToolStatus {
  toolType: string | null
  toolName: string | null
  statusText: string
}

/**
 * Get human-readable status text for a tool part
 */
function getToolStatusText(part: MessagePart): string {
  const toolType = part.type
  switch (toolType) {
    case "tool-Bash":
      return part.state === "input-streaming" ? "Generating command" : "Running command"
    case "tool-Read":
      return "Reading file"
    case "tool-Edit":
      return "Editing file"
    case "tool-Write":
      return "Writing file"
    case "tool-Grep":
      return "Searching code"
    case "tool-Glob":
      return "Finding files"
    case "tool-WebFetch":
      return "Fetching web page"
    case "tool-WebSearch":
      return "Searching web"
    case "tool-Task":
      return "Running agent"
    case "tool-Thinking":
      return "Thinking deeply"
    case "tool-TodoWrite":
      return "Updating tasks"
    case "tool-AskUserQuestion":
      return "Waiting for input"
    default:
      return "Working"
  }
}

/**
 * Hook to get the currently running tool status from messages
 * Returns null if no tool is currently running
 */
export function useCurrentToolStatus(
  messages: Message[],
  chatStatus: string
): CurrentToolStatus | null {
  return useMemo(() => {
    // Not streaming - no active tool
    if (!chatStatus || chatStatus === "ready") {
      return null
    }

    if (messages.length === 0) {
      return { toolType: null, toolName: null, statusText: "Thinking" }
    }

    // Find the last assistant message
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "assistant") {
      return { toolType: null, toolName: null, statusText: "Thinking" }
    }

    const parts = lastMessage.parts || []

    // Find most recent non-completed tool (search from end)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      if (!part || !part.type?.startsWith("tool-")) continue

      const isPending =
        part.state !== "output-available" &&
        part.state !== "output-error" &&
        part.state !== "result"

      if (isPending) {
        return {
          toolType: part.type,
          toolName: part.type.replace("tool-", ""),
          statusText: getToolStatusText(part),
        }
      }
    }

    // No tool running - just streaming text
    return { toolType: null, toolName: null, statusText: "Thinking" }
  }, [messages, chatStatus])
}
