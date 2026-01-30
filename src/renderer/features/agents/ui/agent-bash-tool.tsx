"use client"

import { memo, useMemo } from "react"
import { Terminal } from "lucide-react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { ExpandableOutputSplit, type OutputSection } from "./expandable-output"

interface AgentBashToolProps {
  part: any
  messageId?: string
  partIndex?: number
  chatStatus?: string
}

// Extract command summary - first word of each command in a pipeline
function extractCommandSummary(command: string): string {
  // First, normalize line continuations (backslash + newline) into single line
  const normalizedCommand = command.replace(/\\\s*\n\s*/g, " ")
  const parts = normalizedCommand.split(/\s*(?:&&|\|\||;|\|)\s*/)
  const firstWords = parts.map((p) => p.trim().split(/\s+/)[0]).filter(Boolean)
  // Limit to first 4 commands to keep it concise
  const limited = firstWords.slice(0, 4)
  if (firstWords.length > 4) {
    return limited.join(", ") + "..."
  }
  return limited.join(", ")
}

export const AgentBashTool = memo(function AgentBashTool({
  part,
  messageId,
  partIndex,
  chatStatus,
}: AgentBashToolProps) {
  const { isPending } = getToolStatus(part, chatStatus)

  const command = part.input?.command || ""
  const stdout = part.output?.stdout || part.output?.output || ""
  const stderr = part.output?.stderr || ""
  const exitCode = part.output?.exitCode ?? part.output?.exit_code

  // For bash tools, success/error is determined by exitCode, not by state
  // exitCode 0 = success, anything else (or undefined if no output yet) = error
  const isError = exitCode !== undefined && exitCode !== 0

  // Memoize command summary to avoid recalculation on every render
  const commandSummary = useMemo(
    () => extractCommandSummary(command),
    [command],
  )

  // Check if command input is still being streamed
  // Only consider streaming if chat is actively streaming (prevents hang on stop)
  // Include "submitted" status - this is when request was sent but streaming hasn't started yet
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isInputStreaming = part.state === "input-streaming" && isActivelyStreaming

  // If command is still being generated (input-streaming state), show loading state
  if (isInputStreaming) {
    return (
      <div className="flex items-start gap-1.5 rounded-md py-0.5 px-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              <TextShimmer
                as="span"
                duration={1.2}
                className="inline-flex items-center text-xs leading-none h-4 m-0"
              >
                Generating command
              </TextShimmer>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // If no command and not streaming, tool was interrupted
  if (!command) {
    return <AgentToolInterrupted toolName="Command" />
  }

  // Build sections for split output
  const sections: OutputSection[] = []

  if (stdout) {
    sections.push({
      content: stdout,
      language: 'bash',
      label: stderr ? 'stdout' : undefined, // Only label if both stdout and stderr exist
    })
  }

  if (stderr) {
    sections.push({
      content: stderr,
      language: 'bash',
      label: 'stderr',
      // Warning color for exit 0, error color for non-zero
      className: exitCode === 0 || exitCode === undefined
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-500 dark:text-rose-400",
    })
  }

  // If no output yet, return null (command still running)
  if (sections.length === 0) {
    return null
  }

  return (
    <div
      data-message-id={messageId}
      data-part-index={partIndex}
      data-part-type="tool-Bash"
    >
      <ExpandableOutputSplit
        icon={Terminal}
        title={isPending ? "Running command" : "Ran command"}
        subtitle={commandSummary}
        tooltipContent={command}
        command={command}
        sections={sections}
        exitCode={exitCode}
        maxCollapsedLines={3}
        isPending={isPending}
        isError={isError}
      />
    </div>
  )
}, areToolPropsEqual)
