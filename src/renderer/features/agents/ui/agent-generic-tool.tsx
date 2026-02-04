"use client"

import { memo, useMemo } from "react"
import { AlertCircle, CheckCircle2, Terminal } from "lucide-react"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolCall } from "./agent-tool-call"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { ExpandableOutput } from "./expandable-output"

interface AgentGenericToolProps {
  part: any
  messageId?: string
  partIndex?: number
  chatStatus?: string
  icon?: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  tooltipContent?: string
}

// Helper: Detect if output contains an image file path
function detectImagePath(output: any): string | null {
  if (!output) return null

  // Check if output is a string that looks like an image path
  if (typeof output === 'string') {
    // Direct path check
    if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(output)) {
      return output
    }

    // Check if the string contains text mentioning a saved diagram path
    // Example: "The diagram is saved at:\n/path/to/file.png"
    const pathMatch = output.match(/(?:saved|generated|created|output|file).*?[:]\s*([^\s\n]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/i)
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1]
    }

    // Look for any file path in the string
    const filePathMatch = output.match(/([^\s\n]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/i)
    if (filePathMatch && filePathMatch[1]) {
      return filePathMatch[1]
    }
  }

  // Check if output has a common image path field
  if (typeof output === 'object') {
    const pathFields = ['path', 'file_path', 'filePath', 'image_path', 'imagePath', 'output_file', 'outputFile']
    for (const field of pathFields) {
      const value = output[field]
      if (typeof value === 'string' && /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(value)) {
        return value
      }
    }

    // Check for nested message/content fields
    if (output.message && typeof output.message === 'string') {
      return detectImagePath(output.message)
    }
    if (output.content && typeof output.content === 'string') {
      return detectImagePath(output.content)
    }
  }

  return null
}

// Helper: Convert file path to protocol for Electron
// In Electron, we can use the file:// protocol or atom:// protocol
function filePathToUrl(filePath: string): string {
  // If it's already a file:// URL, return as-is
  if (filePath.startsWith('file://')) {
    return filePath
  }

  // Convert absolute path to file:// URL
  // Ensure proper file:/// format (three slashes for absolute paths)
  if (filePath.startsWith('/')) {
    return `file://${filePath}`
  }

  // For Windows paths (C:\...), convert to file:///C:/...
  if (/^[A-Za-z]:/.test(filePath)) {
    return `file:///${filePath.replace(/\\/g, '/')}`
  }

  // If it doesn't start with /, assume it's already a relative or absolute path
  return `file://${filePath}`
}

// Helper: Format tool output for display
function formatToolOutput(output: any): string {
  if (!output) return "No output"

  if (typeof output === 'string') {
    return output
  }

  if (typeof output === 'object') {
    return JSON.stringify(output, null, 2)
  }

  return String(output)
}

export const AgentGenericTool = memo(function AgentGenericTool({
  part,
  messageId,
  partIndex,
  chatStatus,
  icon: Icon = Terminal,
  title,
  subtitle,
  tooltipContent,
}: AgentGenericToolProps) {
  const { isPending, isError, isInterrupted } = getToolStatus(part, chatStatus)

  const output = part.output
  const imagePath = useMemo(() => detectImagePath(output), [output])

  // If tool was interrupted, show interrupted state
  if (isInterrupted) {
    return <AgentToolInterrupted toolName={title} />
  }

  // If tool is still pending and has no output, just show the tool call
  if (isPending && !output) {
    return (
      <AgentToolCall
        icon={Icon}
        title={title}
        subtitle={subtitle}
        tooltipContent={tooltipContent}
        isPending={isPending}
        isError={isError}
      />
    )
  }

  // If there's an image path in the output, render it as an image
  if (imagePath) {
    const imageUrl = filePathToUrl(imagePath)
    const filename = imagePath.split('/').pop() || 'image'

    return (
      <div
        data-message-id={messageId}
        data-part-index={partIndex}
        data-part-type={part.type}
      >
        {/* Tool header */}
        <AgentToolCall
          icon={Icon}
          title={title}
          subtitle={subtitle || filename}
          tooltipContent={tooltipContent || imagePath}
          isPending={isPending}
          isError={isError}
        />

        {/* Image display */}
        <div className="mx-2 mt-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
          <div className="p-4 flex justify-center bg-background/50">
            <img
              src={imageUrl}
              alt={filename}
              className="max-w-full h-auto rounded"
              onError={(e) => {
                // If image fails to load, show the path as fallback
                console.error('Failed to load image:', imagePath)
                e.currentTarget.style.display = 'none'
                const parent = e.currentTarget.parentElement
                if (parent) {
                  parent.innerHTML = `<div class="text-sm text-destructive">Failed to load image: ${imagePath}</div>`
                }
              }}
            />
          </div>
          <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 border-t border-border font-mono truncate">
            {imagePath}
          </div>
        </div>
      </div>
    )
  }

  // If there's output but it's not an image, show it as expandable text
  if (output) {
    const formattedOutput = formatToolOutput(output)

    return (
      <div
        data-message-id={messageId}
        data-part-index={partIndex}
        data-part-type={part.type}
      >
        {/* Tool header */}
        <AgentToolCall
          icon={Icon}
          title={title}
          subtitle={subtitle}
          tooltipContent={tooltipContent}
          isPending={isPending}
          isError={isError}
        />

        {/* Output display */}
        <ExpandableOutput
          content={formattedOutput}
          language={typeof output === 'string' ? 'text' : 'json'}
          icon={isError ? AlertCircle : CheckCircle2}
          title="Output"
          maxCollapsedLines={5}
          isPending={isPending}
          isError={isError}
          enableDialog={false}
        />
      </div>
    )
  }

  // No output yet - just show the tool call
  return (
    <AgentToolCall
      icon={Icon}
      title={title}
      subtitle={subtitle}
      tooltipContent={tooltipContent}
      isPending={isPending}
      isError={isError}
    />
  )
}, areToolPropsEqual)
