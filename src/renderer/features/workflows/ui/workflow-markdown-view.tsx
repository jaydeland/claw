"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { useAtomValue } from "jotai"
import { createHighlighter, type Highlighter } from "shiki"
import { selectedWorkflowNodeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import {
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Wrench,
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import { toast } from "sonner"
import { lintWorkflowFile, getLintStatusSummary, type LintResult, type LintDiagnostic } from "../lib/markdown-linter"
import { cn } from "../../../lib/utils"

/**
 * Markdown view for workflow files
 * Shows raw markdown content with syntax highlighting and inline linting
 */
export function WorkflowMarkdownView() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)
  const [lintExpanded, setLintExpanded] = useState(true)

  // Initialize Shiki highlighter
  useEffect(() => {
    let mounted = true

    async function initHighlighter() {
      try {
        const h = await createHighlighter({
          themes: ["dark-plus"],
          langs: ["markdown"],
        })

        if (mounted) {
          setHighlighter(h)
        }
      } catch (err) {
        console.error("[workflow-markdown] Failed to initialize Shiki:", err)
      }
    }

    initHighlighter()

    return () => {
      mounted = false
    }
  }, [])

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  // Fetch file content
  const { data: fileContent, isLoading, refetch: refetchContent } = trpc.workflows.readFileContent.useQuery(
    { path: selectedNode?.sourcePath || "" },
    { enabled: !!selectedNode?.sourcePath }
  )

  // Mutation to write file content
  const writeFileMutation = trpc.workflows.writeFileContent.useMutation({
    onSuccess: () => {
      // Refetch the file content after successful write
      refetchContent()
      // Invalidate workflow graph to refresh validation
      utils.workflows.getWorkflowGraph.invalidate()
      toast.success("Fix applied successfully")
    },
    onError: (error) => {
      toast.error(`Failed to apply fix: ${error.message}`)
    },
  })

  // Handler to apply a fix
  const handleApplyFix = useCallback(
    (diagnostic: LintDiagnostic) => {
      if (!diagnostic.fix || !fileContent || !selectedNode?.sourcePath) return

      try {
        const fixedContent = diagnostic.fix(fileContent)
        writeFileMutation.mutate({
          path: selectedNode.sourcePath,
          content: fixedContent,
        })
      } catch (err) {
        toast.error(`Failed to apply fix: ${err instanceof Error ? err.message : "Unknown error"}`)
      }
    },
    [fileContent, selectedNode?.sourcePath, writeFileMutation]
  )

  // Fetch workflow graph to get validation errors
  const { data: workflowGraph } = trpc.workflows.getWorkflowGraph.useQuery()

  // Get validation errors for this node (from backend)
  const validationErrors = useMemo(() => {
    if (!selectedNode || !workflowGraph) return []

    if (selectedNode.type === "agent") {
      const agent = workflowGraph.agents.find(a => a.id === selectedNode.id)
      return agent?.validationErrors || []
    }

    if (selectedNode.type === "command") {
      const command = workflowGraph.commands.find(c => c.id === selectedNode.id)
      return command?.validationErrors || []
    }

    if (selectedNode.type === "skill") {
      const skill = workflowGraph.skills.find(s => s.id === selectedNode.id)
      return skill?.validationErrors || []
    }

    return []
  }, [selectedNode, workflowGraph])

  // Run client-side linting
  const lintResult: LintResult | null = useMemo(() => {
    if (!fileContent || !selectedNode) return null

    // Determine the type for linting
    let type: "agent" | "command" | "skill" = "command"
    if (selectedNode.type === "agent") {
      type = "agent"
    } else if (selectedNode.type === "skill") {
      type = "skill"
    }

    return lintWorkflowFile(fileContent, type)
  }, [fileContent, selectedNode])

  // Get lint status summary
  const lintStatus = useMemo(() => {
    if (!lintResult) return null
    return getLintStatusSummary(lintResult)
  }, [lintResult])

  // Combine all diagnostics
  const allDiagnostics = useMemo(() => {
    const diagnostics: LintDiagnostic[] = []

    // Add backend validation errors
    for (const error of validationErrors) {
      diagnostics.push({
        severity: error.severity,
        field: error.field,
        message: error.message,
      })
    }

    // Add client-side lint results (deduped)
    if (lintResult) {
      const existingMessages = new Set(diagnostics.map(d => `${d.field}:${d.message}`))

      for (const error of lintResult.errors) {
        const key = `${error.field}:${error.message}`
        if (!existingMessages.has(key)) {
          diagnostics.push(error)
          existingMessages.add(key)
        }
      }

      for (const warning of lintResult.warnings) {
        const key = `${warning.field}:${warning.message}`
        if (!existingMessages.has(key)) {
          diagnostics.push(warning)
          existingMessages.add(key)
        }
      }

      for (const info of lintResult.info) {
        const key = `${info.field}:${info.message}`
        if (!existingMessages.has(key)) {
          diagnostics.push(info)
          existingMessages.add(key)
        }
      }
    }

    return diagnostics
  }, [validationErrors, lintResult])

  // Syntax highlighted markdown
  const highlightedHtml = useMemo(() => {
    if (!fileContent || !highlighter) return null

    try {
      return highlighter.codeToHtml(fileContent, {
        lang: "markdown",
        theme: "dark-plus",
      })
    } catch (err) {
      console.error("[workflow-markdown] Failed to highlight code:", err)
      return null
    }
  }, [fileContent, highlighter])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!fileContent) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Failed to load file</p>
      </div>
    )
  }

  const errorCount = allDiagnostics.filter(d => d.severity === "error").length
  const warningCount = allDiagnostics.filter(d => d.severity === "warning").length
  const infoCount = allDiagnostics.filter(d => d.severity === "info").length

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-4">
        {/* Lint Status Header */}
        {lintStatus && (
          <div
            className={cn(
              "flex items-center justify-between rounded-lg border px-4 py-2",
              lintStatus.status === "valid" && "bg-green-500/10 border-green-500/30",
              lintStatus.status === "warnings" && "bg-yellow-500/10 border-yellow-500/30",
              lintStatus.status === "errors" && "bg-red-500/10 border-red-500/30"
            )}
          >
            <div className="flex items-center gap-2">
              {lintStatus.status === "valid" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {lintStatus.status === "warnings" && (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              )}
              {lintStatus.status === "errors" && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <span
                className={cn(
                  "text-sm font-medium",
                  lintStatus.status === "valid" && "text-green-500",
                  lintStatus.status === "warnings" && "text-yellow-500",
                  lintStatus.status === "errors" && "text-red-500"
                )}
              >
                {lintStatus.text}
              </span>
              {(errorCount > 0 || warningCount > 0 || infoCount > 0) && (
                <span className="text-xs text-muted-foreground">
                  {errorCount > 0 && `${errorCount} error${errorCount !== 1 ? "s" : ""}`}
                  {errorCount > 0 && warningCount > 0 && ", "}
                  {warningCount > 0 && `${warningCount} warning${warningCount !== 1 ? "s" : ""}`}
                  {(errorCount > 0 || warningCount > 0) && infoCount > 0 && ", "}
                  {infoCount > 0 && `${infoCount} info`}
                </span>
              )}
            </div>
            {allDiagnostics.length > 0 && (
              <button
                onClick={() => setLintExpanded(!lintExpanded)}
                className="p-1 hover:bg-accent rounded transition-colors"
              >
                {lintExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Diagnostics List */}
        {lintExpanded && allDiagnostics.length > 0 && (
          <div className="space-y-2">
            {allDiagnostics.map((diagnostic, index) => (
              <DiagnosticItem
                key={index}
                diagnostic={diagnostic}
                onFix={diagnostic.fixable ? () => handleApplyFix(diagnostic) : undefined}
                isFixing={writeFileMutation.isPending}
              />
            ))}
          </div>
        )}

        {/* Syntax Highlighted Markdown Content */}
        <div className="border rounded-lg bg-[#1e1e1e] overflow-hidden">
          {highlightedHtml ? (
            <div
              className="shiki-container overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <pre className="p-4 overflow-x-auto text-xs font-mono text-gray-300">
              <code>{fileContent}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Individual diagnostic item component
 */
interface DiagnosticItemProps {
  diagnostic: LintDiagnostic
  onFix?: () => void
  isFixing?: boolean
}

function DiagnosticItem({ diagnostic, onFix, isFixing }: DiagnosticItemProps) {
  const [expanded, setExpanded] = useState(false)

  const icon = {
    error: <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />,
    info: <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />,
  }[diagnostic.severity]

  const bgColor = {
    error: "bg-red-500/10 border-red-500/30",
    warning: "bg-yellow-500/10 border-yellow-500/30",
    info: "bg-blue-500/10 border-blue-500/30",
  }[diagnostic.severity]

  const labelColor = {
    error: "text-red-500",
    warning: "text-yellow-500",
    info: "text-blue-500",
  }[diagnostic.severity]

  const handleClick = () => {
    if (diagnostic.suggestion) {
      setExpanded(!expanded)
    }
  }

  const handleFix = (e: React.MouseEvent) => {
    e.stopPropagation()
    onFix?.()
  }

  return (
    <div
      className={cn(
        "border rounded-lg p-3 flex items-start gap-3 transition-opacity",
        diagnostic.suggestion && "cursor-pointer hover:opacity-90",
        bgColor
      )}
      onClick={handleClick}
    >
      {icon}
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {diagnostic.field && (
            <span className="text-xs font-mono text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
              {diagnostic.field}
            </span>
          )}
          {diagnostic.line && (
            <span className="text-xs text-muted-foreground">
              Line {diagnostic.line}
            </span>
          )}
          <span className={cn("text-xs font-semibold uppercase", labelColor)}>
            {diagnostic.severity}
          </span>
        </div>
        <p className="text-sm">{diagnostic.message}</p>
        {diagnostic.suggestion && (
          <div className={cn("text-xs text-muted-foreground", expanded && "mt-2")}>
            {expanded ? (
              <div className="bg-background/50 rounded p-2 font-mono">
                Suggestion: {diagnostic.suggestion}
              </div>
            ) : (
              <span className="underline decoration-dotted">Click to see suggestion</span>
            )}
          </div>
        )}
      </div>
      {/* Fix button */}
      {onFix && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFix}
          disabled={isFixing}
          className="flex-shrink-0 h-7 px-2 gap-1.5 text-xs hover:bg-background/50"
        >
          <Wrench className="h-3.5 w-3.5" />
          {isFixing ? "Fixing..." : "Fix"}
        </Button>
      )}
    </div>
  )
}
