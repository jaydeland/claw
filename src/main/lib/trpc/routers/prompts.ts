import { z } from "zod"
import { eq } from "drizzle-orm"
import { getDatabase, systemPrompts } from "../../db"
import { publicProcedure, router } from "../index"

/**
 * Prompts Router
 *
 * Manages system prompts used by AI interactions.
 * Allows viewing and editing prompts that are stored in the database.
 */
export const promptsRouter = router({
  /**
   * List all system prompts
   * Optionally filter by category
   */
  list: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getDatabase()

      let query = db.select().from(systemPrompts)

      if (input?.category) {
        query = query.where(eq(systemPrompts.category, input.category)) as typeof query
      }

      const prompts = query.all()

      return {
        prompts: prompts.map((p) => ({
          id: p.id,
          key: p.key,
          name: p.name,
          description: p.description,
          content: p.content,
          category: p.category,
          isEditable: p.isEditable,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      }
    }),

  /**
   * Get a single prompt by key
   * Used by the backend to fetch prompts for AI interactions
   */
  getByKey: publicProcedure.input(z.object({ key: z.string() })).query(async ({ input }) => {
    const db = getDatabase()

    const prompt = db.select().from(systemPrompts).where(eq(systemPrompts.key, input.key)).get()

    if (!prompt) {
      return null
    }

    return {
      id: prompt.id,
      key: prompt.key,
      name: prompt.name,
      description: prompt.description,
      content: prompt.content,
      category: prompt.category,
      isEditable: prompt.isEditable,
      defaultValue: prompt.defaultValue,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
    }
  }),

  /**
   * Get a single prompt by ID
   */
  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = getDatabase()

    const prompt = db.select().from(systemPrompts).where(eq(systemPrompts.id, input.id)).get()

    if (!prompt) {
      return null
    }

    return {
      id: prompt.id,
      key: prompt.key,
      name: prompt.name,
      description: prompt.description,
      content: prompt.content,
      category: prompt.category,
      isEditable: prompt.isEditable,
      defaultValue: prompt.defaultValue,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
    }
  }),

  /**
   * Update a prompt's content
   * Only editable prompts can be modified
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Check if prompt exists and is editable
      const existing = db.select().from(systemPrompts).where(eq(systemPrompts.id, input.id)).get()

      if (!existing) {
        throw new Error("Prompt not found")
      }

      if (!existing.isEditable) {
        throw new Error("This prompt cannot be edited")
      }

      // Update the prompt
      const updated = db
        .update(systemPrompts)
        .set({
          content: input.content,
          updatedAt: new Date(),
        })
        .where(eq(systemPrompts.id, input.id))
        .returning()
        .get()

      return {
        id: updated.id,
        key: updated.key,
        name: updated.name,
        description: updated.description,
        content: updated.content,
        category: updated.category,
        isEditable: updated.isEditable,
        updatedAt: updated.updatedAt,
      }
    }),

  /**
   * Reset a prompt to its default value
   */
  resetToDefault: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = getDatabase()

    // Check if prompt exists
    const existing = db.select().from(systemPrompts).where(eq(systemPrompts.id, input.id)).get()

    if (!existing) {
      throw new Error("Prompt not found")
    }

    // Reset to default value
    const updated = db
      .update(systemPrompts)
      .set({
        content: existing.defaultValue,
        updatedAt: new Date(),
      })
      .where(eq(systemPrompts.id, input.id))
      .returning()
      .get()

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      content: updated.content,
      category: updated.category,
      isEditable: updated.isEditable,
      updatedAt: updated.updatedAt,
    }
  }),

  /**
   * Get all available categories
   */
  getCategories: publicProcedure.query(async () => {
    const db = getDatabase()

    const prompts = db.select().from(systemPrompts).all()

    // Get unique categories
    const categories = [...new Set(prompts.map((p) => p.category))]

    return { categories }
  }),
})