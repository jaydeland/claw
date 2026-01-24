/**
 * Type definitions for MCP config consolidation
 */

/**
 * MCP server configuration from mcp.json
 */
export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
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
export type ConfigSourceType = "project" | "devyard" | "user" | "custom"

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
