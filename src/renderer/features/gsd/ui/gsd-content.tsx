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
  HelpCircle,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "../../agents/atoms"
import {
  selectedGsdProjectIdAtom,
  selectedGsdBranchesAtom,
  selectedPlanningDocAtom,
  selectedGsdDocAtom,
  expandedGsdFoldersAtom,
  selectedGsdCategoryAtom,
  gsdUpdateInfoAtom,
} from "../atoms"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"

type DocType = "planning" | "gsd"

export function GsdContent() {
  const selectedProjectId = useAtomValue(selectedGsdProjectIdAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [selectedPlanningDoc, setSelectedPlanningDoc] = useAtom(selectedPlanningDocAtom)
  const [selectedGsdDoc, setSelectedGsdDoc] = useAtom(selectedGsdDocAtom)
  const updateInfo = useAtomValue(gsdUpdateInfoAtom)

  // Fetch projects to get the selected one
  const { data: projectsData } = trpc.projects.list.useQuery()

  // Fetch GSD version
  const { data: versionData } = trpc.gsd.getVersion.useQuery()

  // Find selected project
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

  // Determine which document type is active
  const activeDocType: DocType | null = selectedGsdDoc ? "gsd" : selectedPlanningDoc ? "planning" : null

  // Default to README.md if nothing selected
  useEffect(() => {
    if (!selectedPlanningDoc && !selectedGsdDoc) {
      setSelectedGsdDoc("README.md")
    }
  }, [selectedPlanningDoc, selectedGsdDoc, setSelectedGsdDoc])

  // Handle selecting a GSD doc (clears planning doc)
  const handleSelectGsdDoc = (path: string) => {
    setSelectedPlanningDoc(null)
    setSelectedGsdDoc(path)
  }

  // Handle selecting a planning doc (clears GSD doc)
  const handleSelectPlanningDoc = (path: string) => {
    setSelectedGsdDoc(null)
    setSelectedPlanningDoc(path)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Compact header bar: Project / Version / Branch */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0 bg-muted/30">
        <Rocket className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium truncate">{projectName || "No project"}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-xs text-muted-foreground">
          {versionData?.version ? `v${versionData.version}` : "GSD"}
          {updateInfo?.available && (
            <span className="ml-1 text-green-500" title="Update available">
              *
            </span>
          )}
        </span>
        {projectPath && (
          <>
            <span className="text-muted-foreground">/</span>
            <BranchSelector projectPath={projectPath} />
          </>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with Documentation + Planning sections */}
        <div className="w-56 border-r border-border flex-shrink-0 overflow-y-auto">
          {/* Documentation section (README, Help) */}
          <div className="p-2 border-b border-border/50">
            <p className="text-[10px] uppercase text-muted-foreground/70 font-medium px-2 mb-1.5">
              Documentation
            </p>
            <div className="space-y-0.5">
              <button
                onClick={() => handleSelectGsdDoc("README.md")}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-xs",
                  activeDocType === "gsd" && selectedGsdDoc === "README.md"
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-foreground/5"
                )}
              >
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">README</span>
              </button>
              <button
                onClick={() => handleSelectGsdDoc("commands/gsd/help.md")}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-xs",
                  activeDocType === "gsd" && selectedGsdDoc === "commands/gsd/help.md"
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-foreground/5"
                )}
              >
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">Help</span>
              </button>
            </div>
          </div>

          {/* Planning section (file tree) */}
          <div className="p-2">
            <PlanningFileTree
              projectPath={projectPath}
              projectName={projectName}
              selectedDoc={selectedPlanningDoc}
              onSelectDoc={handleSelectPlanningDoc}
              isActive={activeDocType === "planning"}
            />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeDocType === "gsd" && selectedGsdDoc && (
            <GsdDocContent docPath={selectedGsdDoc} />
          )}
          {activeDocType === "planning" && selectedPlanningDoc && projectPath && (
            <PlanningDocContent projectPath={projectPath} docPath={selectedPlanningDoc} />
          )}
          {!activeDocType && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Select a document to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Branch selector dropdown (compact inline version)
 */
function BranchSelector({ projectPath }: { projectPath: string }) {
  const [branches, setBranches] = useAtom(selectedGsdBranchesAtom)
  const { data: branchData, isLoading } = trpc.gsd.getBranches.useQuery({ projectPath })

  const currentBranch = branches[projectPath] || branchData?.current || "main"

  const handleBranchSelect = (branch: string) => {
    setBranches((prev) => ({ ...prev, [projectPath]: branch }))
  }

  if (isLoading) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  }

  if (!branchData?.branches.length) {
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <GitBranch className="h-3 w-3" />
        {currentBranch}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <GitBranch className="h-3 w-3" />
          <span>{currentBranch}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {branchData.branches.map((branch) => (
          <DropdownMenuItem
            key={branch}
            onClick={() => handleBranchSelect(branch)}
            className={cn("text-xs", branch === currentBranch && "bg-accent")}
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
 * GSD documentation content viewer
 */
function GsdDocContent({ docPath }: { docPath: string }) {
  const { data: docContent, isLoading } = trpc.gsd.readGsdDoc.useQuery(
    { filePath: docPath },
    { enabled: !!docPath }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!docContent?.content) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Unable to load document</p>
      </div>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ChatMarkdownRenderer content={docContent.content} />
    </div>
  )
}

/**
 * Planning document content viewer
 */
function PlanningDocContent({ projectPath, docPath }: { projectPath: string; docPath: string }) {
  const { data: docContent, isLoading } = trpc.gsd.readPlanningDoc.useQuery(
    { projectPath, filePath: docPath },
    { enabled: !!projectPath && !!docPath }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!docContent?.content) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Unable to load file</p>
      </div>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ChatMarkdownRenderer content={docContent.content} />
    </div>
  )
}

/**
 * Planning file tree section
 */
function PlanningFileTree({
  projectPath,
  projectName,
  selectedDoc,
  onSelectDoc,
  isActive,
}: {
  projectPath?: string
  projectName?: string
  selectedDoc: string | null
  onSelectDoc: (path: string) => void
  isActive: boolean
}) {
  const [expandedFolders, setExpandedFolders] = useAtom(expandedGsdFoldersAtom)
  const selectedProjectId = useAtomValue(selectedGsdProjectIdAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedGsdCategory = useSetAtom(selectedGsdCategoryAtom)
  const utils = trpc.useUtils()

  const createChatMutation = trpc.chats.create.useMutation({
    onSuccess: (data) => {
      utils.chats.list.invalidate()
      setSelectedChatId(data.id)
      setSelectedGsdCategory(null)
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

  // Build tree structure
  const fileTree = useMemo(() => {
    if (!docsData?.files) return []
    return buildFileTree(docsData.files)
  }, [docsData])

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }))
  }

  // No project selected
  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-20 text-muted-foreground">
        <FolderOpen className="h-6 w-6 mb-1 opacity-50" />
        <p className="text-[10px] text-center">Select a project</p>
      </div>
    )
  }

  // Header
  const header = (
    <p className="text-[10px] uppercase text-muted-foreground/70 font-medium px-2 mb-1.5">
      Planning ({projectName || "Project"})
    </p>
  )

  // Loading state
  if (isCheckingDocs || isLoadingDocs) {
    return (
      <>
        {header}
        <div className="flex items-center justify-center h-16">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  // No .planning directory
  if (!hasDocs?.exists) {
    return (
      <>
        {header}
        <div className="flex flex-col items-center justify-center text-center px-2 py-4">
          <FileText className="h-6 w-6 mb-2 text-muted-foreground/50" />
          <p className="text-[10px] text-muted-foreground mb-2">No .planning directory</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-6 text-[10px]"
            onClick={handleRunMapCodebase}
            disabled={createChatMutation.isPending}
          >
            <Play className="h-3 w-3" />
            {createChatMutation.isPending ? "Starting..." : "Map Codebase"}
          </Button>
        </div>
      </>
    )
  }

  // Empty .planning directory
  if (fileTree.length === 0) {
    return (
      <>
        {header}
        <div className="flex flex-col items-center justify-center h-16 text-muted-foreground">
          <FileText className="h-5 w-5 mb-1 opacity-50" />
          <p className="text-[10px]">No files yet</p>
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      <div className="space-y-0.5">
        {fileTree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            selectedPath={isActive ? selectedDoc : null}
            expandedFolders={expandedFolders}
            onSelect={onSelectDoc}
            onToggleFolder={toggleFolder}
            depth={0}
          />
        ))}
      </div>
    </>
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

  const sortedFiles = [...flatFiles].sort((a, b) => a.path.localeCompare(b.path))

  for (const file of sortedFiles) {
    const node: FileTreeNode = {
      name: file.name,
      path: file.path,
      isDirectory: file.isDirectory,
      children: file.isDirectory ? [] : undefined,
    }

    nodeMap.set(file.path, node)

    const pathParts = file.path.split("/")
    if (pathParts.length === 1) {
      tree.push(node)
    } else {
      const parentPath = pathParts.slice(0, -1).join("/")
      const parent = nodeMap.get(parentPath)
      if (parent && parent.children) {
        parent.children.push(node)
      } else {
        tree.push(node)
      }
    }
  }

  return tree
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
            "flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-left hover:bg-foreground/5"
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
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-foreground/5"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs truncate">{node.name}</span>
    </button>
  )
}
