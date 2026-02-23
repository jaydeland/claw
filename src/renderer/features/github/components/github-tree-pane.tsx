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
  AlertCircle,
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
  githubExpandedFoldersAtom,
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
  const [expandedFolders, setExpandedFolders] = useAtom(githubExpandedFoldersAtom)
  const [selection, setSelection] = useAtom(githubSelectionAtom)
  const prs = useAtomValue(githubPRsAtom)
  const issues = useAtomValue(githubIssuesAtom)
  const [files, setFiles] = useAtom(githubFilesAtom)
  const setPRs = useSetAtom(githubPRsAtom)
  const setIssues = useSetAtom(githubIssuesAtom)

  // Fetch files when the code section is expanded
  const isRepoExpanded = expandedRepos.has(projectId)
  const isCodeExpanded = expandedSections.has("code")

  // Fetch GitHub data (PRs and Issues) when repo is expanded
  const { data: githubData, isLoading: isLoadingGitHub, error: githubError, refetch: refetchGitHub } = trpc.github.getData.useQuery(
    { projectPath },
    {
      enabled: isRepoExpanded && !!projectPath,
      staleTime: 60 * 1000, // 1 minute
      retry: false,
    }
  )

  // Fetch files
  const { data: filesData, isLoading: isLoadingFiles, refetch: refetchFiles } = trpc.files.search.useQuery(
    { projectPath, query: "", limit: 100 },
    {
      enabled: isRepoExpanded && isCodeExpanded && !!projectPath,
      staleTime: 30 * 1000, // 30 seconds
    }
  )

  // Update atoms when GitHub data changes
  useEffect(() => {
    if (githubData?.success) {
      setPRs((prev) => {
        const next = new Map(prev)
        next.set(projectId, githubData.prs.map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state as "open" | "closed" | "merged",
          author: pr.author,
          headBranch: pr.headBranch,
          baseBranch: pr.baseBranch,
          draft: pr.draft,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })))
        return next
      })
      setIssues((prev) => {
        const next = new Map(prev)
        next.set(projectId, githubData.issues.map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state as "open" | "closed",
          author: issue.author,
          labels: issue.labels,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assignees: [],
        })))
        return next
      })
    }
  }, [githubData, projectId, setPRs, setIssues])

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
    name: githubData?.success ? `${githubData.owner}/${githubData.repo}` : (projectPath.split("/").pop() || "repo"),
    fullName: githubData?.success ? `${githubData.owner}/${githubData.repo}` : (projectPath.split("/").pop() || "repo"),
    owner: githubData?.success ? githubData.owner : "",
    url: githubData?.success ? `https://github.com/${githubData.owner}/${githubData.repo}` : "",
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
            expandedFolders={expandedFolders}
            selection={selection}
            prs={prs.get(currentRepo.id) || []}
            issues={issues.get(currentRepo.id) || []}
            files={files.get(currentRepo.id) || []}
            onToggleRepo={() => toggleRepo(currentRepo.id)}
            onToggleSection={toggleSection}
            onToggleFolder={(path) => {
              const next = new Set(expandedFolders)
              if (next.has(path)) next.delete(path)
              else next.add(path)
              setExpandedFolders(next)
            }}
            onSelect={handleSelect}
            analysisLabels={analysisLabels}
            analysisIcons={analysisIcons}
            isLoading={isLoadingGitHub}
            error={githubError?.message || (githubData && !githubData.success ? githubData.error : null)}
            isGitHub={githubData?.success ? githubData.isGitHub : true}
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
  expandedFolders: Set<string>
  selection: GitHubSelection
  prs: Array<{ number: number; title: string; state: string }>
  issues: Array<{ number: number; title: string; state: string }>
  files: Array<{ path: string; type: "file" | "dir" }>
  onToggleRepo: () => void
  onToggleSection: (section: string) => void
  onToggleFolder: (folderPath: string) => void
  onSelect: (selection: GitHubSelection) => void
  analysisLabels: Record<AnalysisType, string>
  analysisIcons: Record<AnalysisType, React.ComponentType<{ className?: string }>>
  isLoading?: boolean
  error?: string | null
  isGitHub?: boolean
}

const RepoTreeItem = memo(function RepoTreeItem({
  repo,
  isExpanded,
  expandedSections,
  expandedFolders,
  selection,
  prs,
  issues,
  files,
  onToggleRepo,
  onToggleSection,
  onToggleFolder,
  onSelect,
  analysisLabels,
  analysisIcons,
  isLoading,
  error,
  isGitHub,
}: RepoTreeItemProps) {
  const openPRs = prs.filter((pr) => pr.state === "open").length
  const openIssues = issues.filter((i) => i.state === "open").length

  // Build a tree structure from flat file list
  interface TreeNode {
    name: string
    path: string
    type: "file" | "dir"
    children: TreeNode[]
  }

  function buildFileTree(fileList: Array<{ path: string; type: "file" | "dir" }>): TreeNode[] {
    const root: TreeNode[] = []

    for (const file of fileList) {
      const parts = file.path.split("/")
      let current = root

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const isLast = i === parts.length - 1
        const currentPath = parts.slice(0, i + 1).join("/")

        let node = current.find((n) => n.name === part)

        if (!node) {
          node = {
            name: part,
            path: currentPath,
            type: isLast ? file.type : "dir",
            children: [],
          }
          current.push(node)
        }

        if (!isLast) {
          current = node.children
        }
      }
    }

    // Sort: directories first, then files, alphabetically
    function sortNodes(nodes: TreeNode[]): TreeNode[] {
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "dir" ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
    }

    function sortTree(nodes: TreeNode[]): TreeNode[] {
      const sorted = sortNodes(nodes)
      for (const node of sorted) {
        if (node.children.length > 0) {
          node.children = sortTree(node.children)
        }
      }
      return sorted
    }

    return sortTree(root)
  }

  const fileTree = buildFileTree(files)

  // Recursive component to render tree nodes
  function FileTreeNode({
    node,
    depth = 0,
  }: {
    node: TreeNode
    depth?: number
  }) {
    const isFolderExpanded = expandedFolders.has(node.path)
    const isSelected = selection?.type === "code" && selection.path === node.path
    const hasChildren = node.children.length > 0

    if (node.type === "dir") {
      return (
        <div style={{ paddingLeft: depth * 12 }}>
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            className={cn(
              "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm",
              "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {isFolderExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Folder className="h-4 w-4 text-yellow-500" />
            <span className="truncate">{node.name}</span>
          </button>
          {isFolderExpanded && hasChildren && (
            <div>
              {node.children.map((child) => (
                <FileTreeNode key={child.path} node={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <button
        type="button"
        onClick={() =>
          onSelect({
            type: "code",
            repoId: repo.id,
            repoName: repo.name,
            path: node.path,
          })
        }
        style={{ paddingLeft: depth * 12 + 20 }}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm",
          "hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-accent"
        )}
      >
        <File className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

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
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
        )}
      </button>

      {/* Error message */}
      {error && isExpanded && (
        <div className="ml-8 px-2 py-1 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded">
          <AlertCircle className="h-3 w-3 inline mr-1" />
          {error}
        </div>
      )}

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

          {/* Code section - shows files with expandable folders */}
          <SectionTreeItem
            id="code"
            label="Code"
            icon={FileCode}
            isExpanded={expandedSections.has("code")}
            onToggle={() => onToggleSection("code")}
          >
            {files.length > 0 ? (
              <div>
                {fileTree.map((node) => (
                  <FileTreeNode key={node.path} node={node} />
                ))}
              </div>
            ) : (
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