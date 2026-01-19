/**
 * Helper functions to generate Mermaid.js flowchart syntax
 * from workflow dependencies
 */

interface AgentWithDependencies {
  id: string
  name: string
  description: string
  tools: string[]
  model: string
  sourcePath: string
  dependencies: {
    tools: string[]
    skills: string[]
    mcpServers: string[]
    agents: string[]
    commands: string[]
  }
}

/**
 * Generate Mermaid flowchart for an agent and its dependencies
 */
export function generateMermaidFromAgent(
  agent: AgentWithDependencies
): string {
  const lines: string[] = []

  // Start with graph definition
  lines.push("graph TD")

  // Main agent node (purple highlight)
  lines.push(`  A["Agent: ${escapeForMermaid(agent.name)}"]`)
  lines.push(`  style A fill:#8b5cf6,stroke:#7c3aed,color:#fff`)

  // Tools
  agent.dependencies.tools.forEach((tool, i) => {
    const nodeId = `T${i}`
    lines.push(`  ${nodeId}["Tool: ${escapeForMermaid(tool)}"]`)
    lines.push(`  A --> ${nodeId}`)
    lines.push(`  style ${nodeId} fill:#3b82f6,stroke:#2563eb,color:#fff`)
  })

  // Skills
  agent.dependencies.skills.forEach((skill, i) => {
    const nodeId = `S${i}`
    lines.push(`  ${nodeId}["Skill: ${escapeForMermaid(skill)}"]`)
    lines.push(`  A --> ${nodeId}`)
    lines.push(`  style ${nodeId} fill:#10b981,stroke:#059669,color:#fff`)
  })

  // Nested Agents
  agent.dependencies.agents.forEach((nestedAgent, i) => {
    const nodeId = `NA${i}`
    lines.push(`  ${nodeId}["Agent: ${escapeForMermaid(nestedAgent)}"]`)
    lines.push(`  A --> ${nodeId}`)
    lines.push(`  style ${nodeId} fill:#8b5cf6,stroke:#7c3aed,color:#fff`)
  })

  // Commands
  agent.dependencies.commands.forEach((command, i) => {
    const nodeId = `C${i}`
    lines.push(`  ${nodeId}["Command: ${escapeForMermaid(command)}"]`)
    lines.push(`  A --> ${nodeId}`)
    lines.push(`  style ${nodeId} fill:#f59e0b,stroke:#d97706,color:#fff`)
  })

  // MCP Servers
  agent.dependencies.mcpServers.forEach((mcp, i) => {
    const nodeId = `M${i}`
    lines.push(`  ${nodeId}["MCP: ${escapeForMermaid(mcp)}"]`)
    lines.push(`  A --> ${nodeId}`)
    lines.push(`  style ${nodeId} fill:#ec4899,stroke:#db2777,color:#fff`)
  })

  // If no dependencies, show a note
  const hasDeps =
    agent.dependencies.tools.length > 0 ||
    agent.dependencies.skills.length > 0 ||
    agent.dependencies.agents.length > 0 ||
    agent.dependencies.commands.length > 0 ||
    agent.dependencies.mcpServers.length > 0

  if (!hasDeps) {
    lines.push(`  INFO["No dependencies"]`)
    lines.push(`  style INFO fill:#e5e7eb,stroke:#d1d5db,color:#374151`)
  }

  return lines.join("\n")
}

/**
 * Generate Mermaid flowchart for a command or skill
 * Shows reverse dependencies (which agents use this)
 */
export function generateMermaidForCommandOrSkill(
  type: "command" | "skill",
  name: string,
  allAgents: AgentWithDependencies[]
): string {
  const lines: string[] = []

  // Start with graph definition
  lines.push("graph TD")

  // Main node (purple highlight)
  const mainLabel = type === "command" ? "Command" : "Skill"
  lines.push(`  MAIN["${mainLabel}: ${escapeForMermaid(name)}"]`)
  lines.push(`  style MAIN fill:#8b5cf6,stroke:#7c3aed,color:#fff`)

  // Find agents that use this command/skill
  const dependents = allAgents.filter(agent => {
    if (type === "command") {
      return agent.dependencies.commands.includes(name)
    } else {
      return agent.dependencies.skills.includes(name)
    }
  })

  // Show agents that depend on this
  dependents.forEach((agent, i) => {
    const nodeId = `A${i}`
    lines.push(`  ${nodeId}["Agent: ${escapeForMermaid(agent.name)}"]`)
    lines.push(`  ${nodeId} --> MAIN`)
    lines.push(`  style ${nodeId} fill:#3b82f6,stroke:#2563eb,color:#fff`)
  })

  // If no dependents, show a note
  if (dependents.length === 0) {
    lines.push(`  INFO["No agents use this ${type} yet"]`)
    lines.push(`  style INFO fill:#e5e7eb,stroke:#d1d5db,color:#374151`)
  }

  return lines.join("\n")
}

/**
 * Escape special characters for Mermaid syntax
 * Mermaid uses quotes for labels, so we need to escape them
 */
function escapeForMermaid(text: string): string {
  return text.replace(/"/g, "#quot;").replace(/\n/g, " ")
}
