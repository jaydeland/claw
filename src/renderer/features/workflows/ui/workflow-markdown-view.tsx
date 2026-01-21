"use client"

import { useMemo, useState, useEffect } from "react"
import { useAtomValue } from "jotai"
import { createHighlighter, type Highlighter } from "shiki"
import { selectedWorkflowNodeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import { Loader2, AlertTriangle, AlertCircle } from "lucide-react"

/**
 * Markdown view for workflow files
 * Shows raw markdown content with syntax highlighting
 */
export function WorkflowMarkdownView() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)

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

  // Fetch file content
  const { data: fileContent, isLoading } = trpc.workflows.readFileContent.useQuery(
    { path: selectedNode?.sourcePath || "" },
    { enabled: !!selectedNode?.sourcePath }
  )

  // Fetch workflow graph to get validation errors
  const { data: workflowGraph } = trpc.workflows.getWorkflowGraph.useQuery()

  // Get validation errors for this node
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-4">
        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="space-y-2">
            {validationErrors.map((error, index) => (
              <div
                key={index}
                className={`border rounded-lg p-3 flex items-start gap-3 ${
                  error.severity === "error"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-yellow-500/10 border-yellow-500/30"
                }`}
              >
                {error.severity === "error" ? (
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {error.field}
                    </span>
                    <span
                      className={`text-xs font-semibold uppercase ${
                        error.severity === "error" ? "text-red-500" : "text-yellow-500"
                      }`}
                    >
                      {error.severity}
                    </span>
                  </div>
                  <p className="text-sm">{error.message}</p>
                </div>
              </div>
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
