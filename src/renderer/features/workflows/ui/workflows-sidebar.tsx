"use client"

import { useCallback } from "react"
import { useAtom } from "jotai"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { WorkflowFlatFileList } from "./workflow-flat-file-list"
import { WorkflowDetail } from "./workflow-detail"
import { WorkflowSidebarHeader } from "./workflow-sidebar-header"
import {
  workflowPanelOpenAtom,
  workflowPanelWidthAtom,
  type WorkflowPanelCategory,
} from "../atoms"

interface WorkflowsSidebarProps {
  onScrollToWorkflow?: (id: string) => void // Optional future feature
}

export function WorkflowsSidebar({ onScrollToWorkflow }: WorkflowsSidebarProps) {
  const [panelOpen, setPanelOpen] = useAtom(workflowPanelOpenAtom)

  const isOpen = panelOpen !== null

  const closeSidebar = useCallback(() => {
    setPanelOpen(null)
  }, [setPanelOpen])

  // Get title based on category
  const getCategoryTitle = (category: WorkflowPanelCategory): string => {
    switch (category) {
      case "agents":
        return "Agents"
      case "commands":
        return "Commands"
      case "skills":
        return "Skills"
      case "mcps":
        return "MCPs"
      default:
        return ""
    }
  }

  const title = getCategoryTitle(panelOpen)

  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={closeSidebar}
      widthAtom={workflowPanelWidthAtom}
      side="right"
      minWidth={400}
      maxWidth={1000}
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
    >
      <div className="flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header */}
        <WorkflowSidebarHeader title={title} onClose={closeSidebar} />

        {/* Content: Horizontal split - File list + Detail */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* File List - Fixed width sidebar */}
          <div className="w-[280px] flex-shrink-0 border-r border-border/50 overflow-hidden">
            <WorkflowFlatFileList />
          </div>

          {/* Detail View - Flexible width */}
          <div className="flex-1 overflow-hidden">
            <WorkflowDetail />
          </div>
        </div>
      </div>
    </ResizableSidebar>
  )
}
