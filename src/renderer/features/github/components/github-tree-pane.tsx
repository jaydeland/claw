"use client"

import { memo, useCallback, useEffect, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ChevronRight,
  ChevronDown,
  GitPullRequest,
  CircleDot,
  FileCode,
  GitBranch,
  Database,
  Layers,
  Wrench,
  Search,
  Loader2,
  Folder,
  File,
  RefreshCw,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { trpc } from "../../../lib/trpc"
import {
  githubSelectionAtom,
  githubExpandedReposAtom,
  githubExpandedSectionsAtom,
  githubReposAtom,
  githubReposLoadingAtom,
  githubPRsAtom,
  githubIssuesAtom,
  githubFilesAtom,
  type GitHubRepo,
  type GitHubSelection,
  type AnalysisType,
} from "../atoms"

// Analysis types and labels
const ANALYSIS_TYPES: AnalysisType[] = ["codeflow", "db", "architecture", "build"]

interface GitHubTreePaneProps {
  projectId: string
  projectPath: string
}

export const GitHubTreePane = memo(function GitHubTreePane({
  projectId,
  projectPath,
}: GitHubTreePaneProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const repos = useAtomValue(githubReposAtom)
  const loading = useAtomValue(githubReposLoadingAtom)
  const [expandedRepos, setExpandedRepos] = useAtom(githubExpandedReposAtom)
  const [expandedSections, setExpandedSections] = useAtom(githubExpandedSectionsAtom)
  const [selection, setSelection] = useAtom(githubSelectionAtom)
  const prs = useAtomValue(githubPRsAtom)
  const issues = useAtomValue(githubIssuesAtom)
  const [files, setFiles] = useAtom(githubFilesAtom)

  // Fetch files when the code section is expanded
  const isRepoExpanded = expandedRepos.has(projectId)
  const isCodeExpanded = expandedSections.has("code")

  const { data: filesData, isLoading: isLoadingFiles, refetch: refetchFiles } = trpc.files.search.useQuery(
    { projectPath, query: "", limit: 100 },
    {
      enabled: isRepoExpanded && isCodeExpanded && !!projectPath,
      staleTime: 30 * 1000, // 30 seconds
    }
  )

  // Update files atom when data changes
  useEffect(() => {
    if (filesData) {
      setFiles((prev) => {
        const next = new Map(prev)
        next.set(projectId, filesData.map((f) => ({
          path: f.path,
          type: f.type === "folder" ? "dir" : "file",
        })))
        return next
      })
    }
  }, [filesData, projectId, setFiles])

  // For now, we'll use a single repo from the project path
  // In the future, this could support multiple repos
  const currentRepo: GitHubRepo = {
    id: projectId,
    name: projectPath.split("/").pop() || "repo",
    fullName: projectPath.split("/").pop() || "repo",
    owner: "",
    url: "",
    localPath: projectPath,
    projectId,
  }

  const toggleRepo = useCallback((repoId: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(repoId)) {
        next.delete(repoId)
      } else {
        next.add(repoId)
      }
      return next
    })
  }, [setExpandedRepos])

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }, [setExpandedSections])

  const handleSelect = useCallback((newSelection: GitHubSelection) => {
    setSelection(newSelection)
  }, [setSelection])

  const analysisLabels: Record<AnalysisType, string> = {
    codeflow: "Code Flow",
    db: "Database",
    architecture: "Architecture",
    build: "Build System",
  }

  const analysisIcons: Record<AnalysisType, React.ComponentType<{ className?: string }>> = {
    codeflow: GitBranch,
    db: Database,
    architecture: Layers,
    build: Wrench,
  }

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {/* Single repo for now */}
          <RepoTreeItem
            repo={currentRepo}
            isExpanded={isRepoExpanded}
            expandedSections={expandedSections}
            selection={selection}
            prs={prs.get(currentRepo.id) || []}
            issues={issues.get(currentRepo.id) || []}
            files={files.get(currentRepo.id) || []}
            onToggleRepo={() => toggleRepo(currentRepo.id)}
            onToggleSection={toggleSection}
            onSelect={handleSelect}
            analysisLabels={analysisLabels}
            analysisIcons={analysisIcons}
          />
        </div>
      </div>
    </div>
  )
})

interface RepoTreeItemProps {
  repo: GitHubRepo
  isExpanded: boolean
  expandedSections: Set<string>
  selection: GitHubSelection
  prs: Array<{ number: number; title: string; state: string }>
  issues: Array<{ number: number; title: string; state: string }>
  files: Array<{ path: string; type: "file" | "dir" }>
  onToggleRepo: () => void
  onToggleSection: (section: string) => void
  onSelect: (selection: GitHubSelection) => void
  analysisLabels: Record<AnalysisType, string>
  analysisIcons: Record<AnalysisType, React.ComponentType<{ className?: string }>>
}

