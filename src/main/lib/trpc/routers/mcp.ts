import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { safeStorage } from "electron"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { createHash, randomBytes } from "node:crypto"
import { getDatabase, mcpCredentials, mcpToolCache } from "../../db"
import { eq } from "drizzle-orm"
import { getConsolidatedConfig } from "../../config/consolidator"
import type {
  McpServerConfig,
  McpConfigFile,
  ConfigSource,
  McpConfigMetadata,
  ConflictInfo,
} from "../../config/types"
import { queryMcpServerTools, type McpTool } from "../../mcp/tool-query"
import { detectAuthType, type OAuthConfig } from "../../mcp/oauth-detection"
import {
  startOAuthFlow,
  closeOAuthWindow,
  hasActiveOAuthWindow,
  type OAuthFlowResult,
} from "../../mcp/oauth-window"
import { BrowserWindow } from "electron"
import { getCachedMcpTools } from "./claude"

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
 * Extract env var references from a string (e.g., "${DD_API_KEY}" or "$DD_API_KEY")
 */
function extractEnvVarRefs(value: string): string[] {
  const refs: string[] = []
  // Match ${VAR_NAME} pattern
  const bracketMatches = value.matchAll(/\$\{([^}]+)\}/g)
  for (const match of bracketMatches) {
    refs.push(match[1])
  }
  // Match $VAR_NAME pattern (without braces)
  const simpleMatches = value.matchAll(/\$([A-Z_][A-Z0-9_]*)/gi)
  for (const match of simpleMatches) {
    // Don't double-count if already captured by bracket pattern
    if (!refs.includes(match[1])) {
      refs.push(match[1])
    }
  }
  return refs
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
 * Create a hash of server config for cache invalidation
 */
function hashServerConfig(config: McpServerConfig): string {
  const configStr = JSON.stringify({
    command: config.command,
    args: config.args,
    env: config.env,
  })
  return createHash("md5").update(configStr).digest("hex")
}

/**
 * Get auth status for a server
 * Detects credential requirements from both env vars and header env var references
 */
function getAuthStatus(
  config: McpServerConfig,
  storedCredentials: Record<string, string>
): { status: McpAuthStatus; credentialEnvVars: string[] } {
  const envVars = config.env || {}
  const credentialVars = new Set<string>()

  // Check env var names for credentials
  for (const key of Object.keys(envVars)) {
    if (isCredentialEnvVar(key)) {
      credentialVars.add(key)
    }
  }

  // For HTTP/SSE servers, also check headers for env var references
  // e.g., "Authorization": "Bearer ${DD_API_KEY}"
  if (config.headers) {
    for (const headerValue of Object.values(config.headers)) {
      const refs = extractEnvVarRefs(headerValue)
      for (const ref of refs) {
        if (isCredentialEnvVar(ref)) {
          credentialVars.add(ref)
        }
      }
    }
  }

  const credentialVarsArray = Array.from(credentialVars)

  if (credentialVarsArray.length === 0) {
    return { status: "no_auth_needed", credentialEnvVars: [] }
  }

  // Check if all credential vars have values (either in config, env, or stored)
  const allConfigured = credentialVarsArray.every((varName) => {
    const configValue = envVars[varName]
    const storedValue = storedCredentials[varName]
    // Consider configured if has non-placeholder value or is stored
    return (configValue && !isPlaceholder(configValue)) || storedValue
  })

  return {
    status: allConfigured ? "configured" : "missing_credentials",
    credentialEnvVars: credentialVarsArray,
  }
}

/**
 * Inject stored credentials into server config env
 * This allows credentials stored via the auth modal to be used when querying tools
 */
function injectStoredCredentials(
  config: McpServerConfig,
  storedCredentials: Record<string, string>
): McpServerConfig {
  if (Object.keys(storedCredentials).length === 0) {
    return config
  }

  return {
    ...config,
    env: {
      ...config.env,
      ...storedCredentials, // Stored creds override placeholders
    },
  }
}

