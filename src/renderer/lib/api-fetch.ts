/**
 * API fetch helper for desktop app
 *
 * NOTE: External API calls have been disabled. This file is kept for
 * potential future use with a self-hosted API.
 */

/**
 * Get the API base URL
 * Returns null since external API is disabled
 */
export async function getApiBaseUrl(): Promise<string | null> {
  return null
}

/**
 * Fetch wrapper for API requests
 * Currently disabled - throws an error indicating the API is unavailable
 *
 * @param path - API path (e.g., "/api/tts")
 * @param init - Fetch init options
 * @param options.withCredentials - Include credentials
 */
export async function apiFetch(
  _path: string,
  _init?: RequestInit,
  _options?: { withCredentials?: boolean }
): Promise<Response> {
  throw new Error("External API is disabled. This feature requires a self-hosted API endpoint.")
}
