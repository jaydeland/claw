import { getDatabase, mcpCredentials } from "../db"
import { eq } from "drizzle-orm"
import type { McpServerConfig } from "../config/types"
import { safeStorage } from "electron"

/**
 * Decrypt a credential value
 */
function decryptCredential(encrypted: string): string {
  if (!encrypted) return ""
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
  } catch (error) {
    console.error("[credential-injection] Decryption failed:", error)
    return ""
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
 * Inject stored credentials into a single server config
 * Handles both stdio servers (credentials in env) and HTTP/SSE servers (credentials in headers)
 */
function injectStoredCredentials(
  config: McpServerConfig,
  storedCredentials: Record<string, string>
): McpServerConfig {
  if (Object.keys(storedCredentials).length === 0) {
    return config
  }

  // For HTTP/SSE servers, inject MCP_ACCESS_TOKEN into Authorization header
  if (config.type === "http" || config.type === "sse") {
    const accessToken = storedCredentials["MCP_ACCESS_TOKEN"]
    if (accessToken) {
      return {
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${accessToken}`,
        },
        // Also add to env in case server expects it there
        env: {
          ...config.env,
          ...storedCredentials,
        },
      }
    }
  }

  // For stdio servers, inject credentials into env
  return {
    ...config,
    env: {
      ...config.env,
      ...storedCredentials, // Stored creds override placeholders
    },
  }
}

/**
 * Inject stored OAuth/API credentials into all server configs
 * This ensures warmup and tool queries can authenticate properly
 */
export async function injectAllStoredCredentials(
  servers: Record<string, McpServerConfig>
): Promise<Record<string, McpServerConfig>> {
  console.log(`[credential-injection] Injecting credentials for ${Object.keys(servers).length} servers`)
  const db = getDatabase()
  const allCredentials = db.select().from(mcpCredentials).all()
  console.log(`[credential-injection] Found ${allCredentials.length} stored credentials: ${allCredentials.map(c => c.id).join(", ")}`)

  // Build map of serverId -> decrypted credentials
  const credentialsMap = new Map<string, Record<string, string>>()
  for (const cred of allCredentials) {
    const decrypted: Record<string, string> = {}
    const stored = parseJsonSafely<Record<string, string>>(cred.credentials, {})
    console.log(`[credential-injection] Processing credentials for ${cred.id}: ${Object.keys(stored).length} keys`)
    for (const [key, value] of Object.entries(stored)) {
      const decryptedValue = decryptCredential(value)
      if (decryptedValue) {
        decrypted[key] = decryptedValue
        console.log(`[credential-injection] Decrypted ${key} for ${cred.id} (length: ${decryptedValue.length})`)
      } else {
        console.warn(`[credential-injection] Failed to decrypt ${key} for ${cred.id}`)
      }
    }
    credentialsMap.set(cred.id, decrypted)
  }

  // Inject credentials into each server config
  const result: Record<string, McpServerConfig> = {}
  for (const [serverId, serverConfig] of Object.entries(servers)) {
    const storedCreds = credentialsMap.get(serverId) || {}
    if (Object.keys(storedCreds).length > 0) {
      console.log(`[credential-injection] Injecting ${Object.keys(storedCreds).length} credentials for ${serverId}: ${Object.keys(storedCreds).join(", ")}`)
    }
    result[serverId] = injectStoredCredentials(serverConfig, storedCreds)
  }

  console.log(`[credential-injection] Injection complete for ${Object.keys(result).length} servers`)
  return result
}
