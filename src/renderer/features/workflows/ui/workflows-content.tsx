"use client"

import { useEffect } from "react"
import { useAtomValue } from "jotai"
import { workflowFileListWidthAtom, selectedWorkflowCategoryAtom } from "../atoms"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
import { WorkflowFileList } from "./workflow-file-list"
import { WorkflowDetail } from "./workflow-detail"

/**
 * Main workflows content area
 * Shows file list sidebar on left and detail panel on right
 * Displayed when a workflow category is selected
 */
export function WorkflowsContent() {
  const selectedCategory = useAtomValue(selectedWorkflowCategoryAtom)

  // Debug logging
  useEffect(() => {
    console.log("[workflows-content] Component mounted, category:", selectedCategory)
  }, [selectedCategory])

  // Safety check
  if (!selectedCategory) {
    console.warn("[workflows-content] Rendered with no category selected")
    return null
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Debug indicator */}
      <div className="absolute top-4 right-4 z-50 px-3 py-1 bg-purple-500 text-white text-xs rounded">
        Workflows: {selectedCategory}
      </div>

      {/* File List Sidebar */}
      <div className="w-[280px] border-r overflow-hidden bg-background flex-shrink-0">
        <WorkflowFileList />
      </div>

      {/* Detail Panel */}
      <div className="flex-1 overflow-hidden bg-background">
        <WorkflowDetail />
      </div>
    </div>
  )
}
