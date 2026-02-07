/**
 * Active session state
 * Consolidates session tracking from activeSessions and activeQueries Maps
 */
export interface ActiveSessionState {
  subChatId: string
  chatId: string
  abortController: AbortController
  query: AsyncIterable<any> | null
  sessionId: string | null
  streamId: string
  startedAt: number
}
