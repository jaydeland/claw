/**
 * Types for the Loaded Context panel
 * Shows context information loaded at session start
 */

export interface LoadedContextData {
  claudeMdFiles: ClaudeMdFile[]
  mcpServers: McpServerInfo[]
  skills: SkillInfo[]
  agents: AgentInfo[]
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

export type DisplayMode = "side-peek" | "center-peek" | "full-page"
