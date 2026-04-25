"use client"

import { useEffect } from "react"
import { useAtomValue } from "jotai"
import { selectedWorkflowCategoryAtom } from "../atoms"
import { WorkflowDetail } from "./workflow-detail"

/**
 * Main workflows content area
 * Shows full-width detail panel for selected workflow item
 * File list is shown in left sidebar, so only detail view is displayed here
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
      {/* Full-width Detail Panel - file list is already shown in left sidebar */}
      <div className="flex-1 overflow-hidden bg-background">
        <WorkflowDetail />
      </div>
    </div>
  )
}
