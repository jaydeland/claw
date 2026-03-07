import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { z } from "zod"
import { router, publicProcedure } from "../index"

/**
 * Get the Claude Code config directory
 * Respects CLAUDE_CONFIG_DIR env var, defaults to ~/.claude
 */
function getClaudeConfigDir(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR
  if (configDir) {
    return configDir.startsWith("~")
      ? path.join(os.homedir(), configDir.slice(1))
      : configDir
  }
  return path.join(os.homedir(), ".claude")
}

/**
 * Settings.json schema - represents the full Claude Code settings file
 */
export const ClaudeSettingsSchema = z.object({
  hooks: z.record(z.string(), z.array(z.object({
    hooks: z.array(z.object({
      type: z.string(),
      command: z.string().optional(),
      script: z.string().optional(),
      description: z.string().optional(),
    })),
  }))).optional(),
  statusLine: z.object({
    type: z.string(),
    command: z.string().optional(),
    script: z.string().optional(),
  }).optional(),
  permissions: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  }).optional(),
  attribution: z.object({
    commit: z.string().optional(),
  }).optional(),
  experimental: z.record(z.string(), z.unknown()).optional(),
}).passthrough() // Allow additional fields

export type ClaudeSettings = z.infer<typeof ClaudeSettingsSchema>

/**
 * Default settings object
 */
const defaultSettings: ClaudeSettings = {
  hooks: {},
  permissions: {
    allow: [],
  },
}

export const claudeConfigRouter = router({
  /**
   * Get the path to the Claude Code config directory
   */
  getConfigPath: publicProcedure.query(() => {
    return { path: getClaudeConfigDir() }
  }),

  /**
   * Read the settings.json file from ~/.claude/
   * Returns the parsed settings or default settings if file doesn't exist
   */
  readSettings: publicProcedure.query(async () => {
    const configDir = getClaudeConfigDir()
    const settingsPath = path.join(configDir, "settings.json")

    try {
      const content = await fs.readFile(settingsPath, "utf-8")
      const parsed = JSON.parse(content)
      return { settings: parsed as ClaudeSettings, exists: true }
    } catch (error) {
      // File doesn't exist or is invalid JSON - return defaults
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { settings: defaultSettings, exists: false }
      }
      // Invalid JSON - return defaults but indicate error
      console.error("[claude-config] Failed to parse settings.json:", error)
      return { settings: defaultSettings, exists: false, error: "Invalid JSON" }
    }
  }),

  /**
   * Write settings to the settings.json file
   */
  writeSettings: publicProcedure
    .input(z.object({ settings: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input }) => {
      const configDir = getClaudeConfigDir()
      const settingsPath = path.join(configDir, "settings.json")

      try {
        // Ensure the config directory exists
        await fs.mkdir(configDir, { recursive: true })

        // Validate the settings structure
        const validated = ClaudeSettingsSchema.parse(input.settings)

        // Write the file with proper formatting
        await fs.writeFile(
          settingsPath,
          JSON.stringify(validated, null, 2) + "\n",
          "utf-8"
        )

        return { success: true }
      } catch (error) {
        console.error("[claude-config] Failed to write settings.json:", error)
        throw new Error(
          `Failed to write settings: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      }
    }),

  /**
   * Read only the hooks section from settings.json
   */
  readHooks: publicProcedure.query(async () => {
    const configDir = getClaudeConfigDir()
    const settingsPath = path.join(configDir, "settings.json")

    try {
      const content = await fs.readFile(settingsPath, "utf-8")
      const parsed = JSON.parse(content)
      return { hooks: parsed.hooks || {}, exists: true }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { hooks: {}, exists: false }
      }
      console.error("[claude-config] Failed to read hooks:", error)
      return { hooks: {}, exists: false, error: "Invalid JSON" }
    }
  }),

  /**
   * Write hooks to settings.json (preserves other settings)
   */
  writeHooks: publicProcedure
    .input(z.object({ hooks: z.record(z.string(), z.array(z.any())) }))
    .mutation(async ({ input }) => {
      const configDir = getClaudeConfigDir()
      const settingsPath = path.join(configDir, "settings.json")

      try {
        // Read existing settings
        let settings: ClaudeSettings = defaultSettings
        try {
          const content = await fs.readFile(settingsPath, "utf-8")
          settings = JSON.parse(content)
        } catch (readError) {
          // File doesn't exist or is invalid - start with defaults
          if ((readError as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn("[claude-config] Could not read existing settings, using defaults")
          }
        }

        // Merge hooks
        settings.hooks = input.hooks

        // Ensure the config directory exists
        await fs.mkdir(configDir, { recursive: true })

        // Write back
        await fs.writeFile(
          settingsPath,
          JSON.stringify(settings, null, 2) + "\n",
          "utf-8"
        )

        return { success: true }
      } catch (error) {
        console.error("[claude-config] Failed to write hooks:", error)
        throw new Error(
          `Failed to write hooks: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      }
    }),
})
