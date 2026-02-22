import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { safeStorage } from "electron"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeSettings } from "../../db"
import { eq } from "drizzle-orm"
import { resetBackgroundSession } from "../../claude/background-session"

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
        bedrockOpus46Model: "global.anthropic.claude-opus-4-6-20260205-v1:0",
        bedrockSonnetModel: "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]",
        bedrockHaikuModel: "us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]",
        maxMcpOutputTokens: 48000, // Safe limit for Bedrock
        maxThinkingTokens: 15000, // Total must not exceed 64k
        enableAgentTeams: false,
        maxBudgetUsd: null,
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

    // At this point settings is guaranteed to be defined
    const s = settings!

    return {
      customBinaryPath: s.customBinaryPath,
      customEnvVars: parseJsonSafely<Record<string, string>>(
        s.customEnvVars,
        {}
      ),
      customConfigDir: s.customConfigDir,
      customWorktreeLocation: s.customWorktreeLocation || null,
      defaultStartCommands: parseJsonSafely<string[]>(
        s.defaultStartCommands || "[]",
        []
      ),
      mcpServerSettings: parseJsonSafely<Record<string, { enabled: boolean }>>(
        s.mcpServerSettings ?? "{}",
        {}
      ),
      authMode: (s.authMode || "oauth") as "oauth" | "aws" | "apiKey",
      apiKey: s.apiKey ? "••••••••" : null, // Masked for UI
      bedrockRegion: s.bedrockRegion || "us-east-1",
      anthropicBaseUrl: s.anthropicBaseUrl || null,
      vpnCheckEnabled: s.vpnCheckEnabled || false,
      vpnCheckUrl: s.vpnCheckUrl || null,
      // Bedrock model overrides
      bedrockOpusModel: s.bedrockOpusModel || "global.anthropic.claude-opus-4-5-20251101-v1:0",
      bedrockSonnetModel: s.bedrockSonnetModel || "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]",
      bedrockHaikuModel: s.bedrockHaikuModel || "us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]",
      maxMcpOutputTokens: s.maxMcpOutputTokens ?? 48000, // Safe limit for Bedrock
      maxThinkingTokens: s.maxThinkingTokens ?? 15000, // Total must not exceed 64k
      // Experimental features
      enableAgentTeams: s.enableAgentTeams ?? false,
      // AWS connection method
      bedrockConnectionMethod: (s.bedrockConnectionMethod || "profile") as "sso" | "profile",
      awsProfileName: s.awsProfileName || null,
      // Background session models
      anthropicBackgroundModel: s.anthropicBackgroundModel || "haiku",
      bedrockBackgroundModel: s.bedrockBackgroundModel || null,
      ollamaBackgroundModel: s.ollamaBackgroundModel || null,
      customApiBackgroundModel: s.customApiBackgroundModel || null,
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
        // Experimental features
        enableAgentTeams: z.boolean().optional(),
        // AWS connection method
        bedrockConnectionMethod: z.enum(["sso", "profile"]).optional(),
        awsProfileName: z.string().nullable().optional(),
        // Background session models (for utility tasks)
        anthropicBackgroundModel: z.string().optional(),
        bedrockBackgroundModel: z.string().nullable().optional(),
        ollamaBackgroundModel: z.string().nullable().optional(),
        customApiBackgroundModel: z.string().nullable().optional(),
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
            // Experimental features
            ...(input.enableAgentTeams !== undefined && {
              enableAgentTeams: input.enableAgentTeams,
            }),
            // AWS connection method
            ...(input.bedrockConnectionMethod !== undefined && {
              bedrockConnectionMethod: input.bedrockConnectionMethod,
            }),
            ...(input.awsProfileName !== undefined && {
              awsProfileName: input.awsProfileName,
            }),
            // Background session models
            ...(input.anthropicBackgroundModel !== undefined && {
              anthropicBackgroundModel: input.anthropicBackgroundModel,
            }),
            ...(input.bedrockBackgroundModel !== undefined && {
              bedrockBackgroundModel: input.bedrockBackgroundModel,
            }),
            ...(input.ollamaBackgroundModel !== undefined && {
              ollamaBackgroundModel: input.ollamaBackgroundModel,
            }),
            ...(input.customApiBackgroundModel !== undefined && {
              customApiBackgroundModel: input.customApiBackgroundModel,
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
            // Experimental features
            enableAgentTeams: input.enableAgentTeams ?? false,
            // AWS connection method
            bedrockConnectionMethod: input.bedrockConnectionMethod ?? "profile",
            awsProfileName: input.awsProfileName ?? null,
            // Background session models
            anthropicBackgroundModel: input.anthropicBackgroundModel ?? "haiku",
            bedrockBackgroundModel: input.bedrockBackgroundModel ?? null,
            ollamaBackgroundModel: input.ollamaBackgroundModel ?? null,
            customApiBackgroundModel: input.customApiBackgroundModel ?? null,
            ...(input.authMode === "apiKey" && input.apiKey && {
              apiKey: encryptApiKey(input.apiKey),
            }),
            updatedAt: new Date(),
          })
          .run()
      }

      // Reset background session if a background model field changed so the
      // new model is picked up immediately on the next utility task
      const backgroundModelChanged =
        input.anthropicBackgroundModel !== undefined ||
        input.bedrockBackgroundModel !== undefined ||
        input.ollamaBackgroundModel !== undefined ||
        input.customApiBackgroundModel !== undefined

      if (backgroundModelChanged) {
        resetBackgroundSession().catch((err) =>
          console.error("[claude-settings] Failed to reset background session:", err)
        )
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

  /**
   * Sync custom API/Ollama config from frontend to backend
   * Stores the custom config in customEnvVars for background session access
   */
  syncCustomConfig: publicProcedure
    .input(
      z.object({
        model: z.string(),
        token: z.string(),
        baseUrl: z.string(),
        apiKey: z.string().optional(),
        ollamaApiKey: z.string().optional(),
        contextWindow: z.number().optional(), // Context window size in tokens (e.g., 189000 for glm-5)
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Auto-correct Ollama cloud URL if needed
      let correctedBaseUrl = input.baseUrl
      if (input.baseUrl === "https://api.ollama.com") {
        correctedBaseUrl = "https://ollama.com"
        console.log("[claude-settings] Auto-corrected Ollama URL: https://api.ollama.com -> https://ollama.com")
      }

      // Determine the correct auth token
      // For Ollama Cloud: use the Ollama API key as the auth token (not the "ollama" marker)
      // For Ollama Local: use "ollama" as the marker token
      const isOllamaMode = input.token === "ollama"
      const isOllamaCloud = isOllamaMode && correctedBaseUrl.includes("ollama.com")
      const authToken = (isOllamaCloud && input.ollamaApiKey) ? input.ollamaApiKey : input.token

      // Build customEnvVars with Ollama/Custom API settings
      const customEnvVars: Record<string, string> = {
        ANTHROPIC_AUTH_TOKEN: authToken,
        ANTHROPIC_BASE_URL: correctedBaseUrl,
        // Store the Ollama/Custom API model for background tasks
        ANTHROPIC_MODEL: input.model,
        ...(input.apiKey && { ANTHROPIC_API_KEY: input.apiKey }),
        ...(input.ollamaApiKey && { OLLAMA_API_KEY: input.ollamaApiKey }),
        // Store context window for Ollama (critical for large system prompts)
        // Default to 189000 (glm-5's context window) if not specified
        ...(input.contextWindow && { CONTEXT_WINDOW: String(input.contextWindow) }),
      }

      // Check if settings exist
      const existing = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (existing) {
        // Update existing settings
        db.update(claudeCodeSettings)
          .set({
            customEnvVars: JSON.stringify(customEnvVars),
            authMode: "apiKey", // Ensure authMode is set for custom API
            updatedAt: new Date(),
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()
      } else {
        // Insert new settings
        db.insert(claudeCodeSettings)
          .values({
            id: "default",
            authMode: "apiKey",
            customEnvVars: JSON.stringify(customEnvVars),
            bedrockRegion: "us-east-1",
            mcpServerSettings: "{}",
            defaultStartCommands: "[]",
            maxMcpOutputTokens: 48000,
            maxThinkingTokens: 15000,
            updatedAt: new Date(),
          })
          .run()
      }

      console.log(`[claude-settings] Synced custom config: model=${input.model}, token=${input.token.slice(0, 10)}..., baseUrl=${input.baseUrl}, contextWindow=${input.contextWindow || 'not set'}`)

      return { success: true }
    }),

  /**
   * Clear custom API/Ollama config from backend
   * Removes the custom config from customEnvVars
   */
  clearCustomConfig: publicProcedure
    .mutation(async () => {
      const db = getDatabase()

      // Get existing customEnvVars
      const existing = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (existing?.customEnvVars) {
        try {
          const customEnv = JSON.parse(existing.customEnvVars)

          // Remove custom API/Ollama specific keys
          delete customEnv.ANTHROPIC_AUTH_TOKEN
          delete customEnv.ANTHROPIC_BASE_URL
          delete customEnv.ANTHROPIC_API_KEY
          delete customEnv.OLLAMA_API_KEY

          // Update database
          db.update(claudeCodeSettings)
            .set({
              customEnvVars: JSON.stringify(customEnv),
              updatedAt: new Date(),
            })
            .where(eq(claudeCodeSettings.id, "default"))
            .run()

          console.log("[claude-settings] Cleared custom config")
        } catch (error) {
          console.error("[claude-settings] Failed to clear custom config:", error)
        }
      }

      return { success: true }
    }),
})
