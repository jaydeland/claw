/**
 * Types for the Loaded Context panel
 * Shows context information loaded at session start
 */

export interface LoadedContextData {
  claudeMdFiles: ClaudeMdFile[]
  mcpServers: McpServerInfo[]
  skills: SkillInfo[]
  agents: AgentInfo[]
  commands: CommandInfo[]
}

export interface ClaudeMdFile {
  path: string
  source: "project" | "user"
  content: string
  relativePath?: string // For display (e.g., ".claude/CLAUDE.md")
}

export interface McpServerInfo {
  name: string
  status: "running" | "failed" | "needs_auth" | "disabled" | "no_auth_needed" | "configured" | "missing_credentials"
  source: "project" | "user" | "custom"
  toolCount?: number
  enabled: boolean
}

export interface SkillInfo {
  name: string
  description: string
  source: "project" | "user" | "custom"
  path: string
}

export interface AgentInfo {
  name: string
  description: string
  source: "project" | "user" | "custom"
  path: string
  model?: string
}

export interface CommandInfo {
  name: string
  description: string
  source: "project" | "user" | "custom"
  path: string
  argumentHint?: string
}

export type DisplayMode = "side-peek" | "center-peek" | "full-page"

/**
 * Estimate token count from text
 * Uses rough approximation of ~4 characters per token
 * This is a common heuristic for English text with Claude/GPT models
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Calculate total token count for loaded context
 *
 * Progressive disclosure rules:
 * - CLAUDE.md files: Count full content
 * - MCP servers: Count server names only (tool descriptions not cached)
 * - Skills: Count description text only
 * - Agents: Count description text only
 * - Commands: Count description text only
 */
export function calculateLoadedContextTokens(data: LoadedContextData): {
  total: number
  claudeMd: number
  mcpServers: number
  skills: number
  agents: number
  commands: number
} {
  // Count full content for CLAUDE.md files
  const claudeMdTokens = (data.claudeMdFiles || []).reduce(
    (sum, file) => sum + estimateTokenCount(file.content),
    0
  )

  // Count server names for MCP servers (no tool descriptions available in cache)
  const mcpServerTokens = (data.mcpServers || []).reduce(
    (sum, server) => sum + estimateTokenCount(server.name),
    0
  )

  // Count descriptions only for skills
  const skillTokens = (data.skills || []).reduce(
    (sum, skill) => sum + estimateTokenCount(skill.description),
    0
  )

  // Count descriptions only for agents
  const agentTokens = (data.agents || []).reduce(
    (sum, agent) => sum + estimateTokenCount(agent.description),
    0
  )

  // Count descriptions only for commands
  const commandTokens = (data.commands || []).reduce(
    (sum, command) => sum + estimateTokenCount(command.description || ""),
    0
  )

  return {
    total: claudeMdTokens + mcpServerTokens + skillTokens + agentTokens + commandTokens,
    claudeMd: claudeMdTokens,
    mcpServers: mcpServerTokens,
    skills: skillTokens,
    agents: agentTokens,
    commands: commandTokens,
  }
}
