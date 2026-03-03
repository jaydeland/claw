"use client"

import { useCallback, useMemo, useState, useEffect } from "react"
import { useAtomValue } from "jotai"
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from "reactflow"
import "reactflow/dist/style.css"
import { selectedWorkflowNodeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import { getLayoutedElements } from "../lib/reactflow-layout"
import {
  AgentNode,
  ToolNode,
  SkillNode,
  CommandNode,
  McpNode,
  ToolGroupNode,
  CliAppNode,
  BackgroundTaskNode,
  WorkflowStepNode,
} from "../components/workflow-nodes"
import { Loader2 } from "lucide-react"

// Custom node types for different dependency types
const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  skill: SkillNode,
  command: CommandNode,
  mcp: McpNode,
  toolGroup: ToolGroupNode,
  cli: CliAppNode,
  backgroundTask: BackgroundTaskNode,
  workflowStep: WorkflowStepNode,
}

interface CliAppMetadata {
  name: string
  commands: string[]
}

interface BackgroundTaskMetadata {
  type: string
  description: string
  agentName?: string
}

// Permission modes for subagents (Claude Code official modes)
type PermissionMode = 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan'

interface AgentWithDependencies {
  id: string
  name: string
  description: string
  // New official Claude Code fields
  permissionMode?: PermissionMode
  disallowedTools?: string[]
  skills?: string[]
  dependencies: {
    tools: string[]
    builtinTools?: string[]
    mcpTools?: Array<{ tool: string; server: string }>
    skills: string[]
    mcpServers: string[]
    agents: string[]
    commands: string[]
    skillInvocations: string[]
    cliApps: CliAppMetadata[]
    backgroundTasks: BackgroundTaskMetadata[]
  }
}

interface SkillWithMetadata {
  id: string
  name: string
  description: string
  context?: 'fork'
  agent?: string
  model?: string
  userInvocable?: boolean
  supportingFiles?: string[]
}

interface CommandWithDependencies {
  id: string
  name: string
  description: string
  allowedTools: string[]
  dependencies: {
    tools: string[]
    builtinTools?: string[]
    mcpTools?: Array<{ tool: string; server: string }>
    skills: string[]
    mcpServers: string[]
    agents: string[]
    commands: string[]
    skillInvocations: string[]
    cliApps: CliAppMetadata[]
    backgroundTasks: BackgroundTaskMetadata[]
  }
}

/**
 * Normalize CLI apps to handle both old string[] and new CliAppMetadata[] formats
 */
function normalizeCliApps(apps: (string | CliAppMetadata)[] | undefined): CliAppMetadata[] {
  if (!apps || apps.length === 0) return []
  return apps.map(app => {
    if (typeof app === 'string') {
      return { name: app, commands: [] }
    }
    return app
  })
}

/**
 * Normalize background tasks to handle both old string[] and new BackgroundTaskMetadata[] formats
 */
function normalizeBackgroundTasks(tasks: (string | BackgroundTaskMetadata)[] | undefined): BackgroundTaskMetadata[] {
  if (!tasks || tasks.length === 0) return []
  return tasks.map(task => {
    if (typeof task === 'string') {
      return { type: task, description: '' }
    }
    return task
  })
}

/**
 * Convert agent dependencies to ReactFlow nodes and edges
 */