// ============ MCP OAUTH 2.1 TYPES ============

/**
 * OAuth 2.1 Authorization Server Metadata (RFC 8414)
 * Discovered from /.well-known/oauth-authorization-server
 */
export interface OAuthServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  response_types_supported?: string[]
  grant_types_supported?: string[]
  code_challenge_methods_supported?: string[]
  pkce_required?: boolean
  token_endpoint_auth_methods_supported?: string[]
}

/**
 * Dynamic client registration response
 */
interface ClientRegistrationResponse {
  client_id: string
  client_secret?: string
  client_id_issued_at?: number
  client_secret_expires_at?: number
  registration_access_token?: string
  registration_client_uri?: string
}

/**
 * Token response from OAuth token endpoint
 */
interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

// Storage for pending OAuth flows (PKCE state)
const pendingOAuthFlows = new Map<
  string,
  {
    codeVerifier: string
    clientId: string
    clientSecret?: string
    tokenEndpoint: string
    redirectUri: string
    serverId: string
  }
>()

// ============ MCP OAUTH 2.1 HELPERS ============

/**
 * Generate a cryptographically secure random string for PKCE code verifier
 * Must be between 43-128 characters
 */
function generateCodeVerifier(): string {
  // Generate 32 random bytes and base64url encode
  const buffer = randomBytes(32)
  return buffer.toString("base64url")
}

/**
 * Generate code challenge from code verifier using S256 method
 */
function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest()
  return hash.toString("base64url")
}

/**
 * Discover OAuth metadata for an HTTP MCP server
 * Checks /.well-known/oauth-authorization-server
 */
async function discoverOAuthMetadata(
  serverUrl: string
): Promise<OAuthServerMetadata | null> {
  try {
    const url = new URL(serverUrl)
    const wellKnownUrl = `${url.origin}/.well-known/oauth-authorization-server`

    console.log(`[mcp-oauth] Checking for OAuth discovery at ${wellKnownUrl}`)

    const response = await fetch(wellKnownUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      console.log(`[mcp-oauth] No OAuth discovery found (${response.status})`)
      return null
    }

    const metadata = (await response.json()) as OAuthServerMetadata

    // Validate required fields
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      console.warn("[mcp-oauth] Invalid OAuth metadata - missing required endpoints")
      return null
    }

    console.log(`[mcp-oauth] Discovered OAuth metadata for ${metadata.issuer}`)
    return metadata
  } catch (error) {
    console.log("[mcp-oauth] OAuth discovery failed:", error)
    return null
  }
}

/**
 * Register a dynamic OAuth client with the server
 */
