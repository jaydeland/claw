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
    for (const [key, value] of Object.entries(stored)) {
      const decryptedValue = decryptCredential(value)
      if (decryptedValue) {
        decrypted[key] = decryptedValue
      }
    }
    credentialsMap.set(cred.id, decrypted)
  }

  // Inject credentials into each server config
  const result: Record<string, McpServerConfig> = {}
  for (const [serverId, serverConfig] of Object.entries(servers)) {
    const storedCreds = credentialsMap.get(serverId) || {}
    result[serverId] = injectStoredCredentials(serverConfig, storedCreds)
  }

  return result
}
