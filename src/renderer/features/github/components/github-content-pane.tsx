"use client"

import { memo, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { FileCode, GitPullRequest, CircleDot, GitBranch, Loader2, AlertCircle, Sparkles, GitCommit, MessageSquare, Plus, Minus, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { type GitHubSelection, type AnalysisType, githubStartChatAtom } from "../atoms"
import { VisualizeView } from "./visualize-view"
import { CodeBlock } from "../../agents/ui/code-block"
import { MemoizedMarkdown } from "../../../components/chat-markdown-renderer"

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
      return <PRDetailView prNumber={selection.prNumber} repoName={selection.repoName} projectPath={projectPath} />
    case "issue":
      return <IssueDetailView issueNumber={selection.issueNumber} repoName={selection.repoName} projectPath={projectPath} />
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

interface PRDetailViewProps {
  prNumber: number
  repoName: string
  projectPath: string
}

const PRDetailView = memo(function PRDetailView({ prNumber, repoName, projectPath }: PRDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"description" | "files" | "commits" | "comments">("description")
  const { data, isLoading, error } = trpc.github.getPRDetail.useQuery(
    { projectPath, prNumber },
    { enabled: !!projectPath }
  )

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error || !data?.success) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
        <p className="text-sm text-destructive">Failed to load PR</p>
        <p className="text-xs mt-1">{error?.message || (data as any)?.error}</p>
      </div>
    )
  }

  const pr = data.pr
  const stateColor = pr.state === "OPEN" ? "text-green-500 bg-green-500/10" : pr.state === "MERGED" ? "text-purple-500 bg-purple-500/10" : "text-red-500 bg-red-500/10"

  const tabs = [
    { id: "description" as const, label: "Description" },
    { id: "files" as const, label: `Files (${pr.files.length})` },
    { id: "commits" as const, label: `Commits (${pr.commits.length})` },
    { id: "comments" as const, label: `Comments (${pr.comments.length})` },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar — the only top-level chrome */}
      <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "description" && (
          <div className="p-4 space-y-4">
            {/* Title + state */}
            <div className="flex items-start gap-2">
              <GitPullRequest className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold">{pr.title}</h2>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", stateColor)}>
                    {pr.draft ? "Draft" : pr.state.charAt(0) + pr.state.slice(1).toLowerCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>#{pr.number} by <span className="font-medium text-foreground">{pr.author}</span></span>
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {pr.headBranch} → {pr.baseBranch}
                  </span>
                  <span className="flex items-center gap-1">
                    <Plus className="h-3 w-3 text-green-500" />{pr.additions}
                    <Minus className="h-3 w-3 text-red-500 ml-1" />{pr.deletions}
                    <span className="ml-1">{pr.changedFiles} files</span>
                  </span>
                </div>
                {pr.labels.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {pr.labels.map((label) => (
                      <span key={label} className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border">{label}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Body */}
            {pr.body ? (
              <div className="border border-border rounded-md px-4 py-3">
                <MemoizedMarkdown content={pr.body} id={`pr-${pr.number}-body`} size="sm" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No description provided.</p>
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="divide-y divide-border">
            {pr.files.map((file) => (
              <div key={file.path} className="px-4 py-2 flex items-center gap-3">
                <span className={cn(
                  "text-xs font-mono w-4 text-center",
                  file.changeType === "added" ? "text-green-500" :
                  file.changeType === "deleted" ? "text-red-500" : "text-yellow-500"
                )}>
                  {file.changeType === "added" ? "A" : file.changeType === "deleted" ? "D" : "M"}
                </span>
                <span className="text-xs font-mono flex-1 truncate">{file.path}</span>
                <span className="text-xs text-green-500 font-mono">+{file.additions}</span>
                <span className="text-xs text-red-500 font-mono">-{file.deletions}</span>
              </div>
            ))}
            {pr.files.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No files changed</p>
            )}
          </div>
        )}

        {activeTab === "commits" && (
          <div className="divide-y divide-border">
            {pr.commits.map((commit) => (
              <div key={commit.sha} className="px-4 py-2 flex items-start gap-3">
                <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">{commit.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <code className="font-mono">{commit.sha}</code> · {commit.author}
                  </p>
                </div>
              </div>
            ))}
            {pr.commits.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No commits</p>
            )}
          </div>
        )}

        {activeTab === "comments" && (
          <div className="divide-y divide-border">
            {pr.comments.map((comment) => (
              <div key={comment.id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium">{comment.author}</span>
                  <span className="text-xs text-muted-foreground">
                    {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <MemoizedMarkdown content={comment.body} id={comment.id} size="sm" />
              </div>
            ))}
            {pr.comments.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No comments</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

interface IssueDetailViewProps {
  issueNumber: number
  repoName: string
  projectPath: string
}

const IssueDetailView = memo(function IssueDetailView({ issueNumber, repoName, projectPath }: IssueDetailViewProps) {
  const { data, isLoading, error } = trpc.github.getIssueDetail.useQuery(
    { projectPath, issueNumber },
    { enabled: !!projectPath }
  )

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error || !data?.success) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
        <p className="text-sm text-destructive">Failed to load issue</p>
        <p className="text-xs mt-1">{error?.message || (data as any)?.error}</p>
      </div>
    )
  }

  const issue = data.issue
  const stateColor = issue.state === "OPEN" ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-start gap-2">
          <CircleDot className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{issue.title}</h2>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", stateColor)}>
                {issue.state.charAt(0) + issue.state.slice(1).toLowerCase()}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span>#{issue.number} by <span className="font-medium text-foreground">{issue.author}</span></span>
              {issue.milestone && <span>Milestone: {issue.milestone}</span>}
              {issue.assignees.length > 0 && (
                <span>Assigned to: {issue.assignees.join(", ")}</span>
              )}
            </div>
            {issue.labels.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {issue.labels.map((label) => (
                  <span key={label} className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border">{label}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {issue.body && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{issue.body}</p>
          </div>
        )}

        {/* Comments */}
        {issue.comments.length > 0 && (
          <div>
            <div className="px-4 py-2 flex items-center gap-1 text-xs font-medium text-muted-foreground border-b border-border">
              <MessageSquare className="h-3 w-3" />
              {issue.comments.length} comment{issue.comments.length !== 1 ? "s" : ""}
            </div>
            <div className="divide-y divide-border">
              {issue.comments.map((comment) => (
                <div key={comment.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">
                      {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!issue.body && issue.comments.length === 0 && (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No description provided</p>
          </div>
        )}
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