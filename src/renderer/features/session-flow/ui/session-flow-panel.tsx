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
import { sessionFlowUserScrolledAtom, sessionFlowExpandedNodesAtom, sessionFlowLiveAtom } from "../atoms"
import { Play, Pause } from "lucide-react"
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
  const [isLive, setIsLive] = useAtom(sessionFlowLiveAtom)
  const reactFlowInstance = useReactFlow()
  const previousNodeCountRef = useRef(0)
  const previousExpandedSizeRef = useRef(0)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

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
          // Center on the bottom node (add offset for node height)
          // NODE_HEIGHT is approximately 60-80px, center a bit above bottom
          // Reset zoom to 1.0 for optimal readability of new nodes
          reactFlowInstance.setCenter(
            bottomNode.position.x + 100, // Offset for node width (~200px / 2)
            bottomNode.position.y + 40,  // Offset for node height
            { duration: 400, zoom: 1.0 }
          )
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
              // Reset zoom to 1.0 for optimal readability when catching up
              reactFlowInstance.setCenter(
                bottomNode.position.x + 100,
                bottomNode.position.y + 40,
                { duration: 400, zoom: 1.0 }
              )
            }
          }
        }, 100)
      }
    }
    wasLiveRef.current = isLive
  }, [isLive, setNodes, setEdges, setUserScrolled, reactFlowInstance])

  // Detect user scroll/zoom actions
  const handleMove = useCallback(() => {
    setUserScrolled(true)
  }, [setUserScrolled])

  // Reset user scroll flag when they manually fit view
  const handleFitView = useCallback(() => {
    setUserScrolled(false)
  }, [setUserScrolled])

  // Toggle Live mode
  const toggleLive = useCallback(() => {
    setIsLive(prev => !prev)
  }, [setIsLive])

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
        <Background
          variant="dots"
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

        {/* Live toggle control - positioned next to Controls */}
        <div className="absolute bottom-2 left-[140px] z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleLive}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                  border shadow-sm transition-colors
                  ${isLive
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-muted/80 border-border text-muted-foreground hover:bg-muted'
                  }
                `}
              >
                {isLive ? (
                  <Play className="h-3 w-3 fill-current" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
                <span>Live</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {isLive ? 'Auto-following new nodes' : 'Paused - click to resume'}
            </TooltipContent>
          </Tooltip>
        </div>
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
