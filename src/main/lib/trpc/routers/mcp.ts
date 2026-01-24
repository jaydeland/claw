import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { safeStorage } from "electron"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, mcpCredentials } from "../../db"
import { eq } from "drizzle-orm"
import { getConsolidatedConfig } from "../../config/consolidator"
import type {
  McpServerConfig,
  McpConfigFile,
  ConfigSource,
  McpConfigMetadata,
  ConflictInfo,
} from "../../config/types"

// ============ TYPES ============

export type McpAuthStatus = "no_auth_needed" | "configured" | "missing_credentials"

export interface McpServer {
  id: string
  name: string
  config: McpServerConfig
  authStatus: McpAuthStatus
  credentialEnvVars: string[]
  enabled: boolean
  source?: ConfigSource // Which config file provides this server
}

// ============ HELPERS ============

/**
 * Get the path to mcp.json config file
 * Returns ~/.claude/mcp.json
 */
function getMcpConfigPath(): string {
  return path.join(os.homedir(), ".claude", "mcp.json")
}

/**
 * Check if an env var name looks like a credential
 */
function isCredentialEnvVar(name: string): boolean {
  const patterns = [
    /API[_-]?KEY/i,
    /TOKEN/i,
    /SECRET/i,
    /PASSWORD/i,
    /CREDENTIAL/i,
    /AUTH/i,
    /PRIVATE[_-]?KEY/i,
  ]
  return patterns.some((p) => p.test(name))
}

/**
 * Check if a value is a placeholder (needs to be filled in)
 */
function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  const trimmed = value.trim()
  return (
    trimmed === "" ||
    trimmed === "..." ||
    trimmed.includes("YOUR_") ||
    trimmed.includes("<") ||
    trimmed.includes("REPLACE") ||
    trimmed.includes("TODO")
  )
}

/**
 * Encrypt a credential value using Electron's safeStorage
 */
function encryptCredential(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[mcp] Encryption not available, storing as base64")
    return Buffer.from(value).toString("base64")
  }
  return safeStorage.encryptString(value).toString("base64")
}

/**
 * Decrypt a credential value using Electron's safeStorage
 */
function decryptCredential(encrypted: string): string | null {
  if (!encrypted) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    const buffer = Buffer.from(encrypted, "base64")
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error("[mcp] Failed to decrypt credential:", error)
    return null
  }
}

/**
 * Parse JSON safely with fallback
 */
function parseJsonSafely<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Get auth status for a server
 */
function getAuthStatus(
  config: McpServerConfig,
  storedCredentials: Record<string, string>
): { status: McpAuthStatus; credentialEnvVars: string[] } {
  const envVars = config.env || {}
  const credentialVars = Object.keys(envVars).filter(isCredentialEnvVar)

  if (credentialVars.length === 0) {
    return { status: "no_auth_needed", credentialEnvVars: [] }
  }

  // Check if all credential vars have values (either in config or stored)
  const allConfigured = credentialVars.every((varName) => {
    const configValue = envVars[varName]
    const storedValue = storedCredentials[varName]
    // Consider configured if has non-placeholder value
    return (configValue && !isPlaceholder(configValue)) || storedValue
  })

  return {
    status: allConfigured ? "configured" : "missing_credentials",
    credentialEnvVars: credentialVars,
  }
}

// ============ ROUTER ============

