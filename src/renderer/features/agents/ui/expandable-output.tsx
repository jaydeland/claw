"use client"

import { memo, useCallback, useMemo, useState, useEffect } from "react"
import { useSetAtom } from "jotai"
import { Maximize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  fileContentDialogOpenAtom,
  selectedFileContentAtom,
  type FileContentDialogData,
} from "../atoms"
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

// Helper: Count lines in content
export function countLines(content: string): number {
  return content.split("\n").length
}

// Helper: Limit content to first N lines
export function limitLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  if (!text) return { text: "", truncated: false }
  const lines = text.split("\n")
  if (lines.length <= maxLines) {
    return { text, truncated: false }
  }
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true }
}

// Props for single content expandable output
export interface ExpandableOutputProps {
  content: string
  language?: string
  icon?: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  tooltipContent?: string
  metadata?: string
  maxCollapsedLines?: number
  maxExpandedHeight?: number
  enableDialog?: boolean
  dialogTitle?: string
  dialogDisplayPath?: string
  isPending?: boolean
  isError?: boolean
  className?: string
  contentClassName?: string
}

export const ExpandableOutput = memo(function ExpandableOutput({
  content,
  language = 'plaintext',
  icon: Icon,
  title,
  subtitle,
  tooltipContent,
  metadata,
  maxCollapsedLines = 5,
  maxExpandedHeight = 300,
  enableDialog = true,
  dialogTitle,
  dialogDisplayPath,
  isPending = false,
  isError = false,
  className,
  contentClassName,
}: ExpandableOutputProps) {
  const setDialogOpen = useSetAtom(fileContentDialogOpenAtom)
  const setSelectedFile = useSetAtom(selectedFileContentAtom)
  const [isExpanded, setIsExpanded] = useState(false)
  const [highlightedCode, setHighlightedCode] = useState<string>("")
  const codeTheme = useCodeTheme()

  // Line count
  const lineCount = useMemo(() => countLines(content), [content])

  // Limit content to maxCollapsedLines when collapsed
  const { text: collapsedContent, truncated: hasMoreContent } = useMemo(
    () => limitLines(content, maxCollapsedLines),
    [content, maxCollapsedLines]
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
      filePath: dialogDisplayPath || dialogTitle || title,
      displayPath: dialogDisplayPath || dialogTitle || title,
      content,
      language,
    }
    setSelectedFile(fileData)
    setDialogOpen(true)
  }, [dialogDisplayPath, dialogTitle, title, content, language, setSelectedFile, setDialogOpen])

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
        "rounded-lg border border-border bg-muted/30 overflow-hidden mx-2",
        className
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
              {Icon && <Icon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />}
              <span className="text-xs font-medium text-foreground truncate">
                {title}
              </span>
              {subtitle && (
                <span className="text-xs text-muted-foreground truncate">
                  {subtitle}
                </span>
              )}
            </div>
          </TooltipTrigger>
          {tooltipContent && (
            <TooltipContent
              side="top"
              className="px-2 py-1.5 max-w-none flex items-center justify-center"
            >
              <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
                {tooltipContent}
              </span>
            </TooltipContent>
          )}
        </Tooltip>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Metadata (line count, bytes, etc) */}
          {metadata && (
            <span className="text-[10px] text-muted-foreground">
              {metadata}
            </span>
          )}

          {/* Open in dialog button */}
          {enableDialog && (
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
          )}

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
        style={{
          maxHeight: isExpanded ? `${maxExpandedHeight}px` : '120px',
        }}
        className={cn(
          "border-t border-border px-2.5 py-1.5 transition-colors duration-150",
          isExpanded ? "overflow-y-auto" : "overflow-hidden",
          !isExpanded && hasMoreContent && "cursor-pointer hover:bg-muted/50",
          contentClassName
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

// Props for split content expandable output (e.g., bash stdout/stderr)
export interface OutputSection {
  content: string
  language?: string
  label?: string
  className?: string
}

export interface ExpandableOutputSplitProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  tooltipContent?: string
  command?: string
  sections: OutputSection[]
  exitCode?: number
  maxCollapsedLines?: number
  maxExpandedHeight?: number
  enableDialog?: boolean
  isPending?: boolean
  isError?: boolean
  className?: string
}

export const ExpandableOutputSplit = memo(function ExpandableOutputSplit({
  icon: Icon,
  title,
  subtitle,
  tooltipContent,
  command,
  sections,
  exitCode,
  maxCollapsedLines = 3,
  maxExpandedHeight = 300,
  enableDialog = true,
  isPending = false,
  isError = false,
  className,
}: ExpandableOutputSplitProps) {
  const setDialogOpen = useSetAtom(fileContentDialogOpenAtom)
  const setSelectedFile = useSetAtom(selectedFileContentAtom)
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const [highlightedSections, setHighlightedSections] = useState<string[]>([])
  const codeTheme = useCodeTheme()

  // Check if any section has more content than collapsed view
  const sectionLimits = useMemo(() => {
    return sections.map(section => limitLines(section.content, maxCollapsedLines))
  }, [sections, maxCollapsedLines])

  const hasMoreOutput = sectionLimits.some(limit => limit.truncated)
  const hasOutput = sections.some(s => s.content)

  // Syntax highlight all sections
  useEffect(() => {
    let cancelled = false

    async function highlightAll() {
      try {
        const highlighted = await Promise.all(
          sections.map(async (section, idx) => {
            const content = isOutputExpanded
              ? section.content
              : sectionLimits[idx].text
            if (!content) return ""
            try {
              return await highlightCode(content, section.language || 'bash', codeTheme)
            } catch {
              return ""
            }
          })
        )
        if (!cancelled) {
          setHighlightedSections(highlighted)
        }
      } catch (error) {
        console.error("Failed to highlight sections:", error)
        if (!cancelled) {
          setHighlightedSections([])
        }
      }
    }

    const timer = setTimeout(highlightAll, 50)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sections, sectionLimits, isOutputExpanded, codeTheme])

  // Handle click to open dialog
  const handleOpenDialog = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // Combine all sections for dialog display
    const combinedContent = [
      command && `$ ${command}`,
      ...sections.map(s => s.label ? `[${s.label}]\n${s.content}` : s.content)
    ].filter(Boolean).join("\n\n")

    const fileData: FileContentDialogData = {
      filePath: "Command Output",
      displayPath: command || "Output",
      content: combinedContent,
      language: sections[0]?.language || 'bash',
    }
    setSelectedFile(fileData)
    setDialogOpen(true)
  }, [command, sections, setSelectedFile, setDialogOpen])

  // Toggle expand/collapse
  const handleToggleExpand = useCallback(() => {
    if (hasMoreOutput) {
      setIsOutputExpanded(prev => !prev)
    }
  }, [hasMoreOutput])

  // Click on content area to expand
  const handleContentClick = useCallback(() => {
    if (!isOutputExpanded && hasMoreOutput) {
      setIsOutputExpanded(true)
    }
  }, [isOutputExpanded, hasMoreOutput])

  if (!hasOutput) return null

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/30 overflow-hidden mx-2",
        className
      )}
    >
      {/* Header */}
      <div
        onClick={handleToggleExpand}
        className={cn(
          "flex items-center justify-between px-2.5 h-7",
          hasMoreOutput && "cursor-pointer hover:bg-muted/50 transition-colors duration-150"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {Icon && <Icon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />}
              <span className="text-xs font-medium text-foreground truncate">
                {title}
              </span>
              {subtitle && (
                <span className="text-xs text-muted-foreground truncate">
                  {subtitle}
                </span>
              )}
            </div>
          </TooltipTrigger>
          {tooltipContent && (
            <TooltipContent
              side="top"
              className="px-2 py-1.5 max-w-none flex items-center justify-center"
            >
              <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
                {tooltipContent}
              </span>
            </TooltipContent>
          )}
        </Tooltip>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Exit code display */}
          {exitCode !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              Exit: {exitCode}
            </span>
          )}

          {/* Open in dialog button */}
          {enableDialog && (
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
          )}

          {/* Expand/Collapse button */}
          {hasMoreOutput && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsOutputExpanded(prev => !prev)
              }}
              className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
            >
              <div className="relative w-4 h-4">
                <ExpandIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isOutputExpanded
                      ? "opacity-0 scale-75"
                      : "opacity-100 scale-100",
                  )}
                />
                <CollapseIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isOutputExpanded
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-75",
                  )}
                />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Command display (if provided) */}
      {command && (
        <div className="border-t border-border px-2.5 py-1.5 bg-muted/20">
          <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all">
            $ {command}
          </pre>
        </div>
      )}

      {/* Content sections */}
      <div
        onClick={handleContentClick}
        style={{
          maxHeight: isOutputExpanded ? `${maxExpandedHeight}px` : '120px',
        }}
        className={cn(
          "border-t border-border transition-colors duration-150",
          isOutputExpanded ? "overflow-y-auto" : "overflow-hidden",
          !isOutputExpanded && hasMoreOutput && "cursor-pointer hover:bg-muted/50"
        )}
      >
        {sections.map((section, idx) => {
          const displayContent = isOutputExpanded
            ? section.content
            : sectionLimits[idx].text

          return (
            <div key={idx} className={cn("px-2.5 py-1.5", section.className)}>
              {/* Section label */}
              {section.label && (
                <div className="text-[10px] text-muted-foreground mb-1">
                  {section.label}
                </div>
              )}

              {/* Section content */}
              {highlightedSections[idx] ? (
                <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                  <code
                    dangerouslySetInnerHTML={{ __html: highlightedSections[idx] }}
                    className="[&_.shiki]:bg-transparent [&_pre]:bg-transparent [&_code]:bg-transparent"
                  />
                </pre>
              ) : (
                <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                  {displayContent}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
