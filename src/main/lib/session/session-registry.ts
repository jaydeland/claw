import type { ActiveSessionState } from "./active-session"

/**
 * Unified session registry
 * Consolidates activeSessions + activeQueries Maps into single source of truth
 */
const sessionRegistry = new Map<string, ActiveSessionState>()

/**
 * Register a new active session
 */
export function registerSession(state: ActiveSessionState): void {
  sessionRegistry.set(state.subChatId, state)
}

/**
 * Get active session state by subChatId
 */
export function getSession(subChatId: string): ActiveSessionState | undefined {
  return sessionRegistry.get(subChatId)
}

/**
 * Remove session from registry
 */
export function removeSession(subChatId: string): boolean {
  return sessionRegistry.delete(subChatId)
}

/**
 * Check if a session is active
 */
export function hasActiveSession(subChatId: string): boolean {
  return sessionRegistry.has(subChatId)
}

/**
 * Get query for a session (for MCP server runtime control and file checkpointing)
 */
export function getSessionQuery(subChatId: string): AsyncIterable<any> | null {
  const session = sessionRegistry.get(subChatId)
  return session?.query ?? null
}

/**
 * Abort an active session
 */
export function abortSession(subChatId: string): boolean {
  const session = sessionRegistry.get(subChatId)
  if (!session) return false

  session.abortController.abort()
  return true
}

/**
 * Update query for an active session
 */
export function updateSessionQuery(subChatId: string, query: AsyncIterable<any> | null): boolean {
  const session = sessionRegistry.get(subChatId)
  if (!session) return false

  session.query = query
  return true
}

/**
 * Update sessionId for an active session
 */
export function updateSessionId(subChatId: string, sessionId: string | null): boolean {
  const session = sessionRegistry.get(subChatId)
  if (!session) return false

  session.sessionId = sessionId
  return true
}

/**
 * Get all active sessions (for debugging/logging)
 */
export function getAllSessions(): Map<string, ActiveSessionState> {
  return new Map(sessionRegistry)
}

/**
 * Clear all sessions (for testing/cleanup)
 */
export function clearAllSessions(): void {
  sessionRegistry.clear()
}
