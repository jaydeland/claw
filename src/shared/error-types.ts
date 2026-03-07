/**
 * Shared Error Types
 *
 * Error categories used throughout the application.
 * These are shared between main process and renderer process.
 */

/**
 * Error categories used throughout the application.
 * These map to specific error conditions from the Claude SDK and API.
 */
export type ErrorCategory =
  | "AUTH_FAILED_SDK"      // SDK authentication failure
  | "INVALID_API_KEY_SDK"  // Invalid API key (SDK)
  | "INVALID_API_KEY"      // Invalid API key (direct API)
  | "RATE_LIMIT_SDK"       // Rate limit hit (SDK)
  | "RATE_LIMIT"           // Rate limit hit (direct API)
  | "OVERLOADED_SDK"       // Service overloaded (SDK)
  | "PROCESS_CRASH"        // Claude process crashed
  | "EXECUTABLE_NOT_FOUND" // Claude CLI not installed
  | "NETWORK_ERROR"        // Network connectivity issue
  | "AUTH_FAILURE"         // Generic authentication failure
  | "CONTEXT_LENGTH"       // Context window exceeded
  | "UNKNOWN"              // Uncategorized error