function convertAgentToReactFlow(agent: AgentWithDependencies): {
  nodes: Node[]
  edges: Edge[]
} {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeCounter = 0

  // Main agent node (centered, will be positioned by ELK)
  nodes.push({
    id: "agent",
    type: "agent",
    position: { x: 0, y: 0 },
    data: {
      name: agent.name,
      description: agent.description,
      permissionMode: agent.permissionMode, // Include permission mode for badge
      width: 200,
      height: 80,
    },
  })

  // Built-in Tools - ONE GROUP NODE with all tools listed
  if (agent.dependencies.builtinTools && agent.dependencies.builtinTools.length > 0) {
    nodes.push({
      id: "builtin-group",
      type: "toolGroup",
      position: { x: 0, y: 0 },
      data: {
        name: "Built-in Tools",
        tools: agent.dependencies.builtinTools,
        category: "builtin",
        width: 200,
        height: Math.max(80, agent.dependencies.builtinTools.length * 22 + 50),
      },
    })
    edges.push({
      id: "agent-builtin-group",
      source: "agent",
      target: "builtin-group",
      animated: false,
      style: { stroke: "#3b82f6", strokeWidth: 2 },
      label: "uses",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#94a3b8", fontSize: 10 },
    })
  }

  // MCP Tools - ONE GROUP NODE PER SERVER with tools listed
  if (agent.dependencies.mcpTools && agent.dependencies.mcpTools.length > 0) {
    // Group tools by server
    const toolsByServer = agent.dependencies.mcpTools.reduce(
      (acc, { tool, server }) => {
        if (!acc[server]) acc[server] = []
        acc[server].push(tool.split("__").pop() || tool)
        return acc
      },
      {} as Record<string, string[]>
    )

    // Create one node per server
    Object.entries(toolsByServer).forEach(([server, tools]) => {
      const nodeId = `mcp-server-${server}`
      nodes.push({
        id: nodeId,
        type: "toolGroup",
        position: { x: 0, y: 0 },
        data: {
          name: server,
          tools: tools,
          category: "mcp",
          width: 200,
          height: Math.max(80, tools.length * 22 + 50),
        },
      })
      edges.push({
        id: `agent-${nodeId}`,
        source: "agent",
        target: nodeId,
        animated: false,
        style: { stroke: "#ec4899", strokeWidth: 2 },
        label: "via MCP",
        labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
        labelStyle: { fill: "#ec4899", fontSize: 10 },
      })
    })
  }

  // Debug: Log all dependencies
  console.log('[reactflow] Agent dependencies:', {
    skills: agent.dependencies.skills,
    agents: agent.dependencies.agents,
    commands: agent.dependencies.commands,
    skillInvocations: agent.dependencies.skillInvocations
  })

  // Skill nodes (static dependencies - solid edges)
  agent.dependencies.skills.forEach((skill) => {
    const nodeId = `skill-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "skill",
      position: { x: 0, y: 0 },
      data: { name: skill, width: 150, height: 40 },
    })
    edges.push({
      id: `agent-${nodeId}`,
      source: "agent",
      target: nodeId,
      animated: false,
      style: { stroke: "#10b981", strokeWidth: 2 },
      label: "declared",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#94a3b8", fontSize: 10 },
    })
  })

  // Command nodes (runtime invocations - dashed animated edges)
  agent.dependencies.commands.forEach((command) => {
    const nodeId = `command-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "command",
      position: { x: 0, y: 0 },
      data: { name: command, width: 150, height: 40 },
    })
    edges.push({
      id: `agent-${nodeId}`,
      source: "agent",
      target: nodeId,
      animated: true,
      style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" },
      label: "invokes",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#fbbf24", fontSize: 10 },
    })
  })

  // Nested agent nodes (runtime invocations - dashed animated edges)
  agent.dependencies.agents.forEach((nestedAgent) => {
    const nodeId = `agent-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "agent",
      position: { x: 0, y: 0 },
      data: { name: nestedAgent, description: "", width: 150, height: 40 },
    })
    edges.push({
      id: `agent-${nodeId}`,
      source: "agent",
      target: nodeId,
      animated: true,
      style: { stroke: "#9333ea", strokeWidth: 2, strokeDasharray: "5,5" },
      label: "spawns",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#c084fc", fontSize: 10 },
    })
  })

  // Skill invocation nodes (runtime - dashed animated edges)
  agent.dependencies.skillInvocations?.forEach((skill) => {
    const nodeId = `skill-invoke-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "skill",
      position: { x: 0, y: 0 },
      data: { name: skill, width: 150, height: 40 },
    })
    edges.push({
      id: `agent-${nodeId}`,
      source: "agent",
      target: nodeId,
      animated: true,
      style: { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "5,5" },
      label: "invokes",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#34d399", fontSize: 10 },
    })
  })

  // CLI Apps node (if any detected)
  const normalizedCliApps = normalizeCliApps(agent.dependencies.cliApps as any)
  if (normalizedCliApps.length > 0) {
    nodes.push({
      id: "cli-apps",
      type: "cli",
      position: { x: 0, y: 0 },
      data: {
        apps: normalizedCliApps,
        width: 220,
        height: Math.max(100, normalizedCliApps.length * 60 + 50),
      },
    })
    edges.push({
      id: "agent-cli-apps",
      source: "agent",
      target: "cli-apps",
      animated: false,
      style: { stroke: "#06b6d4", strokeWidth: 2 },
      label: "calls",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#67e8f9", fontSize: 10 },
    })
  }

  // Background Tasks node (if any detected)
  const normalizedBackgroundTasks = normalizeBackgroundTasks(agent.dependencies.backgroundTasks as any)
  if (normalizedBackgroundTasks.length > 0) {
    nodes.push({
      id: "background-tasks",
      type: "backgroundTask",
      position: { x: 0, y: 0 },
      data: {
        tasks: normalizedBackgroundTasks,
        width: 220,
        height: Math.max(100, normalizedBackgroundTasks.length * 60 + 50),
      },
    })
    edges.push({
      id: "agent-background-tasks",
      source: "agent",
      target: "background-tasks",
      animated: true,
      style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" },
      label: "runs async",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#fbbf24", fontSize: 10 },
    })
  }

  return { nodes, edges }
}

