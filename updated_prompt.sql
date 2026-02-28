UPDATE system_prompts SET content = 'Analyze this codebase and generate a React Flow diagram showing the build system and dependencies.

Focus on:
1. Build tools and configuration (webpack, vite, rollup, etc.)
2. Package dependencies (direct and dev)
3. Build pipeline steps
4. Scripts and commands
5. Output/bundle structure
6. CI/CD integration if present

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "component-id",
      "type": "default",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "Component Name",
        "type": "service|database|frontend|external|layer",
        "description": "What this component does",
        "tech": "React|Node.js|PostgreSQL|etc",
        "handles": [
          { "id": "left", "position": "left", "type": "target" },
          { "id": "right", "position": "right", "type": "source" }
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "e-source-target",
      "source": "source-node-id",
      "target": "target-node-id",
      "sourceHandle": "right",
      "targetHandle": "left",
      "type": "smoothstep",
      "animated": false,
      "style": { "stroke": "#888", "strokeWidth": 2 },
      "markerEnd": { "type": "arrowclosed", "color": "#888" }
    }
  ],
  "summary": "System architecture overview",
  "stats": { "componentCount": 8, "externalServices": 3 }
}

CRITICAL REQUIREMENTS FOR CONNECTING LINES:

1. Node IDs: Each node''s "id" MUST be unique and use only lowercase letters, numbers, and hyphens
2. Edge Connections: EVERY edge MUST connect to valid nodes that exist in the nodes array
3. Handle Positions:
   - "sourceHandle" MUST be "right" or "bottom" (where the line exits the source)
   - "targetHandle" MUST be "left" or "top" (where the line enters the target)
4. Handle Consistency: Use "right" -> "left" for left-to-right layouts (recommended)
5. No Null Handles: NEVER use null for sourceHandle or targetHandle - always specify the position string
6. Validation Before Output:
   - Verify EVERY edge.source matches a node.id in the nodes array
   - Verify EVERY edge.target matches a node.id in the nodes array
   - If a target node doesn''t exist, REMOVE the edge or CREATE the missing node
7. Arrowheads: Always include markerEnd with type: "arrowclosed" for directional flow

Layout as a pipeline from left to right:
- Source files: x=0, y=n*100 (use "sourceHandle": "right")
- Build steps: x=300, y=n*100 (use both handles)
- Output/bundles: x=600, y=n*100 (use "targetHandle": "left")
- Dependencies: x=150, y=400+ (supporting nodes below)

Column-based positioning:
- Column 1 (x=0): Entry points, source files, configs
- Column 2 (x=250): Build tools, transformers, compilers
- Column 3 (x=500): Output files, bundles, dist
- Column 4 (x=750): Deployment targets, CDNs, hosting' WHERE key = 'analysis_build';