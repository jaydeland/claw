"use client"

import { memo } from "react"
import {
  GlobeIcon,
} from "../../../components/ui/icons"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { ExpandableOutput } from "./expandable-output"

// Detect content language for syntax highlighting
function detectContentLanguage(content: string): string {
  if (!content) return 'plaintext'
  const trimmed = content.trim()

  // Check for HTML
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return 'html'
  }

  // Check for markdown patterns
  if (/^#{1,6}\s/.test(trimmed) || /\[.*?\]\(.*?\)/.test(trimmed)) {
    return 'markdown'
  }

  // Check for XML
  if (trimmed.startsWith('<?xml')) {
    return 'xml'
  }

  // Check for JSON
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) &&
      (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // Not valid JSON
    }
  }

  return 'plaintext'
}

interface AgentWebFetchToolProps {
  part: any
  chatStatus?: string
}

export const AgentWebFetchTool = memo(function AgentWebFetchTool({
  part,
  chatStatus,
}: AgentWebFetchToolProps) {
  const { isPending, isError, isInterrupted } = getToolStatus(part, chatStatus)

  const url = part.input?.url || ""
  const result = part.output?.result || ""
  const bytes = part.output?.bytes || 0
  const statusCode = part.output?.code
  const isSuccess = statusCode === 200

  // Extract hostname for display
  let hostname = ""
  try {
    hostname = new URL(url).hostname.replace("www.", "")
  } catch {
    hostname = url.slice(0, 30)
  }

  // Format bytes
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Show interrupted state if fetch was interrupted without completing
  if (isInterrupted && !result) {
    return <AgentToolInterrupted toolName="Fetch" subtitle={hostname} />
  }

  // Build metadata string
  let metadata = formatBytes(bytes)
  if (statusCode) {
    metadata += ` · ${statusCode}`
  }

  // Build title with shimmer for pending state
  const titleComponent = isPending ? (
    <TextShimmer as="span" duration={1.2} className="text-xs">
      Fetching
    </TextShimmer>
  ) : (
    "Fetched"
  )

  // If no content yet (still pending), show a simplified view
  if (!result && isPending) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
        <div className="flex items-center gap-1.5 px-2.5 h-7">
          <GlobeIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
          {titleComponent}
          <span className="text-xs text-foreground truncate">{hostname}</span>
        </div>
      </div>
    )
  }

  if (!result) return null

  return (
    <ExpandableOutput
      content={result}
      language={detectContentLanguage(result)}
      icon={GlobeIcon}
      title={isPending ? "Fetching" : "Fetched"}
      subtitle={hostname}
      tooltipContent={url}
      metadata={metadata}
      dialogTitle={`Fetched: ${hostname}`}
      dialogDisplayPath={url}
      isPending={isPending}
      isError={isError || !isSuccess}
    />
  )
}, areToolPropsEqual)