/**
 * Convert command dependencies to ReactFlow nodes and edges
 * Shows what tools/skills/etc the command uses
 */
function convertCommandToReactFlow(command: CommandWithDependencies): {
  nodes: Node[]
  edges: Edge[]
} {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeCounter = 0

  // Main command node (centered, will be positioned by ELK)
  nodes.push({
    id: "command",
    type: "command",
    position: { x: 0, y: 0 },
    data: {
      name: command.name,
      description: command.description,
      width: 200,
      height: 80,
    },
  })

  const deps = command.dependencies || {
    tools: [],
    builtinTools: [],
    mcpTools: [],
    skills: [],
    mcpServers: [],
    agents: [],
    commands: [],
    skillInvocations: [],
    cliApps: [],
    backgroundTasks: [],
  }

  // Built-in Tools - ONE GROUP NODE
  if (deps.builtinTools && deps.builtinTools.length > 0) {
    nodes.push({
      id: "builtin-group",
      type: "toolGroup",
      position: { x: 0, y: 0 },
      data: {
        name: "Built-in Tools",
        tools: deps.builtinTools,
        category: "builtin",
        width: 200,
        height: Math.max(80, deps.builtinTools.length * 22 + 50),
      },
    })
    edges.push({
      id: "command-builtin-group",
      source: "command",
      target: "builtin-group",
      label: "uses",
      style: { stroke: "#3b82f6", strokeWidth: 2 },
    })
  }

  // MCP Tools - ONE GROUP NODE PER SERVER
  if (deps.mcpTools && deps.mcpTools.length > 0) {
    // Group tools by server
    const toolsByServer = deps.mcpTools.reduce(
      (acc, { tool, server }) => {
        if (!acc[server]) acc[server] = []
        acc[server].push(tool.split("__").pop() || tool)
        return acc
      },
      {} as Record<string, string[]>
    )

    // Create one node per server
    Object.entries(toolsByServer).forEach(([server, tools]) => {
      const nodeId = `mcp-server-${server}`
      nodes.push({
        id: nodeId,
        type: "toolGroup",
        position: { x: 0, y: 0 },
        data: {
          name: server,
          tools: tools,
          category: "mcp",
          width: 200,
          height: Math.max(80, tools.length * 22 + 50),
        },
      })
      edges.push({
        id: `command-${nodeId}`,
        source: "command",
        target: nodeId,
        label: "via MCP",
        style: { stroke: "#ec4899", strokeWidth: 2 },
      })
    })
  }

  // Skill nodes (declared dependencies)
  deps.skills?.forEach((skill) => {
    const nodeId = `skill-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "skill",
      position: { x: 0, y: 0 },
      data: { name: skill, width: 150, height: 40 },
    })
    edges.push({
      id: `command-${nodeId}`,
      source: "command",
      target: nodeId,
      label: "declared",
      style: { stroke: "#10b981" },
    })
  })

  // Agent spawn nodes (runtime invocations)
  deps.agents?.forEach((agentId) => {
    const nodeId = `agent-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "agent",
      position: { x: 0, y: 0 },
      data: { name: agentId, width: 150, height: 40 },
    })
    edges.push({
      id: `command-${nodeId}`,
      source: "command",
      target: nodeId,
      label: "spawns",
      animated: true,
      style: { stroke: "#a855f7", strokeDasharray: "5 5" },
    })
  })

  // Command invocation nodes (runtime calls)
  deps.commands?.forEach((commandId) => {
    const nodeId = `cmd-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "command",
      position: { x: 0, y: 0 },
      data: { name: commandId, width: 150, height: 40 },
    })
    edges.push({
      id: `command-${nodeId}`,
      source: "command",
      target: nodeId,
      label: "invokes",
      animated: true,
      style: { stroke: "#f97316", strokeDasharray: "5 5" },
    })
  })

  // Skill invocation nodes (runtime calls)
  deps.skillInvocations?.forEach((skillId) => {
    const nodeId = `skill-inv-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "skill",
      position: { x: 0, y: 0 },
      data: { name: skillId, width: 150, height: 40 },
    })
    edges.push({
      id: `command-${nodeId}`,
      source: "command",
      target: nodeId,
      label: "invokes",
      animated: true,
      style: { stroke: "#10b981", strokeDasharray: "5 5" },
    })
  })

  // CLI Apps node (if any detected)
  const normalizedCliApps = normalizeCliApps(deps.cliApps as any)
  if (normalizedCliApps.length > 0) {
    nodes.push({
      id: "cli-apps",
      type: "cli",
      position: { x: 0, y: 0 },
      data: {
        apps: normalizedCliApps,
        width: 220,
        height: Math.max(100, normalizedCliApps.length * 60 + 50),
      },
    })
    edges.push({
      id: "command-cli-apps",
      source: "command",
      target: "cli-apps",
      label: "calls",
      style: { stroke: "#06b6d4", strokeWidth: 2 },
    })
  }

  // Background Tasks node (if any detected)
  const normalizedBackgroundTasks = normalizeBackgroundTasks(deps.backgroundTasks as any)
  if (normalizedBackgroundTasks.length > 0) {
    nodes.push({
      id: "background-tasks",
      type: "backgroundTask",
      position: { x: 0, y: 0 },
      data: {
        tasks: normalizedBackgroundTasks,
        width: 220,
        height: Math.max(100, normalizedBackgroundTasks.length * 60 + 50),
      },
    })
    edges.push({
      id: "command-background-tasks",
      source: "command",
      target: "background-tasks",
      label: "runs async",
      animated: true,
      style: { stroke: "#f59e0b", strokeDasharray: "5 5" },
    })
  }

  return { nodes, edges }
}

