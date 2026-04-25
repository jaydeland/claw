"use client"

import { memo, useMemo } from "react"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolCall } from "./agent-tool-call"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { AgentFileContent } from "./agent-file-content"
import { EyeIcon } from "../../../components/ui/icons"

interface AgentReadToolProps {
  part: any
  chatStatus?: string
}

// Get clean display path (remove sandbox prefix)
function getDisplayPath(filePath: string): string {
  if (!filePath) return ""
  const prefixes = [
    "/project/sandbox/repo/",
    "/project/sandbox/",
    "/project/",
  ]
  for (const prefix of prefixes) {
    if (filePath.startsWith(prefix)) {
      return filePath.slice(prefix.length)
    }
  }
  if (filePath.startsWith("/")) {
    const parts = filePath.split("/")
    const rootIndicators = ["apps", "packages", "src", "lib", "components"]
    const rootIndex = parts.findIndex((p: string) =>
      rootIndicators.includes(p),
    )
    if (rootIndex > 0) {
      return parts.slice(rootIndex).join("/")
    }
  }
  return filePath
}

export const AgentReadTool = memo(function AgentReadTool({
  part,
  chatStatus,
}: AgentReadToolProps) {
  const { isPending, isInterrupted, isError } = getToolStatus(part, chatStatus)

  const filePath = part.input?.file_path || ""
  const filename = filePath ? filePath.split("/").pop() || "" : ""
  const displayPath = useMemo(() => getDisplayPath(filePath), [filePath])

  // Get content from output
  const content = part.output?.content || ""

  // Check if content is truncated (SDK sometimes indicates this)
  const isTruncated = part.output?.truncated === true

  // Get line range if provided
  const lineRange = useMemo(() => {
    const offset = part.input?.offset
    const limit = part.input?.limit
    if (offset !== undefined && limit !== undefined) {
      return { start: offset + 1, end: offset + limit }
    }
    return undefined
  }, [part.input?.offset, part.input?.limit])

  // Show interrupted state if applicable
  if (isInterrupted && !content) {
    return <AgentToolInterrupted toolName="Read" />
  }

  // If still pending or error without content, show the simple tool call
  if (isPending || isError || !content) {
    const title = isPending ? "Reading" : "Read"
    return (
      <AgentToolCall
        icon={EyeIcon}
        title={title}
        subtitle={filename}
        tooltipContent={displayPath}
        isPending={isPending}
        isError={isError}
      />
    )
  }

  // Show file content box with the content
  return (
    <AgentFileContent
      filePath={filePath}
      content={content}
      isTruncated={isTruncated}
      lineRange={lineRange}
    />
  )
})
