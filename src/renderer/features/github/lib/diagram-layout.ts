import ELK from "elkjs/lib/elk.bundled.js"
import type { Node, Edge } from "reactflow"

const elk = new ELK()

const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "60",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.compaction.postCompaction.strategy": "LEFT_RIGHT_CONSTRAINT_LOCKING",
  "elk.edgeRouting": "ORTHOGONAL",
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 70

/**
 * Apply ELK layered layout to React Flow nodes and edges.
 * Returns new nodes with updated positions; edges are unchanged.
 */
export async function applyDiagramLayout(
  nodes: Node[],
  edges: Edge[]
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) return { nodes, edges }

  const elkNodes = nodes.map((n) => ({
    id: n.id,
    width: (n.width as number | undefined) ?? NODE_WIDTH,
    height: (n.height as number | undefined) ?? NODE_HEIGHT,
  }))

  const elkEdges = edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }))

  const graph = {
    id: "root",
    layoutOptions: ELK_OPTIONS,
    children: elkNodes,
    edges: elkEdges,
  }

  try {
    const layouted = await elk.layout(graph)
    const positionMap = new Map(
      (layouted.children ?? []).map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])
    )

    const layoutedNodes = nodes.map((n) => {
      const pos = positionMap.get(n.id)
      return pos ? { ...n, position: pos } : n
    })

    return { nodes: layoutedNodes, edges }
  } catch (err) {
    console.warn("[diagram-layout] ELK layout failed, using original positions:", err)
    return { nodes, edges }
  }
}
