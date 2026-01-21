"use client"

import { useAtomValue } from "jotai"
import { selectedWorkflowNodeAtom, workflowViewModeAtom } from "../atoms"
import { WorkflowDetailHeader } from "./workflow-detail-header"
import { WorkflowMarkdownView } from "./workflow-markdown-view"
import { WorkflowReactFlowView } from "./workflow-reactflow-view"

/**
 * Detail panel for viewing workflow file content
 * Shows markdown view or flowchart view based on toggle
 */
export function WorkflowDetail() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const viewMode = useAtomValue(workflowViewModeAtom)

  if (!selectedNode) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Select a file to view details
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <WorkflowDetailHeader />

      {viewMode === "markdown" ? (
        <WorkflowMarkdownView />
      ) : (
        <WorkflowReactFlowView />
      )}
    </div>
  )
}
