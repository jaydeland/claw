"use client"

import { useEffect } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { selectedWorkflowNodeAtom, workflowViewModeAtom } from "../atoms"
import { selectedProjectAtom } from "../../agents/atoms"
import { WorkflowDetailHeader } from "./workflow-detail-header"
import { WorkflowMarkdownView } from "./workflow-markdown-view"
import { WorkflowReactFlowView } from "./workflow-reactflow-view"
import { WorkflowMcpView } from "./workflow-mcp-view"
import { useContextualChat } from "../../shared/hooks/use-contextual-chat"
import { ContextualChatPane } from "../../shared/components/contextual-chat-pane"

/**
 * Detail panel for viewing workflow file content
 * Shows markdown view or flowchart view based on toggle
 * Review is now a dialog triggered from the header
 */
export function WorkflowDetail() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const viewMode = useAtomValue(workflowViewModeAtom)
  const setViewMode = useSetAtom(workflowViewModeAtom)

  // Determine sourceView based on node type
  const sourceView = selectedNode?.type === "command" ? "commands" as const : "skills" as const

  // Per-node persistent chat session
  const { chatId, subChatId, isLoading: isChatLoading, create: createChat, reset: resetChat } = useContextualChat({
    sourceView,
    sourceContext: { name: selectedNode?.name ?? "", type: selectedNode?.type ?? "" },
    projectId: selectedProject?.id ?? "",
    chatName: selectedNode ? `${sourceView === "skills" ? "Skill" : "Command"}: ${selectedNode.name}` : undefined,
    enabled: !!selectedNode && !!selectedProject && (selectedNode.type === "command" || selectedNode.type === "skill"),
  })

  // Always reset to markdown view when a new file is selected
  useEffect(() => {
    if (selectedNode) {
      console.log("[workflow-detail] selectedNode:", selectedNode)
      setViewMode("markdown")
    }
  }, [selectedNode?.id, setViewMode])

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

  // MCPs have custom view (no markdown files)
  if (selectedNode.type === "mcpServer") {
    return (
      <div className="flex flex-col h-full">
        <WorkflowDetailHeader />
        <WorkflowMcpView />
      </div>
    )
  }

  // Agents, Commands, Skills show markdown, flowchart, or chat
  return (
    <div className="flex flex-col h-full">
      <WorkflowDetailHeader />

      {viewMode === "markdown" && <WorkflowMarkdownView />}
      {viewMode === "flowchart" && <WorkflowReactFlowView />}
      {viewMode === "chat" && (
        <div className="flex-1 overflow-hidden">
          <ContextualChatPane
            chatId={chatId}
            subChatId={subChatId}
            projectId={selectedProject?.id ?? ""}
            projectPath={selectedProject?.path ?? ""}
            isSessionLoading={isChatLoading}
            onReset={resetChat}
            onCreate={createChat}
            placeholder={`Ask about this ${selectedNode.type}...`}
            systemContext={`You are helping the user understand and work with a Claude ${selectedNode.type} file.\n\nName: ${selectedNode.name}\nPath: ${selectedNode.sourcePath}`}
          />
        </div>
      )}
    </div>
  )
}
