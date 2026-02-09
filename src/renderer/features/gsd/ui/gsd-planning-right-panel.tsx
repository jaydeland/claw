"use client"

import { useState, useMemo, useCallback } from "react"
import { useAtom, useAtomValue } from "jotai"
import {
  FileText, Folder, ChevronRight, Sparkles, CheckCircle2, Circle,
  ArrowRight, Play, ListChecks, Layers, ShieldCheck, Plus, RefreshCw,
  Zap, AlertTriangle, CheckCircle, XCircle, HelpCircle, MessageCircle,
} from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { selectedGsdProjectIdAtom, selectedPlanningDocAtom, gsdPanelActiveTabAtom } from "../atoms"
import type { GsdPanelTab } from "../atoms"
import { selectedAgentChatIdAtom } from "../../agents/atoms"
import { GsdDocumentDialog } from "../../agents/components/gsd-document-dialog"

interface PlanningFile {
  path: string
  name: string
  type: "file" | "directory"
  depth: number
  children?: PlanningFile[]
}

interface NextAction {
  file: string
  title: string
  priority: "high" | "medium" | "low"
  hasCommand?: boolean
  fullText?: string
}

interface GsdPlanningRightPanelProps {
  onRunCommand?: (command: string) => void
}

/**
 * GSD Planning Right Panel - Shows planning folder files and next actions
 * Designed for the right sidebar to complement the main GSD content view
 */
