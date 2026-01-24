/**
 * MCP config consolidation logic
 * Merges multiple mcp.json files from different sources in priority order
 */
import * as fs from "fs/promises"
import { existsSync, statSync } from "fs"
import path from "path"
import * as os from "os"
import { getDevyardConfig } from "../devyard-config"
import type {
  ConfigSource,
  McpConfigFile,
  McpConfigMetadata,
  ConflictInfo,
  ConsolidatedConfig,
  McpServerConfig,
} from "./types"

/**
 * Get all MCP config paths in priority order
 * Priority: Project (10) → Devyard (20) → User (100) → Custom configs (by priority field)
 *
 * @param projectPath Optional path to project root (for project-specific mcp.json)
 * @returns Array of ConfigSource objects in priority order
 */
export function getMcpConfigPaths(projectPath?: string): ConfigSource[] {
  const sources: ConfigSource[] = []

  // 1. Project-level config (priority 10) - highest priority
  if (projectPath) {
    const projectConfigPath = path.join(projectPath, ".claude", "mcp.json")
    sources.push({
      type: "project",
      path: projectConfigPath,
      priority: 10,
      exists: existsSync(projectConfigPath),
    })
  }

  // 2. Devyard config (priority 20)
  const devyardConfig = getDevyardConfig()
  if (devyardConfig.enabled && devyardConfig.claudeConfigDir) {
    const devyardConfigPath = path.join(devyardConfig.claudeConfigDir, "mcp.json")
    sources.push({
      type: "devyard",
      path: devyardConfigPath,
      priority: 20,
      exists: existsSync(devyardConfigPath),
    })
  }

  // 3. User config (priority 100)
  const userConfigPath = path.join(os.homedir(), ".claude", "mcp.json")
  sources.push({
    type: "user",
    path: userConfigPath,
    priority: 100,
    exists: existsSync(userConfigPath),
  })

  // TODO: Add custom configs from database (Step 3)
  // const customConfigs = await getCustomMcpConfigs()
  // sources.push(...customConfigs)

  // Sort by priority (lower = higher priority)
  sources.sort((a, b) => a.priority - b.priority)

  return sources
}

/**
 * Parse an MCP config file and extract metadata
 *
 * @param configPath Absolute path to mcp.json file
 * @param source Source information for this config
 * @returns Metadata about the parsed config
 */
export async function parseMcpConfigFile(
  configPath: string,
  source: ConfigSource
): Promise<McpConfigMetadata> {
  const metadata: McpConfigMetadata = {
    source,
    serverNames: [],
  }

  // Check if file exists
  if (!source.exists) {
    metadata.parseError = "File does not exist"
    return metadata
  }

  try {
    // Get file modification time for caching
    const stats = statSync(configPath)
    metadata.mtime = stats.mtimeMs

    // Read and parse file
    const content = await fs.readFile(configPath, "utf-8")
    const config = JSON.parse(content) as McpConfigFile

    metadata.config = config

    // Extract server names
    if (config.mcpServers) {
      metadata.serverNames = Object.keys(config.mcpServers)
    }
  } catch (error) {
    // Handle specific error types
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      metadata.parseError = "File not found"
    } else if ((error as NodeJS.ErrnoException).code === "EACCES") {
      metadata.parseError = "Permission denied"
    } else if (error instanceof SyntaxError) {
      metadata.parseError = `Invalid JSON: ${error.message}`
    } else {
      metadata.parseError = `Failed to parse: ${(error as Error).message}`
    }

    console.error(`[config] Error parsing ${configPath}:`, error)
  }

  return metadata
}

/**
 * Merge MCP servers from multiple configs
 * First source wins for each server name (priority-based override)
 *
 * @param configs Array of parsed config metadata in priority order
 * @returns Merged servers and source mapping
 */
export function mergeMcpServers(configs: McpConfigMetadata[]): {
  mergedServers: Record<string, McpServerConfig>
  serverSources: Record<string, ConfigSource>
} {
  const mergedServers: Record<string, McpServerConfig> = {}
  const serverSources: Record<string, ConfigSource> = {}

  // Process configs in priority order (already sorted)
  for (const metadata of configs) {
    if (!metadata.config?.mcpServers) {
      continue
    }

    for (const [serverName, serverConfig] of Object.entries(metadata.config.mcpServers)) {
      // First source wins - skip if already defined
      if (serverName in mergedServers) {
        continue
      }

      mergedServers[serverName] = serverConfig
      serverSources[serverName] = metadata.source
    }
  }

  return { mergedServers, serverSources }
}

