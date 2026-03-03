"use client"

import { memo, useState, useCallback, useRef, useEffect } from "react"
import { GripVertical } from "lucide-react"
import { cn } from "../../../lib/utils"
import { GitHubContentPane } from "./github-content-pane"
import { GitHubChatPane } from "./github-chat-pane"
import type { GitHubSelection } from "../atoms"

interface WorkspaceGitHubViewProps {
  projectId: string
  projectPath: string
  selection: GitHubSelection
}

export const WorkspaceGitHubView = memo(function WorkspaceGitHubView({
  projectId,
  projectPath,
  selection,
}: WorkspaceGitHubViewProps) {
  const [chatWidth, setChatWidth] = useState(30) // percentage
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - containerRect.left
      const mousePercent = (x / containerRect.width) * 100
      // chat width = space to the right of the cursor
      const newChatWidth = Math.max(20, Math.min(70, 100 - mousePercent))
      setChatWidth(newChatWidth)
    }

    const handleMouseUp = () => setIsDragging(false)

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging])

  const contentWidth = 100 - chatWidth

  return (
    <div
      ref={containerRef}
      className="flex-1 h-full flex overflow-hidden"
      style={{ userSelect: isDragging ? "none" : "auto" }}
    >
      {/* Content pane */}
      <div
        className="flex-shrink-0 overflow-hidden border-r border-border"
        style={{ width: `${contentWidth}%` }}
      >
        <GitHubContentPane
          projectId={projectId}
          projectPath={projectPath}
          selection={selection}
        />
      </div>

      {/* Resize handle */}
      <div
        className={cn(
          "w-1.5 flex-shrink-0 bg-border/50 hover:bg-primary/30 cursor-col-resize flex items-center justify-center transition-all",
          isDragging && "bg-primary"
        )}
        onMouseDown={handleMouseDown}
        title="Drag to resize chat panel"
      >
        <GripVertical className={cn(
          "h-4 w-4 text-muted-foreground transition-opacity",
          isDragging ? "opacity-100" : "opacity-0 hover:opacity-70"
        )} />
      </div>

      {/* Chat pane */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{ width: `${chatWidth}%` }}
      >
        <GitHubChatPane
          projectId={projectId}
          projectPath={projectPath}
          selection={selection}
        />
      </div>
    </div>
  )
})
