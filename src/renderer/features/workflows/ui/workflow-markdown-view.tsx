"use client"

import { useMemo } from "react"
import { useAtomValue } from "jotai"
import matter from "gray-matter"
import { selectedWorkflowNodeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { Loader2 } from "lucide-react"

/**
 * Markdown view for workflow files
 * Shows frontmatter metadata and rendered markdown content
 */
export function WorkflowMarkdownView() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)

  // Fetch file content
  const { data: fileContent, isLoading } = trpc.workflows.readFileContent.useQuery(
    { path: selectedNode?.sourcePath || "" },
    { enabled: !!selectedNode?.sourcePath }
  )

  // Parse frontmatter and content
  const { frontmatter, content } = useMemo(() => {
    if (!fileContent) return { frontmatter: null, content: "" }

    try {
      const parsed = matter(fileContent)
      return {
        frontmatter: parsed.data,
        content: parsed.content,
      }
    } catch (error) {
      console.error("[workflow-markdown] Failed to parse frontmatter:", error)
      return { frontmatter: null, content: fileContent }
    }
  }, [fileContent])

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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Metadata Card */}
        {frontmatter && Object.keys(frontmatter).length > 0 && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <h3 className="text-sm font-semibold">Metadata</h3>
            <dl className="space-y-2 text-sm">
              {frontmatter.name && (
                <div>
                  <dt className="text-muted-foreground mb-1">Name</dt>
                  <dd className="font-medium">{frontmatter.name}</dd>
                </div>
              )}
              {frontmatter.description && (
                <div>
                  <dt className="text-muted-foreground mb-1">Description</dt>
                  <dd>{frontmatter.description}</dd>
                </div>
              )}
              {frontmatter.tools && (
                <div>
                  <dt className="text-muted-foreground mb-1">Tools</dt>
                  <dd className="font-mono text-xs">
                    {Array.isArray(frontmatter.tools)
                      ? frontmatter.tools.join(", ")
                      : frontmatter.tools}
                  </dd>
                </div>
              )}
              {frontmatter.model && (
                <div>
                  <dt className="text-muted-foreground mb-1">Model</dt>
                  <dd className="capitalize">{frontmatter.model}</dd>
                </div>
              )}
              {frontmatter.disallowedTools && (
                <div>
                  <dt className="text-muted-foreground mb-1">Disallowed Tools</dt>
                  <dd className="font-mono text-xs">
                    {Array.isArray(frontmatter.disallowedTools)
                      ? frontmatter.disallowedTools.join(", ")
                      : frontmatter.disallowedTools}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Markdown Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ChatMarkdownRenderer content={content} />
        </div>
      </div>
    </div>
  )
}
