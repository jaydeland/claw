/**
 * Type definitions for MCP config consolidation
 */

/**
 * MCP server configuration from mcp.json
 * Supports both command-based (stdio) and URL-based (http/sse) servers
 */
export interface McpServerConfig {
  /** Command to execute (for stdio servers) */
  command?: string
  /** Arguments for the command (for stdio servers) */
  args?: string[]
  /** Environment variables */
  env?: Record<string, string>
  /** Whether the server is disabled */
  disabled?: boolean
  /** Tools to auto-approve */
  autoApprove?: string[]
  /** Server type: "http", "sse", or undefined for stdio */
  type?: "http" | "sse"
  /** URL for HTTP/SSE servers */
  url?: string
  /** HTTP headers for HTTP/SSE servers */
  headers?: Record<string, string>
}

/**
 * Raw MCP config file structure
 */
export interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>
}

/**
 * Source of an MCP config file
 */
export type ConfigSourceType = "project" | "user" | "custom"

/**
 * Metadata about an MCP config source
 */
export interface ConfigSource {
  /** Type of config source */
  type: ConfigSourceType
  /** Absolute path to mcp.json */
  path: string
  /** Priority (lower = higher priority, first source wins) */
  priority: number
  /** Whether this source exists and is readable */
  exists: boolean
  /** If exists=false, this contains the error */
  error?: string
}

/**
 * Metadata extracted from parsing an MCP config file
 */
export interface McpConfigMetadata {
  /** Config source information */
  source: ConfigSource
  /** Parsed config file (undefined if parse failed) */
  config?: McpConfigFile
  /** Server names defined in this config */
  serverNames: string[]
  /** Parse error if any */
  parseError?: string
  /** File modification time (for caching) */
  mtime?: number
}

/**
 * Information about a config conflict (duplicate server name)
 */
export interface ConflictInfo {
  /** Server name that conflicts */
  serverName: string
  /** Source that wins (first in priority order) */
  winningSource: ConfigSource
  /** Sources that are ignored due to conflict */
  ignoredSources: ConfigSource[]
}

/**
 * Consolidated view of all MCP configs merged by priority
 */
export interface ConsolidatedConfig {
  /** All config sources in priority order */
  sources: McpConfigMetadata[]
  /** Merged servers (first source wins for each server name) */
  mergedServers: Record<string, McpServerConfig>
  /** Map of server name to source that provides it */
  serverSources: Record<string, ConfigSource>
  /** Detected conflicts */
  conflicts: ConflictInfo[]
}
