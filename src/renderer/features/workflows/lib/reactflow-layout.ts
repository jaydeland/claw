import { Node, Edge } from "reactflow"

// Layout configuration
const COLUMN_WIDTH = 250
const ROW_HEIGHT = 120
const START_Y = 150
const LEVEL_OFFSET_Y = 200 // Vertical offset for each depth level

/**
 * Detect if the graph has hierarchical/transitive dependencies
 * (nodes at different depth levels)
 */
function isHierarchicalGraph(nodes: Node[]): boolean {
  return nodes.some(node => typeof node.data?.depth === 'number' && node.data.depth > 0)
}

/**
 * Group nodes by their depth level for hierarchical layout
 */
function groupNodesByDepth(nodes: Node[]): Map<number, Node[]> {
  const levels = new Map<number, Node[]>()

  nodes.forEach(node => {
    const depth = node.data?.depth ?? 0
    if (!levels.has(depth)) {
      levels.set(depth, [])
    }
    levels.get(depth)!.push(node)
  })

  return levels
}

/**
 * Calculate horizontal positions for nodes to minimize edge crossings
 * Uses a simple centering approach based on parent positions
 */
function calculateOptimalPositions(
  nodes: Node[],
  edges: Edge[],
  rootX: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  // Group by depth
  const depthGroups = groupNodesByDepth(nodes)
  const depths = Array.from(depthGroups.keys()).sort((a, b) => a - b)

  // Position each depth level
  depths.forEach(depth => {
    const levelNodes = depthGroups.get(depth)!
    const y = depth === 0 ? 0 : START_Y + (depth - 1) * LEVEL_OFFSET_Y

    // For root level, center it
    if (depth === 0) {
      const rootNode = levelNodes[0]
      if (rootNode) {
        positions.set(rootNode.id, { x: rootX, y })
      }
      return
    }

    // For other levels, distribute evenly
    const nodeCount = levelNodes.length
    const totalWidth = (nodeCount - 1) * COLUMN_WIDTH
    const startX = rootX - totalWidth / 2

    levelNodes.forEach((node, index) => {
      positions.set(node.id, {
        x: startX + index * COLUMN_WIDTH,
        y,
      })
    })
  })

  return positions
}

/**
 * Hierarchical layout for transitive dependency graphs
 * Arranges nodes in levels based on depth
 */
function layoutHierarchical(
  nodes: Node[],
  edges: Edge[],
  rootNode: Node | undefined
): Node[] {
  const layoutedNodes: Node[] = []

  // Calculate center position
  const containerWidth = 1200 // Estimated container width
  const rootX = containerWidth / 2 - (rootNode?.data?.width ?? 100) / 2

  // Calculate positions
  const positions = calculateOptimalPositions(nodes, edges, rootX)

  // Apply positions to nodes
  nodes.forEach(node => {
    const pos = positions.get(node.id)
    if (pos) {
      layoutedNodes.push({
        ...node,
        position: pos,
      })
    } else {
      // Fallback: place at root level
      layoutedNodes.push({
        ...node,
        position: { x: rootX, y: START_Y },
      })
    }
  })

  return layoutedNodes
}

/**
 * Original column-based layout for flat dependency graphs
 */
function layoutColumnar(nodes: Node[], rootNode: Node | undefined): Node[] {
  const layoutedNodes: Node[] = []

  // Categorize nodes into columns
  const mcpNodes: Node[] = []
  const builtinNodes: Node[] = []
  const invocationNodes: Node[] = []
  const infraNodes: Node[] = []
  const dependentNodes: Node[] = [] // Nodes that depend on root (reverse deps)

  nodes.forEach((node) => {
    if (node.id === rootNode?.id) return

    // Reverse dependencies (agents that depend on this skill)
    if (node.id.startsWith('dependent-')) {
      dependentNodes.push(node)
    }
    // Column 1: MCP tools
    else if (node.type === "toolGroup" && node.data.category === "mcp") {
      mcpNodes.push(node)
    }
    // Column 2: Built-in tools
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
    else {
      invocationNodes.push(node)
    }
  })

  // Position root node at top center
  if (rootNode) {
    const totalWidth = COLUMN_WIDTH * 4
    layoutedNodes.push({
      ...rootNode,
      position: { x: totalWidth / 2 - (rootNode.data.width || 100) / 2, y: 0 },
    })
  }

  // Position Column 1: MCP tools
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

  // Position Column 4: CLI apps and Background tasks
  infraNodes.forEach((node, i) => {
    layoutedNodes.push({
      ...node,
      position: { x: COLUMN_WIDTH * 3, y: START_Y + i * ROW_HEIGHT },
    })
  })

  // Position reverse dependencies (dependents) to the left
  dependentNodes.forEach((node, i) => {
    layoutedNodes.push({
      ...node,
      position: { x: -COLUMN_WIDTH, y: START_Y + i * ROW_HEIGHT },
    })
  })

  return layoutedNodes
}

/**
 * Smart layout that adapts to graph structure
 * Uses hierarchical layout for transitive deps, columnar for flat graphs
 */
export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[]
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) return { nodes, edges }

  // Find root node
  const rootNode = nodes.find(
    (n) => n.type === "agent" || n.type === "command" || n.id === "main"
  )

  // Check if this is a hierarchical graph (has depth levels)
  const useHierarchical = isHierarchicalGraph(nodes)

  // Apply appropriate layout
  const layoutedNodes = useHierarchical
    ? layoutHierarchical(nodes, edges, rootNode)
    : layoutColumnar(nodes, rootNode)

  return { nodes: layoutedNodes, edges }
}
