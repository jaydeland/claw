"use client"

import { useMemo, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Rocket,
  BookOpen,
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  GitBranch,
  Play,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "../../agents/atoms"
import {
  activeGsdTabAtom,
  selectedGsdProjectIdAtom,
  selectedGsdBranchesAtom,
  selectedPlanningDocAtom,
  selectedGsdDocAtom,
  expandedGsdFoldersAtom,
  selectedGsdCategoryAtom,
} from "../atoms"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"

export function GsdContent() {
  const activeTab = useAtomValue(activeGsdTabAtom)
  const selectedProjectId = useAtomValue(selectedGsdProjectIdAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch projects to get the selected one
  const { data: projectsData } = trpc.projects.list.useQuery()

  // Find selected project path
  const projectPath = useMemo(() => {
    if (!projectsData || !selectedProjectId) return selectedProject?.path
    const proj = projectsData.find((p) => p.id === selectedProjectId)
    return proj?.path || selectedProject?.path
  }, [projectsData, selectedProjectId, selectedProject])

  const projectName = useMemo(() => {
    if (!projectsData || !selectedProjectId) return selectedProject?.name
    const proj = projectsData.find((p) => p.id === selectedProjectId)
    return proj?.name || selectedProject?.name
  }, [projectsData, selectedProjectId, selectedProject])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">GSD</h1>
          <span className="text-sm text-muted-foreground">
            {activeTab === "overview" ? "Documentation" : "Planning"}
          </span>
        </div>
        {projectPath && activeTab === "plans" && (
          <BranchSelector projectPath={projectPath} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "overview" && (
          <GsdOverview key="gsd-overview" />
        )}
        {activeTab === "plans" && (
          <GsdPlans
            key="gsd-plans"
            projectPath={projectPath}
            projectName={projectName}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Branch selector dropdown
 */
function BranchSelector({ projectPath }: { projectPath: string }) {
  const [branches, setBranches] = useAtom(selectedGsdBranchesAtom)
  const { data: branchData, isLoading } = trpc.gsd.getBranches.useQuery({ projectPath })

  const currentBranch = branches[projectPath] || branchData?.current || "main"

  const handleBranchSelect = (branch: string) => {
    setBranches((prev) => ({ ...prev, [projectPath]: branch }))
  }

  if (isLoading || !branchData?.branches.length) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
          <GitBranch className="h-3 w-3" />
          {currentBranch}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {branchData.branches.map((branch) => (
          <DropdownMenuItem
            key={branch}
            onClick={() => handleBranchSelect(branch)}
            className={cn(branch === currentBranch && "bg-accent")}
          >
            <GitBranch className="h-3 w-3 mr-2" />
            {branch}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * GSD Overview - shows README and Help
 */
function GsdOverview() {
  const [selectedDoc, setSelectedDoc] = useAtom(selectedGsdDocAtom)

  // Default to README.md
  useEffect(() => {
    if (!selectedDoc) {
      setSelectedDoc("README.md")
    }
  }, [selectedDoc, setSelectedDoc])

  // Fetch selected document content
  const { data: docContent, isLoading: isLoadingContent } = trpc.gsd.readGsdDoc.useQuery(
    { filePath: selectedDoc || "README.md" },
    { enabled: !!selectedDoc }
  )

  const isReadme = selectedDoc === "README.md"
  const isHelp = selectedDoc === "commands/gsd/help.md"

  return (
    <div className="flex flex-col h-full">
      {/* Tab selector */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border flex-shrink-0">
        <Button
          variant={isReadme ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setSelectedDoc("README.md")}
          className="h-7 text-xs"
        >
          <BookOpen className="h-3 w-3 mr-1.5" />
          README
        </Button>
        <Button
          variant={isHelp ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setSelectedDoc("commands/gsd/help.md")}
          className="h-7 text-xs"
        >
          <FileText className="h-3 w-3 mr-1.5" />
          Help
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoadingContent ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : docContent?.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ChatMarkdownRenderer content={docContent.content} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <FileText className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Unable to load document</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Build a tree structure from flat file list
 */
interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

function buildFileTree(
  flatFiles: Array<{ name: string; path: string; isDirectory: boolean }>
): FileTreeNode[] {
  const tree: FileTreeNode[] = []
  const nodeMap = new Map<string, FileTreeNode>()

  // Sort files to ensure parents come before children
  const sortedFiles = [...flatFiles].sort((a, b) => a.path.localeCompare(b.path))

  for (const file of sortedFiles) {
    const node: FileTreeNode = {
      name: file.name,
      path: file.path,
      isDirectory: file.isDirectory,
      children: file.isDirectory ? [] : undefined,
    }

    nodeMap.set(file.path, node)

    // Find parent
    const pathParts = file.path.split("/")
    if (pathParts.length === 1) {
      // Top-level item
      tree.push(node)
    } else {
      // Nested item - find parent
      const parentPath = pathParts.slice(0, -1).join("/")
      const parent = nodeMap.get(parentPath)
      if (parent && parent.children) {
        parent.children.push(node)
      } else {
        // Parent not found, add to root (shouldn't happen with sorted list)
        tree.push(node)
      }
    }
  }

  return tree
}

/**
 * GSD Plans - shows project .planning/ files
 */
function GsdPlans({
  projectPath,
  projectName,
}: {
  projectPath?: string
  projectName?: string
}) {
  const [selectedDoc, setSelectedDoc] = useAtom(selectedPlanningDocAtom)
  const [expandedFolders, setExpandedFolders] = useAtom(expandedGsdFoldersAtom)
  const selectedProjectId = useAtomValue(selectedGsdProjectIdAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedGsdCategory = useSetAtom(selectedGsdCategoryAtom)
  const utils = trpc.useUtils()

  const createChatMutation = trpc.chats.create.useMutation({
    onSuccess: (data) => {
      utils.chats.list.invalidate()
      setSelectedChatId(data.id)
      setSelectedGsdCategory(null) // Clear GSD category to navigate to the new chat
    },
  })

  const handleRunMapCodebase = () => {
    if (!selectedProjectId) return

    createChatMutation.mutate({
      projectId: selectedProjectId,
      name: "Map Codebase",
      initialMessageParts: [{ type: "text", text: "/gsd:map-codebase" }],
      useWorktree: true,
      mode: "agent",
    })
  }

  // Check if project has .planning directory
  const { data: hasDocs, isLoading: isCheckingDocs } = trpc.gsd.hasPlanningDocs.useQuery(
    { projectPath: projectPath || "" },
    { enabled: !!projectPath }
  )

  // Fetch .planning files
  const { data: docsData, isLoading: isLoadingDocs } = trpc.gsd.listPlanningDocs.useQuery(
    { projectPath: projectPath || "" },
    { enabled: !!projectPath && hasDocs?.hasContent }
  )

  // Build tree structure from flat list
  const fileTree = useMemo(() => {
    if (!docsData?.files) return []
    return buildFileTree(docsData.files)
  }, [docsData])

  // Fetch selected document content
  const { data: docContent, isLoading: isLoadingContent } = trpc.gsd.readPlanningDoc.useQuery(
    { projectPath: projectPath || "", filePath: selectedDoc || "" },
    { enabled: !!projectPath && !!selectedDoc }
  )

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }))
  }

  // No project selected
  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/10">
        <FolderOpen className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm font-medium">Plans - No project selected</p>
        <p className="text-xs mt-1">Select a project from the sidebar to view planning docs</p>
      </div>
    )
  }

  // Loading state
  if (isCheckingDocs) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // No .planning directory - show init prompt
  if (!hasDocs?.exists) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 bg-muted/10">
        <FileText className="h-12 w-12 mb-3 text-muted-foreground/50" />
        <p className="text-sm font-medium">No .planning directory found</p>
        <p className="text-xs text-muted-foreground mt-1 mb-1">
          {projectName ? `Project: ${projectName}` : "Initialize GSD for this project to start planning"}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 mt-2"
          onClick={handleRunMapCodebase}
          disabled={createChatMutation.isPending}
        >
          <Play className="h-3.5 w-3.5" />
          {createChatMutation.isPending ? "Starting..." : "Run /gsd:map-codebase"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div className="w-56 border-r border-border flex-shrink-0 overflow-y-auto p-2">
        <p className="text-[10px] uppercase text-muted-foreground/70 font-medium px-2 mb-2">
          {projectName || "Project"} / .planning
        </p>
        {isLoadingDocs ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : fileTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-muted-foreground">
            <FileText className="h-6 w-6 mb-1 opacity-50" />
            <p className="text-xs">No files yet</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {fileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                selectedPath={selectedDoc}
                expandedFolders={expandedFolders}
                onSelect={setSelectedDoc}
                onToggleFolder={toggleFolder}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedDoc ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <FileText className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Select a file to view</p>
          </div>
        ) : isLoadingContent ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : docContent?.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ChatMarkdownRenderer content={docContent.content} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <FileText className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Unable to load file</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * File tree item component with recursive rendering
 */
interface FileTreeItemProps {
  node: FileTreeNode
  selectedPath: string | null
  expandedFolders: Record<string, boolean>
  onSelect: (path: string) => void
  onToggleFolder: (path: string) => void
  depth: number
}

function FileTreeItem({
  node,
  selectedPath,
  expandedFolders,
  onSelect,
  onToggleFolder,
  depth,
}: FileTreeItemProps) {
  const isExpanded = expandedFolders[node.path]
  const isSelected = selectedPath === node.path

  if (node.isDirectory) {
    return (
      <>
        <button
          onClick={() => onToggleFolder(node.path)}
          className={cn(
            "flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-left hover:bg-foreground/5",
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          )}
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs truncate">{node.name}</span>
        </button>
        {/* Recursively render children when expanded */}
        {isExpanded && node.children && node.children.length > 0 && (
          <div className="space-y-0.5">
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                expandedFolders={expandedFolders}
                onSelect={onSelect}
                onToggleFolder={onToggleFolder}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-left",
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-foreground/5",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs truncate">{node.name}</span>
    </button>
  )
}