/**
 * Convert skill reverse dependencies to ReactFlow
 */
function convertSkillToReactFlow(
  name: string,
  allAgents: AgentWithDependencies[],
  skillMetadata?: SkillWithMetadata
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Main skill node with context metadata
  nodes.push({
    id: "main",
    type: "skill",
    position: { x: 0, y: 0 },
    data: {
      name,
      context: skillMetadata?.context, // Include fork context for badge
      agent: skillMetadata?.agent,
      width: 200,
      height: 60,
    },
  })

  // Find agents that use this skill
  const dependents = allAgents.filter((agent) => agent.dependencies.skills.includes(name))

  // Add agent nodes that depend on this
  dependents.forEach((agent, i) => {
    const nodeId = `agent-${i}`
    nodes.push({
      id: nodeId,
      type: "agent",
      position: { x: 0, y: 0 },
      data: { name: agent.name, description: agent.description, width: 180, height: 60 },
    })
    edges.push({
      id: `${nodeId}-main`,
      source: nodeId,
      target: "main",
      animated: true,
    })
  })

  return { nodes, edges }
}

/**
 * Parse workflow steps from markdown content
 * Looks for sections like "## Workflow" or "## Steps to follow" and extracts numbered steps
 */
function parseWorkflowSteps(content: string): Array<{ title: string; description: string }> {
  const steps: Array<{ title: string; description: string }> = []

  // Look for Workflow or Steps to follow sections
  const workflowSectionRegex = /##\s+(?:Workflow|Steps to follow)[\s\S]*?(?=##\s|$)/i
  const workflowSection = content.match(workflowSectionRegex)

  if (!workflowSection) return steps

  const sectionContent = workflowSection[0]

  // Match numbered steps (1. Step title, 2. Step title, etc.)
  const stepRegex = /^(\d+)\.\s+(.+)$/gm
  let match

  while ((match = stepRegex.exec(sectionContent)) !== null) {
    const stepNumber = parseInt(match[1], 10)
    const stepTitle = match[2].trim()

    // Extract description from the following lines until next step or section
    const stepStartIndex = match.index + match[0].length
    const nextMatch = stepRegex.exec(sectionContent)
    stepRegex.lastIndex = stepStartIndex // Reset for next iteration

    const stepEndIndex = nextMatch ? nextMatch.index : sectionContent.length
    const stepContent = sectionContent.slice(stepStartIndex, stepEndIndex)

    // Clean up description - take first non-empty paragraph
    const description = stepContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .slice(0, 2)
      .join(' ')
      .substring(0, 100)

    steps.push({
      title: stepTitle,
      description: description || `Step ${stepNumber}`,
    })
  }

  return steps
}

