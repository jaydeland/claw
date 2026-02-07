import { app } from "electron"
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, statSync } from "fs"
import { dirname, join } from "path"

// Cache for MCP server statuses (to filter out failed/needs-auth servers)
// Maps project path -> server name -> status
const mcpServerStatusCache = new Map<string, Map<string, string>>()

// Cache for MCP tools from Claude session init message
// Maps project path -> { servers: [{name, status, tools}], allTools: [...], cachedAt }
export interface McpServerWithTools {
  name: string
  status: string
  tools: Array<{
    name: string
    description?: string
    inputSchema?: {
      type: string
      properties?: Record<string, unknown>
      required?: string[]
      [key: string]: unknown
    }
  }>
}

export interface McpToolsCacheEntry {
  servers: McpServerWithTools[]
  allTools: string[] // All tool names for quick lookup
  cachedAt: number
}

const mcpToolsCache = new Map<string, McpToolsCacheEntry>()
const MCP_TOOLS_TTL = 10 * 60 * 1000 // 10 minutes (tools change less frequently than status)

// Disk cache types and configuration for MCP server statuses
interface CachedMcpStatus {
  status: string
  cachedAt: number
}

interface McpCacheData {
  version: number
  entries: Record<string, {
    servers: Record<string, CachedMcpStatus>
    updatedAt: number
  }>
}

const MCP_STATUS_TTL = 5 * 60 * 1000 // 5 minutes
const MCP_CACHE_PATH = join(app.getPath("userData"), "cache", "mcp-status.json")
let diskCacheLastLoadTime = 0 // Track when disk cache was last loaded

/**
 * Get cached MCP tools for a project path
 * Returns null if cache is empty or expired
 */
export function getCachedMcpTools(projectPath: string): McpToolsCacheEntry | null {
  const cached = mcpToolsCache.get(projectPath)
  if (!cached) return null

  // Check if expired
  if (Date.now() - cached.cachedAt > MCP_TOOLS_TTL) {
    mcpToolsCache.delete(projectPath)
    return null
  }

  return cached
}

/**
 * Set MCP tools cache for a project path
 */
export function setCachedMcpTools(projectPath: string, entry: McpToolsCacheEntry): void {
  mcpToolsCache.set(projectPath, entry)
}

/**
 * Get MCP server status cache for a project path
 */
export function getMcpServerStatusCache(projectPath: string): Map<string, string> | undefined {
  return mcpServerStatusCache.get(projectPath)
}

/**
 * Set MCP server status cache for a project path
 */
export function setMcpServerStatusCache(projectPath: string, serverMap: Map<string, string>): void {
  mcpServerStatusCache.set(projectPath, serverMap)
}

/**
 * Load MCP status cache from disk
 * Reloads if cache was updated on disk since last load (for concurrent requests)
 */
export function loadMcpStatusFromDisk(): void {
  try {
    if (!existsSync(MCP_CACHE_PATH)) {
      diskCacheLastLoadTime = Date.now()
      return
    }

    // Check if file was modified since last load (handles concurrent requests)
    const stats = statSync(MCP_CACHE_PATH)
    const fileModTime = stats.mtimeMs

    if (diskCacheLastLoadTime > 0 && fileModTime <= diskCacheLastLoadTime) {
      // File hasn't changed since last load, skip
      return
    }

    const data: McpCacheData = JSON.parse(readFileSync(MCP_CACHE_PATH, "utf-8"))

    if (data.version !== 1) {
      console.warn(`[MCP Cache] Unknown version ${data.version}, ignoring`)
      diskCacheLastLoadTime = Date.now()
      return
    }

    const now = Date.now()
    let loadedCount = 0
    let expiredCount = 0

    for (const [projectPath, entry] of Object.entries(data.entries)) {
      const serverMap = new Map<string, string>()

      for (const [serverName, cached] of Object.entries(entry.servers)) {
        if (now - cached.cachedAt < MCP_STATUS_TTL) {
          serverMap.set(serverName, cached.status)
          loadedCount++
        } else {
          expiredCount++
        }
      }

      if (serverMap.size > 0) {
        mcpServerStatusCache.set(projectPath, serverMap)
      }
    }

    diskCacheLastLoadTime = Date.now()
    if (loadedCount > 0) {
      console.log(`[MCP Cache] Loaded ${loadedCount} cached server statuses`)
    }
  } catch (error) {
    console.warn("[MCP Cache] Failed to load from disk:", error)
    diskCacheLastLoadTime = Date.now()
    try {
      if (existsSync(MCP_CACHE_PATH)) {
        unlinkSync(MCP_CACHE_PATH)
      }
    } catch {}
  }
}

/**
 * Save MCP status cache to disk (write-through)
 */
export function saveMcpStatusToDisk(): void {
  try {
    const cacheDir = dirname(MCP_CACHE_PATH)
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }

    const data: McpCacheData = {
      version: 1,
      entries: Object.fromEntries(
        Array.from(mcpServerStatusCache.entries()).map(([projectPath, serverMap]) => [
          projectPath,
          {
            servers: Object.fromEntries(
              Array.from(serverMap.entries()).map(([name, status]) => [
                name,
                { status, cachedAt: Date.now() }
              ])
            ),
            updatedAt: Date.now()
          }
        ])
      )
    }

    const tempPath = MCP_CACHE_PATH + ".tmp"
    writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8")
    renameSync(tempPath, MCP_CACHE_PATH)

    const totalServers = Array.from(mcpServerStatusCache.values())
      .reduce((sum, map) => sum + map.size, 0)
    console.log(`[MCP Cache] Saved ${totalServers} statuses to disk`)
  } catch (error) {
    console.error("[MCP Cache] Failed to save to disk:", error)
  }
}

/**
 * Clear all MCP caches (memory + disk)
 */
export function clearMcpCaches(): void {
  mcpServerStatusCache.clear()
  mcpToolsCache.clear()
  diskCacheLastLoadTime = 0

  // Clear disk cache
  try {
    if (existsSync(MCP_CACHE_PATH)) {
      unlinkSync(MCP_CACHE_PATH)
      console.log("[MCP Cache] Cleared disk cache")
    }
  } catch (error) {
    console.error("[MCP Cache] Failed to clear disk cache:", error)
  }
}

/**
 * Reset disk cache load time (for testing/debugging)
 */
export function resetDiskCacheLoadTime(): void {
  diskCacheLastLoadTime = 0
}

/**
 * Get all server status cache entries (for logging/stats)
 */
export function getAllMcpServerStatusCaches(): Map<string, Map<string, string>> {
  return mcpServerStatusCache
}
