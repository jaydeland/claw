"use client"

import { memo, useState, useEffect, useRef } from "react"
import { ChevronRight, Brain } from "lucide-react"
import { cn } from "../../../lib/utils"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"

interface ThinkingToolPart {
  type: string
  state: string
  input?: {
    text?: string
  }
  output?: {
    completed?: boolean
  }
}

interface AgentThinkingToolProps {
  part: ThinkingToolPart
  chatStatus?: string
}

// Constants for thinking preview and scrolling
const PREVIEW_LENGTH = 60
const SCROLL_THRESHOLD = 500

export const AgentThinkingTool = memo(function AgentThinkingTool({
  part,
  chatStatus,
}: AgentThinkingToolProps) {
  const isPending =
    part.state !== "output-available" && part.state !== "output-error"
  // Include "submitted" status - this is when request was sent but streaming hasn't started yet
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isStreaming = isPending && isActivelyStreaming
  const isInterrupted = isPending && !isActivelyStreaming && chatStatus !== undefined

  // Default: expanded by default (was: only while streaming)
  const [isExpanded, setIsExpanded] = useState(true)
  const wasStreamingRef = useRef(isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-collapse when streaming ends (transition from true -> false) - disabled to keep expanded
  // Note: User can still manually collapse
  useEffect(() => {
    // Intentionally not auto-collapsing anymore - content stays expanded by default
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [part.input?.text, isStreaming, isExpanded])

  // Get thinking text
  const thinkingText = part.input?.text || ""

  // Build preview for collapsed state
  const previewText = thinkingText.slice(0, PREVIEW_LENGTH).replace(/\n/g, " ")

  // Show interrupted state if thinking was interrupted without completing
  if (isInterrupted && !thinkingText) {
    return <AgentToolInterrupted toolName="Thinking" />
  }

  return (
    <div className="rounded-lg border border-border/50 bg-accent/30 overflow-hidden my-1.5">
      {/* Header - clickable to toggle, with themed background */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex items-center justify-between py-1.5 px-3 cursor-pointer hover:bg-accent/50 transition-colors duration-150 border-b border-border/30"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Icon with theme-based color */}
          <Brain className={cn(
            "w-3.5 h-3.5 flex-shrink-0 transition-colors duration-200",
            isStreaming ? "text-primary animate-pulse" : "text-primary/70"
          )} />
          <div className="text-xs flex items-center gap-1.5 min-w-0">
            <span className={cn(
              "font-medium whitespace-nowrap flex-shrink-0",
              isStreaming ? "text-primary" : "text-foreground"
            )}>
              {isStreaming ? "Thinking" : "Thought"}
            </span>
            {/* Preview text when collapsed */}
            {!isExpanded && previewText && (
              <span className="text-muted-foreground/70 truncate">
                {previewText}...
              </span>
            )}
          </div>
        </div>
        {/* Chevron - rotates when expanded */}
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out flex-shrink-0",
            isExpanded && "rotate-90",
          )}
        />
      </div>

      {/* Thinking content - only show when expanded */}
      {isExpanded && thinkingText && (
        <div className="relative bg-card/30">
          {/* Top gradient fade when streaming and has lots of content */}
          {isStreaming && thinkingText.length > SCROLL_THRESHOLD && (
            <div className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-background/70 to-transparent z-10 pointer-events-none" />
          )}

          {/* Scrollable container */}
          <div
            ref={scrollRef}
            className={cn(
              "px-3 py-2",
              isStreaming &&
                thinkingText.length > SCROLL_THRESHOLD &&
                "overflow-y-auto scrollbar-none max-h-24",
            )}
          >
            {/* Markdown content with subtle theme integration */}
            <ChatMarkdownRenderer
              content={thinkingText}
              size="sm"
              className="text-foreground/80"
            />
            {/* Blinking cursor when streaming */}
            {isStreaming && (
              <span className="inline-block w-1 h-3 bg-primary/50 ml-0.5 animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
