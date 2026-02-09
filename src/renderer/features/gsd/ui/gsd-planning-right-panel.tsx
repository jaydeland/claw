"use client"

import { useState, useMemo, useCallback } from "react"
import { useAtom, useAtomValue } from "jotai"
import { FileText, Folder, ChevronRight, Sparkles, CheckCircle2, Circle, ArrowRight, Play } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { selectedGsdProjectIdAtom, selectedPlanningDocAtom } from "../atoms"
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

        {/* Next Actions Section */}
        {nextActions.length > 0 && (
          <>
            <div className="border-t border-border/50" />
            <div className="flex-shrink-0 bg-muted/20">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Next Actions ({nextActions.length})
                </span>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                <div className="p-2 space-y-1">
                  {nextActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => handleActionClick(action)}
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
              </div>
            </div>
          </>
        )}
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
