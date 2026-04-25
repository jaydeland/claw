import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { getDatabase, hooks } from "../../db"
import { createId } from "../../db/utils"
import { publicProcedure, router } from "../index"

/**
 * Hooks Router
 *
 * Manages lifecycle hooks for workflow automation.
 * Supports global and project-scoped hooks that execute at various lifecycle events.
 */

const hookTypeEnum = z.enum(["PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop", "Stop"])
const hookScopeEnum = z.enum(["global", "project"])

export const hooksRouter = router({
  /**
   * List all hooks
   * Optionally filter by project ID and/or scope
   */
  list: publicProcedure
    .input(
      z
        .object({
          projectId: z.string().optional(),
          scope: z.enum(["global", "project", "all"]).default("all"),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getDatabase()

      let query = db.select().from(hooks)

      // Build where clause based on scope
      if (input?.scope === "global") {
        query = query.where(eq(hooks.scope, "global")) as typeof query
      } else if (input?.scope === "project" && input?.projectId) {
        query = query.where(
          and(eq(hooks.scope, "project"), eq(hooks.projectId, input.projectId)),
        ) as typeof query
      } else if (input?.scope === "project" && !input?.projectId) {
        // If project scope requested but no projectId, return empty
        return []
      }
      // If scope is "all", don't add any where clause

      const allHooks = query.all()

      return allHooks.map((hook) => ({
        id: hook.id,
        name: hook.name,
        description: hook.description,
        hookType: hook.hookType,
        matcher: hook.matcher,
        command: hook.command,
        scope: hook.scope,
        projectId: hook.projectId,
        enabled: hook.enabled,
        createdAt: hook.createdAt,
        updatedAt: hook.updatedAt,
      }))
    }),

  /**
   * Get a single hook by ID
   */
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = getDatabase()

    const hook = db.select().from(hooks).where(eq(hooks.id, input.id)).get()

    if (!hook) {
      return null
    }

    return {
      id: hook.id,
      name: hook.name,
      description: hook.description,
      hookType: hook.hookType,
      matcher: hook.matcher,
      command: hook.command,
      scope: hook.scope,
      projectId: hook.projectId,
      enabled: hook.enabled,
      createdAt: hook.createdAt,
      updatedAt: hook.updatedAt,
    }
  }),

  /**
   * Create a new hook
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
        hookType: hookTypeEnum,
        matcher: z.string().min(1, "Matcher is required"),
        command: z.string().min(1, "Command is required"),
        scope: hookScopeEnum,
        projectId: z.string().optional(),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Validate that projectId is provided when scope is project
      if (input.scope === "project" && !input.projectId) {
        throw new Error("Project ID is required for project-scoped hooks")
      }

      const id = createId()
      const now = new Date()

      const newHook = {
        id,
        name: input.name,
        description: input.description || null,
        hookType: input.hookType,
        matcher: input.matcher,
        command: input.command,
        scope: input.scope,
        projectId: input.projectId || null,
        enabled: input.enabled,
        createdAt: now,
        updatedAt: now,
      }

      const inserted = db.insert(hooks).values(newHook).returning().get()

      return {
        id: inserted.id,
        name: inserted.name,
        description: inserted.description,
        hookType: inserted.hookType,
        matcher: inserted.matcher,
        command: inserted.command,
        scope: inserted.scope,
        projectId: inserted.projectId,
        enabled: inserted.enabled,
        createdAt: inserted.createdAt,
        updatedAt: inserted.updatedAt,
      }
    }),

  /**
   * Update an existing hook
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        hookType: hookTypeEnum.optional(),
        matcher: z.string().min(1).optional(),
        command: z.string().min(1).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Check if hook exists
      const existing = db.select().from(hooks).where(eq(hooks.id, input.id)).get()

      if (!existing) {
        throw new Error("Hook not found")
      }

      const { id, ...updates } = input

      const updated = db
        .update(hooks)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(hooks.id, id))
        .returning()
        .get()

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        hookType: updated.hookType,
        matcher: updated.matcher,
        command: updated.command,
        scope: updated.scope,
        projectId: updated.projectId,
        enabled: updated.enabled,
        updatedAt: updated.updatedAt,
      }
    }),

  /**
   * Delete a hook
   */
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = getDatabase()

    // Check if hook exists
    const existing = db.select().from(hooks).where(eq(hooks.id, input.id)).get()

    if (!existing) {
      throw new Error("Hook not found")
    }

    db.delete(hooks).where(eq(hooks.id, input.id)).run()

    return { success: true }
  }),

  /**
   * Toggle hook enabled/disabled
   */
  toggle: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = getDatabase()

    const hook = db.select().from(hooks).where(eq(hooks.id, input.id)).get()

    if (!hook) {
      throw new Error("Hook not found")
    }

    const updated = db
      .update(hooks)
      .set({
        enabled: !hook.enabled,
        updatedAt: new Date(),
      })
      .where(eq(hooks.id, input.id))
      .returning()
      .get()

    return {
      id: updated.id,
      enabled: updated.enabled,
    }
  }),
})
