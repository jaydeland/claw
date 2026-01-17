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
        })
        .run()
      settings = {
        id: "default",
        customBinaryPath: null,
        customEnvVars: "{}",
        customConfigDir: null,
        mcpServerSettings: "{}",
        updatedAt: new Date(),
      }
    }

    return {
      customBinaryPath: settings.customBinaryPath,
      customEnvVars: parseJsonSafely<Record<string, string>>(
        settings.customEnvVars,
        {}
      ),
      customConfigDir: settings.customConfigDir,
      mcpServerSettings: parseJsonSafely<Record<string, { enabled: boolean }>>(
        settings.mcpServerSettings ?? "{}",
        {}
      ),
    }
  }),

  /**
   * Update Claude Code settings
   */
  updateSettings: publicProcedure
    .input(
      z.object({
        customBinaryPath: z.string().nullable().optional(),
        customEnvVars: z.record(z.string()).optional(),
        customConfigDir: z.string().nullable().optional(),
        mcpServerSettings: z.record(z.object({ enabled: z.boolean() })).optional(),
      })
    )
    .mutation(({ input }) => {
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
            ...(input.mcpServerSettings !== undefined && {
              mcpServerSettings: JSON.stringify(input.mcpServerSettings),
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
            mcpServerSettings: JSON.stringify(input.mcpServerSettings ?? {}),
            updatedAt: new Date(),
          })
          .run()
      }

      return { success: true }
    }),
})