export const mcpRouter = router({
  /**
   * List all MCP servers from consolidated mcp.json configs with auth status
   * Merges servers from project, user, and custom config sources
   */
  listServers: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional()
    )
    .query(
      async ({
        input,
      }): Promise<{ servers: McpServer[]; conflicts?: ConflictInfo[] }> => {
        const servers: McpServer[] = []

        try {
          // Get consolidated config from all sources
          const consolidated = await getConsolidatedConfig(input?.projectPath)

          // Get stored credentials from database
          const db = getDatabase()
          const allCredentials = db.select().from(mcpCredentials).all()
          const credentialsMap = new Map<string, Record<string, string>>()

          for (const cred of allCredentials) {
            const decrypted: Record<string, string> = {}
            const stored = parseJsonSafely<Record<string, string>>(cred.credentials, {})
            for (const [key, value] of Object.entries(stored)) {
              const decryptedValue = decryptCredential(value)
              if (decryptedValue) {
                decrypted[key] = decryptedValue
              }
            }
            credentialsMap.set(cred.id, decrypted)
          }

          // Process each merged server
          for (const [serverId, serverConfig] of Object.entries(consolidated.mergedServers)) {
            const typedConfig = serverConfig as McpServerConfig
            const storedCredentials = credentialsMap.get(serverId) || {}
            const { status, credentialEnvVars } = getAuthStatus(
              typedConfig,
              storedCredentials
            )
            const source = consolidated.serverSources[serverId]

            servers.push({
              id: serverId,
              name: serverId,
              config: typedConfig,
              authStatus: status,
              credentialEnvVars,
              enabled: !typedConfig.disabled,
              source, // Include source information
            })
          }

          // Return servers and any detected conflicts
          return {
            servers,
            conflicts: consolidated.conflicts.length > 0 ? consolidated.conflicts : undefined,
          }
        } catch (error) {
          console.error("[mcp] Failed to get consolidated config:", error)
          return { servers: [] }
        }
      }
    ),

  /**
   * Get detailed info for a single MCP server from consolidated configs
   */
  getServer: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        projectPath: z.string().optional(),
      })
    )
    .query(async ({ input }): Promise<McpServer | null> => {
      try {
        // Get consolidated config from all sources
        const consolidated = await getConsolidatedConfig(input.projectPath)

        if (!consolidated.mergedServers[input.serverId]) {
          return null
        }

        const serverConfig = consolidated.mergedServers[input.serverId]
        const source = consolidated.serverSources[input.serverId]

        // Get stored credentials
        const db = getDatabase()
        const stored = db
          .select()
          .from(mcpCredentials)
          .where(eq(mcpCredentials.id, input.serverId))
          .get()

        let storedCredentials: Record<string, string> = {}
        if (stored) {
          const parsed = parseJsonSafely<Record<string, string>>(stored.credentials, {})
          for (const [key, value] of Object.entries(parsed)) {
            const decryptedValue = decryptCredential(value)
            if (decryptedValue) {
              storedCredentials[key] = decryptedValue
            }
          }
        }

        const { status, credentialEnvVars } = getAuthStatus(serverConfig, storedCredentials)

        return {
          id: input.serverId,
          name: input.serverId,
          config: serverConfig,
          authStatus: status,
          credentialEnvVars,
          enabled: !serverConfig.disabled,
          source, // Include source information
        }
      } catch (error) {
        console.error("[mcp] Failed to get server:", error)
        return null
      }
    }),

  /**
   * Save credentials for an MCP server
   */
  saveCredentials: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        credentials: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Encrypt each credential value
      const encrypted: Record<string, string> = {}
      for (const [key, value] of Object.entries(input.credentials)) {
        if (value && value.trim()) {
          encrypted[key] = encryptCredential(value)
        }
      }

      // Check if credentials exist
      const existing = db
        .select()
        .from(mcpCredentials)
        .where(eq(mcpCredentials.id, input.serverId))
        .get()

      if (existing) {
        // Merge with existing credentials
        const existingCreds = parseJsonSafely<Record<string, string>>(existing.credentials, {})
        const merged = { ...existingCreds, ...encrypted }

        db.update(mcpCredentials)
          .set({
            credentials: JSON.stringify(merged),
            updatedAt: new Date(),
          })
          .where(eq(mcpCredentials.id, input.serverId))
          .run()
      } else {
        db.insert(mcpCredentials)
          .values({
            id: input.serverId,
            credentials: JSON.stringify(encrypted),
            updatedAt: new Date(),
          })
          .run()
      }

      return { success: true }
    }),

  /**
   * Clear credentials for an MCP server
   */
  clearCredentials: publicProcedure
    .input(z.object({ serverId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      db.delete(mcpCredentials).where(eq(mcpCredentials.id, input.serverId)).run()

      return { success: true }
    }),

  /**
   * Toggle server enabled/disabled status in its source mcp.json file
   * Finds the correct source file for the server and updates it
   */
  toggleServer: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        enabled: z.boolean(),
        projectPath: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Get consolidated config to find which source has this server
        const consolidated = await getConsolidatedConfig(input.projectPath)

        if (!consolidated.mergedServers[input.serverId]) {
          throw new Error(`Server ${input.serverId} not found`)
        }

        // Find the source file that defines this server
        const source = consolidated.serverSources[input.serverId]
        const configPath = source.path

        // Read the specific source file
        const content = await fs.readFile(configPath, "utf-8")
        const config = JSON.parse(content) as McpConfigFile

        if (!config.mcpServers?.[input.serverId]) {
          throw new Error(`Server ${input.serverId} not found in ${source.type} config`)
        }

        // Update disabled field
        if (input.enabled) {
          delete config.mcpServers[input.serverId].disabled
        } else {
          config.mcpServers[input.serverId].disabled = true
        }

        // Write back to the source file
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8")

        return { success: true, source: source.type }
      } catch (error) {
        console.error("[mcp] Failed to toggle server:", error)
        throw error
      }
    }),

  /**
   * Get all MCP config file paths from consolidated sources
   * Shows all config files being used in priority order
   */
  getConfigPaths: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      try {
        const consolidated = await getConsolidatedConfig(input?.projectPath)

        return {
          sources: consolidated.sources.map((metadata: McpConfigMetadata) => ({
            type: metadata.source.type,
            path: metadata.source.path,
            priority: metadata.source.priority,
            exists: metadata.source.exists,
            serverCount: metadata.serverNames.length,
            parseError: metadata.parseError,
          })),
        }
      } catch (error) {
        console.error("[mcp] Failed to get config paths:", error)
        return { sources: [] }
      }
    }),

  /**
   * Get the primary MCP config file path (for backward compatibility)
   * Returns the first valid config path
   */
  getConfigPath: publicProcedure.query(() => {
    return { path: getMcpConfigPath() }
  }),

  /**
   * Get full consolidated config with all sources, servers, and conflicts
   * This is a detailed view for advanced configuration management
   */
  getConsolidatedView: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      try {
        const consolidated = await getConsolidatedConfig(input?.projectPath)

        return {
          sources: consolidated.sources.map((metadata: McpConfigMetadata) => ({
            source: metadata.source,
            serverNames: metadata.serverNames,
            parseError: metadata.parseError,
            mtime: metadata.mtime,
          })),
          serverCount: Object.keys(consolidated.mergedServers).length,
          conflicts: consolidated.conflicts,
        }
      } catch (error) {
        console.error("[mcp] Failed to get consolidated view:", error)
        throw error
      }
    }),
})
