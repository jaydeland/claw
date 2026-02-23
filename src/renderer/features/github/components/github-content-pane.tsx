"use client"

import { memo } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { FileCode, GitPullRequest, CircleDot, GitBranch, Database, Layers, Wrench, Loader2, AlertCircle, MessageSquare, Sparkles } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { type GitHubSelection, type AnalysisType, githubStartChatAtom } from "../atoms"
import { VisualizeView } from "./visualize-view"
import { CodeBlock } from "../../agents/ui/code-block"

interface GitHubContentPaneProps {
  projectId: string
  projectPath: string
  selection: GitHubSelection
}

export const GitHubContentPane = memo(function GitHubContentPane({
  projectId,
  projectPath,
  selection,
}: GitHubContentPaneProps) {
  // Empty state
  if (!selection) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <GitBranch className="h-12 w-12 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">Select an item</h3>
        <p className="text-sm text-center">
          Choose a PR, Issue, Code file, or Visualize type from the tree to view details.
        </p>
      </div>
    )
  }

  // Render based on selection type
  switch (selection.type) {
    case "pr":
      return <PRDetailView prNumber={selection.prNumber} repoName={selection.repoName} />
    case "issue":
      return <IssueDetailView issueNumber={selection.issueNumber} repoName={selection.repoName} />
    case "code":
      return <CodeView path={selection.path} repoName={selection.repoName} projectPath={projectPath} />
    case "visualize":
      return (
        <VisualizeView
          projectId={projectId}
          projectPath={projectPath}
          analysisType={selection.analysisType}
          repoName={selection.repoName}
        />
      )
    default:
      return null
  }
})

// Placeholder components - will be implemented fully later

interface PRDetailViewProps {
  prNumber: number
  repoName: string
}

const PRDetailView = memo(function PRDetailView({ prNumber, repoName }: PRDetailViewProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-semibold">PR #{prNumber}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{repoName}</p>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">Pull request details will appear here</p>
          <p className="text-xs mt-1">Implement with gh CLI integration</p>
        </div>
      </div>
    </div>
  )
})

interface IssueDetailViewProps {
  issueNumber: number
  repoName: string
}

const IssueDetailView = memo(function IssueDetailView({ issueNumber, repoName }: IssueDetailViewProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <CircleDot className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-semibold">Issue #{issueNumber}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{repoName}</p>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">Issue details will appear here</p>
          <p className="text-xs mt-1">Implement with gh CLI integration</p>
        </div>
      </div>
    </div>
  )
})

interface CodeViewProps {
  path: string
  repoName: string
  projectPath: string
}

const CodeView = memo(function CodeView({ path, repoName, projectPath }: CodeViewProps) {
  // Fetch file content
  const { data, isLoading, error } = trpc.files.readProjectFile.useQuery(
    { projectPath, relativePath: path },
    { enabled: !!projectPath && !!path }
  )

  // Get file extension for icon color
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const iconColor = {
    ts: "text-blue-500",
    tsx: "text-blue-500",
    js: "text-yellow-500",
    jsx: "text-yellow-500",
    py: "text-green-500",
    go: "text-cyan-500",
    rs: "text-orange-500",
    rb: "text-red-500",
    java: "text-red-500",
    swift: "text-orange-500",
    kt: "text-purple-500",
    css: "text-pink-500",
    scss: "text-pink-500",
    html: "text-orange-500",
    json: "text-yellow-500",
    md: "text-gray-500",
  }[ext] || "text-muted-foreground"

  // Function to start explain chat
  const setStartChat = useSetAtom(githubStartChatAtom)

  const handleExplainCode = () => {
    setStartChat({
      message: `Explain this code file: ${path}\n\nFocus on:\n- What the code does\n- Key functions and their purposes\n- How it fits into the larger project`,
      type: "explain",
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className={cn("h-5 w-5", iconColor)} />
            <h2 className="text-lg font-semibold truncate">{path}</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExplainCode}
            className="flex items-center gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            Explain Code
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-sm text-muted-foreground">{repoName}</p>
          {data?.success && (
            <span className="text-xs text-muted-foreground">
              • {data.lineCount} lines • {formatBytes(data.sizeBytes)}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
            <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
            <p className="text-sm text-destructive">Failed to load file</p>
            <p className="text-xs mt-1">{error.message}</p>
          </div>
        ) : data?.success ? (
          <div className="p-4">
            <CodeBlock
              code={data.content}
              language={data.language}
              showLineNumbers={true}
              wrap={false}
              className="rounded-lg border border-border bg-muted/30"
            />
          </div>
        ) : data?.error ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
            <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
            <p className="text-sm text-destructive">Failed to load file</p>
            <p className="text-xs mt-1">{data.error}</p>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-sm">Select a file to view its content</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}