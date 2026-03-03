"use client"

import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useAtomValue } from "jotai"
import { GripVertical } from "lucide-react"
import { cn } from "../../../lib/utils"
import { githubSelectionAtom } from "../atoms"
import { GitHubTreePane } from "./github-tree-pane"
import { GitHubContentPane } from "./github-content-pane"
import { GitHubChatPane } from "./github-chat-pane"

interface GitHubViewProps {
  projects: Array<{ id: string; path: string; name: string }>
}

export const GitHubView = memo(function GitHubView({ projects }: GitHubViewProps) {
  const selection = useAtomValue(githubSelectionAtom)

  // Build a map for O(1) lookup of project by id
  const projectsMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  )

  // Derive the active project from the current selection (or fall back to first project)
  const activeProject = (selection?.repoId ? projectsMap.get(selection.repoId) : undefined) ?? projects[0]
  const activeProjectId = activeProject?.id ?? ""
  const activeProjectPath = activeProject?.path ?? ""

  // Panel widths (as percentages of total container width)
  // Three panels: tree | content | chat
  const [treeWidth, setTreeWidth] = useState(20) // percentage
  const [contentWidth, setContentWidth] = useState(50) // percentage
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
      const mousePercent = (x / containerWidth) * 100

      if (isDraggingTree) {
        // Tree panel: min 15%, max 35%
        // Must leave at least 25% for content + 20% for chat = 45% minimum remaining
        const maxTreeWidth = Math.min(35, 100 - 45)
        const newTreeWidth = Math.max(15, Math.min(maxTreeWidth, mousePercent))
        setTreeWidth(newTreeWidth)
      } else if (isDraggingContent) {
        // Content ends where the mouse is (minus tree width)
        // Content width = mouseX - treeWidth
        const rawContentWidth = mousePercent - treeWidth

        // Content min: 25%, Content max: whatever leaves 20% for chat
        const minContentWidth = 25
        const maxContentWidth = 100 - treeWidth - 20 // Leave at least 20% for chat

        // Clamp to valid range
        const newContentWidth = Math.max(minContentWidth, Math.min(maxContentWidth, rawContentWidth))
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
  }, [isDraggingTree, isDraggingContent, treeWidth, contentWidth])

  // Calculate chat width as remaining space (min 20%)
  const chatWidth = Math.max(20, 100 - treeWidth - contentWidth)

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col bg-background"
      style={{ userSelect: isDraggingTree || isDraggingContent ? "none" : "auto" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-lg font-semibold">GitHub</h2>
      </div>

      {/* Main content with resizable panels - flat structure for absolute percentages */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tree Pane */}
        <div
          className="flex-shrink-0 border-r border-border overflow-hidden"
          style={{ width: `${treeWidth}%` }}
        >
          <GitHubTreePane projects={projects} />
        </div>

        {/* Tree/Content resize handle */}
        <div
          className={cn(
            "w-1.5 flex-shrink-0 bg-border/50 hover:bg-primary/30 cursor-col-resize flex items-center justify-center transition-all",
            isDraggingTree && "bg-primary"
          )}
          onMouseDown={handleTreeMouseDown}
          title="Drag to resize tree panel"
        >
          <GripVertical className={cn(
            "h-4 w-4 text-muted-foreground transition-opacity",
            isDraggingTree ? "opacity-100" : "opacity-0 hover:opacity-70"
          )} />
        </div>

        {/* Content Pane */}
        <div
          className="flex-shrink-0 overflow-hidden border-r border-border"
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
            "w-1.5 flex-shrink-0 bg-border/50 hover:bg-primary/30 cursor-col-resize flex items-center justify-center transition-all",
            isDraggingContent && "bg-primary"
          )}
          onMouseDown={handleContentMouseDown}
          title="Drag to resize chat panel"
        >
          <GripVertical className={cn(
            "h-4 w-4 text-muted-foreground transition-opacity",
            isDraggingContent ? "opacity-100" : "opacity-0 hover:opacity-70"
          )} />
        </div>

        {/* Chat Pane */}
        <div
          className="flex-shrink-0 overflow-hidden"
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
  )
})