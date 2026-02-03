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
  HelpCircle,
  Download,
  Check,
  ListPlus,
  Play,
  MessageSquare,
  Edit,
  GitCommit,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom, selectedAgentChatIdAtom, selectedSidebarTabAtom } from "../../agents/atoms"
import {
  selectedGsdProjectIdAtom,
  selectedGsdBranchesAtom,
  selectedPlanningDocAtom,
  selectedGsdDocAtom,
  expandedGsdFoldersAtom,
  selectedGsdCategoryAtom,
  gsdUpdateInfoAtom,
  gsdUpdateInProgressAtom,
  isGsdEditModeAtom,
  gsdChangesPanelOpenAtom,
  gsdSelectedFilePathAtom,
} from "../atoms"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { PlanningDocEditor } from "./planning-doc-editor"
import { ChangesPanel } from "../../changes"
// TODO: Add react-resizable-panels package for proper resizable layout
// For now, using simple flex layout

type DocType = "planning" | "gsd"

/**
 * Version badge component showing current GSD version and update status
 */
function VersionBadge({
  version,
  updateAvailable,
  isChecking,
}: {
  version: string | null
  updateAvailable: boolean
  isChecking: boolean
}) {
  if (isChecking) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">
        {version ? `v${version}` : ""}
      </span>
      {updateAvailable && (
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Update available" />
      )}
    </div>
  )
}