/**
 * Detect conflicts (duplicate server names across sources)
 *
 * @param configs Array of parsed config metadata in priority order
 * @returns Array of conflict information
 */
export function detectConflicts(configs: McpConfigMetadata[]): ConflictInfo[] {
  const conflicts: ConflictInfo[] = []
  const serverOccurrences = new Map<string, ConfigSource[]>()

  // Track all occurrences of each server name
  for (const metadata of configs) {
    if (!metadata.config?.mcpServers) {
      continue
    }

    for (const serverName of metadata.serverNames) {
      if (!serverOccurrences.has(serverName)) {
        serverOccurrences.set(serverName, [])
      }
      serverOccurrences.get(serverName)!.push(metadata.source)
    }
  }

  // Find conflicts (server defined in multiple sources)
  for (const [serverName, sources] of Array.from(serverOccurrences.entries())) {
    if (sources.length > 1) {
      conflicts.push({
        serverName,
        winningSource: sources[0], // First source wins
        ignoredSources: sources.slice(1),
      })
    }
  }

  return conflicts
}

/**
 * Get consolidated view of all MCP configs
 * Merges all config sources in priority order
 *
 * @param projectPath Optional path to project root
 * @returns Complete consolidated config with sources, merged servers, and conflicts
 */
export async function getConsolidatedConfig(
  projectPath?: string
): Promise<ConsolidatedConfig> {
  // Get all config paths in priority order
  const configSources = getMcpConfigPaths(projectPath)

  // Parse each config file
  const parsedConfigs: McpConfigMetadata[] = []
  for (const source of configSources) {
    const metadata = await parseMcpConfigFile(source.path, source)
    parsedConfigs.push(metadata)
  }

  // Filter to only successfully parsed configs with servers
  const validConfigs = parsedConfigs.filter(
    (config) => config.config?.mcpServers && !config.parseError
  )

  // Merge servers from all sources
  const { mergedServers, serverSources } = mergeMcpServers(validConfigs)

  // Detect conflicts
  const conflicts = detectConflicts(validConfigs)

  return {
    sources: parsedConfigs,
    mergedServers,
    serverSources,
    conflicts,
  }
}

/**
 * Get a single merged MCP config file for Claude SDK
 * This is what gets passed to Claude for MCP server initialization
 *
 * @param projectPath Optional path to project root
 * @returns McpConfigFile with merged servers
 */
export async function getMergedMcpConfig(projectPath?: string): Promise<McpConfigFile> {
  const consolidated = await getConsolidatedConfig(projectPath)
  return {
    mcpServers: consolidated.mergedServers,
  }
}

/**
 * Get human-readable summary of config consolidation
 * Useful for debugging and displaying in UI
 *
 * @param projectPath Optional path to project root
 * @returns Formatted summary string
 */
export async function getConfigSummary(projectPath?: string): Promise<string> {
  const consolidated = await getConsolidatedConfig(projectPath)
  const lines: string[] = []

  lines.push("MCP Configuration Summary")
  lines.push("=".repeat(50))
  lines.push("")

  // List all sources
  lines.push("Config Sources (priority order):")
  for (const metadata of consolidated.sources) {
    const status = metadata.parseError
      ? `❌ ${metadata.parseError}`
      : metadata.serverNames.length > 0
        ? `✓ ${metadata.serverNames.length} server(s)`
        : "⚠ No servers"
    lines.push(`  ${metadata.source.priority}: ${metadata.source.type} - ${status}`)
    lines.push(`     ${metadata.source.path}`)
  }

  lines.push("")

  // List merged servers
  const serverCount = Object.keys(consolidated.mergedServers).length
  lines.push(`Merged Servers (${serverCount} total):`)
  for (const [serverName, config] of Object.entries(consolidated.mergedServers)) {
    const source = consolidated.serverSources[serverName]
    const disabled = config.disabled ? " [DISABLED]" : ""
    lines.push(`  • ${serverName} (from ${source.type})${disabled}`)
  }

  lines.push("")

  // List conflicts
  if (consolidated.conflicts.length > 0) {
    lines.push(`Conflicts (${consolidated.conflicts.length}):`)
    for (const conflict of consolidated.conflicts) {
      lines.push(`  ⚠ ${conflict.serverName}`)
      lines.push(`     Using: ${conflict.winningSource.type}`)
      lines.push(
        `     Ignoring: ${conflict.ignoredSources.map((s) => s.type).join(", ")}`
      )
    }
  } else {
    lines.push("No conflicts detected")
  }

  return lines.join("\n")
}
