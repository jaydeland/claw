import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeSettings, configSources } from "../../db"
import { eq } from "drizzle-orm"
import { expandEnvVars } from "../../path-utils"

// ============ TYPES ============

// Export format version for compatibility checking
const EXPORT_VERSION = "1.0.0"

// Zod schema for export format validation
const ClawSettingsExportSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  settings: z.object({
    customBinaryPath: z.string().nullable().optional(),
    customEnvVars: z.record(z.string(), z.string()).nullable().optional(),
    customConfigDir: z.string().nullable().optional(),
    customWorktreeLocation: z.string().nullable().optional(),
    authMode: z.enum(["oauth", "aws", "apiKey"]).optional(),
    anthropicBaseUrl: z.string().nullable().optional(),
    bedrockRegion: z.string().nullable().optional(),
    bedrockConnectionMethod: z.enum(["sso", "profile"]).nullable().optional(),
    awsProfileName: z.string().nullable().optional(),
    ssoStartUrl: z.string().nullable().optional(),
    ssoRegion: z.string().nullable().optional(),
    ssoAccountId: z.string().nullable().optional(),
    ssoAccountName: z.string().nullable().optional(),
    ssoRoleName: z.string().nullable().optional(),
    vpnCheckEnabled: z.boolean().nullable().optional(),
    vpnCheckUrl: z.string().nullable().optional(),
    defaultStartCommands: z.array(z.string()).nullable().optional(),
    bedrockModelOverrides: z.object({
      opus: z.string().nullable().optional(),
      sonnet: z.string().nullable().optional(),
      haiku: z.string().nullable().optional(),
    }).nullable().optional(),
    maxMcpOutputTokens: z.number().nullable().optional(),
    maxThinkingTokens: z.number().nullable().optional(),
  }),
  mcpConfigPaths: z.array(z.object({
    path: z.string(),
    priority: z.number(),
    enabled: z.boolean(),
  })),
  pluginDirectories: z.array(z.object({
    path: z.string(),
    priority: z.number(),
    enabled: z.boolean(),
  })),
 uiPreferences: z.object({
    selectedThemeId: z.string().optional(),
    systemLightThemeId: z.string().optional(),
    systemDarkThemeId: z.string().optional(),
    customHotkeys: z.record(z.string(), z.string()).optional(),
    extendedThinkingEnabled: z.boolean().optional(),
    soundNotificationsEnabled: z.boolean().optional(),
    ctrlTabTarget: z.enum(["tabs", "chats"]).optional(),
    showWorkspaceIcon: z.boolean().optional(),
  }).optional(),
})

type ClawSettingsExport = z.infer<typeof ClawSettingsExportSchema>

// ============ HELPERS ============

/**
 * Expand environment variables in path fields
 * Handles $VAR, ${VAR}, and ~ for home directory
 */
function expandPathField(value: string | null | undefined): string | null {
  if (!value) return null
  return expandEnvVars(value)
}

// ============ ROUTER ============

