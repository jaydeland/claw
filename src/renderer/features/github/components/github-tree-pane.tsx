"use client"

import { createContext, memo, useCallback, useContext, useEffect, useState } from "react"
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
  Sparkles,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { trpc } from "../../../lib/trpc"
import {
  githubSelectionAtom,
  githubExpandedReposAtom,
  githubExpandedSectionsAtom,
  githubPRsAtom,
  githubIssuesAtom,
  githubFilesAtom,
  githubExpandedFoldersAtom,
  githubStartChatAtom,
  type GitHubRepo,
  type GitHubSelection,
  type AnalysisType,
} from "../atoms"

// Analysis types and labels
const ANALYSIS_TYPES: AnalysisType[] = ["codeflow", "db", "architecture", "build"]

interface GitHubTreePaneProps {
  projects: Array<{ id: string; path: string; name: string }>
}

export const GitHubTreePane = memo(function GitHubTreePane({ projects }: GitHubTreePaneProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedRepos, setExpandedRepos] = useAtom(githubExpandedReposAtom)
  const setSelection = useSetAtom(githubSelectionAtom)

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
        <div className="p-2 space-y-0.5">
          {projects.map((project) => (
            <SingleRepoSection
              key={project.id}
              projectId={project.id}
              projectPath={project.path}
              projectName={project.name}
              isExpanded={expandedRepos.has(project.id)}
              onToggleExpanded={() => {
                setExpandedRepos((prev) => {
                  const next = new Set(prev)
                  if (next.has(project.id)) {
                    next.delete(project.id)
                  } else {
                    next.add(project.id)
                    // Auto-select README when expanding a repo in the full GitHub tab
                    setSelection({ type: "readme", repoId: project.id, repoName: project.name })
                  }
                  return next
                })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

// Per-repo component — manages its own data fetching so hooks aren't called in a loop
export const SingleRepoSection = memo(function SingleRepoSection({
  projectId,
  projectPath,
  projectName,
  isExpanded,
  onToggleExpanded,
  hideRepoHeader = false,
  onItemSelect,
}: {
  projectId: string
  projectPath: string
  projectName: string
  /** Controlled expand/collapse for the repo row — managed by the caller */
  isExpanded: boolean
  /** Called when the repo header row is clicked */
  onToggleExpanded: () => void
  /** When true, hides the repo header button (for embedded sidebar use) */
  hideRepoHeader?: boolean
  /** Optional side-effect called after githubSelectionAtom is set */
  onItemSelect?: (selection: GitHubSelection) => void
}) {
  const [expandedSections, setExpandedSections] = useAtom(githubExpandedSectionsAtom)
  const [expandedFolders, setExpandedFolders] = useAtom(githubExpandedFoldersAtom)
  const [selection, setSelection] = useAtom(githubSelectionAtom)
  const setPRs = useSetAtom(githubPRsAtom)
  const setIssues = useSetAtom(githubIssuesAtom)
  const [, setFiles] = useAtom(githubFilesAtom)
  const setStartChat = useSetAtom(githubStartChatAtom)
  const prs = useAtomValue(githubPRsAtom)
  const issues = useAtomValue(githubIssuesAtom)

  const isRepoExpanded = isExpanded
  // Section IDs are scoped per-repo so expanding "prs" in one repo doesn't affect others
  const sectionKey = useCallback((section: string) => `${projectId}-${section}`, [projectId])
  const isCodeExpanded = expandedSections.has(sectionKey("code"))

  const { data: githubData, isLoading: isLoadingGitHub, error: githubError } = trpc.github.getData.useQuery(
    { projectPath },
    {
      enabled: isRepoExpanded && !!projectPath,
      staleTime: 60 * 1000,
      retry: false,
    }
  )

  const { data: filesData } = trpc.files.search.useQuery(
    { projectPath, query: "" },
    {
      enabled: isRepoExpanded && isCodeExpanded && !!projectPath,
      staleTime: 30 * 1000,
    }
  )

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

  const currentRepo: GitHubRepo = {
    id: projectId,
    name: githubData?.success ? `${githubData.owner}/${githubData.repo}` : projectName,
    fullName: githubData?.success ? `${githubData.owner}/${githubData.repo}` : projectName,
    owner: githubData?.success ? githubData.owner : "",
    url: githubData?.success ? `https://github.com/${githubData.owner}/${githubData.repo}` : "",
    localPath: projectPath,
    projectId,
  }

  const toggleRepo = useCallback(() => {
    onToggleExpanded()
  }, [onToggleExpanded])

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }, [setExpandedSections])

  const handleSelect = useCallback((newSelection: GitHubSelection) => {
    setSelection(newSelection)
    onItemSelect?.(newSelection)
  }, [setSelection, onItemSelect])

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

  const handleStartChat = useCallback((message: string, type: "explain" | "diagram") => {
    setStartChat({ message, type, autoStart: true })
  }, [setStartChat])

  return (
    <RepoTreeItem
      repo={currentRepo}
      isExpanded={isRepoExpanded}
      expandedSections={expandedSections}
      expandedFolders={expandedFolders}
      selection={selection}
      prs={prs.get(currentRepo.id) || []}
      issues={issues.get(currentRepo.id) || []}
      files={filesData?.map((f) => ({
        path: f.path,
        type: f.type === "folder" ? "dir" : "file" as "file" | "dir",
      })) || []}
      onToggleRepo={toggleRepo}
      onToggleSection={toggleSection}
      onToggleFolder={(path) => {
        const next = new Set(expandedFolders)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        setExpandedFolders(next)
      }}
      onSelect={handleSelect}
      onStartChat={handleStartChat}
      analysisLabels={analysisLabels}
      analysisIcons={analysisIcons}
      isLoading={isLoadingGitHub}
      error={githubError?.message || (githubData && !githubData.success ? githubData.error : null)}
      isGitHub={githubData?.success ? githubData.isGitHub : true}
      sectionKey={sectionKey}
      hideRepoHeader={hideRepoHeader}
    />
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
  onStartChat?: (message: string, type: "explain" | "diagram") => void
  analysisLabels: Record<AnalysisType, string>
  analysisIcons: Record<AnalysisType, React.ComponentType<{ className?: string }>>
  isLoading?: boolean
  error?: string | null
  isGitHub?: boolean
  sectionKey: (section: string) => string
  /** When true, hides the repo header button row */
  hideRepoHeader?: boolean
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
  onStartChat,
  analysisLabels,
  analysisIcons,
  isLoading,
  error,
  isGitHub,
  sectionKey,
  hideRepoHeader = false,
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
    const colorVariant = useSectionColor()
    const colorClasses = SECTION_COLOR_CLASSES[colorVariant]
    const isFolderExpanded = expandedFolders.has(node.path)
    const isSelected = selection?.type === "code" && selection.path === node.path
    const hasChildren = node.children.length > 0

    if (node.type === "dir") {
      return (
        <div style={{ paddingLeft: depth * 8 }}>
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            className={cn(
              "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm",
              "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {isFolderExpanded ? (
              <ChevronDown className={cn("h-3.5 w-3.5", colorClasses.icon)} />
            ) : (
              <ChevronRight className={cn("h-3.5 w-3.5", colorClasses.icon)} />
            )}
            <Folder className="h-4 w-4 text-yellow-500" />
            <span className={cn("truncate", colorClasses.text)}>{node.name}</span>
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
        style={{ paddingLeft: depth * 8 + 16 }}
        className={cn(
          "w-full flex items-center gap-2 py-1 rounded-md text-sm",
          "hover:bg-accent hover:text-accent-foreground",
          isSelected ? "bg-accent" : ""
        )}
      >
        <File className={cn("h-4 w-4", colorClasses.icon)} />
        <span className={cn("truncate", colorClasses.text)}>{node.name}</span>
      </button>
    )
  }

  return (
    <div className="space-y-0.5">
      {/* Repo header — hidden when embedded in workspace sidebar */}
      {!hideRepoHeader && (
        <button
          type="button"
          onClick={onToggleRepo}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm",
            "border border-border/30",
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
      )}

      {/* Error message */}
      {error && isExpanded && (
        <div className={cn("px-2 py-1 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded", hideRepoHeader ? "ml-0" : "ml-8")}>
          <AlertCircle className="h-3 w-3 inline mr-1" />
          {error}
        </div>
      )}

      {/* Repo contents */}
      {isExpanded && (
        <div className="ml-2 space-y-0.5">
          {/* PRs section */}
          <SectionTreeItem
            id={sectionKey("prs")}
            label="Pull Requests"
            icon={GitPullRequest}
            count={openPRs}
            isExpanded={expandedSections.has(sectionKey("prs"))}
            onToggle={() => onToggleSection(sectionKey("prs"))}
            colorVariant="green"
          >
            <PRItems
              prs={prs}
              repo={repo}
              selection={selection}
              onSelect={onSelect}
            />
          </SectionTreeItem>

          {/* Issues section */}
          <SectionTreeItem
            id={sectionKey("issues")}
            label="Issues"
            icon={CircleDot}
            count={openIssues}
            isExpanded={expandedSections.has(sectionKey("issues"))}
            onToggle={() => onToggleSection(sectionKey("issues"))}
            colorVariant="purple"
          >
            <IssueItems
              issues={issues}
              repo={repo}
              selection={selection}
              onSelect={onSelect}
            />
          </SectionTreeItem>

          {/* Code section - shows files with expandable folders */}
          <SectionTreeItem
            id={sectionKey("code")}
            label="Code"
            icon={FileCode}
            isExpanded={expandedSections.has(sectionKey("code"))}
            onToggle={() => onToggleSection(sectionKey("code"))}
            colorVariant="blue"
          >
            {/* Get App Overview button */}
            <button
              type="button"
              onClick={() => {
                const prompt = `Please provide a comprehensive overview of this codebase: ${repo.name}

Project path: ${repo.localPath || repo.projectId}

I need you to analyze the codebase structure and provide a high-level overview covering:

1. **Project Architecture**
   - What type of application is this? (web, mobile, CLI, library, etc.)
   - What are the main frameworks and technologies used?
   - What is the overall architectural pattern? (MVC, microservices, monolith, etc.)

2. **Directory Structure**
   - Key directories and their purposes
   - Where is the main source code located?
   - Where are tests, configuration, and documentation?

3. **Key Components/Modules**
   - Major features or modules
   - Entry points (main files)
   - Core business logic locations

4. **Technology Stack**
   - Programming languages used
   - Frameworks and libraries
   - Database, caching, messaging systems
   - Build tools and CI/CD setup

5. **Dependencies**
   - Key external dependencies
   - Internal module relationships

Please use the Agent tool with sub-agents to explore different parts of the codebase in parallel for faster analysis. Start by exploring the root directory structure, key configuration files, and then dive into the main source directories.

Focus on giving me a clear, high-level understanding that would help a new developer get oriented with this project.`
                onStartChat?.(prompt, "explain")
              }}
              className={cn(
                "w-full flex items-center gap-2 pl-[2ch] pr-2 py-1.5 rounded-md text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                "text-blue-600 dark:text-blue-400"
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span>Get App Overview</span>
            </button>

            {files.length > 0 ? (
              <div className="mt-1">
                {fileTree.map((node) => (
                  <FileTreeNode key={node.path} node={node} />
                ))}
              </div>
            ) : (
              <span className="pl-[2ch] py-1 text-sm text-muted-foreground">No files</span>
            )}
          </SectionTreeItem>

          {/* Visualize section */}
          <SectionTreeItem
            id={sectionKey("visualize")}
            label="Visualize"
            icon={GitBranch}
            isExpanded={expandedSections.has(sectionKey("visualize"))}
            onToggle={() => onToggleSection(sectionKey("visualize"))}
            colorVariant="orange"
          >
            <VisualizeItems
              analysisTypes={ANALYSIS_TYPES}
              analysisIcons={analysisIcons}
              analysisLabels={analysisLabels}
              repo={repo}
              selection={selection}
              onSelect={onSelect}
            />
          </SectionTreeItem>
        </div>
      )}
    </div>
  )
})

// Section color variants for alternating visual distinction
type SectionColorVariant = "default" | "blue" | "green" | "purple" | "orange" | "cyan" | "pink"

const SECTION_COLOR_CLASSES: Record<SectionColorVariant, { icon: string; text: string }> = {
  default: {
    icon: "text-muted-foreground",
    text: "text-foreground",
  },
  blue: {
    icon: "text-blue-600 dark:text-blue-400",
    text: "text-blue-700 dark:text-blue-300",
  },
  green: {
    icon: "text-green-600 dark:text-green-400",
    text: "text-green-700 dark:text-green-300",
  },
  purple: {
    icon: "text-purple-600 dark:text-purple-400",
    text: "text-purple-700 dark:text-purple-300",
  },
  orange: {
    icon: "text-orange-600 dark:text-orange-400",
    text: "text-orange-700 dark:text-orange-300",
  },
  cyan: {
    icon: "text-cyan-600 dark:text-cyan-400",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  pink: {
    icon: "text-pink-600 dark:text-pink-400",
    text: "text-pink-700 dark:text-pink-300",
  },
}

// Context for passing color variant to child items
const SectionColorContext = createContext<SectionColorVariant>("default")
const useSectionColor = () => useContext(SectionColorContext)

// PR items component - uses parent's color from context
const PRItems = memo(function PRItems({
  prs,
  repo,
  selection,
  onSelect,
}: {
  prs: Array<{ number: number; title: string; state: string }>
  repo: GitHubRepo
  selection: GitHubSelection | null
  onSelect: (selection: GitHubSelection) => void
}) {
  const colorVariant = useSectionColor()
  const colorClasses = SECTION_COLOR_CLASSES[colorVariant]

  if (prs.length === 0) {
    return <span className="pl-[2ch] py-1 text-sm text-muted-foreground">No pull requests</span>
  }

  return (
    <>
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
            "w-full flex items-center gap-2 pl-[2ch] pr-2 py-1 rounded-md text-sm",
            "hover:bg-accent hover:text-accent-foreground",
            selection?.type === "pr" && selection.prNumber === pr.number
              ? "bg-accent"
              : ""
          )}
        >
          <GitPullRequest
            className={cn(
              "h-4 w-4",
              colorClasses.icon
            )}
          />
          <span className={cn("truncate", colorClasses.text)}>
            #{pr.number} {pr.title}
          </span>
        </button>
      ))}
    </>
  )
})

// Issue items component - uses parent's color from context
const IssueItems = memo(function IssueItems({
  issues,
  repo,
  selection,
  onSelect,
}: {
  issues: Array<{ number: number; title: string; state: string }>
  repo: GitHubRepo
  selection: GitHubSelection | null
  onSelect: (selection: GitHubSelection) => void
}) {
  const colorVariant = useSectionColor()
  const colorClasses = SECTION_COLOR_CLASSES[colorVariant]

  if (issues.length === 0) {
    return <span className="pl-[2ch] py-1 text-sm text-muted-foreground">No issues</span>
  }

  return (
    <>
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
            "w-full flex items-center gap-2 pl-[2ch] pr-2 py-1 rounded-md text-sm",
            "hover:bg-accent hover:text-accent-foreground",
            selection?.type === "issue" && selection.issueNumber === issue.number
              ? "bg-accent"
              : ""
          )}
        >
          <CircleDot className={cn("h-4 w-4", colorClasses.icon)} />
          <span className={cn("truncate", colorClasses.text)}>
            #{issue.number} {issue.title}
          </span>
        </button>
      ))}
    </>
  )
})

