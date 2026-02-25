/**
 * Prompt Service
 *
 * Provides cached access to system prompts stored in the database.
 * Used by the backend to fetch prompts for AI interactions.
 */

import { eq } from "drizzle-orm"
import { getDatabase, systemPrompts } from "../db"

/**
 * In-memory cache for prompts
 * Key -> content mapping for fast lookups
 */
const promptCache = new Map<string, string>()

/**
 * Cache of all prompts loaded flag
 */
let promptsLoaded = false

/**
 * Get a prompt by key with caching
 * Returns the prompt content, or undefined if not found
 *
 * @param key - The unique key for the prompt (e.g., "mcp_config", "chat_title_generation")
 * @returns The prompt content, or undefined if not found
 */
export function getPromptByKey(key: string): string | undefined {
  // Check cache first
  if (promptCache.has(key)) {
    return promptCache.get(key)
  }

  // Query database
  const db = getDatabase()
  const prompt = db.select().from(systemPrompts).where(eq(systemPrompts.key, key)).get()

  if (prompt) {
    // Cache for future use
    promptCache.set(key, prompt.content)
    return prompt.content
  }

  return undefined
}

/**
 * Get a prompt by key, with fallback to a default value
 *
 * @param key - The unique key for the prompt
 * @param fallback - The fallback value if not found
 * @returns The prompt content, or the fallback if not found
 */
export function getPromptByKeyWithFallback(key: string, fallback: string): string {
  const prompt = getPromptByKey(key)
  return prompt ?? fallback
}

/**
 * Preload all prompts into memory cache
 * Call this on app startup for faster prompt lookups
 */
export function preloadPrompts(): void {
  const db = getDatabase()
  const prompts = db.select().from(systemPrompts).all()

  promptCache.clear()
  for (const prompt of prompts) {
    promptCache.set(prompt.key, prompt.content)
  }

  promptsLoaded = true
  console.log(`[Prompts] Preloaded ${prompts.length} prompts into cache`)
}

/**
 * Clear the prompt cache
 * Useful when prompts are updated
 */
export function clearPromptCache(): void {
  promptCache.clear()
  promptsLoaded = false
}

/**
 * Invalidate cache for a specific prompt
 *
 * @param key - The prompt key to invalidate
 */
export function invalidatePromptCache(key: string): void {
  promptCache.delete(key)
}

/**
 * Check if prompts have been preloaded
 */
export function arePromptsLoaded(): boolean {
  return promptsLoaded
}

/**
 * Get all cached prompt keys
 */
export function getCachedPromptKeys(): string[] {
  return Array.from(promptCache.keys())
}

/**
 * Prompt key constants for type-safe access
 */
export const PROMPT_KEYS = {
  // MCP prompts
  MCP_CONFIG: "mcp_config",
  REVIEW: "review",

  // Chat prompts
  CHAT_TITLE_GENERATION: "chat_title_generation",
  CONVERSATION_TITLE_GENERATION: "conversation_title_generation",

  // Background session prompts
  BASH_STATUS_CHECK: "bash_status_check",
  TASK_SUBAGENT: "task_subagent",
  TYPESCRIPT_FIX: "typescript_fix",

  // Analysis prompts
  ANALYSIS_CODEFLOW: "analysis_codeflow",
  ANALYSIS_DB: "analysis_db",
  ANALYSIS_ARCHITECTURE: "analysis_architecture",
  ANALYSIS_BUILD: "analysis_build",
} as const

export type PromptKey = (typeof PROMPT_KEYS)[keyof typeof PROMPT_KEYS]