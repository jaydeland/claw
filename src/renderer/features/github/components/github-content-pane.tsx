"use client"

import { memo } from "react"
import { useAtomValue } from "jotai"
import { FileCode, GitPullRequest, CircleDot, GitBranch, Database, Layers, Wrench } from "lucide-react"
import { cn } from "../../../lib/utils"
import { type GitHubSelection, type AnalysisType } from "../atoms"
import { VisualizeView } from "./visualize-view"

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
      return <CodeView path={selection.path} repoName={selection.repoName} />
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
}

const CodeView = memo(function CodeView({ path, repoName }: CodeViewProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold truncate">{path}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{repoName}</p>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">File content will appear here</p>
          <p className="text-xs mt-1">Implement with syntax highlighting</p>
        </div>
      </div>
    </div>
  )
})