export function GsdPlanningRightPanel({ onRunCommand }: GsdPlanningRightPanelProps) {
  const selectedProjectId = useAtomValue(selectedGsdProjectIdAtom)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const [selectedDoc, setSelectedDoc] = useAtom(selectedPlanningDocAtom)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Get project details
  const { data: project } = trpc.projects.get.useQuery(
    { id: selectedProjectId || "" },
    { enabled: !!selectedProjectId }
  )

  // Get current chat data to access worktreePath (cwd)
  const { data: chat } = trpc.chats.get.useQuery(
    { id: selectedChatId || "" },
    { enabled: !!selectedChatId }
  )

  // Use worktreePath if available (for git worktree chats), otherwise fall back to project path
  const cwdPath = chat?.worktreePath || project?.path || ""

  // List all planning files from the workspace cwd
  const { data: planningFiles, isLoading } = trpc.gsd.listPlanningDocs.useQuery(
    { projectPath: cwdPath },
    { enabled: !!cwdPath }
  )

  // Read document content when selected
  const { data: selectedDocContent } = trpc.gsd.readPlanningDoc.useQuery(
    {
      projectPath: cwdPath,
      filePath: selectedDoc || "",
    },
    { enabled: !!cwdPath && !!selectedDoc && dialogOpen }
  )

  // Get planning state (current phase, next actions, blockers)
  const { data: planningState } = trpc.gsd.getPlanningState.useQuery(
    { projectPath: cwdPath },
    { enabled: !!cwdPath }
  )

  // Build file tree structure from listPlanningDocs response
  // Returns: Array<{ name: string; path: string; isDirectory: boolean }>
  const fileTree = useMemo(() => {
    if (!planningFiles?.files) return []

    const allFiles = planningFiles.files
    const dirs = new Set<string>()

    // First pass: collect all directories from directory entries
    allFiles.forEach((entry) => {
      if (entry.isDirectory) {
        dirs.add(entry.path)
      }
      // Also collect parent directories of files
      const parts = entry.path.split("/")
      let currentPath = ""
      for (let i = 0; i < parts.length - (entry.isDirectory ? 0 : 1); i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]
        dirs.add(currentPath)
      }
    })

    // Create directory map
    const dirMap = new Map<string, PlanningFile>()
    dirs.forEach((dirPath) => {
      const parts = dirPath.split("/")
      const name = parts[parts.length - 1]
      const depth = parts.length - 1
      dirMap.set(dirPath, {
        path: dirPath,
        name,
        type: "directory",
        depth,
        children: [],
      })
    })

    // Add files and directories
    const rootItems: PlanningFile[] = []

    allFiles.forEach((entry) => {
      const parts = entry.path.split("/")
      const name = parts[parts.length - 1]
      const depth = parts.length - 1
      const parentPath = parts.slice(0, -1).join("/")

      if (entry.isDirectory) {
        // Directory entries are already handled in dirMap
        // Just ensure they get added to their parent
        const dir = dirMap.get(entry.path)
        if (dir && parentPath && dirMap.has(parentPath)) {
          const parent = dirMap.get(parentPath)!
          if (!parent.children?.find(c => c.path === dir.path)) {
            parent.children = parent.children || []
            parent.children.push(dir)
          }
        } else if (dir && !parentPath) {
          if (!rootItems.find(r => r.path === dir.path)) {
            rootItems.push(dir)
          }
        }
      } else {
        // It's a file
        const file: PlanningFile = {
          path: entry.path,
          name,
          type: "file",
          depth,
        }

        if (parentPath && dirMap.has(parentPath)) {
          const parent = dirMap.get(parentPath)!
          if (!parent.children?.find(c => c.path === file.path)) {
            parent.children = parent.children || []
            parent.children.push(file)
          }
        } else {
          rootItems.push(file)
        }
      }
    })

    // Add any directories that aren't already in the tree
    dirs.forEach((dirPath) => {
      const parts = dirPath.split("/")
      const parentPath = parts.slice(0, -1).join("/")
      const dir = dirMap.get(dirPath)!

      if (parentPath && dirMap.has(parentPath)) {
        const parent = dirMap.get(parentPath)!
        if (!parent.children?.find(c => c.path === dir.path)) {
          parent.children = parent.children || []
          parent.children.push(dir)
        }
      } else if (!parentPath) {
        if (!rootItems.find(r => r.path === dir.path)) {
          rootItems.push(dir)
        }
      }
    })

    return sortFiles(rootItems)
  }, [planningFiles])

  // Extract next actions from STATE.md planning state
  const nextActions = useMemo(() => {
    const actions: NextAction[] = []

    // Use parsed next actions from STATE.md if available
    if (planningState?.nextActions && planningState.nextActions.length > 0) {
      planningState.nextActions.forEach((actionText, index) => {
        // Parse command from patterns like `/gsd:command args`
        const commandMatch = actionText.match(/`(\/[^`]+)`/)
        const hasCommand = !!commandMatch

        // Clean title by removing command markdown
        const title = actionText.replace(/`[^`]+`/g, "").trim() || actionText

        // Priority based on order (first = high priority)
        const priority = index === 0 ? "high" : index === 1 ? "medium" : "low"

        actions.push({
          file: commandMatch ? commandMatch[1] : "",
          title,
          priority,
          hasCommand,
          fullText: actionText,
        })
      })
      return actions
    }

    // Fallback: Look for files that suggest next actions based on naming patterns
    if (!planningFiles?.files) return actions

    const actionPatterns = [
      { pattern: /next|todo|action|upcoming/i, priority: "high" as const },
      { pattern: /phase|milestone|sprint/i, priority: "medium" as const },
      { pattern: /plan|roadmap|backlog/i, priority: "low" as const },
    ]

    planningFiles.files
      .filter(entry => !entry.isDirectory) // Only consider files
      .forEach((entry) => {
        const name = entry.name
        const title = name.replace(/\.md$/i, "").replace(/[-_]/g, " ")

        for (const { pattern, priority } of actionPatterns) {
          if (pattern.test(name)) {
            actions.push({
              file: entry.path,
              title,
              priority,
              hasCommand: false,
              fullText: title,
            })
            break
          }
        }
      })

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
  }, [planningFiles, planningState])

  // Handle file click
  const handleFileClick = useCallback((path: string) => {
    setSelectedDoc(path)
    setDialogOpen(true)
  }, [setSelectedDoc])

  // Close dialog
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setSelectedDoc(null)
  }, [setSelectedDoc])

  // Handle next action click - run command if available, otherwise open file
  const handleActionClick = useCallback((action: NextAction) => {
    if (action.hasCommand && action.file && onRunCommand) {
      // Run the command in chat
      onRunCommand(action.file)
    } else if (action.file) {
      // Open the file
      setSelectedDoc(action.file)
      setDialogOpen(true)
    }
  }, [setSelectedDoc, onRunCommand])

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground">
        <Folder className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm text-center">Select a project to view planning docs</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p className="text-sm">Loading planning files...</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
          <Folder className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium truncate">.planning</span>
        </div>

        {/* File Tree */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {fileTree.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No planning files found</p>
                <p className="text-xs mt-1 opacity-70">Create a .planning folder</p>
              </div>
            ) : (
              <FileTreeList
                files={fileTree}
                onFileClick={handleFileClick}
                selectedPath={selectedDoc}
              />
            )}
          </div>
        </div>

        {/* Tabbed Bottom Section */}
        <GsdPanelTabs
          cwdPath={cwdPath}
          nextActions={nextActions}
          onActionClick={handleActionClick}
          onRunCommand={onRunCommand}
          onFileClick={handleFileClick}
        />
      </div>

      {/* Document Dialog */}
      <GsdDocumentDialog
        isOpen={dialogOpen}
        documentPath={selectedDoc}
        projectPath={cwdPath || null}
        onClose={handleCloseDialog}
      />
    </>
  )
}

