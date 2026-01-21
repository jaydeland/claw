import { Node, Edge } from "reactflow"

/**
 * Custom column-based layout for workflow dependencies
 * Column 1: MCP tool groups
 * Column 2: Built-in tools
 * Column 3: Skills, Commands, Agents
 * Column 4: CLI apps & Background tasks
 * Agent/Command node at top center
 */
export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[]
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const layoutedNodes: Node[] = []

  // Column configuration
  const COLUMN_WIDTH = 250
  const ROW_HEIGHT = 120
  const START_Y = 150 // Start below the agent/command node

  // Find the root node (agent or command)
  const rootNode = nodes.find((n) => n.type === "agent" || n.type === "command")

  // Categorize nodes into columns
  const mcpNodes: Node[] = []
  const builtinNodes: Node[] = []
  const invocationNodes: Node[] = [] // Skills, Commands, Agents
  const infraNodes: Node[] = [] // CLI apps, Background tasks

  nodes.forEach((node) => {
    if (node.id === rootNode?.id) return // Skip root

    // Column 1: MCP tools (toolGroup with category=mcp)
    if (node.type === "toolGroup" && node.data.category === "mcp") {
      mcpNodes.push(node)
    }
    // Column 2: Built-in tools (toolGroup with category=builtin)
    else if (node.type === "toolGroup" && node.data.category === "builtin") {
      builtinNodes.push(node)
    }
    // Column 3: Skills, Commands, Agents
    else if (node.type === "skill" || node.type === "command" || node.type === "agent") {
      invocationNodes.push(node)
    }
    // Column 4: CLI apps and Background tasks
    else if (node.type === "cli" || node.type === "backgroundTask") {
      infraNodes.push(node)
    }
    // Fallback: put in column 3
    else {
      invocationNodes.push(node)
    }
  })

  // Position root node at top center
  if (rootNode) {
    const totalWidth = COLUMN_WIDTH * 4
    layoutedNodes.push({
      ...rootNode,
      position: { x: totalWidth / 2 - (rootNode.data.width || 100), y: 0 },
    })
  }

  // Position Column 1: MCP tools (leftmost)
  mcpNodes.forEach((node, i) => {
    layoutedNodes.push({
      ...node,
      position: { x: 0, y: START_Y + i * ROW_HEIGHT },
    })
  })

  // Position Column 2: Built-in tools
  builtinNodes.forEach((node, i) => {
    layoutedNodes.push({
      ...node,
      position: { x: COLUMN_WIDTH, y: START_Y + i * ROW_HEIGHT },
    })
  })

  // Position Column 3: Skills, Commands, Agents
  invocationNodes.forEach((node, i) => {
    layoutedNodes.push({
      ...node,
      position: { x: COLUMN_WIDTH * 2, y: START_Y + i * ROW_HEIGHT },
    })
  })

  // Position Column 4: CLI apps and Background tasks (rightmost)
  infraNodes.forEach((node, i) => {
    layoutedNodes.push({
      ...node,
      position: { x: COLUMN_WIDTH * 3, y: START_Y + i * ROW_HEIGHT },
    })
  })

  return { nodes: layoutedNodes, edges }
}
