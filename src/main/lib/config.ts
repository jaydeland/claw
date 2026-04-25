/**
 * Shared configuration for the desktop app
 */

const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

/**
 * Get the API base URL
 * External API is disabled - returns null
 */
export function getApiUrl(): string | null {
  return null
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return IS_DEV
}