export function GsdContent() {
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedGsdProjectIdAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [selectedPlanningDoc, setSelectedPlanningDoc] = useAtom(selectedPlanningDocAtom)
  const [selectedGsdDoc, setSelectedGsdDoc] = useAtom(selectedGsdDocAtom)
  const [updateInfo, setUpdateInfo] = useAtom(gsdUpdateInfoAtom)
  const [updateInProgress, setUpdateInProgress] = useAtom(gsdUpdateInProgressAtom)
  const [isEditMode, setIsEditMode] = useAtom(isGsdEditModeAtom)
  const [changesPanelOpen, setChangesPanelOpen] = useAtom(gsdChangesPanelOpenAtom)
  const [selectedFilePath, setSelectedFilePath] = useAtom(gsdSelectedFilePathAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedGsdCategory = useSetAtom(selectedGsdCategoryAtom)
  const setSelectedSidebarTab = useSetAtom(selectedSidebarTabAtom)
  const utils = trpc.useUtils()

  // Fetch projects to get the selected one
  const { data: projectsData } = trpc.projects.list.useQuery()

  // Fetch GSD version
  const { data: versionData } = trpc.gsd.getVersion.useQuery()

  // Check for updates
  const { data: updateData, isLoading: isCheckingUpdates } = trpc.gsd.checkForUpdates.useQuery(
    undefined,
    {
      enabled: !!versionData?.version,
      refetchOnMount: true,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  )

  // Update mutation
  const updateMutation = trpc.gsd.downloadUpdate.useMutation({
    onSuccess: (result) => {
      setUpdateInProgress(false)
      if (result.success) {
        window.location.reload()
      }
    },
    onError: () => {
      setUpdateInProgress(false)
    },
  })

  // Chat creation mutation for GSD commands
  const createChatMutation = trpc.chats.create.useMutation({
    onSuccess: (data) => {
      utils.chats.list.invalidate()
      setSelectedChatId(data.id)
      setSelectedGsdCategory(null)
      setSelectedSidebarTab("chats") // Switch view to show the new chat
    },
  })

  // Handler for "Add Plan" button - creates chat with /gsd:plan-phase command
  const handleAddPlan = () => {
    if (!selectedProjectId) return
    createChatMutation.mutate({
      projectId: selectedProjectId,
      name: "Plan Phase",
      initialMessageParts: [{ type: "text", text: "/gsd:plan-phase" }],
      useWorktree: true,
      mode: "agent",
    })
  }

  // Handler for "Add Phase" button - creates chat with /gsd:add-phase command
  const handleAddPhase = () => {
    if (!selectedProjectId) return
    createChatMutation.mutate({
      projectId: selectedProjectId,
      name: "Add Phase",
      initialMessageParts: [{ type: "text", text: "/gsd:add-phase" }],
      useWorktree: true,
      mode: "agent",
    })
  }

  // Handler for "Execute" button - creates chat with /gsd:execute-phase command
  const handleExecutePhase = () => {
    if (!selectedProjectId) return
    createChatMutation.mutate({
      projectId: selectedProjectId,
      name: "Execute Phase",
      initialMessageParts: [{ type: "text", text: "/gsd:execute-phase" }],
      useWorktree: true,
      mode: "agent",
    })
  }

  // Handler for "Discuss Phase" button - creates chat with /gsd:discuss-phase command
  const handleDiscussPhase = () => {
    if (!selectedProjectId) return
    createChatMutation.mutate({
      projectId: selectedProjectId,
      name: "Discuss Phase",
      initialMessageParts: [{ type: "text", text: "/gsd:discuss-phase" }],
      useWorktree: true,
      mode: "agent",
    })
  }

  // Update updateInfo atom when data changes
  useEffect(() => {
    if (updateData) {
      setUpdateInfo({
        available: updateData.updateAvailable,
        currentVersion: updateData.currentVersion,
        latestVersion: updateData.latestVersion,
        releaseUrl: updateData.releaseUrl,
        releaseNotes: updateData.releaseNotes,
      })
    }
  }, [updateData, setUpdateInfo])

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

  // Close edit mode when switching documents or switching to GSD docs
  useEffect(() => {
    if (activeDocType === "gsd" || !selectedPlanningDoc) {
      setIsEditMode(false)
      setChangesPanelOpen(false)
    }
  }, [selectedPlanningDoc, activeDocType, setIsEditMode, setChangesPanelOpen])

  // Check if project has .planning directory (in GsdContent to check for STATE.md)
  const { data: planningHasDocs } = trpc.gsd.hasPlanningDocs.useQuery(
    { projectPath: projectPath || "" },
    { enabled: !!projectPath }
  )

  // Fetch .planning files list (in GsdContent to check if STATE.md exists)
  const { data: planningDocsData } = trpc.gsd.listPlanningDocs.useQuery(
    { projectPath: projectPath || "" },
    { enabled: !!projectPath && planningHasDocs?.hasContent }
  )

  // Default to roadmap.md if it exists, then STATE.md, otherwise README.md
  useEffect(() => {
    if (!selectedPlanningDoc && !selectedGsdDoc && planningDocsData) {
      // Check if roadmap.md exists in planning docs (highest priority)
      const hasRoadmapMd = planningDocsData.files?.some((f) => f.name === "roadmap.md" && !f.isDirectory)
      if (hasRoadmapMd) {
        setSelectedPlanningDoc("roadmap.md")
        return
      }

      // Check if STATE.md exists in planning docs (second priority)
      const hasStateMd = planningDocsData.files?.some((f) => f.name === "STATE.md" && !f.isDirectory)
      if (hasStateMd) {
        setSelectedPlanningDoc("STATE.md")
      } else {
        // Fall back to README.md in GSD docs
        setSelectedGsdDoc("README.md")
      }
    }
  }, [selectedPlanningDoc, selectedGsdDoc, planningDocsData, setSelectedGsdDoc, setSelectedPlanningDoc])

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

  // Handle update download
  const handleUpdate = () => {
    if (updateData?.latestVersion && !updateInProgress) {
      setUpdateInProgress(true)
      updateMutation.mutate({ version: updateData.latestVersion })
    }
  }

  // Default to current workspace project if none selected
  useEffect(() => {
    if (!selectedProjectId && selectedProject?.id) {
      setSelectedProjectId(selectedProject.id)
    }
  }, [selectedProject, selectedProjectId, setSelectedProjectId])

  // Find selected project object for dropdown display
  const selectedProjectObj = useMemo(() => {
    if (!projectsData || !selectedProjectId) return null
    return projectsData.find((p) => p.id === selectedProjectId) || null
  }, [projectsData, selectedProjectId])

  return (
    <div className="flex flex-col h-full">
      {/* Header bar: LEFT (GSD logo, version, update) | RIGHT (project, branch) */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0 bg-muted/30">
        {/* Left side: GSD branding, version, update */}
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">GSD</span>
          <VersionBadge
            version={versionData?.version || null}
            updateAvailable={updateInfo?.available || false}
            isChecking={isCheckingUpdates}
          />
          {updateInfo?.available && updateInfo.latestVersion && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleUpdate}
              disabled={updateInProgress}
              className="h-6 text-[10px] px-2"
            >
              {updateInProgress ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Download className="h-3 w-3 mr-1" />
                  Update to v{updateInfo.latestVersion}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Right side: Action buttons, Project selector, branch */}
        <div className="flex items-center gap-2">
          {/* Action buttons */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddPlan}
            disabled={!selectedProjectId || createChatMutation.isPending}
            className="h-6 text-[10px] px-2 gap-1"
            title="Create a plan for a phase"
          >
            <FileText className="h-3 w-3" />
            Add Plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddPhase}
            disabled={!selectedProjectId || createChatMutation.isPending}
            className="h-6 text-[10px] px-2 gap-1"
            title="Add a new phase to the roadmap"
          >
            <ListPlus className="h-3 w-3" />
            Add Phase
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExecutePhase}
            disabled={!selectedProjectId || createChatMutation.isPending}
            className="h-6 text-[10px] px-2 gap-1"
            title="Execute a phase"
          >
            <Play className="h-3 w-3" />
            Execute
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDiscussPhase}
            disabled={!selectedProjectId || createChatMutation.isPending}
            className="h-6 text-[10px] px-2 gap-1"
            title="Discuss a phase"
          >
            <MessageSquare className="h-3 w-3" />
            Discuss
          </Button>

          <span className="text-muted-foreground text-xs mx-1">|</span>

          {/* Edit mode toggle - only show for planning docs */}
          {activeDocType === "planning" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditMode(!isEditMode)}
              className={cn(
                "h-6 text-[10px] px-2 gap-1",
                isEditMode && "bg-muted"
              )}
              title="Toggle edit mode"
            >
              <Edit className="h-3 w-3" />
              Edit
            </Button>
          )}

          {/* Changes panel toggle - only show when editing */}
          {isEditMode && activeDocType === "planning" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setChangesPanelOpen(!changesPanelOpen)}
              className={cn(
                "h-6 text-[10px] px-2 gap-1",
                changesPanelOpen && "bg-muted"
              )}
              title="View changes and commit"
            >
              <GitCommit className="h-3 w-3" />
              Changes
            </Button>
          )}

          <span className="text-muted-foreground text-xs mx-1">|</span>

          {/* Project selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-foreground/10 text-left">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs truncate max-w-[150px]">
                  {selectedProjectObj?.name || "Select project..."}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {projectsData?.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className="flex items-center gap-2"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate flex-1">{project.name}</span>
                  {project.id === selectedProjectId && (
                    <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              {(!projectsData || projectsData.length === 0) && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No projects available
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {projectPath && (
            <>
              <span className="text-muted-foreground text-xs">/</span>
              <BranchSelector projectPath={projectPath} />
            </>
          )}
        </div>
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
                    : "hover:bg-foreground/10"
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
                    : "hover:bg-foreground/10"
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

        {/* Content area with changes panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main content panel */}
          <div className={changesPanelOpen ? "flex-1 overflow-y-auto p-6" : "flex-1 overflow-y-auto p-6"}>
            {activeDocType === "gsd" && selectedGsdDoc && (
              <GsdDocContent docPath={selectedGsdDoc} />
            )}
            {activeDocType === "planning" && selectedPlanningDoc && projectPath && (
              isEditMode ? (
                <PlanningDocEditor
                  projectPath={projectPath}
                  docPath={selectedPlanningDoc}
                  onClose={() => setIsEditMode(false)}
                />
              ) : (
                <PlanningDocContent projectPath={projectPath} docPath={selectedPlanningDoc} />
              )
            )}
            {!activeDocType && (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Select a document to view</p>
              </div>
            )}
          </div>

          {/* Changes panel */}
          {changesPanelOpen && projectPath && (
            <>
              <div className="w-px bg-border flex-shrink-0" />
              <div className="w-96 overflow-y-auto flex-shrink-0">
                <ChangesPanel
                  worktreePath={projectPath}
                  selectedFilePath={selectedFilePath}
                  onFileSelect={(file) => setSelectedFilePath(file.path)}
                  onCommitSuccess={() => {
                    // Refetch planning docs list
                    utils.gsd.listPlanningDocs.invalidate()
                    // Clear selected file
                    setSelectedFilePath(null)
                  }}
                />
              </div>
            </>
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
            "flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-left hover:bg-foreground/10"
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
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-foreground/10"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs truncate">{node.name}</span>
    </button>
  )
}