async function registerOAuthClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName: string
): Promise<ClientRegistrationResponse | null> {
  try {
    console.log(`[mcp-oauth] Registering client at ${registrationEndpoint}`)

    const response = await fetch(registrationEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none", // Public client (PKCE-only)
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[mcp-oauth] Client registration failed: ${error}`)
      return null
    }

    const result = (await response.json()) as ClientRegistrationResponse
    console.log(`[mcp-oauth] Registered client: ${result.client_id}`)
    return result
  } catch (error) {
    console.error("[mcp-oauth] Client registration error:", error)
    return null
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
  clientId: string,
  clientSecret: string | undefined,
  redirectUri: string
): Promise<TokenResponse | null> {
  try {
    console.log(`[mcp-oauth] Exchanging code for tokens`)

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    })

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    }

    // Add client authentication if we have a secret
    if (clientSecret) {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
      headers["Authorization"] = `Basic ${credentials}`
    }

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers,
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[mcp-oauth] Token exchange failed: ${error}`)
      return null
    }

    const tokens = (await response.json()) as TokenResponse
    console.log(`[mcp-oauth] Token exchange successful, expires_in: ${tokens.expires_in}`)
    return tokens
  } catch (error) {
    console.error("[mcp-oauth] Token exchange error:", error)
    return null
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

  /**
   * Get cached tool counts for MCP servers
   * Returns tool counts from cache (does not query servers)
   */
  getToolCounts: publicProcedure
    .input(
      z
        .object({
          serverIds: z.array(z.string()).optional(),
          projectPath: z.string().optional(),
        })
        .optional()
    )
    .query(
      async ({
        input,
      }): Promise<Record<string, { count: number; stale: boolean } | null>> => {
        try {
          const db = getDatabase()
          const cache = db.select().from(mcpToolCache).all()

          // Get current server configs to check if cache is stale
          const consolidated = await getConsolidatedConfig(input?.projectPath)

          const result: Record<string, { count: number; stale: boolean } | null> = {}

          // Filter by requested serverIds if provided
          const serverIds = input?.serverIds || Object.keys(consolidated.mergedServers)

          for (const serverId of serverIds) {
            const cached = cache.find((c) => c.serverId === serverId)
            const serverConfig = consolidated.mergedServers[serverId]

            if (!cached) {
              result[serverId] = null // Not yet cached
              continue
            }

            // Check if cache is stale (config changed or older than 24 hours)
            const configHash = serverConfig ? hashServerConfig(serverConfig) : null
            const isHashStale = configHash !== cached.configHash
            const isTimeStale =
              cached.lastQueried &&
              Date.now() - new Date(cached.lastQueried).getTime() > 24 * 60 * 60 * 1000

            result[serverId] = {
              count: cached.toolCount,
              stale: isHashStale || isTimeStale,
            }
          }

          return result
        } catch (error) {
          console.error("[mcp] Failed to get tool counts:", error)
          return {}
        }
      }
    ),

  /**
   * Query tools from an MCP server
   * Connects to the server and retrieves its available tools
   * Also caches the result for future getToolCounts queries
   */
  getServerTools: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        projectPath: z.string().optional(),
      })
    )
    .query(async ({ input }): Promise<{ tools: McpTool[]; error?: string }> => {
      try {
        console.log(`[mcp] Querying tools for server: ${input.serverId}`)

        // Get server configuration
        const consolidated = await getConsolidatedConfig(input.projectPath)
        const serverConfig = consolidated.mergedServers[input.serverId]

        if (!serverConfig) {
          return {
            tools: [],
            error: `Server ${input.serverId} not found`,
          }
        }

        // Check if server is disabled
        if (serverConfig.disabled) {
          return {
            tools: [],
            error: "Server is disabled",
          }
        }

        // Get stored credentials and inject into config
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

        // Inject credentials into config before querying
        const configWithCredentials = injectStoredCredentials(serverConfig, storedCredentials)

        // Query tools from the server
        const tools = await queryMcpServerTools(configWithCredentials)

        // Cache the results
        try {
          const db = getDatabase()
          const toolNames = tools.map((t) => t.name)
          const configHash = hashServerConfig(serverConfig)

          db.insert(mcpToolCache)
            .values({
              serverId: input.serverId,
              toolCount: tools.length,
              toolNames: JSON.stringify(toolNames),
              lastQueried: new Date(),
              configHash,
            })
            .onConflictDoUpdate({
              target: mcpToolCache.serverId,
              set: {
                toolCount: tools.length,
                toolNames: JSON.stringify(toolNames),
                lastQueried: new Date(),
                configHash,
              },
            })
            .run()
        } catch (cacheError) {
          console.warn("[mcp] Failed to cache tool counts:", cacheError)
          // Don't fail the request if caching fails
        }

        return { tools }
      } catch (error) {
        console.error("[mcp] Failed to query server tools:", error)
        return {
          tools: [],
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Get authentication type for an MCP server
   * Detects whether server uses OAuth or API key authentication
   */
  getAuthType: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        projectPath: z.string().optional(),
      })
    )
    .query(async ({ input }): Promise<OAuthConfig> => {
      try {
        const consolidated = await getConsolidatedConfig(input.projectPath)
        const serverConfig = consolidated.mergedServers[input.serverId]

        if (!serverConfig) {
          return { type: "api_key", requiredFields: [] }
        }

        return detectAuthType(input.serverId, serverConfig)
      } catch (error) {
        console.error("[mcp] Failed to detect auth type:", error)
        return { type: "api_key", requiredFields: [] }
      }
    }),

  /**
   * Start OAuth flow for an MCP server
   * Opens a window with embedded OAuth page
   */
  startOAuth: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        authUrl: z.string().url(),
        callbackPattern: z.string().optional(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ input }): Promise<OAuthFlowResult> => {
      try {
        // Get the focused window as parent
        const parentWindow = BrowserWindow.getFocusedWindow()

        const result = await startOAuthFlow(parentWindow, {
          authUrl: input.authUrl,
          callbackUrlPattern: input.callbackPattern || "localhost.*callback",
          serverId: input.serverId,
          title: input.title || "Sign in",
        })

        return result
      } catch (error) {
        console.error("[mcp] OAuth flow error:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Cancel an in-progress OAuth flow
   */
  cancelOAuth: publicProcedure
    .input(z.object({ serverId: z.string() }))
    .mutation(({ input }) => {
      closeOAuthWindow(input.serverId)
      return { success: true }
    }),

  /**
   * Check if OAuth flow is in progress for a server
   */
  hasActiveOAuth: publicProcedure
    .input(z.object({ serverId: z.string() }))
    .query(({ input }): boolean => {
      return hasActiveOAuthWindow(input.serverId)
    }),

  /**
   * Discover OAuth metadata for an HTTP MCP server
   * Queries /.well-known/oauth-authorization-server
   */
  discoverOAuth: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        projectPath: z.string().optional(),
      })
    )
    .query(async ({ input }): Promise<{
      supported: boolean
      metadata?: OAuthServerMetadata
      error?: string
    }> => {
      try {
        const consolidated = await getConsolidatedConfig(input.projectPath)
        const serverConfig = consolidated.mergedServers[input.serverId]

        if (!serverConfig) {
          return { supported: false, error: "Server not found" }
        }

        // Only HTTP/SSE servers support OAuth discovery
        if (serverConfig.type !== "http" && serverConfig.type !== "sse") {
          return { supported: false }
        }

        if (!serverConfig.url) {
          return { supported: false, error: "Server has no URL" }
        }

        const metadata = await discoverOAuthMetadata(serverConfig.url)

        if (!metadata) {
          return { supported: false }
        }

        return { supported: true, metadata }
      } catch (error) {
        console.error("[mcp] OAuth discovery error:", error)
        return {
          supported: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Start MCP OAuth 2.1 flow with PKCE
   * Handles dynamic client registration, PKCE, and token exchange
   */
  startMcpOAuth: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        projectPath: z.string().optional(),
      })
    )
    .mutation(async ({ input }): Promise<{
      success: boolean
      error?: string
    }> => {
      try {
        console.log(`[mcp-oauth] Starting OAuth flow for ${input.serverId}`)
        const consolidated = await getConsolidatedConfig(input.projectPath)
        const serverConfig = consolidated.mergedServers[input.serverId]

        if (!serverConfig?.url) {
          console.log(`[mcp-oauth] Server not found or has no URL: ${input.serverId}`)
          return { success: false, error: "Server not found or has no URL" }
        }

        console.log(`[mcp-oauth] Server URL: ${serverConfig.url}`)

        // Step 1: Discover OAuth metadata
        console.log(`[mcp-oauth] Step 1: Discovering OAuth metadata...`)
        const metadata = await discoverOAuthMetadata(serverConfig.url)
        if (!metadata) {
          console.log(`[mcp-oauth] OAuth discovery failed - server does not support OAuth`)
          return { success: false, error: "Server does not support OAuth" }
        }
        console.log(`[mcp-oauth] OAuth metadata discovered: issuer=${metadata.issuer}`)

        // Step 2: Generate PKCE code verifier and challenge
        console.log(`[mcp-oauth] Step 2: Generating PKCE parameters...`)
        const codeVerifier = generateCodeVerifier()
        const codeChallenge = generateCodeChallenge(codeVerifier)

        // Step 3: Dynamic client registration (if supported)
        let clientId: string
        let clientSecret: string | undefined

        // Use a consistent redirect URI that we can intercept
        const redirectUri = "http://localhost:19283/oauth/callback"

        if (metadata.registration_endpoint) {
          console.log(`[mcp-oauth] Step 3: Registering OAuth client...`)
          const registration = await registerOAuthClient(
            metadata.registration_endpoint,
            redirectUri,
            `Claw - ${input.serverId}`
          )

          if (!registration) {
            console.log(`[mcp-oauth] Client registration failed`)
            return { success: false, error: "Failed to register OAuth client" }
          }

          clientId = registration.client_id
          clientSecret = registration.client_secret
          console.log(`[mcp-oauth] Client registered: ${clientId}`)
        } else {
          console.log(`[mcp-oauth] No registration endpoint available`)
          return {
            success: false,
            error: "Server requires OAuth but does not support dynamic client registration",
          }
        }

        // Step 4: Build authorization URL with PKCE
        console.log(`[mcp-oauth] Step 4: Building authorization URL...`)
        const state = randomBytes(16).toString("hex")
        const authUrl = new URL(metadata.authorization_endpoint)
        authUrl.searchParams.set("response_type", "code")
        authUrl.searchParams.set("client_id", clientId)
        authUrl.searchParams.set("redirect_uri", redirectUri)
        authUrl.searchParams.set("code_challenge", codeChallenge)
        authUrl.searchParams.set("code_challenge_method", "S256")
        authUrl.searchParams.set("state", state)
        console.log(`[mcp-oauth] Authorization URL: ${authUrl.origin}${authUrl.pathname}`)

        // Store pending flow state
        pendingOAuthFlows.set(state, {
          codeVerifier,
          clientId,
          clientSecret,
          tokenEndpoint: metadata.token_endpoint,
          redirectUri,
          serverId: input.serverId,
        })

        // Step 5: Open OAuth window
        console.log(`[mcp-oauth] Step 5: Opening OAuth window...`)
        const parentWindow = BrowserWindow.getFocusedWindow()
        console.log(`[mcp-oauth] Parent window: ${parentWindow ? 'found' : 'null'}`)
        const result = await startOAuthFlow(parentWindow, {
          authUrl: authUrl.toString(),
          callbackUrlPattern: "localhost:19283.*callback",
          serverId: input.serverId,
          title: `Sign in to ${input.serverId}`,
        })
        console.log(`[mcp-oauth] OAuth flow result: ${JSON.stringify(result)}`)

        // Clean up if cancelled
        if (!result.success || result.cancelled) {
          pendingOAuthFlows.delete(state)
          if (result.cancelled) {
            return { success: false, error: "User cancelled authentication" }
          }
          return { success: false, error: result.error || "Authentication failed" }
        }

        // Step 6: Extract authorization code
        const code = result.code
        if (!code) {
          pendingOAuthFlows.delete(state)
          return { success: false, error: "No authorization code received" }
        }

        // Step 7: Exchange code for tokens
        const tokens = await exchangeCodeForTokens(
          metadata.token_endpoint,
          code,
          codeVerifier,
          clientId,
          clientSecret,
          redirectUri
        )

        pendingOAuthFlows.delete(state)

        if (!tokens) {
          return { success: false, error: "Failed to exchange code for tokens" }
        }

        // Step 8: Store tokens as credentials
        const db = getDatabase()
        const credentials: Record<string, string> = {
          MCP_ACCESS_TOKEN: encryptCredential(tokens.access_token),
        }

        if (tokens.refresh_token) {
          credentials["MCP_REFRESH_TOKEN"] = encryptCredential(tokens.refresh_token)
        }

        if (tokens.expires_in) {
          const expiresAt = Date.now() + tokens.expires_in * 1000
          credentials["MCP_TOKEN_EXPIRES_AT"] = encryptCredential(String(expiresAt))
        }

        // Store client info for token refresh
        credentials["MCP_CLIENT_ID"] = encryptCredential(clientId)
        if (clientSecret) {
          credentials["MCP_CLIENT_SECRET"] = encryptCredential(clientSecret)
        }
        credentials["MCP_TOKEN_ENDPOINT"] = encryptCredential(metadata.token_endpoint)

        // Check if credentials exist
        const existing = db
          .select()
          .from(mcpCredentials)
          .where(eq(mcpCredentials.id, input.serverId))
          .get()

        if (existing) {
          const existingCreds = parseJsonSafely<Record<string, string>>(existing.credentials, {})
          const merged = { ...existingCreds, ...credentials }

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
              credentials: JSON.stringify(credentials),
              updatedAt: new Date(),
            })
            .run()
        }

        console.log(`[mcp-oauth] Successfully authenticated ${input.serverId}`)
        return { success: true }
      } catch (error) {
        console.error("[mcp-oauth] OAuth flow error:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Get MCP tools from Claude session cache
   * This is more reliable than querying servers directly because:
   * 1. Tools are already loaded by the Claude SDK
   * 2. No separate process spawning needed
   * 3. Shows exactly what Claude has access to
   * 4. Handles auth/env issues gracefully
   *
   * Returns null if no cached data (user hasn't started a chat yet)
   */
  getSessionTools: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        serverId: z.string().optional(), // If provided, filter to specific server
      })
    )
    .query(({ input }): {
      tools: McpTool[]
      serverName?: string
      fromCache: boolean
      error?: string
    } => {
      try {
        const cached = getCachedMcpTools(input.projectPath)

        if (!cached) {
          return {
            tools: [],
            fromCache: false,
            error: "No cached tools available. Start a chat to load MCP tools.",
          }
        }

        // If serverId provided, filter to that server's tools
        if (input.serverId) {
          const server = cached.servers.find((s) => s.name === input.serverId)
          if (!server) {
            return {
              tools: [],
              fromCache: true,
              error: `Server "${input.serverId}" not found in cache`,
            }
          }

          return {
            tools: server.tools,
            serverName: server.name,
            fromCache: true,
          }
        }

        // Return all tools from all servers
        const allTools: McpTool[] = []
        for (const server of cached.servers) {
          for (const tool of server.tools) {
            allTools.push({
              ...tool,
              // Prefix tool name with server name for clarity
              name: tool.name,
            })
          }
        }

        return {
          tools: allTools,
          fromCache: true,
        }
      } catch (error) {
        console.error("[mcp] Failed to get session tools:", error)
        return {
          tools: [],
          fromCache: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),

  /**
   * Get all MCP servers with their tools from Claude session cache
   * Returns the full server+tools structure for the MCP UI
   */
  getSessionServers: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
      })
    )
    .query(({ input }): {
      servers: Array<{
        name: string
        status: string
        toolCount: number
        tools: McpTool[]
      }>
      fromCache: boolean
      cachedAt?: number
      error?: string
    } => {
      try {
        const cached = getCachedMcpTools(input.projectPath)

        if (!cached) {
          return {
            servers: [],
            fromCache: false,
            error: "No cached data available. Start a chat to load MCP servers and tools.",
          }
        }

        return {
          servers: cached.servers.map((s) => ({
            name: s.name,
            status: s.status,
            toolCount: s.tools.length,
            tools: s.tools,
          })),
          fromCache: true,
          cachedAt: cached.cachedAt,
        }
      } catch (error) {
        console.error("[mcp] Failed to get session servers:", error)
        return {
          servers: [],
          fromCache: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
})
