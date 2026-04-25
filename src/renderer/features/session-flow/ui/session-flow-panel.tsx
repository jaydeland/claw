"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { atom } from "jotai"
import ReactFlow, {
  Background,
  BackgroundVariant,
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
import { sessionFlowUserScrolledAtom, sessionFlowExpandedNodesAtom, sessionFlowLiveAtom, sessionFlowSubAgentsAtom } from "../atoms"
import { TooltipProvider } from "@/components/ui/tooltip"

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
  const subAgents = useAtomValue(sessionFlowSubAgentsAtom)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [userScrolled, setUserScrolled] = useAtom(sessionFlowUserScrolledAtom)
  const [expandedNodes, setExpandedNodes] = useAtom(sessionFlowExpandedNodesAtom)
  const [isLive, setIsLive] = useAtom(sessionFlowLiveAtom)
  const reactFlowInstance = useReactFlow()
  const previousNodeCountRef = useRef(0)
  const previousExpandedSizeRef = useRef(0)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const isProgrammaticMoveRef = useRef(false)

  // Build nested tools map from sub-agents
  const nestedToolsMap = useMemo(() => {
    const map = new Map<string, { toolName: string; status: "pending" | "completed" | "error"; input?: any; output?: any }>()
    for (const agent of subAgents) {
      if (agent.nestedTools && agent.nestedTools.length > 0) {
        map.set(agent.agentId, agent.nestedTools.map(t => ({
          toolName: t.toolName,
          status: t.status,
          input: t.input,
          output: t.output,
        })))
      }
    }
    return map
  }, [subAgents])

  // Store pending nodes/edges when Live is off - these will be applied when Live turns on
  const pendingNodesRef = useRef<typeof nodes>([])
  const pendingEdgesRef = useRef<typeof edges>([])
  const wasLiveRef = useRef(isLive)

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
      console.log("[session-flow] Toggling expansion for node:", nodeId)
      setExpandedNodes((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(nodeId)) {
          console.log("[session-flow] Collapsing node:", nodeId)
          newSet.delete(nodeId)
        } else {
          console.log("[session-flow] Expanding node:", nodeId)
          newSet.add(nodeId)
        }
        console.log("[session-flow] New expanded nodes:", Array.from(newSet))
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
      nestedToolsMap,
    })

    // Always store latest computed state in pending refs
    pendingNodesRef.current = newNodes
    pendingEdgesRef.current = newEdges

    // If Live is off, don't update the display
    if (!isLive) {
      return
    }

    const nodeCountChanged = newNodes.length !== previousNodeCountRef.current
    const expandedSizeChanged = expandedNodes.size !== previousExpandedSizeRef.current
    previousNodeCountRef.current = newNodes.length
    previousExpandedSizeRef.current = expandedNodes.size

    setNodes(newNodes)
    setEdges(newEdges)

    // Auto-follow: center viewport on bottom-most nodes when new nodes are added
    // (only if user hasn't manually scrolled - turning Live on resets scroll state)
    if ((nodeCountChanged || expandedSizeChanged) && newNodes.length > 0 && !userScrolled) {
      // Delay to allow nodes to render
      setTimeout(() => {
        // Find the bottom-most node (highest Y position)
        const maxY = Math.max(...newNodes.map(n => n.position.y))
        const bottomNode = newNodes.find(n => n.position.y === maxY)

        if (bottomNode) {
          // Scroll to show the bottom of the chart with the newest node visible
          // Use higher zoom (1.3) for better readability and larger Y offset to push view down
          // Mark as programmatic move to prevent triggering userScrolled
          isProgrammaticMoveRef.current = true
          reactFlowInstance.setCenter(
            bottomNode.position.x + 100, // Offset for node width (~200px / 2)
            bottomNode.position.y + 150, // Larger offset to scroll further down
            { duration: 400, zoom: 1.3 }
          )
          // Reset flag after animation completes
          setTimeout(() => {
            isProgrammaticMoveRef.current = false
          }, 500)
        }
      }, 100)
    }
  }, [messages, handleNodeClick, expandedNodes, handleToggleExpansion, setNodes, setEdges, isLive, userScrolled, reactFlowInstance])

  // Handle Live toggle turning on - catch up to current state and reset scroll
  useEffect(() => {
    if (isLive && !wasLiveRef.current) {
      // Live just turned on - catch up to pending state
      if (pendingNodesRef.current.length > 0) {
        setNodes(pendingNodesRef.current)
        setEdges(pendingEdgesRef.current)
        previousNodeCountRef.current = pendingNodesRef.current.length

        // Reset user scroll state so auto-follow works
        setUserScrolled(false)

        // Center on bottom node after catching up
        setTimeout(() => {
          const newNodes = pendingNodesRef.current
          if (newNodes.length > 0) {
            const maxY = Math.max(...newNodes.map(n => n.position.y))
            const bottomNode = newNodes.find(n => n.position.y === maxY)

            if (bottomNode) {
              // Scroll to bottom with higher zoom when catching up
              // Mark as programmatic move to prevent triggering userScrolled
              isProgrammaticMoveRef.current = true
              reactFlowInstance.setCenter(
                bottomNode.position.x + 100,
                bottomNode.position.y + 150, // Larger offset to scroll further down
                { duration: 400, zoom: 1.3 }
              )
              // Reset flag after animation completes
              setTimeout(() => {
                isProgrammaticMoveRef.current = false
              }, 500)
            }
          }
        }, 100)
      }
    }
    wasLiveRef.current = isLive
  }, [isLive, setNodes, setEdges, setUserScrolled, reactFlowInstance])

  // Detect user scroll/zoom actions (ignore programmatic moves from setCenter)
  const handleMove = useCallback(() => {
    if (!isProgrammaticMoveRef.current) {
      setUserScrolled(true)
    }
  }, [setUserScrolled])

  // Reset user scroll flag when they manually fit view
  const handleFitView = useCallback(() => {
    setUserScrolled(false)
  }, [setUserScrolled])

  // Initial mount - zoom to bottom of flow (consistent with live behavior)
  const hasInitializedViewRef = useRef(false)
  useEffect(() => {
    if (hasInitializedViewRef.current) return
    if (nodes.length === 0) return

    hasInitializedViewRef.current = true

    // Small delay to ensure React Flow has rendered
    setTimeout(() => {
      const maxY = Math.max(...nodes.map(n => n.position.y))
      const bottomNode = nodes.find(n => n.position.y === maxY)

      if (bottomNode) {
        isProgrammaticMoveRef.current = true
        reactFlowInstance.setCenter(
          bottomNode.position.x + 100,
          bottomNode.position.y + 150,
          { duration: 400, zoom: 1.3 }
        )
        setTimeout(() => {
          isProgrammaticMoveRef.current = false
        }, 500)
      }
    }, 100)
  }, [nodes, reactFlowInstance])

  return (
    <div className="h-full w-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={sessionFlowNodeTypes}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          style: { stroke: "#94a3b8", strokeWidth: 2 },
        }}
        onMove={handleMove}
        onMoveEnd={handleMove}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="[&>*]:dark:opacity-30 [&>*]:opacity-60"
          style={{
            backgroundColor: 'hsl(var(--background))'
          }}
        />
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