const RepoTreeItem = memo(function RepoTreeItem({
  repo,
  isExpanded,
  expandedSections,
  selection,
  prs,
  issues,
  files,
  onToggleRepo,
  onToggleSection,
  onSelect,
  analysisLabels,
  analysisIcons,
}: RepoTreeItemProps) {
  const openPRs = prs.filter((pr) => pr.state === "open").length
  const openIssues = issues.filter((i) => i.state === "open").length

  return (
    <div className="space-y-0.5">
      {/* Repo header */}
      <button
        type="button"
        onClick={onToggleRepo}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium truncate">{repo.name}</span>
      </button>

      {/* Repo contents */}
      {isExpanded && (
        <div className="ml-4 space-y-0.5">
          {/* PRs section */}
          <SectionTreeItem
            id="prs"
            label="Pull Requests"
            icon={GitPullRequest}
            count={openPRs}
            isExpanded={expandedSections.has("prs")}
            onToggle={() => onToggleSection("prs")}
          >
            {prs.map((pr) => (
              <button
                key={pr.number}
                type="button"
                onClick={() =>
                  onSelect({
                    type: "pr",
                    repoId: repo.id,
                    repoName: repo.name,
                    prNumber: pr.number,
                  })
                }
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                  selection?.type === "pr" && selection.prNumber === pr.number && "bg-accent"
                )}
              >
                <GitPullRequest
                  className={cn(
                    "h-4 w-4",
                    pr.state === "open" && "text-green-500",
                    pr.state === "closed" && "text-red-500",
                    pr.state === "merged" && "text-purple-500"
                  )}
                />
                <span className="truncate">
                  #{pr.number} {pr.title}
                </span>
              </button>
            ))}
            {prs.length === 0 && (
              <span className="px-6 py-1 text-sm text-muted-foreground">No pull requests</span>
            )}
          </SectionTreeItem>

          {/* Issues section */}
          <SectionTreeItem
            id="issues"
            label="Issues"
            icon={CircleDot}
            count={openIssues}
            isExpanded={expandedSections.has("issues")}
            onToggle={() => onToggleSection("issues")}
          >
            {issues.map((issue) => (
              <button
                key={issue.number}
                type="button"
                onClick={() =>
                  onSelect({
                    type: "issue",
                    repoId: repo.id,
                    repoName: repo.name,
                    issueNumber: issue.number,
                  })
                }
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                  selection?.type === "issue" && selection.issueNumber === issue.number && "bg-accent"
                )}
              >
                <CircleDot
                  className={cn(
                    "h-4 w-4",
                    issue.state === "open" ? "text-green-500" : "text-gray-500"
                  )}
                />
                <span className="truncate">
                  #{issue.number} {issue.title}
                </span>
              </button>
            ))}
            {issues.length === 0 && (
              <span className="px-6 py-1 text-sm text-muted-foreground">No issues</span>
            )}
          </SectionTreeItem>

          {/* Code section - shows only files, not folders */}
          <SectionTreeItem
            id="code"
            label="Code"
            icon={FileCode}
            isExpanded={expandedSections.has("code")}
            onToggle={() => onToggleSection("code")}
          >
            {files
              .filter((file) => file.type === "file")
              .slice(0, 50)
              .map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() =>
                    onSelect({
                      type: "code",
                      repoId: repo.id,
                      repoName: repo.name,
                      path: file.path,
                    })
                  }
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    selection?.type === "code" && selection.path === file.path && "bg-accent"
                  )}
                >
                  <File className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{file.path}</span>
                </button>
              ))}
            {files.filter((f) => f.type === "file").length === 0 && (
              <span className="px-6 py-1 text-sm text-muted-foreground">No files</span>
            )}
          </SectionTreeItem>

          {/* Visualize section */}
          <SectionTreeItem
            id="visualize"
            label="Visualize"
            icon={GitBranch}
            isExpanded={expandedSections.has("visualize")}
            onToggle={() => onToggleSection("visualize")}
          >
            {ANALYSIS_TYPES.map((type) => {
              const Icon = analysisIcons[type]
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    onSelect({
                      type: "visualize",
                      repoId: repo.id,
                      repoName: repo.name,
                      analysisType: type,
                    })
                  }
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    selection?.type === "visualize" &&
                      selection.analysisType === type &&
                      "bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{analysisLabels[type]}</span>
                </button>
              )
            })}
          </SectionTreeItem>
        </div>
      )}
    </div>
  )
})

interface SectionTreeItemProps {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

const SectionTreeItem = memo(function SectionTreeItem({
  id,
  label,
  icon: Icon,
  count,
  isExpanded,
  onToggle,
  children,
}: SectionTreeItemProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </button>
      {isExpanded && <div className="ml-2 mt-0.5 space-y-0.5">{children}</div>}
    </div>
  )
})