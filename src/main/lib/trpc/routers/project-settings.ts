import { z } from "zod"
import { eq } from "drizzle-orm"
import { getDatabase, projects } from "../../db"
import { publicProcedure, router } from "../index"
import { getConsolidatedConfig } from "../../config/consolidator"
import path from "path"
import fs from "fs/promises"
import { existsSync } from "fs"

/**
 * Project Settings Router
 *
 * Manages project-specific Claude Code settings including MCP overrides,
 * environment variables, and custom paths for skills/agents.
 *
 * Project settings follow a hybrid storage model:
 * - Credentials/secrets: Stored in database (encrypted)
 * - MCP configs: Can be stored in .claw/mcp.json files OR database JSON columns
 * - Project overrides global settings (priority-based merging)
 */

export const projectSettingsRouter = router({
  /**
   * Get effective MCP config for a project (merged global + project)
   * Uses existing consolidator logic with project path
   */
  getMcpConfig: publicProcedure.input(z.object({ projectId: z.string() })).query(async ({ input }) => {
    const db = getDatabase()
    const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get()

    if (!project) {
      throw new Error("Project not found")
    }

    // Use existing consolidator with project path
    // This will automatically merge .claw/mcp.json (if it exists) with user config
    return getConsolidatedConfig(project.path)
  }),

  /**
   * Get project-specific overrides (not merged with global)
   * Returns only the project-level settings from database
   */
  getProjectOverrides: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get()

      if (!project) {
        throw new Error("Project not found")
      }

      // Parse JSON columns
      return {
        mcpOverrides: project.mcpOverrides ? JSON.parse(project.mcpOverrides) : {},
        envVars: project.envVars ? JSON.parse(project.envVars) : {},
        skillsPath: project.skillsPath,
        agentsPath: project.agentsPath,
      }
    }),

  /**
   * Update project settings in database
   * These settings are stored as JSON columns in the projects table
   */
  updateProjectSettings: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        mcpOverrides: z.record(z.string(), z.unknown()).optional(),
        envVars: z.record(z.string(), z.string()).optional(),
        skillsPath: z.string().optional(),
        agentsPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const { projectId, ...settings } = input

      const updates: Record<string, unknown> = { updatedAt: new Date() }

      if (settings.mcpOverrides !== undefined) {
        updates.mcpOverrides = JSON.stringify(settings.mcpOverrides)
      }
      if (settings.envVars !== undefined) {
        updates.envVars = JSON.stringify(settings.envVars)
      }
      if (settings.skillsPath !== undefined) {
        updates.skillsPath = settings.skillsPath
      }
      if (settings.agentsPath !== undefined) {
        updates.agentsPath = settings.agentsPath
      }

      const updated = db.update(projects).set(updates).where(eq(projects.id, projectId)).returning().get()

      return {
        id: updated.id,
        name: updated.name,
        path: updated.path,
        mcpOverrides: updated.mcpOverrides,
        envVars: updated.envVars,
        skillsPath: updated.skillsPath,
        agentsPath: updated.agentsPath,
        updatedAt: updated.updatedAt,
      }
    }),

  /**
   * Read .claw/mcp.json from project directory
   * Returns file contents and parsed config
   */
  readProjectMcpFile: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get()

      if (!project) {
        throw new Error("Project not found")
      }

      const mcpPath = path.join(project.path, ".claw", "mcp.json")

      if (!existsSync(mcpPath)) {
        return null
      }

      const content = await fs.readFile(mcpPath, "utf-8")

      try {
        const parsed = JSON.parse(content)
        return {
          path: mcpPath,
          content,
          parsed,
        }
      } catch (error) {
        return {
          path: mcpPath,
          content,
          parsed: null,
          parseError: (error as Error).message,
        }
      }
    }),

  /**
   * Write .claw/mcp.json to project directory
   * Creates .claw directory if it doesn't exist
   * Validates JSON before writing
   */
  writeProjectMcpFile: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        content: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get()

      if (!project) {
        throw new Error("Project not found")
      }

      const clawDir = path.join(project.path, ".claw")
      const mcpPath = path.join(clawDir, "mcp.json")

      // Validate JSON before writing
      try {
        JSON.parse(input.content)
      } catch (error) {
        throw new Error(`Invalid JSON: ${(error as Error).message}`)
      }

      // Create .claw directory if it doesn't exist
      if (!existsSync(clawDir)) {
        await fs.mkdir(clawDir, { recursive: true })
      }

      // Write the file
      await fs.writeFile(mcpPath, input.content, "utf-8")

      return {
        success: true,
        path: mcpPath,
      }
    }),

  /**
   * Delete .claw/mcp.json from project directory
   */
  deleteProjectMcpFile: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get()

      if (!project) {
        throw new Error("Project not found")
      }

      const mcpPath = path.join(project.path, ".claw", "mcp.json")

      if (!existsSync(mcpPath)) {
        return {
          success: true,
          message: "File does not exist",
        }
      }

      await fs.unlink(mcpPath)

      return {
        success: true,
        path: mcpPath,
      }
    }),
})