// Visualize items component - uses parent's color from context
const VisualizeItems = memo(function VisualizeItems({
  analysisTypes,
  analysisIcons,
  analysisLabels,
  repo,
  selection,
  onSelect,
}: {
  analysisTypes: AnalysisType[]
  analysisIcons: Record<AnalysisType, React.ComponentType<{ className?: string }>>
  analysisLabels: Record<AnalysisType, string>
  repo: GitHubRepo
  selection: GitHubSelection | null
  onSelect: (selection: GitHubSelection) => void
}) {
  const colorVariant = useSectionColor()
  const colorClasses = SECTION_COLOR_CLASSES[colorVariant]

  return (
    <>
      {analysisTypes.map((type) => {
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
              "w-full flex items-center gap-2 pl-[2ch] pr-2 py-1 rounded-md text-sm",
              "hover:bg-accent hover:text-accent-foreground",
              selection?.type === "visualize" && selection.analysisType === type
                ? "bg-accent"
                : ""
            )}
          >
            <Icon className={cn("h-4 w-4", colorClasses.icon)} />
            <span className={colorClasses.text}>{analysisLabels[type]}</span>
          </button>
        )
      })}
    </>
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
  /** Color variant for the section - affects icon and label colors */
  colorVariant?: SectionColorVariant
}

const SectionTreeItem = memo(function SectionTreeItem({
  id,
  label,
  icon: Icon,
  count,
  isExpanded,
  onToggle,
  children,
  colorVariant = "default",
}: SectionTreeItemProps) {
  const colorClasses = SECTION_COLOR_CLASSES[colorVariant]

  return (
    <div className={cn(
      "rounded-md border border-border/30",
      isExpanded && "bg-muted/20"
    )}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm",
          "hover:bg-accent",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        )}
      >
        {isExpanded ? (
          <ChevronDown className={cn("h-4 w-4", colorClasses.icon)} />
        ) : (
          <ChevronRight className={cn("h-4 w-4", colorClasses.icon)} />
        )}
        <Icon className={cn("h-4 w-4", colorClasses.icon)} />
        <span className={cn("font-medium", colorClasses.text)}>{label}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </button>
      {isExpanded && (
        <SectionColorContext.Provider value={colorVariant}>
          <div className="px-2 pb-1 space-y-0.5">
            {children}
          </div>
        </SectionColorContext.Provider>
      )}
    </div>
  )
})