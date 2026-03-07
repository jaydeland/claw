/**
 * Type definitions for MCP config consolidation
 */

/**
 * SDK-compatible MCP server config types (discriminated union)
 */
export interface McpStdioServerConfig {
  type?: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpSSEServerConfig {
  type: "sse"
  url: string
  headers?: Record<string, string>
}

export interface McpHttpServerConfig {
  type: "http"
  url: string
  headers?: Record<string, string>
}

export type SdkMcpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig

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
 * Convert local McpServerConfig to SDK-compatible format
 */
export function toSdkMcpConfig(config: McpServerConfig): SdkMcpServerConfig {
  // HTTP server
  if (config.type === "http" && config.url) {
    return {
      type: "http",
      url: config.url,
      headers: config.headers,
    }
  }

  // SSE server
  if (config.type === "sse" && config.url) {
    return {
      type: "sse",
      url: config.url,
      headers: config.headers,
    }
  }

  // Stdio server (default)
  // Must have a command for stdio servers
  if (!config.command) {
    throw new Error("Stdio MCP server must have a command")
  }
  return {
    type: "stdio",
    command: config.command,
    args: config.args,
    env: config.env,
  }
}

/**
 * Convert a map of local McpServerConfig to SDK format
 */
export function toSdkMcpConfigs(
  servers: Record<string, McpServerConfig>
): Record<string, SdkMcpServerConfig> {
  const result: Record<string, SdkMcpServerConfig> = {}
  for (const [name, config] of Object.entries(servers)) {
    result[name] = toSdkMcpConfig(config)
  }
  return result
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
