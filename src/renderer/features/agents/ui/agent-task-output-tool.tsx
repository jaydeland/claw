"use client"

import { memo, useState, useMemo } from "react"
import { Check, X, Clock } from "lucide-react"
import {
  IconSpinner,
  ExpandIcon,
  CollapseIcon,
} from "../../../components/ui/icons"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { cn } from "../../../lib/utils"

interface AgentTaskOutputToolProps {
  part: any
  messageId?: string
  partIndex?: number
  chatStatus?: string
}

// Limit output to first N lines
function limitLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  if (!text) return { text: "", truncated: false }
  const lines = text.split("\n")
  if (lines.length <= maxLines) {
    return { text, truncated: false }
  }
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true }
}

export const AgentTaskOutputTool = memo(function AgentTaskOutputTool({
  part,
  messageId,
  partIndex,
  chatStatus,
}: AgentTaskOutputToolProps) {
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const { isPending } = getToolStatus(part, chatStatus)

  const taskId = part.input?.task_id || part.input?.taskId || ""
  const output = part.output || part.result || {}

  // Extract status and output from result
  const taskStatus = output.status || "unknown"
  const stdout = output.stdout || output.output || ""
  const stderr = output.stderr || ""
  const exitCode = output.exit_code ?? output.exitCode

  // Determine success/error state
  const isRunning = taskStatus === "running"
  const isSuccess = taskStatus === "completed" && exitCode === 0
  const isError = taskStatus === "failed" || (exitCode !== undefined && exitCode !== 0)

  // Determine if we have any output
  const hasOutput = stdout || stderr

  // Limit output to 3 lines when collapsed
  const MAX_OUTPUT_LINES = 3
  const stdoutLimited = useMemo(() => limitLines(stdout, MAX_OUTPUT_LINES), [stdout])
  const stderrLimited = useMemo(() => limitLines(stderr, MAX_OUTPUT_LINES), [stderr])
  const hasMoreOutput = stdoutLimited.truncated || stderrLimited.truncated

  // Truncate task ID for display
  const displayTaskId = taskId.length > 20 ? taskId.slice(0, 20) + "..." : taskId

  // Check if input is still being streamed
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isInputStreaming = part.state === "input-streaming" && isActivelyStreaming

  // If input is still being generated, show loading state
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
                Checking task status
              </TextShimmer>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // If no task ID and not streaming, tool was interrupted
  if (!taskId) {
    return <AgentToolInterrupted toolName="TaskOutput" />
  }

  return (
    <div
      data-message-id={messageId}
      data-part-index={partIndex}
      data-part-type="tool-TaskOutput"
      className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2"
    >
      {/* Header - clickable to expand, fixed height to prevent layout shift */}
      <div
        onClick={() => hasMoreOutput && !isPending && setIsOutputExpanded(!isOutputExpanded)}
        className={cn(
          "flex items-center justify-between pl-2.5 pr-2 h-7",
          hasMoreOutput && !isPending && "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        )}
      >
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {isPending ? "Checking task: " : "Task status: "}
          {displayTaskId}
        </span>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Status - min-width ensures no layout shift */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[70px] justify-end">
            {isPending ? (
              <IconSpinner className="w-3 h-3" />
            ) : isRunning ? (
              <>
                <Clock className="w-3 h-3" />
                <span>Running</span>
              </>
            ) : isSuccess ? (
              <>
                <Check className="w-3 h-3" />
                <span>Completed</span>
              </>
            ) : isError ? (
              <>
                <X className="w-3 h-3" />
                <span>Failed</span>
              </>
            ) : (
              <span>Unknown</span>
            )}
          </div>

          {/* Expand/Collapse button - only show when not pending and has output that can be expanded */}
          {!isPending && hasOutput && hasMoreOutput && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsOutputExpanded(!isOutputExpanded)
              }}
              className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
            >
              {isOutputExpanded ? (
                <CollapseIcon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ExpandIcon className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content - always visible when there's output */}
      {hasOutput && (
        <div
          onClick={() =>
            hasMoreOutput && !isOutputExpanded && setIsOutputExpanded(true)
          }
          className={cn(
            "border-t border-border px-2.5 py-1.5 transition-colors duration-150",
            hasMoreOutput && !isOutputExpanded && "cursor-pointer hover:bg-muted/50",
          )}
        >
          {/* Task ID - show full ID */}
          <div className="font-mono text-xs mb-1">
            <span className="text-muted-foreground">Task: </span>
            <span className="text-foreground">{taskId}</span>
          </div>

          {/* Stdout - show limited lines when collapsed, full when expanded */}
          {stdout && (
            <div className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all">
              {isOutputExpanded ? stdout : stdoutLimited.text}
            </div>
          )}

          {/* Stderr - warning/error color based on exit code */}
          {stderr && (
            <div
              className={cn(
                "mt-1.5 font-mono text-xs whitespace-pre-wrap break-all",
                exitCode === 0 || exitCode === undefined
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-500 dark:text-rose-400",
              )}
            >
              {isOutputExpanded ? stderr : stderrLimited.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
