"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { atom } from "jotai"
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
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
import { sessionFlowUserScrolledAtom, sessionFlowExpandedNodesAtom } from "../atoms"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"

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

function SessionFlowPanelInner({ onScrollToMessage }: SessionFlowPanelProps) {
  const messages = useAllMessages()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [userScrolled, setUserScrolled] = useAtom(sessionFlowUserScrolledAtom)
  const [expandedNodes, setExpandedNodes] = useAtom(sessionFlowExpandedNodesAtom)
  const reactFlowInstance = useReactFlow()
  const previousNodeCountRef = useRef(0)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Handle node click - scroll to message
  const handleNodeClick = useCallback(
    (messageId: string, partIndex?: number) => {
      onScrollToMessage(messageId, partIndex)
    },
    [onScrollToMessage],
  )

  // Handle expansion toggle
  const handleToggleExpansion = useCallback(
    (nodeId: string) => {
      setExpandedNodes((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId)
        } else {
          newSet.add(nodeId)
        }
        return newSet
      })
    },
    [setExpandedNodes],
  )

  // Transform messages to nodes/edges when messages change
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = transformMessagesToFlow(messages, {
      onNodeClick: handleNodeClick,
      expandedNodes,
      onToggleExpansion: handleToggleExpansion,
    })

    const nodeCountChanged = newNodes.length !== previousNodeCountRef.current
    previousNodeCountRef.current = newNodes.length

    setNodes(newNodes)
    setEdges(newEdges)

    // Auto-scroll to bottom when new nodes are added (but only if user hasn't manually scrolled)
    if (nodeCountChanged && newNodes.length > 0 && !userScrolled) {
      // Delay to allow nodes to render
      setTimeout(() => {
        reactFlowInstance.fitView({
          padding: 0.2,
          duration: 400,
          nodes: [newNodes[newNodes.length - 1]], // Focus on last node
        })
      }, 100)
    }
  }, [messages, handleNodeClick, expandedNodes, handleToggleExpansion, setNodes, setEdges, userScrolled, reactFlowInstance])

  // Detect user scroll/zoom actions
  const handleMove = useCallback(() => {
    setUserScrolled(true)
  }, [setUserScrolled])

  // Reset user scroll flag when they manually fit view
  const handleFitView = useCallback(() => {
    setUserScrolled(false)
  }, [setUserScrolled])

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
        onMove={handleMove}
        onMoveEnd={handleMove}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-left"
          onFitView={handleFitView}
        />
      </ReactFlow>
    </div>
  )
}

export function SessionFlowPanel(props: SessionFlowPanelProps) {
  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <SessionFlowPanelInner {...props} />
      </ReactFlowProvider>
    </TooltipProvider>
  )
}
