"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useAtomValue } from "jotai"
import { atom } from "jotai"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
} from "reactflow"
import "reactflow/dist/style.css"

import {
  messageIdsAtom,
  messageAtomFamily,
  type Message,
} from "../../agents/stores/message-store"
import { sessionFlowNodeTypes } from "../components/session-flow-nodes"
import { transformMessagesToFlow } from "../lib/message-transformer"

interface SessionFlowPanelProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

// Derive all messages from the atom family
// This creates a derived atom that collects all messages
function useAllMessages(): Message[] {
  const messageIds = useAtomValue(messageIdsAtom)

  // Create a derived atom for each render that collects messages
  const allMessagesAtom = useMemo(
    () =>
      atom((get) => {
        return messageIds
          .map((id) => get(messageAtomFamily(id)))
          .filter((msg): msg is Message => msg !== null)
      }),
    [messageIds],
  )

  return useAtomValue(allMessagesAtom)
}

// MiniMap node color function
function getNodeColor(node: Node): string {
  switch (node.type) {
    case "userMessage":
      return "#3b82f6" // blue
    case "assistantResponse":
      return "#9333ea" // purple
    case "toolCall":
      return "#06b6d4" // cyan
    case "agentSpawn":
      return "#f59e0b" // amber
    default:
      return "#64748b" // slate
  }
}

function SessionFlowPanelInner({ onScrollToMessage }: SessionFlowPanelProps) {
  const messages = useAllMessages()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Handle node click - scroll to message
  const handleNodeClick = useCallback(
    (messageId: string, partIndex?: number) => {
      onScrollToMessage(messageId, partIndex)
    },
    [onScrollToMessage],
  )

  // Transform messages to nodes/edges when messages change
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = transformMessagesToFlow(messages, {
      onNodeClick: handleNodeClick,
    })
    setNodes(newNodes)
    setEdges(newEdges)
  }, [messages, handleNodeClick, setNodes, setEdges])

  return (
    <div className="h-full w-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={sessionFlowNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          style: { stroke: "#94a3b8", strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-left"
        />
        <MiniMap
          nodeColor={getNodeColor}
          maskColor="rgba(0, 0, 0, 0.1)"
          position="bottom-right"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}

export function SessionFlowPanel(props: SessionFlowPanelProps) {
  return (
    <ReactFlowProvider>
      <SessionFlowPanelInner {...props} />
    </ReactFlowProvider>
  )
}
