"use client"

import { useCallback, useMemo, useState, useEffect } from "react"
import { useAtom, useAtomValue } from "jotai"
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
import {
  selectedWorkflowNodeAtom,
  workflowMaxDepthAtom,
  workflowDependencyFiltersAtom,
  WorkflowDependencyFilters,
} from "../atoms"
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
  ExpandableAgentNode,
  ExpandableSkillNode,
  ExpandableCommandNode,
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
  // Expandable variants
  expandableAgent: ExpandableAgentNode,
  expandableSkill: ExpandableSkillNode,
  expandableCommand: ExpandableCommandNode,
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

interface SkillWithDependencies extends SkillWithMetadata {
  id: string
  name: string
  description: string
  sourcePath: string
  source: "user" | "project" | "custom"
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

// ============ TRANSITIVE DEPENDENCY RESOLUTION ============

interface TransitiveGraphOptions {
  maxDepth: number
  includeReverseDeps: boolean
  includeWorkflowSteps: boolean
}

const defaultTransitiveOptions: TransitiveGraphOptions = {
  maxDepth: 2, // Default: show direct deps (1) + one level of transitive deps (2)
  includeReverseDeps: true,
  includeWorkflowSteps: true,
}

/**
 * Build complete transitive dependency graph
 * Resolves: Agent → Command → Command's dependencies
 *           Agent → Skill → Skill's dependencies
 *           Command → Skill → Skill's dependencies
 * Prevents cycles using visited set
 */
function buildTransitiveGraph(
  rootNode: AgentWithDependencies | CommandWithDependencies | SkillWithDependencies,
  workflowGraph: {
    agents: AgentWithDependencies[]
    commands: CommandWithDependencies[]
    skills: SkillWithDependencies[]
  },
  options: Partial<TransitiveGraphOptions> = {},
  visited: Set<string> = new Set(),
  depth: number = 0
): { nodes: Node[]; edges: Edge[] } {
  const opts = { ...defaultTransitiveOptions, ...options }
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeCounter = 0

  // Prevent cycles - use type + id as unique key
  const nodeKey = `${(rootNode as any).type || 'unknown'}-${rootNode.id}`
  if (visited.has(nodeKey)) {
    return { nodes, edges }
  }
  visited.add(nodeKey)

  // Stop if we've reached max depth
  if (depth > opts.maxDepth) {
    return { nodes, edges }
  }

  const deps = rootNode.dependencies || {
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

  // Helper to get unique node ID
  const getNodeId = (prefix: string) => `${prefix}-${nodeCounter++}-${Math.random().toString(36).substr(2, 9)}`

  // Helper to create dependency node and edge
  const createDepNode = (
    type: string,
    name: string,
    data: any = {},
    edgeStyle: any = {},
    edgeLabel?: string
  ): string => {
    const nodeId = getNodeId(type)
    nodes.push({
      id: nodeId,
      type,
      position: { x: 0, y: 0 },
      data: { name, width: 150, height: 40, depth, ...data },
    })
    edges.push({
      id: `edge-${nodeId}`,
      source: "root",
      target: nodeId,
      label: edgeLabel,
      style: edgeStyle,
    })
    return nodeId
  }

  // Built-in Tools - ONE GROUP NODE
  if (deps.builtinTools?.length > 0) {
    const nodeId = "builtin-group"
    nodes.push({
      id: nodeId,
      type: "toolGroup",
      position: { x: 0, y: 0 },
      data: {
        name: "Built-in Tools",
        tools: deps.builtinTools,
        category: "builtin",
        width: 200,
        height: Math.max(80, deps.builtinTools.length * 22 + 50),
        depth,
      },
    })
    edges.push({
      id: "root-builtin-group",
      source: "root",
      target: nodeId,
      style: { stroke: "#3b82f6", strokeWidth: 2 },
      label: "uses",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#94a3b8", fontSize: 10 },
    })
  }

  // MCP Tools - ONE GROUP NODE PER SERVER
  if (deps.mcpTools?.length > 0) {
    const toolsByServer = deps.mcpTools.reduce(
      (acc, { tool, server }) => {
        if (!acc[server]) acc[server] = []
        acc[server].push(tool.split("__").pop() || tool)
        return acc
      },
      {} as Record<string, string[]>
    )

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
          depth,
        },
      })
      edges.push({
        id: `root-${nodeId}`,
        source: "root",
        target: nodeId,
        style: { stroke: "#ec4899", strokeWidth: 2 },
        label: "via MCP",
        labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
        labelStyle: { fill: "#ec4899", fontSize: 10 },
      })
    })
  }

  // Static skill dependencies (declared in frontmatter)
  deps.skills?.forEach((skillName) => {
    const skill = workflowGraph.skills.find(s => s.id === skillName || s.name === skillName)
    const nodeId = createDepNode(
      "skill",
      skillName,
      {
        isTransitive: depth > 0,
        hasMoreDeps: !!skill?.dependencies && Object.values(skill.dependencies).some(arr => (arr as any[])?.length > 0),
      },
      { stroke: "#10b981", strokeWidth: 2 },
      "declared"
    )

    // Recursively add skill dependencies
    if (skill && depth < opts.maxDepth) {
      const childGraph = buildTransitiveGraph(skill, workflowGraph, opts, visited, depth + 1)
      // Remap child nodes to connect to this skill node instead of root
      childGraph.nodes.forEach(node => {
        if (node.id !== 'root') {
          nodes.push({ ...node, id: `${nodeId}-${node.id}` })
        }
      })
      childGraph.edges.forEach(edge => {
        if (edge.source === 'root') {
          edges.push({ ...edge, source: nodeId, id: `${nodeId}-${edge.id}` })
        }
      })
    }
  })

  // Command invocations (runtime) - with transitive expansion
  deps.commands?.forEach((commandId) => {
    const command = workflowGraph.commands.find(c => c.id === commandId)
    const nodeId = createDepNode(
      "command",
      commandId,
      {
        isTransitive: depth > 0,
        hasMoreDeps: !!command?.dependencies && Object.values(command.dependencies).some(arr => (arr as any[])?.length > 0),
      },
      { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" },
      "invokes"
    )

    // Recursively add command dependencies
    if (command && depth < opts.maxDepth) {
      const childGraph = buildTransitiveGraph(command, workflowGraph, opts, visited, depth + 1)
      // Remap child nodes to connect to this command node
      childGraph.nodes.forEach(node => {
        if (node.id !== 'root') {
          nodes.push({ ...node, id: `${nodeId}-${node.id}` })
        }
      })
      childGraph.edges.forEach(edge => {
        if (edge.source === 'root') {
          edges.push({ ...edge, source: nodeId, id: `${nodeId}-${edge.id}`, animated: true })
        }
      })
    }
  })

  // Agent spawns (runtime)
  deps.agents?.forEach((agentId) => {
    const agent = workflowGraph.agents.find(a => a.id === agentId)
    const nodeId = createDepNode(
      "agent",
      agentId,
      {
        isTransitive: depth > 0,
        hasMoreDeps: !!agent?.dependencies && Object.values(agent.dependencies).some(arr => (arr as any[])?.length > 0),
      },
      { stroke: "#9333ea", strokeWidth: 2, strokeDasharray: "5,5" },
      "spawns"
    )

    // Recursively add agent dependencies
    if (agent && depth < opts.maxDepth) {
      const childGraph = buildTransitiveGraph(agent, workflowGraph, opts, visited, depth + 1)
      childGraph.nodes.forEach(node => {
        if (node.id !== 'root') {
          nodes.push({ ...node, id: `${nodeId}-${node.id}` })
        }
      })
      childGraph.edges.forEach(edge => {
        if (edge.source === 'root') {
          edges.push({ ...edge, source: nodeId, id: `${nodeId}-${edge.id}`, animated: true })
        }
      })
    }
  })

  // Skill invocations (runtime)
  deps.skillInvocations?.forEach((skillName) => {
    const skill = workflowGraph.skills.find(s => s.id === skillName || s.name === skillName)
    createDepNode(
      "skill",
      skillName,
      {
        isTransitive: depth > 0,
        isRuntime: true,
        hasMoreDeps: !!skill?.dependencies && Object.values(skill.dependencies).some(arr => (arr as any[])?.length > 0),
      },
      { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "5,5" },
      "invokes"
    )
  })

  // CLI Apps
  const normalizedCliApps = normalizeCliApps(deps.cliApps as any)
  if (normalizedCliApps.length > 0) {
    const nodeId = "cli-apps"
    nodes.push({
      id: nodeId,
      type: "cli",
      position: { x: 0, y: 0 },
      data: {
        apps: normalizedCliApps,
        width: 220,
        height: Math.max(100, normalizedCliApps.length * 60 + 50),
        depth,
      },
    })
    edges.push({
      id: "root-cli-apps",
      source: "root",
      target: nodeId,
      style: { stroke: "#06b6d4", strokeWidth: 2 },
      label: "calls",
      labelBgStyle: { fill: "#1e293b", fillOpacity: 0.8 },
      labelStyle: { fill: "#67e8f9", fontSize: 10 },
    })
  }

  // Background Tasks
  const normalizedBackgroundTasks = normalizeBackgroundTasks(deps.backgroundTasks as any)
  if (normalizedBackgroundTasks.length > 0) {
    const nodeId = "background-tasks"
    nodes.push({
      id: nodeId,
      type: "backgroundTask",
      position: { x: 0, y: 0 },
      data: {
        tasks: normalizedBackgroundTasks,
        width: 220,
        height: Math.max(100, normalizedBackgroundTasks.length * 60 + 50),
        depth,
      },
    })
    edges.push({
      id: "root-background-tasks",
      source: "root",
      target: nodeId,
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
 * Convert skill dependencies to ReactFlow
 * Shows both:
 * 1. What the skill depends on (tools, commands, agents, etc.)
 * 2. What depends on this skill (agents that declare it)
 */
function convertSkillToReactFlow(
  skill: SkillWithDependencies,
  allAgents: AgentWithDependencies[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeCounter = 0

  const deps = skill.dependencies || {
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

  // Main skill node with context metadata
  nodes.push({
    id: "main",
    type: "skill",
    position: { x: 0, y: 0 },
    data: {
      name: skill.name,
      context: skill.context, // Include fork context for badge
      agent: skill.agent,
      width: 200,
      height: 60,
    },
  })

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
      id: "main-builtin-group",
      source: "main",
      target: "builtin-group",
      label: "uses",
      style: { stroke: "#3b82f6", strokeWidth: 2 },
    })
  }

  // MCP Tools - ONE GROUP NODE PER SERVER
  if (deps.mcpTools && deps.mcpTools.length > 0) {
    const toolsByServer = deps.mcpTools.reduce(
      (acc, { tool, server }) => {
        if (!acc[server]) acc[server] = []
        acc[server].push(tool.split("__").pop() || tool)
        return acc
      },
      {} as Record<string, string[]>
    )

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
        id: `main-${nodeId}`,
        source: "main",
        target: nodeId,
        label: "via MCP",
        style: { stroke: "#ec4899", strokeWidth: 2 },
      })
    })
  }

  // Skill nodes (declared dependencies)
  deps.skills?.forEach((skillName) => {
    const nodeId = `skill-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "skill",
      position: { x: 0, y: 0 },
      data: { name: skillName, width: 150, height: 40 },
    })
    edges.push({
      id: `main-${nodeId}`,
      source: "main",
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
      id: `main-${nodeId}`,
      source: "main",
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
      id: `main-${nodeId}`,
      source: "main",
      target: nodeId,
      label: "invokes",
      animated: true,
      style: { stroke: "#f97316", strokeDasharray: "5 5" },
    })
  })

  // Skill invocation nodes (runtime calls)
  deps.skillInvocations?.forEach((skillName) => {
    const nodeId = `skill-inv-${nodeCounter++}`
    nodes.push({
      id: nodeId,
      type: "skill",
      position: { x: 0, y: 0 },
      data: { name: skillName, width: 150, height: 40 },
    })
    edges.push({
      id: `main-${nodeId}`,
      source: "main",
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
      id: "main-cli-apps",
      source: "main",
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
      id: "main-background-tasks",
      source: "main",
      target: "background-tasks",
      label: "runs async",
      animated: true,
      style: { stroke: "#f59e0b", strokeDasharray: "5 5" },
    })
  }

  // Find agents that use this skill (reverse dependencies)
  const dependents = allAgents.filter((agent) => agent.dependencies.skills.includes(skill.id))

  // Add agent nodes that depend on this
  dependents.forEach((agent, i) => {
    const nodeId = `dependent-agent-${i}`
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
      label: "declares",
      style: { stroke: "#9333ea", strokeWidth: 2 },
    })
  })

  return { nodes: edges }
}

/**
 * Apply dependency type filters to nodes and edges
 */
function applyDependencyFilters(
  result: { nodes: Node[]; edges: Edge[] },
  filters: WorkflowDependencyFilters
): { nodes: Node[]; edges: Edge[] } {
  // If all filters are enabled, return as-is
  if (Object.values(filters).every(v => v)) return result

  const { nodes, edges } = result

  // Determine which node types to keep based on filters
  const keepNodeType = (type: string | undefined, data: any) => {
    if (!type) return true

    switch (type) {
      case "toolGroup":
        if (data?.category === "builtin" && !filters.builtinTools) return false
        if (data?.category === "mcp" && !filters.mcpTools) return false
        return true
      case "skill":
        return filters.skills
      case "command":
        return filters.commands
      case "agent":
        return filters.agents
      case "cli":
        return filters.cliApps
      case "backgroundTask":
        return filters.backgroundTasks
      case "workflowStep":
        return true // Always keep workflow steps
      default:
        return true
    }
  }

  // Filter nodes
  const filteredNodes = nodes.filter(node => keepNodeType(node.type, node.data))
  const keptNodeIds = new Set(filteredNodes.map(n => n.id))

  // Filter edges - only keep edges where both source and target exist
  const filteredEdges = edges.filter(edge =>
    keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
  )

  return { nodes: filteredNodes, edges: filteredEdges }
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

  // Interactive feature state
  const [maxDepth, setMaxDepth] = useAtom(workflowMaxDepthAtom)
  const [filters, setFilters] = useAtom(workflowDependencyFiltersAtom)
  const [showControls, setShowControls] = useState(true)

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
      // Use transitive graph builder with depth limit for agents with complex deps
      const transitiveResult = buildTransitiveGraph(
        agent,
        {
          agents: workflowGraph.agents,
          commands: workflowGraph.commands,
          skills: workflowGraph.skills as SkillWithDependencies[],
        },
        { maxDepth, includeReverseDeps: true, includeWorkflowSteps: true }
      )
      // Remap root node ID to "agent" for consistency
      result = {
        nodes: transitiveResult.nodes.map(n => n.id === "root" ? { ...n, id: "agent" } : n),
        edges: transitiveResult.edges.map(e => e.source === "root" ? { ...e, source: "agent" } : e),
      }
    } else if (selectedNode.type === "command") {
      const command = workflowGraph.commands.find((c) => c.id === selectedNode.id)
      if (!command) return { nodes: [], edges: [] }
      // Use transitive graph builder for commands
      const transitiveResult = buildTransitiveGraph(
        command,
        {
          agents: workflowGraph.agents,
          commands: workflowGraph.commands,
          skills: workflowGraph.skills as SkillWithDependencies[],
        },
        { maxDepth, includeReverseDeps: true, includeWorkflowSteps: true }
      )
      result = {
        nodes: transitiveResult.nodes.map(n => n.id === "root" ? { ...n, id: "command" } : n),
        edges: transitiveResult.edges.map(e => e.source === "root" ? { ...e, source: "command" } : e),
      }
    } else if (selectedNode.type === "skill") {
      // Find skill with dependencies
      const skill = workflowGraph.skills.find((s) => s.id === selectedNode.id)
      if (!skill) return { nodes: [], edges: [] }
      result = convertSkillToReactFlow(skill as SkillWithDependencies, workflowGraph.agents)
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

    // Apply filters
    const filteredResult = applyDependencyFilters(result, filters)
    return filteredResult
  }, [selectedNode, workflowGraph, workflowSteps, maxDepth, filters])

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

  // Toggle filter
  const toggleFilter = (key: keyof WorkflowDependencyFilters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Get node counts by type
  const nodeCounts = useMemo(() => {
    return {
      agents: nodes.filter(n => n.type === "agent").length,
      skills: nodes.filter(n => n.type === "skill").length,
      commands: nodes.filter(n => n.type === "command").length,
      tools: nodes.filter(n => n.type === "toolGroup").length,
    }
  }, [nodes])

  return (
    <div className="h-full w-full bg-background relative">
      {/* Interactive Controls Panel */}
      {showControls && (
        <div className="absolute top-4 left-4 z-10 bg-card border rounded-lg shadow-lg p-4 min-w-[240px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Diagram Controls</h3>
            <button
              onClick={() => setShowControls(false)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Hide
            </button>
          </div>

          {/* Depth Control */}
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Transitive Depth: {maxDepth}
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMaxDepth(Math.max(1, maxDepth - 1))}
                className="px-2 py-1 text-xs border rounded hover:bg-muted"
                disabled={maxDepth <= 1}
              >
                -
              </button>
              <input
                type="range"
                min="1"
                max="5"
                value={maxDepth}
                onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                className="flex-1"
              />
              <button
                onClick={() => setMaxDepth(Math.min(5, maxDepth + 1))}
                className="px-2 py-1 text-xs border rounded hover:bg-muted"
                disabled={maxDepth >= 5}
              >
                +
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {maxDepth === 1 ? "Direct dependencies only" : `Up to ${maxDepth} levels of transitive deps`}
            </p>
          </div>

          {/* Dependency Type Filters */}
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Show Dependencies
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.builtinTools}
                  onChange={() => toggleFilter("builtinTools")}
                  className="rounded border-muted"
                />
                <span className="text-xs">Built-in Tools ({nodes.filter(n => n.type === "toolGroup" && n.data?.category === "builtin").length})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.mcpTools}
                  onChange={() => toggleFilter("mcpTools")}
                  className="rounded border-muted"
                />
                <span className="text-xs">MCP Tools ({nodes.filter(n => n.type === "toolGroup" && n.data?.category === "mcp").length})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.skills}
                  onChange={() => toggleFilter("skills")}
                  className="rounded border-muted"
                />
                <span className="text-xs">Skills ({nodeCounts.skills})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.commands}
                  onChange={() => toggleFilter("commands")}
                  className="rounded border-muted"
                />
                <span className="text-xs">Commands ({nodeCounts.commands})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.agents}
                  onChange={() => toggleFilter("agents")}
                  className="rounded border-muted"
                />
                <span className="text-xs">Agents ({nodeCounts.agents})</span>
              </label>
            </div>
          </div>

          {/* Reset Button */}
          <button
            onClick={() => {
              setMaxDepth(2)
              setFilters({
                builtinTools: true,
                mcpTools: true,
                skills: true,
                commands: true,
                agents: true,
                cliApps: true,
                backgroundTasks: true,
              })
            }}
            className="w-full px-3 py-1.5 text-xs border rounded hover:bg-muted transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      )}

      {/* Show Controls Button (when hidden) */}
      {!showControls && (
        <button
          onClick={() => setShowControls(true)}
          className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-card border rounded-lg shadow-lg text-xs hover:bg-muted"
        >
          Show Controls
        </button>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-card border rounded-lg shadow-lg p-3">
        <h4 className="text-xs font-medium mb-2">Legend</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-purple-600"></div>
            <span>Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500"></div>
            <span>Skill</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-orange-500"></div>
            <span>Command</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
            <span>Built-in Tools</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-pink-500"></div>
            <span>MCP Tools</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 border-t-2 border-dashed border-gray-400"></div>
            <span>Runtime Invocation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 border-t-2 border-gray-400"></div>
            <span>Static Dependency</span>
          </div>
        </div>
      </div>

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
