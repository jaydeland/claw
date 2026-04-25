/**
 * Shared token formatting utilities for consistent display across the app.
 */

/**
 * Format token count for display.
 * Uses lowercase 'k' for thousands and 'M' for millions.
 *
 * @example
 * formatTokenCount(500) // "500"
 * formatTokenCount(1234) // "1.2k"
 * formatTokenCount(12345) // "12.3k"
 * formatTokenCount(1234567) // "1.2M"
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toLocaleString()
  }
  if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(1)}k`
  }
  return `${(tokens / 1_000_000).toFixed(1)}M`
}

/**
 * Format duration in milliseconds to human-readable format.
 *
 * @example
 * formatDuration(500) // "500ms"
 * formatDuration(1500) // "1.5s"
 * formatDuration(90000) // "1m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  const seconds = ms / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

/**
 * Format cost in USD for display.
 *
 * @example
 * formatCost(0.0001) // "$0.0001"
 * formatCost(0.05) // "$0.05"
 * formatCost(1.234) // "$1.23"
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`
  }
  return `$${usd.toFixed(2)}`
}
