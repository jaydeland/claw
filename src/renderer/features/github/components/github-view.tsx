"use client"

import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { PanelLeftClose, PanelLeft, GripVertical, GitBranch, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { githubTreeWidthAtom, githubSelectionAtom, githubSelectedBranchAtom } from "../atoms"
import { GitHubTreePane } from "./github-tree-pane"
import { GitHubContentPane } from "./github-content-pane"
import { GitHubChatPane } from "./github-chat-pane"

interface GitHubViewProps {
  projects: Array<{ id: string; path: string; name: string }>
}

export const GitHubView = memo(function GitHubView({ projects }: GitHubViewProps) {
  const selection = useAtomValue(githubSelectionAtom)
  const [selectedBranches, setSelectedBranches] = useAtom(githubSelectedBranchAtom)

  // Build a map for O(1) lookup of project by id
  const projectsMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  )

  // Derive the active project from the current selection (or fall back to first project)
  const activeProject = (selection?.repoId ? projectsMap.get(selection.repoId) : undefined) ?? projects[0]
  const activeProjectId = activeProject?.id ?? ""
  const activeProjectPath = activeProject?.path ?? ""

  // Fetch branches for the active project
  const { data: branchData, isLoading: isLoadingBranches } = trpc.gsd.getBranches.useQuery(
    { projectPath: activeProjectPath },
    { enabled: !!activeProjectPath }
  )

  const currentBranch = selectedBranches[activeProjectPath] || branchData?.current || "main"

  const handleBranchSelect = useCallback((branch: string) => {
    setSelectedBranches((prev) => ({ ...prev, [activeProjectPath]: branch }))
  }, [activeProjectPath, setSelectedBranches])

  // Panel widths (as percentages for responsive layout)
  const [treeWidth, setTreeWidth] = useState(20) // percentage
  const [contentWidth, setContentWidth] = useState(50) // percentage of remaining space
  const [isDraggingTree, setIsDraggingTree] = useState(false)
  const [isDraggingContent, setIsDraggingContent] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle drag for tree panel
  const handleTreeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingTree(true)
  }, [])

  // Handle drag for content/chat split
  const handleContentMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingContent(true)
  }, [])

  // Mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - containerRect.left
      const containerWidth = containerRect.width

      if (isDraggingTree) {
        // Calculate tree width as percentage
        const newTreeWidth = Math.max(15, Math.min(30, (x / containerWidth) * 100))
        setTreeWidth(newTreeWidth)
      } else if (isDraggingContent) {
        // Calculate content width relative to remaining space
        const remainingWidth = containerWidth * ((100 - treeWidth) / 100)
        const contentX = x - containerWidth * (treeWidth / 100)
        const newContentWidth = Math.max(30, Math.min(70, (contentX / remainingWidth) * 100))
        setContentWidth(newContentWidth)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingTree(false)
      setIsDraggingContent(false)
    }

    if (isDraggingTree || isDraggingContent) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDraggingTree, isDraggingContent, treeWidth])

  const chatWidth = 100 - contentWidth

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col bg-background"
      style={{ userSelect: isDraggingTree || isDraggingContent ? "none" : "auto" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">GitHub</h2>

          {/* Branch Selector */}
          {activeProjectPath && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-xs">/</span>
              {isLoadingBranches ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : branchData?.branches.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 text-xs hover:text-foreground transition-colors">
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
              ) : (
                <span className="flex items-center gap-1 text-xs">
                  <GitBranch className="h-3 w-3" />
                  {currentBranch}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Action buttons can go here */}
        </div>
      </div>

      {/* Main content with resizable panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tree Pane */}
        <div
          className="flex-shrink-0 border-r border-border overflow-hidden"
          style={{ width: `${treeWidth}%` }}
        >
          <GitHubTreePane projects={projects} />
        </div>

        {/* Tree resize handle */}
        <div
          className={cn(
            "w-1 flex-shrink-0 bg-border hover:bg-primary/50 cursor-col-resize flex items-center justify-center transition-colors",
            isDraggingTree && "bg-primary"
          )}
          onMouseDown={handleTreeMouseDown}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100" />
        </div>

        {/* Content + Chat Panes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Content Pane */}
          <div
            className="overflow-hidden"
            style={{ width: `${contentWidth}%` }}
          >
            <GitHubContentPane
              projectId={activeProjectId}
              projectPath={activeProjectPath}
              selection={selection}
            />
          </div>

          {/* Content/Chat resize handle */}
          <div
            className={cn(
              "w-1 flex-shrink-0 bg-border hover:bg-primary/50 cursor-col-resize flex items-center justify-center transition-colors",
              isDraggingContent && "bg-primary"
            )}
            onMouseDown={handleContentMouseDown}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100" />
          </div>

          {/* Chat Pane */}
          <div
            className="overflow-hidden border-l border-border"
            style={{ width: `${chatWidth}%` }}
          >
            <GitHubChatPane
              projectId={activeProjectId}
              projectPath={activeProjectPath}
              selection={selection}
            />
          </div>
        </div>
      </div>
    </div>
  )
})