function WorkflowReactFlowInner() {
  const selectedNode = useAtomValue(selectedWorkflowNodeAtom)
  const { data: workflowGraph } = trpc.workflows.getWorkflowGraph.useQuery()
  const [isLayouting, setIsLayouting] = useState(true)

  // Fetch file content to parse workflow steps
  const { data: fileContent } = trpc.workflows.readFileContent.useQuery(
    { path: selectedNode?.sourcePath || "" },
    { enabled: !!selectedNode?.sourcePath && selectedNode?.type !== "mcpServer" }
  )

  // Parse workflow steps from file content
  const workflowSteps = useMemo(() => {
    if (!fileContent) return []
    return parseWorkflowSteps(fileContent)
  }, [fileContent])

  // Convert dependencies to ReactFlow nodes/edges and merge with workflow steps
  const rawNodesAndEdges = useMemo(() => {
    if (!selectedNode || !workflowGraph) return { nodes: [], edges: [] }

    let result: { nodes: Node[]; edges: Edge[] }

    if (selectedNode.type === "agent") {
      const agent = workflowGraph.agents.find((a) => a.id === selectedNode.id)
      if (!agent) return { nodes: [], edges: [] }
      result = convertAgentToReactFlow(agent)
    } else if (selectedNode.type === "command") {
      const command = workflowGraph.commands.find((c) => c.id === selectedNode.id)
      if (!command) return { nodes: [], edges: [] }
      result = convertCommandToReactFlow(command)
    } else if (selectedNode.type === "skill") {
      // Find skill metadata for context badge
      const skill = workflowGraph.skills.find((s) => s.id === selectedNode.id)
      const skillMetadata: SkillWithMetadata | undefined = skill ? {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        context: (skill as any).context, // Type assertion since backend now includes this
        agent: (skill as any).agent,
        model: (skill as any).model,
        userInvocable: (skill as any).userInvocable,
        supportingFiles: (skill as any).supportingFiles,
      } : undefined
      result = convertSkillToReactFlow(selectedNode.name, workflowGraph.agents, skillMetadata)
    } else {
      return { nodes: [], edges: [] }
    }

    // Add workflow steps as nodes if found
    if (workflowSteps.length > 0) {
      const stepNodes: Node[] = []
      const stepEdges: Edge[] = []

      workflowSteps.forEach((step, index) => {
        const nodeId = `workflow-step-${index}`
        stepNodes.push({
          id: nodeId,
          type: "workflowStep",
          position: { x: 0, y: 0 },
          data: {
            stepNumber: index + 1,
            title: step.title,
            description: step.description,
            width: 180,
            height: 60,
          },
        })

        // Connect steps in sequence
        if (index > 0) {
          stepEdges.push({
            id: `workflow-step-${index - 1}-${index}`,
            source: `workflow-step-${index - 1}`,
            target: nodeId,
            animated: true,
            style: { stroke: "#6366f1", strokeWidth: 2 },
          })
        }
      })

      // Connect first step from main node
      if (stepNodes.length > 0) {
        const mainNodeId = result.nodes.find(n => n.id === "agent" || n.id === "command" || n.id === "main")?.id
        if (mainNodeId) {
          stepEdges.unshift({
            id: `${mainNodeId}-workflow-step-0`,
            source: mainNodeId,
            target: "workflow-step-0",
            animated: true,
            style: { stroke: "#6366f1", strokeWidth: 2 },
            label: "workflow",
            labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
            labelStyle: { fill: "#6366f1", fontSize: 10 },
          })
        }
      }

      result = {
        nodes: [...result.nodes, ...stepNodes],
        edges: [...result.edges, ...stepEdges],
      }
    }

    return result
  }, [selectedNode, workflowGraph, workflowSteps])

  // Apply ELK auto-layout
  const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([])
  const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([])

  useEffect(() => {
    async function applyLayout() {
      if (rawNodesAndEdges.nodes.length === 0) {
        setLayoutedNodes([])
        setLayoutedEdges([])
        setIsLayouting(false)
        return
      }

      setIsLayouting(true)
      try {
        // Apply custom column-based layout
        const { nodes, edges } = await getLayoutedElements(
          rawNodesAndEdges.nodes,
          rawNodesAndEdges.edges
        )
        setLayoutedNodes(nodes)
        setLayoutedEdges(edges)
      } catch (err) {
        console.error("[reactflow] Layout failed:", err)
        // Fallback to raw positions
        setLayoutedNodes(rawNodesAndEdges.nodes)
        setLayoutedEdges(rawNodesAndEdges.edges)
      } finally {
        setIsLayouting(false)
      }
    }

    applyLayout()
  }, [rawNodesAndEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Update nodes/edges when layout completes
  useEffect(() => {
    setNodes(layoutedNodes)
  }, [layoutedNodes, setNodes])

  useEffect(() => {
    setEdges(layoutedEdges)
  }, [layoutedEdges, setEdges])

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    console.log("[reactflow] Clicked node:", node.data)
    // Future: open detail panel, highlight in code, etc.
  }, [])

  if (!selectedNode) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Select a file to view flowchart</p>
      </div>
    )
  }

  if (isLayouting) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No dependencies or workflow steps to display</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: "#94a3b8", strokeWidth: 2 },
        }}
        elevateEdgesOnSelect={true}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case "agent":
                return "#9333ea"
              case "tool":
                return "#3b82f6"
              case "skill":
                return "#10b981"
              case "command":
                return "#f59e0b"
              case "mcp":
                return "#ec4899"
              case "workflowStep":
                return "#6366f1"
              default:
                return "#64748b"
            }
          }}
        />
      </ReactFlow>
    </div>
  )
}

/**
 * Flowchart view using ReactFlow
 * Provides interactive workflow visualization with drag, zoom, and custom nodes
 */
export function WorkflowReactFlowView() {
  return (
    <ReactFlowProvider>
      <WorkflowReactFlowInner />
    </ReactFlowProvider>
  )
}