export const settingsExportRouter = router({
  /**
   * Export all settings to JSON format
   * Excludes encrypted credentials (API keys, OAuth tokens, AWS credentials)
   */
  exportSettings: publicProcedure
    .input(
      z.object({
        uiPreferences: z.record(z.string(), z.any()).optional(), // UI preferences from localStorage
      }).optional()
    )
    .query(async ({ input }): Promise<ClawSettingsExport> => {
      const db = getDatabase()

      // Get settings from database (exclude encrypted fields)
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      // Parse JSON fields
      const customEnvVars = settings?.customEnvVars
        ? JSON.parse(settings.customEnvVars)
        : null
      const defaultStartCommands = settings?.defaultStartCommands
        ? JSON.parse(settings.defaultStartCommands)
        : null

      // Get MCP config sources
      const mcpConfigs = db
        .select()
        .from(configSources)
        .where(eq(configSources.type, "mcp"))
        .all()

      // Get plugin directories
      const plugins = db
        .select()
        .from(configSources)
        .where(eq(configSources.type, "plugin"))
        .all()

      // Build export object
      const exportData: ClawSettingsExport = {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        settings: {
          customBinaryPath: settings?.customBinaryPath || null,
          customEnvVars: customEnvVars,
          customConfigDir: settings?.customConfigDir || null,
          customWorktreeLocation: settings?.customWorktreeLocation || null,
          authMode: settings?.authMode as "oauth" | "aws" | "apiKey" | undefined,
          anthropicBaseUrl: settings?.anthropicBaseUrl || null,
          bedrockRegion: settings?.bedrockRegion || null,
          bedrockConnectionMethod: settings?.bedrockConnectionMethod as "sso" | "profile" | null | undefined,
          awsProfileName: settings?.awsProfileName || null,
          // SSO config (non-sensitive parts only - no tokens)
          ssoStartUrl: settings?.ssoStartUrl || null,
          ssoRegion: settings?.ssoRegion || null,
          ssoAccountId: settings?.ssoAccountId || null,
          ssoAccountName: settings?.ssoAccountName || null,
          ssoRoleName: settings?.ssoRoleName || null,
          // VPN settings
          vpnCheckEnabled: settings?.vpnCheckEnabled || null,
          vpnCheckUrl: settings?.vpnCheckUrl || null,
          // Start commands
          defaultStartCommands: defaultStartCommands,
          // Bedrock model overrides
          bedrockModelOverrides: {
            opus: settings?.bedrockOpusModel || null,
            sonnet: settings?.bedrockSonnetModel || null,
            haiku: settings?.bedrockHaikuModel || null,
          },
          // Token limits
          maxMcpOutputTokens: settings?.maxMcpOutputTokens || null,
          maxThinkingTokens: settings?.maxThinkingTokens || null,
        },
        mcpConfigPaths: mcpConfigs.map((c) => ({
          path: c.path,
          priority: c.priority,
          enabled: c.enabled,
        })),
        pluginDirectories: plugins.map((p) => ({
          path: p.path,
          priority: p.priority,
          enabled: p.enabled,
        })),
        uiPreferences: input?.uiPreferences || {},
      }

      return exportData
    }),

  /**
   * Validate an import file and return preview of changes
   */
  validateImportFile: publicProcedure
    .input(
      z.object({
        jsonContent: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Parse JSON
        const parsed = JSON.parse(input.jsonContent)

        // Validate against schema
        const validated = ClawSettingsExportSchema.parse(parsed)

        // Check version compatibility
        if (validated.version !== EXPORT_VERSION) {
          return {
            valid: false,
            error: `Incompatible export version. Expected ${EXPORT_VERSION}, got ${validated.version}`,
          }
        }

        // Get current settings for comparison
        const db = getDatabase()
        const currentSettings = db
          .select()
          .from(claudeCodeSettings)
          .where(eq(claudeCodeSettings.id, "default"))
          .get()

        const currentMcpConfigs = db
          .select()
          .from(configSources)
          .where(eq(configSources.type, "mcp"))
          .all()

        const currentPlugins = db
          .select()
          .from(configSources)
          .where(eq(configSources.type, "plugin"))
          .all()

        // Build preview of changes
        const changes = {
          settings: {
            willChange: validated.settings,
            current: currentSettings,
          },
          mcpConfigPaths: {
            willReplace: validated.mcpConfigPaths,
            current: currentMcpConfigs.map((c) => ({
              path: c.path,
              priority: c.priority,
              enabled: c.enabled,
            })),
          },
          pluginDirectories: {
            willReplace: validated.pluginDirectories,
            current: currentPlugins.map((p) => ({
              path: p.path,
              priority: p.priority,
              enabled: p.enabled,
            })),
          },
        }

        return {
          valid: true,
          data: validated,
          changes,
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          return {
            valid: false,
            error: "Invalid JSON format",
          }
        }
        if (err instanceof z.ZodError) {
          return {
            valid: false,
            error: `Invalid export format: ${err.issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          }
        }
        return {
          valid: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }
      }
    }),

  /**
   * Import settings from validated export object
   * Replaces ALL existing settings (destructive)
   */
  importSettings: publicProcedure
    .input(
      z.object({
        data: ClawSettingsExportSchema,
        uiPreferences: z.record(z.string(), z.any()).optional(), // UI preferences to write to localStorage
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      try {
        // Validate version
        if (input.data.version !== EXPORT_VERSION) {
          throw new Error(`Incompatible export version: ${input.data.version}`)
        }

        // Start transaction
        await db.transaction(async (tx) => {
          // Update Claude Code settings (preserve ID)
          // Expand environment variables in path fields ($HOME, ${VAR}, ~)
          const settingsToUpdate: any = {
            customBinaryPath: expandPathField(input.data.settings.customBinaryPath),
            customEnvVars: input.data.settings.customEnvVars
              ? JSON.stringify(input.data.settings.customEnvVars)
              : "{}",
            customConfigDir: expandPathField(input.data.settings.customConfigDir),
            customWorktreeLocation: expandPathField(input.data.settings.customWorktreeLocation),
            authMode: input.data.settings.authMode || "oauth",
            anthropicBaseUrl: input.data.settings.anthropicBaseUrl,
            bedrockRegion: input.data.settings.bedrockRegion || "us-east-1",
            bedrockConnectionMethod: input.data.settings.bedrockConnectionMethod || "profile",
            awsProfileName: input.data.settings.awsProfileName,
            ssoStartUrl: input.data.settings.ssoStartUrl,
            ssoRegion: input.data.settings.ssoRegion,
            ssoAccountId: input.data.settings.ssoAccountId,
            ssoAccountName: input.data.settings.ssoAccountName,
            ssoRoleName: input.data.settings.ssoRoleName,
            vpnCheckEnabled: input.data.settings.vpnCheckEnabled || false,
            vpnCheckUrl: input.data.settings.vpnCheckUrl,
            defaultStartCommands: input.data.settings.defaultStartCommands
              ? JSON.stringify(input.data.settings.defaultStartCommands)
              : "[]",
            bedrockOpusModel: input.data.settings.bedrockModelOverrides?.opus,
            bedrockSonnetModel: input.data.settings.bedrockModelOverrides?.sonnet,
            bedrockHaikuModel: input.data.settings.bedrockModelOverrides?.haiku,
            maxMcpOutputTokens: input.data.settings.maxMcpOutputTokens || 200000,
            maxThinkingTokens: input.data.settings.maxThinkingTokens || 1000000,
            updatedAt: new Date(),
          }

          await tx
            .update(claudeCodeSettings)
            .set(settingsToUpdate)
            .where(eq(claudeCodeSettings.id, "default"))

          // Clear and replace config sources
          await tx.delete(configSources).where(eq(configSources.type, "mcp"))
          await tx.delete(configSources).where(eq(configSources.type, "plugin"))

          // Insert new MCP config sources (expand env vars in paths)
          for (const mcpConfig of input.data.mcpConfigPaths) {
            const expandedPath = expandPathField(mcpConfig.path)
            if (expandedPath) {
              await tx.insert(configSources).values({
                type: "mcp",
                path: expandedPath,
                priority: mcpConfig.priority,
                enabled: mcpConfig.enabled,
              })
            }
          }

          // Insert new plugin directories (expand env vars in paths)
          for (const plugin of input.data.pluginDirectories) {
            const expandedPath = expandPathField(plugin.path)
            if (expandedPath) {
              await tx.insert(configSources).values({
                type: "plugin",
                path: expandedPath,
                priority: plugin.priority,
                enabled: plugin.enabled,
              })
            }
          }

        })

        return {
          success: true,
          message: "Settings imported successfully",
        }
      } catch (err) {
        console.error("[settings-export] Import failed:", err)
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }
      }
    }),
})

// Export types for frontend
export type { ClawSettingsExport }
