import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { safeStorage } from "electron"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeSettings } from "../../db"
import { eq } from "drizzle-orm"

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
 * Encrypt API key using Electron's safeStorage
 */
function encryptApiKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[claude-settings] Encryption not available, storing as base64")
    return Buffer.from(key).toString("base64")
  }
  return safeStorage.encryptString(key).toString("base64")
}

/**
 * Decrypt API key using Electron's safeStorage
 */
function decryptApiKey(encrypted: string): string | null {
  if (!encrypted) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    const buffer = Buffer.from(encrypted, "base64")
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error("[claude-settings] Failed to decrypt API key:", error)
    return null
  }
}

export const claudeSettingsRouter = router({
  /**
   * Get Claude Code settings (always returns a record, creates default if missing)
   */
  getSettings: publicProcedure.query(() => {
    const db = getDatabase()
    let settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    // Create default settings if not exist
    if (!settings) {
      db.insert(claudeCodeSettings)
        .values({
          id: "default",
          customBinaryPath: null,
          customEnvVars: "{}",
          customConfigDir: null,
          mcpServerSettings: "{}",
          authMode: "oauth",
          bedrockRegion: "us-east-1",
        })
        .run()
      settings = {
        id: "default",
        customBinaryPath: null,
        customEnvVars: "{}",
        customConfigDir: null,
        customWorktreeLocation: null,
        mcpServerSettings: "{}",
        authMode: "oauth",
        apiKey: null,
        bedrockRegion: "us-east-1",
        anthropicBaseUrl: null,
        updatedAt: new Date(),
        // Bedrock fields (will be set by migration)
        bedrockOpusModel: "global.anthropic.claude-opus-4-5-20251101-v1:0",
        bedrockSonnetModel: "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]",
        bedrockHaikuModel: "us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]",
        maxMcpOutputTokens: 150000, // MCP tool output limit
        maxThinkingTokens: 60000, // Thinking token limit (64k max for Bedrock)
        // SSO fields (not used in fallback)
        bedrockConnectionMethod: null,
        awsProfileName: null,
        ssoStartUrl: null,
        ssoRegion: null,
        ssoAccountId: null,
        ssoAccountName: null,
        ssoRoleName: null,
        ssoAccessToken: null,
        ssoRefreshToken: null,
        ssoTokenExpiresAt: null,
        ssoClientId: null,
        ssoClientSecret: null,
        ssoClientExpiresAt: null,
        awsAccessKeyId: null,
        awsSecretAccessKey: null,
        awsSessionToken: null,
        awsCredentialsExpiresAt: null,
        vpnCheckEnabled: false,
        vpnCheckUrl: null,
        defaultStartCommands: "[]",
      }
    }

    return {
      customBinaryPath: settings.customBinaryPath,
      customEnvVars: parseJsonSafely<Record<string, string>>(
        settings.customEnvVars,
        {}
      ),
      customConfigDir: settings.customConfigDir,
      customWorktreeLocation: settings.customWorktreeLocation || null,
      defaultStartCommands: parseJsonSafely<string[]>(
        settings.defaultStartCommands || "[]",
        []
      ),
      mcpServerSettings: parseJsonSafely<Record<string, { enabled: boolean }>>(
        settings.mcpServerSettings ?? "{}",
        {}
      ),
      authMode: (settings.authMode || "oauth") as "oauth" | "aws" | "apiKey",
      apiKey: settings.apiKey ? "••••••••" : null, // Masked for UI
      bedrockRegion: settings.bedrockRegion || "us-east-1",
      anthropicBaseUrl: settings.anthropicBaseUrl || null,
      vpnCheckEnabled: settings.vpnCheckEnabled || false,
      vpnCheckUrl: settings.vpnCheckUrl || null,
      // Bedrock model overrides
      bedrockOpusModel: settings.bedrockOpusModel || "global.anthropic.claude-opus-4-5-20251101-v1:0",
      bedrockSonnetModel: settings.bedrockSonnetModel || "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]",
      bedrockHaikuModel: settings.bedrockHaikuModel || "us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]",
      maxMcpOutputTokens: settings.maxMcpOutputTokens ?? 150000, // MCP tool output limit
      maxThinkingTokens: settings.maxThinkingTokens ?? 60000, // Thinking token limit (64k max for Bedrock)
      // AWS connection method
      bedrockConnectionMethod: (settings.bedrockConnectionMethod || "profile") as "sso" | "profile",
      awsProfileName: settings.awsProfileName || null,
    }
  }),

  /**
   * Update Claude Code settings
   */
  updateSettings: publicProcedure
    .input(
      z.object({
        customBinaryPath: z.string().nullable().optional(),
        customEnvVars: z.record(z.string(), z.string()).optional(),
        customConfigDir: z.string().nullable().optional(),
        customWorktreeLocation: z.string().nullable().optional(),
        defaultStartCommands: z.array(z.string()).optional(),
        mcpServerSettings: z.record(z.string(), z.object({ enabled: z.boolean() })).optional(),
        authMode: z.enum(["oauth", "aws", "apiKey"]).optional(),
        apiKey: z.string().optional(), // API key for apiKey mode
        bedrockRegion: z.string().optional(), // AWS region for Bedrock
        anthropicBaseUrl: z.string().nullable().optional(), // Custom Anthropic API base URL
        vpnCheckEnabled: z.boolean().optional(), // Enable/disable VPN status monitoring
        vpnCheckUrl: z.string().nullable().optional(), // Internal URL to check for VPN connectivity
        // Bedrock model overrides
        bedrockOpusModel: z.string().optional(),
        bedrockSonnetModel: z.string().optional(),
        bedrockHaikuModel: z.string().optional(),
        maxMcpOutputTokens: z.number().optional(),
        maxThinkingTokens: z.number().optional(),
        // AWS connection method
        bedrockConnectionMethod: z.enum(["sso", "profile"]).optional(),
        awsProfileName: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      // Validate customWorktreeLocation if provided
      if (input.customWorktreeLocation && input.customWorktreeLocation.trim()) {
        const path = input.customWorktreeLocation.trim()
        // Reject relative paths - must be absolute or start with ~ or $
        if (!path.startsWith('/') && !path.startsWith('~') && !path.startsWith('$')) {
          throw new Error("Worktree location must be an absolute path or start with ~ or $")
        }
      }

      const db = getDatabase()

      // Check if settings exist
      const existing = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (existing) {
        // Update existing
        db.update(claudeCodeSettings)
          .set({
            ...(input.customBinaryPath !== undefined && {
              customBinaryPath: input.customBinaryPath,
            }),
            ...(input.customEnvVars !== undefined && {
              customEnvVars: JSON.stringify(input.customEnvVars),
            }),
            ...(input.customConfigDir !== undefined && {
              customConfigDir: input.customConfigDir,
            }),
            ...(input.customWorktreeLocation !== undefined && {
              customWorktreeLocation: input.customWorktreeLocation,
            }),
            ...(input.defaultStartCommands !== undefined && {
              defaultStartCommands: JSON.stringify(input.defaultStartCommands),
            }),
            ...(input.mcpServerSettings !== undefined && {
              mcpServerSettings: JSON.stringify(input.mcpServerSettings),
            }),
            ...(input.authMode !== undefined && {
              authMode: input.authMode,
            }),
            ...(input.apiKey !== undefined && input.authMode === "apiKey" && {
              apiKey: encryptApiKey(input.apiKey),
            }),
            ...(input.bedrockRegion !== undefined && {
              bedrockRegion: input.bedrockRegion,
            }),
            ...(input.anthropicBaseUrl !== undefined && {
              anthropicBaseUrl: input.anthropicBaseUrl,
            }),
            ...(input.vpnCheckEnabled !== undefined && {
              vpnCheckEnabled: input.vpnCheckEnabled,
            }),
            ...(input.vpnCheckUrl !== undefined && {
              vpnCheckUrl: input.vpnCheckUrl,
            }),
            // Bedrock model overrides
            ...(input.bedrockOpusModel !== undefined && {
              bedrockOpusModel: input.bedrockOpusModel,
            }),
            ...(input.bedrockSonnetModel !== undefined && {
              bedrockSonnetModel: input.bedrockSonnetModel,
            }),
            ...(input.bedrockHaikuModel !== undefined && {
              bedrockHaikuModel: input.bedrockHaikuModel,
            }),
            ...(input.maxMcpOutputTokens !== undefined && {
              maxMcpOutputTokens: input.maxMcpOutputTokens,
            }),
            ...(input.maxThinkingTokens !== undefined && {
              maxThinkingTokens: input.maxThinkingTokens,
            }),
            // AWS connection method
            ...(input.bedrockConnectionMethod !== undefined && {
              bedrockConnectionMethod: input.bedrockConnectionMethod,
            }),
            ...(input.awsProfileName !== undefined && {
              awsProfileName: input.awsProfileName,
            }),
            updatedAt: new Date(),
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()
      } else {
        // Insert new
        db.insert(claudeCodeSettings)
          .values({
            id: "default",
            customBinaryPath: input.customBinaryPath ?? null,
            customEnvVars: JSON.stringify(input.customEnvVars ?? {}),
            customConfigDir: input.customConfigDir ?? null,
            defaultStartCommands: JSON.stringify(input.defaultStartCommands ?? []),
            mcpServerSettings: JSON.stringify(input.mcpServerSettings ?? {}),
            authMode: input.authMode ?? "oauth",
            bedrockRegion: input.bedrockRegion ?? "us-east-1",
            anthropicBaseUrl: input.anthropicBaseUrl ?? null,
            vpnCheckEnabled: input.vpnCheckEnabled ?? false,
            vpnCheckUrl: input.vpnCheckUrl ?? null,
            // Bedrock model overrides
            bedrockOpusModel: input.bedrockOpusModel ?? "global.anthropic.claude-opus-4-5-20251101-v1:0",
            bedrockSonnetModel: input.bedrockSonnetModel ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]",
            bedrockHaikuModel: input.bedrockHaikuModel ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]",
            maxMcpOutputTokens: input.maxMcpOutputTokens ?? 200000,
            maxThinkingTokens: input.maxThinkingTokens ?? 1000000,
            // AWS connection method
            bedrockConnectionMethod: input.bedrockConnectionMethod ?? "profile",
            awsProfileName: input.awsProfileName ?? null,
            ...(input.authMode === "apiKey" && input.apiKey && {
              apiKey: encryptApiKey(input.apiKey),
            }),
            updatedAt: new Date(),
          })
          .run()
      }

      return { success: true }
    }),

  /**
   * List available MCP servers from ~/.claude/
   * Scans for MCP server directories and reads their package.json for metadata
   */
  listMcpServers: publicProcedure.query(async () => {
    const claudeDir = path.join(os.homedir(), ".claude")
    const servers: Array<{
      id: string
      name: string
      description: string
      enabled: boolean
    }> = []

    try {
      const entries = await fs.readdir(claudeDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith("mcp-") && !entry.name.includes("-mcp")) {
          continue
        }

        const pkgPath = path.join(claudeDir, entry.name, "package.json")
        try {
          const pkgContent = await fs.readFile(pkgPath, "utf-8")
          const pkg = JSON.parse(pkgContent)

          servers.push({
            id: entry.name,
            name: pkg.displayName || pkg.name || entry.name,
            description: pkg.description || "",
            enabled: false, // Will be overridden by settings
          })
        } catch {
          // No package.json, add basic entry
          servers.push({
            id: entry.name,
            name: entry.name,
            description: "",
            enabled: false,
          })
        }
      }
    } catch (error) {
      console.error("[claude-settings] Failed to list MCP servers:", error)
    }

    // Get user's enabled servers from settings
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    const enabledServers = parseJsonSafely<Record<string, { enabled: boolean }>>(
      settings?.mcpServerSettings ?? "{}",
      {}
    )

    // Mark enabled servers
    for (const server of servers) {
      if (enabledServers[server.id]?.enabled) {
        server.enabled = true
      }
    }

    return { servers }
  }),

  /**
   * Sync active provider to backend auth mode
   * Maps frontend activeProvider to database authMode for Claude execution
   */
  syncProviderToBackend: publicProcedure
    .input(
      z.object({
        provider: z.enum(["anthropic-oauth", "anthropic-api", "aws-bedrock", "ollama", "custom-api"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Map provider to backend auth mode
      const authModeMap = {
        "anthropic-oauth": "oauth" as const,
        "anthropic-api": "apiKey" as const,
        "aws-bedrock": "aws" as const,
        "ollama": "apiKey" as const,
        "custom-api": "apiKey" as const,
      }

      const authMode = authModeMap[input.provider]

      // Update database
      await db
        .update(claudeCodeSettings)
        .set({ authMode })
        .where(eq(claudeCodeSettings.id, "default"))
        .run()

      console.log(`[claude-settings] Synced provider ${input.provider} to backend authMode: ${authMode}`)

      return { success: true, authMode }
    }),
})