/**
 * File Tree List Component - Renders files and folders recursively
 */
interface FileTreeListProps {
  files: PlanningFile[]
  onFileClick: (path: string) => void
  selectedPath: string | null
  depth?: number
}

function FileTreeList({ files, onFileClick, selectedPath, depth = 0 }: FileTreeListProps) {
  return (
    <div className="space-y-0.5">
      {files.map((file) => (
        <FileTreeItem
          key={file.path}
          file={file}
          onFileClick={onFileClick}
          selectedPath={selectedPath}
          depth={depth}
        />
      ))}
    </div>
  )
}

/**
 * Individual File Tree Item
 */
interface FileTreeItemProps {
  file: PlanningFile
  onFileClick: (path: string) => void
  selectedPath: string | null
  depth: number
}

function FileTreeItem({ file, onFileClick, selectedPath, depth }: FileTreeItemProps) {
  const isSelected = selectedPath === file.path
  const isDirectory = file.type === "directory"

  if (isDirectory) {
    return (
      <div>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-muted-foreground",
            "hover:bg-accent/30 transition-colors"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <Folder className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
          <span className="text-xs font-medium truncate">{file.name}</span>
        </div>
        {file.children && file.children.length > 0 && (
          <div className="mt-0.5">
            <FileTreeList
              files={file.children}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
              depth={depth + 1}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onFileClick(file.path)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1 rounded text-left",
        "hover:bg-accent/50 transition-colors",
        "group",
        isSelected && "bg-accent/70 text-accent-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FileText className={cn(
        "h-3.5 w-3.5 flex-shrink-0",
        isSelected ? "text-primary" : "text-muted-foreground/70 group-hover:text-primary/70"
      )} />
      <span className={cn(
        "text-xs truncate flex-1",
        isSelected ? "font-medium" : "text-muted-foreground group-hover:text-foreground"
      )}>
        {file.name.replace(/\.md$/i, "")}
      </span>
      <ArrowRight className={cn(
        "h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100",
        isSelected ? "text-accent-foreground" : "text-muted-foreground"
      )} />
    </button>
  )
}

/**
 * Sort files: directories first, then alphabetically
 */
function sortFiles(files: PlanningFile[]): PlanningFile[] {
  return files.sort((a, b) => {
    // Directories come before files
    if (a.type === "directory" && b.type !== "directory") return -1
    if (a.type !== "directory" && b.type === "directory") return 1
    // Alphabetical within same type
    return a.name.localeCompare(b.name)
  }).map(file => {
    // Recursively sort children
    if (file.children) {
      return { ...file, children: sortFiles(file.children) }
    }
    return file
  })
}

// ============================================
// Tabbed Bottom Section
// ============================================

const TAB_CONFIG: Array<{ id: GsdPanelTab; label: string; icon: typeof Sparkles }> = [
  { id: "next", label: "Next", icon: Sparkles },
  { id: "plan", label: "Plan", icon: ListChecks },
  { id: "phase", label: "Phase", icon: Layers },
  { id: "verify", label: "Verify", icon: ShieldCheck },
]

interface GsdPanelTabsProps {
  cwdPath: string
  nextActions: NextAction[]
  onActionClick: (action: NextAction) => void
  onRunCommand?: (command: string) => void
  onFileClick: (path: string) => void
}

function GsdPanelTabs({ cwdPath, nextActions, onActionClick, onRunCommand, onFileClick }: GsdPanelTabsProps) {
  const [activeTab, setActiveTab] = useAtom(gsdPanelActiveTabAtom)

  return (
    <>
      <div className="border-t border-border/50" />
      <div className="flex-shrink-0 bg-muted/20 flex flex-col min-h-0">
        {/* Tab Bar */}
        <div className="flex items-center border-b border-border/30">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors",
                  "hover:text-foreground",
                  isActive
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="max-h-[250px] overflow-y-auto">
          {activeTab === "next" && (
            <NextTabContent actions={nextActions} onActionClick={onActionClick} />
          )}
          {activeTab === "plan" && (
            <PlanTabContent cwdPath={cwdPath} onRunCommand={onRunCommand} onFileClick={onFileClick} />
          )}
          {activeTab === "phase" && (
            <PhaseTabContent cwdPath={cwdPath} onRunCommand={onRunCommand} />
          )}
          {activeTab === "verify" && (
            <VerifyTabContent cwdPath={cwdPath} onRunCommand={onRunCommand} onFileClick={onFileClick} />
          )}
        </div>
      </div>
    </>
  )
}

// ============================================
// Next Tab - Suggested next actions
// ============================================

function NextTabContent({
  actions,
  onActionClick,
}: {
  actions: NextAction[]
  onActionClick: (action: NextAction) => void
}) {
  if (actions.length === 0) {
    return (
      <div className="p-3 text-center text-muted-foreground">
        <Sparkles className="h-5 w-5 mx-auto mb-1.5 opacity-30" />
        <p className="text-xs">No next actions found</p>
        <p className="text-[10px] mt-0.5 opacity-70">Actions are parsed from STATE.md</p>
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={() => onActionClick(action)}
          className={cn(
            "w-full flex items-start gap-2 px-2 py-1.5 rounded text-left",
            "hover:bg-accent/50 transition-colors",
            "group"
          )}
        >
          {action.hasCommand ? (
            <Play className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0 fill-primary/20" />
          ) : action.priority === "high" ? (
            <Circle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0 fill-red-500/20" />
          ) : action.priority === "medium" ? (
            <Circle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0 fill-amber-500/20" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate group-hover:text-foreground">
              {action.title}
            </p>
            {action.hasCommand ? (
              <p className="text-[10px] text-primary truncate font-mono">
                {action.file}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground truncate">
                {action.file}
              </p>
            )}
          </div>
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5" />
        </button>
      ))}
    </div>
  )
}

// ============================================
// Plan Tab - Incomplete plans
// ============================================

function PlanTabContent({
  cwdPath,
  onRunCommand,
  onFileClick,
}: {
  cwdPath: string
  onRunCommand?: (command: string) => void
  onFileClick: (path: string) => void
}) {
  const { data, isLoading } = trpc.gsd.getIncompletePlans.useQuery(
    { projectPath: cwdPath },
    { enabled: !!cwdPath }
  )

  if (isLoading) {
    return (
      <div className="p-3 flex justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const plans = data?.plans || []

  if (plans.length === 0) {
    return (
      <div className="p-3 text-center text-muted-foreground">
        <ListChecks className="h-5 w-5 mx-auto mb-1.5 opacity-30" />
        <p className="text-xs">No incomplete plans</p>
        <p className="text-[10px] mt-0.5 opacity-70">All plans are complete or none exist</p>
        {onRunCommand && (
          <button
            onClick={() => onRunCommand("/gsd:plan-phase")}
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Create a plan
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {plans.map((plan) => (
        <div
          key={`${plan.phaseNumber}-${plan.planNumber}`}
          className={cn(
            "flex items-start gap-2 px-2 py-1.5 rounded",
            "hover:bg-accent/50 transition-colors group"
          )}
        >
          <ListChecks className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
          <button
            onClick={() => {
              const relPath = plan.planPath.split(".planning/")[1]
              if (relPath) onFileClick(relPath)
            }}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-xs font-medium truncate group-hover:text-foreground">
              Phase {plan.phaseNumber} / Plan {plan.planNumber}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {plan.tasks.length} task{plan.tasks.length !== 1 ? "s" : ""}
              {plan.mustHaves.length > 0 && ` · ${plan.mustHaves.length} must-have${plan.mustHaves.length !== 1 ? "s" : ""}`}
            </p>
          </button>
          {onRunCommand && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
              <button
                onClick={() => onRunCommand(`/gsd:plan-phase ${plan.phaseNumber}`)}
                className="p-0.5 rounded hover:bg-accent/50 transition-colors"
                title="Plan this phase"
              >
                <ListChecks className="h-3 w-3 text-primary" />
              </button>
              <button
                onClick={() => onRunCommand(`/gsd:discuss-phase ${plan.phaseNumber}`)}
                className="p-0.5 rounded hover:bg-accent/50 transition-colors"
                title="Discuss this phase"
              >
                <MessageCircle className="h-3 w-3 text-blue-500" />
              </button>
              <button
                onClick={() => onRunCommand(`/gsd:execute-phase ${plan.phaseNumber}`)}
                className="p-0.5 rounded hover:bg-accent/50 transition-colors"
                title="Execute this phase"
              >
                <Play className="h-3 w-3 text-amber-500" />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Quick actions */}
      {onRunCommand && (
        <div className="flex items-center gap-1 pt-1 border-t border-border/20 mt-1">
          <button
            onClick={() => onRunCommand("/gsd:plan-phase")}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
          <button
            onClick={() => onRunCommand("/gsd:update-roadmap")}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Update
          </button>
          <button
            onClick={() => onRunCommand("/gsd:quick")}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <Zap className="h-3 w-3" />
            Quick
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================
// Phase Tab - Incomplete phases
// ============================================

function PhaseTabContent({
  cwdPath,
  onRunCommand,
}: {
  cwdPath: string
  onRunCommand?: (command: string) => void
}) {
  const { data, isLoading } = trpc.gsd.getRoadmapPhases.useQuery(
    { projectPath: cwdPath },
    { enabled: !!cwdPath }
  )

  if (isLoading) {
    return (
      <div className="p-3 flex justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const phases = data?.phases || []
  const incompletePhases = phases.filter(
    (p) => p.status === "in_progress" || p.status === "not_started"
  )

  if (incompletePhases.length === 0) {
    return (
      <div className="p-3 text-center text-muted-foreground">
        <Layers className="h-5 w-5 mx-auto mb-1.5 opacity-30" />
        <p className="text-xs">
          {phases.length === 0 ? "No phases found" : "All phases complete"}
        </p>
        <p className="text-[10px] mt-0.5 opacity-70">
          {phases.length === 0 ? "Create a ROADMAP.md in .planning/" : `${phases.length} phase${phases.length !== 1 ? "s" : ""} total`}
        </p>
        {onRunCommand && (
          <button
            onClick={() => onRunCommand("/gsd:init")}
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Initialize GSD
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {incompletePhases.map((phase) => (
        <div
          key={phase.phaseNumber}
          className={cn(
            "flex items-start gap-2 px-2 py-1.5 rounded",
            "group"
          )}
        >
          {phase.status === "in_progress" ? (
            <div className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              <span className="text-muted-foreground">P{phase.phaseNumber}</span>{" "}
              {phase.phaseName}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {phase.description}
            </p>
            {phase.plansList.length > 0 && (
              <p className="text-[10px] text-muted-foreground/70">
                {phase.plansList.length} plan{phase.plansList.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {onRunCommand && phase.status === "not_started" && (
            <button
              onClick={() => onRunCommand(`/gsd:plan-phase ${phase.phaseNumber}`)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/50 transition-all"
              title="Plan this phase"
            >
              <Play className="h-3 w-3 text-primary" />
            </button>
          )}
          {onRunCommand && phase.status === "in_progress" && (
            <button
              onClick={() => onRunCommand(`/gsd:execute-phase ${phase.phaseNumber}`)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/50 transition-all"
              title="Execute this phase"
            >
              <Zap className="h-3 w-3 text-amber-500" />
            </button>
          )}
        </div>
      ))}

      {/* Quick actions */}
      {onRunCommand && (
        <div className="flex items-center gap-1 pt-1 border-t border-border/20 mt-1">
          <button
            onClick={() => onRunCommand("/gsd:init")}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
          <button
            onClick={() => onRunCommand("/gsd:update-roadmap")}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Update
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================
// Verify Tab - Verification state
// ============================================

const VERIFY_STATUS_CONFIG = {
  passed: { icon: CheckCircle, color: "text-green-500", label: "Passed" },
  gaps_found: { icon: AlertTriangle, color: "text-amber-500", label: "Gaps Found" },
  human_needed: { icon: HelpCircle, color: "text-blue-500", label: "Human Needed" },
  not_verified: { icon: XCircle, color: "text-muted-foreground/50", label: "Not Verified" },
} as const

function VerifyTabContent({
  cwdPath,
  onRunCommand,
  onFileClick,
}: {
  cwdPath: string
  onRunCommand?: (command: string) => void
  onFileClick: (path: string) => void
}) {
  const { data, isLoading } = trpc.gsd.getVerificationStatus.useQuery(
    { projectPath: cwdPath },
    { enabled: !!cwdPath }
  )

  if (isLoading) {
    return (
      <div className="p-3 flex justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const verifications = data?.verifications || []

  if (verifications.length === 0) {
    return (
      <div className="p-3 text-center text-muted-foreground">
        <ShieldCheck className="h-5 w-5 mx-auto mb-1.5 opacity-30" />
        <p className="text-xs">No phases to verify</p>
        <p className="text-[10px] mt-0.5 opacity-70">Complete a phase to enable verification</p>
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {verifications.map((v) => {
        const config = VERIFY_STATUS_CONFIG[v.status]
        const StatusIcon = config.icon
        return (
          <div
            key={v.phaseNumber}
            className="group"
          >
            <div className="flex items-start gap-2 px-2 py-1.5 rounded">
              <StatusIcon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", config.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium truncate">
                    <span className="text-muted-foreground">P{v.phaseNumber}</span>{" "}
                    {v.phaseName}
                  </p>
                  <span className={cn(
                    "text-[9px] px-1 py-0.5 rounded-sm font-medium flex-shrink-0",
                    v.status === "passed" && "bg-green-500/10 text-green-500",
                    v.status === "gaps_found" && "bg-amber-500/10 text-amber-500",
                    v.status === "human_needed" && "bg-blue-500/10 text-blue-500",
                    v.status === "not_verified" && "bg-muted text-muted-foreground",
                  )}>
                    {config.label}
                  </span>
                </div>
                {v.gaps.length > 0 && (
                  <p className="text-[10px] text-amber-500 truncate">
                    {v.gaps.length} gap{v.gaps.length !== 1 ? "s" : ""} remaining
                  </p>
                )}
              </div>
              {v.verificationPath && (
                <button
                  onClick={() => onFileClick(v.verificationPath!)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/50 transition-all flex-shrink-0"
                  title="View verification"
                >
                  <FileText className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Commands for this phase */}
            {v.commands.length > 0 && onRunCommand && (
              <div className="flex flex-wrap gap-1 px-2 pb-1 ml-5">
                {v.commands.map((cmd, i) => (
                  <button
                    key={i}
                    onClick={() => onRunCommand(cmd)}
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono",
                      "bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                    )}
                  >
                    <Play className="h-2.5 w-2.5 fill-primary/20" />
                    {cmd.replace("/gsd:", "")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
