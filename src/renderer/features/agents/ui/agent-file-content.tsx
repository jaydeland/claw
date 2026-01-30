"use client"

import { memo, useCallback, useMemo, useState, useEffect } from "react"
import { useSetAtom } from "jotai"
import { FileText, Maximize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  fileContentDialogOpenAtom,
  selectedFileContentAtom,
  type FileContentDialogData,
} from "../atoms"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import {
  ExpandIcon,
  CollapseIcon,
} from "../../../components/ui/icons"
import { useCodeTheme } from "../../../lib/hooks/use-code-theme"
import { highlightCode } from "../../../lib/themes/shiki-theme-loader"

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

// Get language from file path
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    sh: "bash",
    bash: "bash",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
    rb: "ruby",
  }
  return langMap[ext] || "plaintext"
}

// Count lines in content
function countLines(content: string): number {
  return content.split("\n").length
}

// Limit content to first N lines
function limitLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  if (!text) return { text: "", truncated: false }
  const lines = text.split("\n")
  if (lines.length <= maxLines) {
    return { text, truncated: false }
  }
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true }
}

interface AgentFileContentProps {
  filePath: string
  content: string
  /** Whether content is truncated */
  isTruncated?: boolean
  /** Optional line range info */
  lineRange?: { start: number; end: number }
}

export const AgentFileContent = memo(function AgentFileContent({
  filePath,
  content,
  isTruncated = false,
  lineRange,
}: AgentFileContentProps) {
  const setDialogOpen = useSetAtom(fileContentDialogOpenAtom)
  const setSelectedFile = useSetAtom(selectedFileContentAtom)
  const [isExpanded, setIsExpanded] = useState(false)
  const [highlightedCode, setHighlightedCode] = useState<string>("")
  const codeTheme = useCodeTheme()

  // Extract filename and display path
  const filename = useMemo(() => {
    return filePath.split("/").pop() || "file"
  }, [filePath])

  const displayPath = useMemo(() => {
    return getDisplayPath(filePath)
  }, [filePath])

  // Get file icon
  const FileIcon = useMemo(() => {
    return getFileIconByExtension(filename, true) || FileText
  }, [filename])

  // Get language for syntax highlighting
  const language = useMemo(() => {
    return getLanguageFromPath(filePath)
  }, [filePath])

  // Line count
  const lineCount = useMemo(() => {
    return countLines(content)
  }, [content])

  // Limit content to 5 lines when collapsed
  const MAX_COLLAPSED_LINES = 5
  const { text: collapsedContent, truncated: hasMoreContent } = useMemo(
    () => limitLines(content, MAX_COLLAPSED_LINES),
    [content]
  )

  // Display content based on expanded state
  const displayContent = isExpanded ? content : collapsedContent

  // Syntax highlight the display content
  useEffect(() => {
    let cancelled = false

    async function highlight() {
      try {
        const html = await highlightCode(displayContent, language, codeTheme)
        if (!cancelled) {
          setHighlightedCode(html)
        }
      } catch (error) {
        console.error("Failed to highlight code:", error)
        if (!cancelled) {
          setHighlightedCode("")
        }
      }
    }

    // Debounce highlighting slightly for better performance
    const timer = setTimeout(highlight, 50)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [displayContent, language, codeTheme])

  // Handle click to open dialog
  const handleOpenDialog = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const fileData: FileContentDialogData = {
      filePath,
      displayPath,
      content,
      language,
    }
    setSelectedFile(fileData)
    setDialogOpen(true)
  }, [filePath, displayPath, content, language, setSelectedFile, setDialogOpen])

  // Toggle expand/collapse
  const handleToggleExpand = useCallback(() => {
    if (hasMoreContent) {
      setIsExpanded(prev => !prev)
    }
  }, [hasMoreContent])

  // Click on content area to expand (when collapsed)
  const handleContentClick = useCallback(() => {
    if (!isExpanded && hasMoreContent) {
      setIsExpanded(true)
    }
  }, [isExpanded, hasMoreContent])

  if (!content) return null

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/30 overflow-hidden mx-2"
      )}
    >
      {/* Header */}
      <div
        onClick={handleToggleExpand}
        className={cn(
          "flex items-center justify-between px-2.5 h-7",
          hasMoreContent && "cursor-pointer hover:bg-muted/50 transition-colors duration-150"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <FileIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground truncate">
                {filename}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="px-2 py-1.5 max-w-none flex items-center justify-center"
          >
            <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
              {displayPath}
            </span>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Line info */}
          <span className="text-[10px] text-muted-foreground">
            {lineRange
              ? `Lines ${lineRange.start}-${lineRange.end}`
              : `${lineCount} lines`}
            {isTruncated && " (truncated)"}
          </span>

          {/* Open in dialog button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleOpenDialog}
                className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
              >
                <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="text-xs">Open in dialog</span>
            </TooltipContent>
          </Tooltip>

          {/* Expand/Collapse button - only show when has more content */}
          {hasMoreContent && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(prev => !prev)
              }}
              className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
            >
              <div className="relative w-4 h-4">
                <ExpandIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isExpanded
                      ? "opacity-0 scale-75"
                      : "opacity-100 scale-100",
                  )}
                />
                <CollapseIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isExpanded
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-75",
                  )}
                />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Content - inline expandable code view */}
      <div
        onClick={handleContentClick}
        className={cn(
          "border-t border-border px-2.5 py-1.5 transition-colors duration-150",
          isExpanded
            ? "max-h-[300px] overflow-y-auto"
            : "max-h-[120px] overflow-hidden",
          !isExpanded && hasMoreContent && "cursor-pointer hover:bg-muted/50",
        )}
      >
        {highlightedCode ? (
          <pre className="font-mono text-xs whitespace-pre-wrap break-all">
            <code
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
              className="[&_.shiki]:bg-transparent [&_pre]:bg-transparent [&_code]:bg-transparent"
            />
          </pre>
        ) : (
          <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all">
            {displayContent}
          </pre>
        )}
      </div>
    </div>
  )
})
