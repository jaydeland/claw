import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { app } from "electron"
import { stripVTControlCharacters } from "node:util"
import { eq } from "drizzle-orm"
import { getDatabase, claudeCodeSettings } from "../db"
import { decrypt } from "../aws/sso-service"

// Cache the shell environment
let cachedShellEnv: Record<string, string> | null = null

// Delimiter for parsing env output
const DELIMITER = "_CLAUDE_ENV_DELIMITER_"

// Keys to strip (prevent auth interference)
// CRITICAL: Include AWS credentials to prevent system SSO from leaking into app
const STRIPPED_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  // AWS credentials - must be set explicitly by the app, not inherited from system
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
  // AWS config that could interfere
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
]

// Cache the bundled binary path (only compute once)
let cachedBinaryPath: string | null = null
let binaryPathComputed = false

// Flag to prevent concurrent refresh attempts
let isRefreshing = false

// AWS Credentials interface for Bedrock
export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
  profileName?: string // AWS profile name for profile mode
}

/**
 * Get AWS credentials from database if AWS auth mode is enabled
 * Note: This requires database access, so it's lazily imported
 */
export function getAwsCredentials(): AwsCredentials | null {
  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings || settings.authMode !== "aws") {
      return null
    }

    // CRITICAL: Check connection method - SSO takes precedence
    const connectionMethod = settings.bedrockConnectionMethod || "profile"

    // SSO mode - MUST have valid SSO credentials
    if (connectionMethod === "sso") {
      if (!settings.awsAccessKeyId || !settings.awsSecretAccessKey) {
        console.warn("[claude-env] SSO mode selected but credentials not available")
        return null
      }

      // Check expiration
      if (settings.awsCredentialsExpiresAt && settings.awsCredentialsExpiresAt < new Date()) {
        console.warn("[claude-env] SSO credentials expired")
        return null
      }

      // Validate credentials exist before decrypting
      if (!settings.awsAccessKeyId || !settings.awsSecretAccessKey) {
        console.warn("[claude-env] AWS credentials not available")
        return null
      }

      // Return SSO credentials with explicit precedence
      console.log("[claude-env] Using SSO credentials (connection method: sso)")
      return {
        accessKeyId: decrypt(settings.awsAccessKeyId),
        secretAccessKey: decrypt(settings.awsSecretAccessKey),
        sessionToken: settings.awsSessionToken ? decrypt(settings.awsSessionToken) : undefined,
        region: settings.bedrockRegion || "us-east-1",
      }
    }

    // Profile mode - rely on AWS SDK to load from ~/.aws/
    console.log("[claude-env] Using profile mode (connection method: profile)")
    return {
      accessKeyId: "", // SDK will load from profile
      secretAccessKey: "",
      region: settings.bedrockRegion || "us-east-1",
      profileName: settings.awsProfileName || undefined,
    }
  } catch (error) {
    console.error("[claude-env] Failed to get AWS credentials:", error)
    return null
  }
}

/**
 * Result of credential refresh attempt
 */
export interface CredentialRefreshResult {
  success: boolean
  error?: string
  expiresAt?: Date
  connectionMethod?: "profile" | "sso" // Which mode we're in
  requiresReauth?: boolean // True if user must re-authenticate in Settings
}

/**
 * Ensure AWS credentials are valid, auto-refreshing if needed.
 * Call this BEFORE buildClaudeEnv() to ensure credentials are fresh.
 *
 * This handles the case where SSO credentials are expired but can be refreshed
 * using the stored SSO access token (and refresh token if needed).
 */
export async function ensureValidAwsCredentials(): Promise<CredentialRefreshResult> {
  // Prevent concurrent refresh attempts
  if (isRefreshing) {
    console.log("[claude-env] Credential refresh already in progress, waiting...")
    // Wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, 1000))
    return ensureValidAwsCredentials()
  }

  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    // Not in AWS mode - nothing to refresh
    if (!settings || settings.authMode !== "aws") {
      return { success: true, connectionMethod: "profile" }
    }

    // Profile mode - relies on system credentials, nothing to refresh in app
    const connectionMethod = settings.bedrockConnectionMethod || "profile"
    if (connectionMethod === "profile") {
      return { success: true, connectionMethod: "profile" }
    }

    // SSO mode - check if credentials need refresh
    const now = new Date()
    const credentialsExpired = settings.awsCredentialsExpiresAt && settings.awsCredentialsExpiresAt < now
    const credentialsMissing = !settings.awsAccessKeyId || !settings.awsSecretAccessKey

    // Credentials are valid - no refresh needed
    if (!credentialsExpired && !credentialsMissing) {
      return { success: true, expiresAt: settings.awsCredentialsExpiresAt || undefined, connectionMethod: "sso" }
    }

    console.log("[claude-env] SSO credentials expired or missing, attempting auto-refresh...")
    isRefreshing = true

    // Check if we have SSO access token to refresh credentials
    if (!settings.ssoAccessToken || !settings.ssoRegion) {
      console.warn("[claude-env] No SSO access token available for refresh")
      return { success: false, error: "SSO session not established. Please authenticate in Settings.", connectionMethod: "sso", requiresReauth: true }
    }

    if (!settings.ssoAccountId || !settings.ssoRoleName) {
      console.warn("[claude-env] No SSO account/role selected for refresh")
      return { success: false, error: "No AWS account/role selected. Please configure in Settings.", connectionMethod: "sso", requiresReauth: true }
    }

    // Dynamically import AwsSsoService to avoid circular deps
    const { AwsSsoService } = await import("../aws/sso-service")
    const ssoService = new AwsSsoService(settings.ssoRegion)

    let accessToken = settings.ssoAccessToken

    // Check if SSO access token itself is expired
    const ssoTokenExpired = settings.ssoTokenExpiresAt && settings.ssoTokenExpiresAt < now
    if (ssoTokenExpired) {
      console.log("[claude-env] SSO access token expired, attempting token refresh...")

      if (!settings.ssoRefreshToken || !settings.ssoClientId || !settings.ssoClientSecret) {
        console.warn("[claude-env] No refresh token available - user must re-authenticate")
        return { success: false, error: "SSO session expired. Please re-authenticate in Settings.", connectionMethod: "sso", requiresReauth: true }
      }

      try {
        const newToken = await ssoService.refreshToken(
          settings.ssoClientId,
          settings.ssoClientSecret,
          settings.ssoRefreshToken
        )

        accessToken = newToken.accessToken

        // Save refreshed SSO token
        db.update(claudeCodeSettings)
          .set({
            ssoAccessToken: newToken.accessToken,
            ssoRefreshToken: newToken.refreshToken || settings.ssoRefreshToken,
            ssoTokenExpiresAt: newToken.expiresAt,
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()

        console.log("[claude-env] SSO access token refreshed successfully")
      } catch (tokenError: any) {
        console.error("[claude-env] Failed to refresh SSO token:", tokenError)
        return { success: false, error: "Failed to refresh SSO session. Please re-authenticate in Settings.", connectionMethod: "sso", requiresReauth: true }
      }
    }

    // Now get fresh role credentials using the (possibly refreshed) access token
    try {
      const credentials = await ssoService.getRoleCredentials(
        accessToken,
        settings.ssoAccountId,
        settings.ssoRoleName
      )

      // Save new credentials
      db.update(claudeCodeSettings)
        .set({
          awsAccessKeyId: credentials.accessKeyId,
          awsSecretAccessKey: credentials.secretAccessKey,
          awsSessionToken: credentials.sessionToken,
          awsCredentialsExpiresAt: credentials.expiration,
          updatedAt: new Date(),
        })
        .where(eq(claudeCodeSettings.id, "default"))
        .run()

      console.log("[claude-env] AWS credentials refreshed successfully, expires:", credentials.expiration)
      return { success: true, expiresAt: credentials.expiration, connectionMethod: "sso" }
    } catch (credError: any) {
      console.error("[claude-env] Failed to get role credentials:", credError)
      return { success: false, error: `Failed to get AWS credentials: ${credError.message}`, connectionMethod: "sso", requiresReauth: true }
    }
  } catch (error: any) {
    console.error("[claude-env] Unexpected error during credential refresh:", error)
    return { success: false, error: `Credential refresh failed: ${error.message}`, connectionMethod: "sso" }
  } finally {
    isRefreshing = false
  }
}

/**
 * Get path to the bundled Claude binary.
 * Returns the path to the native Claude executable bundled with the app.
 * CACHED - only computes path once and logs verbose info on first call.
 */
export function getBundledClaudeBinaryPath(): string {
  // Return cached path if already computed
  if (binaryPathComputed) {
    return cachedBinaryPath!
  }

  const isDev = !app.isPackaged
  const platform = process.platform
  const arch = process.arch

  // Only log verbose info on first call
  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] ========== BUNDLED BINARY PATH ==========")
    console.log("[claude-binary] isDev:", isDev)
    console.log("[claude-binary] platform:", platform)
    console.log("[claude-binary] arch:", arch)
    console.log("[claude-binary] appPath:", app.getAppPath())
  }

  // In dev: apps/desktop/resources/bin/{platform}-{arch}/claude
  // In production: {resourcesPath}/bin/claude
  const resourcesPath = isDev
    ? path.join(app.getAppPath(), "resources/bin", `${platform}-${arch}`)
    : path.join(process.resourcesPath, "bin")

  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] resourcesPath:", resourcesPath)
  }

  const binaryName = platform === "win32" ? "claude.exe" : "claude"
  const binaryPath = path.join(resourcesPath, binaryName)

  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] binaryPath:", binaryPath)
  }

  // Check if binary exists
  const exists = fs.existsSync(binaryPath)

  // Always log if binary doesn't exist (critical error)
  if (!exists) {
    console.error("[claude-binary] WARNING: Binary not found at path:", binaryPath)
    console.error("[claude-binary] Run 'bun run claude:download' to download it")
  } else if (process.env.DEBUG_CLAUDE_BINARY) {
    const stats = fs.statSync(binaryPath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
    const isExecutable = (stats.mode & fs.constants.X_OK) !== 0
    console.log("[claude-binary] exists:", exists)
    console.log("[claude-binary] size:", sizeMB, "MB")
    console.log("[claude-binary] isExecutable:", isExecutable)
    console.log("[claude-binary] ===========================================")
  }

  // Cache the result
  cachedBinaryPath = binaryPath
  binaryPathComputed = true

  return binaryPath
}

/**
 * Parse environment variables from shell output
 */
function parseEnvOutput(output: string): Record<string, string> {
  const envSection = output.split(DELIMITER)[1]
  if (!envSection) return {}

  const env: Record<string, string> = {}
  for (const line of stripVTControlCharacters(envSection)
    .split("\n")
    .filter(Boolean)) {
    const separatorIndex = line.indexOf("=")
    if (separatorIndex > 0) {
      const key = line.substring(0, separatorIndex)
      const value = line.substring(separatorIndex + 1)
      env[key] = value
    }
  }
  return env
}

/**
 * Load full shell environment using interactive login shell.
 * This captures PATH, HOME, and all shell profile configurations.
 * Results are cached for the lifetime of the process.
 */
export function getClaudeShellEnvironment(): Record<string, string> {
  if (cachedShellEnv !== null) {
    return { ...cachedShellEnv }
  }

  const shell = process.env.SHELL || "/bin/zsh"
  const command = `echo -n "${DELIMITER}"; env; echo -n "${DELIMITER}"; exit`

  try {
    const output = execSync(`${shell} -ilc '${command}'`, {
      encoding: "utf8",
      timeout: 5000,
      env: {
        // Prevent Oh My Zsh from blocking with auto-update prompts
        DISABLE_AUTO_UPDATE: "true",
        // Minimal env to bootstrap the shell
        HOME: os.homedir(),
        USER: os.userInfo().username,
        SHELL: shell,
      },
    })

    const env = parseEnvOutput(output)

    // Strip keys that could interfere with Claude's auth resolution
    for (const key of STRIPPED_ENV_KEYS) {
      if (key in env) {
        console.log(`[claude-env] Stripped ${key} from shell environment`)
        delete env[key]
      }
    }

    console.log(
      `[claude-env] Loaded ${Object.keys(env).length} environment variables from shell`,
    )
    cachedShellEnv = env
    return { ...env }
  } catch (error) {
    console.error("[claude-env] Failed to load shell environment:", error)

    // Fallback: return minimal required env
    const home = os.homedir()
    const fallbackPath = [
      `${home}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].join(":")

    const fallback: Record<string, string> = {
      HOME: home,
      USER: os.userInfo().username,
      PATH: fallbackPath,
      SHELL: process.env.SHELL || "/bin/zsh",
      TERM: "xterm-256color",
    }

    console.log("[claude-env] Using fallback environment")
    cachedShellEnv = fallback
    return { ...fallback }
  }
}

/**
 * Build the complete environment for Claude SDK.
 * Merges shell environment, process.env, and custom overrides.
 */
export function buildClaudeEnv(options?: {
  ghToken?: string
  customEnv?: Record<string, string>
}): Record<string, string> {
  const env: Record<string, string> = {}

  // 1. Start with shell environment (has HOME, full PATH, etc.)
  try {
    Object.assign(env, getClaudeShellEnvironment())
  } catch (error) {
    console.error("[claude-env] Shell env failed, using process.env")
  }

  // 2. Overlay current process.env (preserves Electron-set vars)
  // BUT: Don't overwrite PATH from shell env - Electron's PATH is minimal when launched from Finder
  // AND: Skip stripped keys to prevent system AWS credentials from leaking in
  const shellPath = env.PATH
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !STRIPPED_ENV_KEYS.includes(key)) {
      env[key] = value
    }
  }
  // Restore shell PATH if we had one (it contains nvm, homebrew, etc.)
  if (shellPath) {
    env.PATH = shellPath
  }

  // 3. Ensure critical vars are present
  if (!env.HOME) env.HOME = os.homedir()
  if (!env.USER) env.USER = os.userInfo().username
  if (!env.SHELL) env.SHELL = "/bin/zsh"
  if (!env.TERM) env.TERM = "xterm-256color"

  // 4. Add custom overrides
  if (options?.ghToken) {
    env.GH_TOKEN = options.ghToken
  }
  if (options?.customEnv) {
    for (const [key, value] of Object.entries(options.customEnv)) {
      if (value === "") {
        delete env[key]
      } else {
        env[key] = value
      }
    }
  }

  // 6. Read settings once (used for both Bedrock and experimental features)
  const db = getDatabase()
  const settings = db
    .select()
    .from(claudeCodeSettings)
    .where(eq(claudeCodeSettings.id, "default"))
    .get()

  // 7. Add AWS Bedrock credentials if in AWS mode
  const awsCreds = getAwsCredentials()
  if (awsCreds) {
    env.CLAUDE_CODE_API_PROVIDER = "bedrock"
    env.CLAUDE_CODE_USE_BEDROCK = "1"
    env.AWS_REGION = awsCreds.region
    env.AWS_DEFAULT_REGION = awsCreds.region

    // Bedrock model defaults (use settings or fall back to defaults)
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = settings?.bedrockOpusModel || "global.anthropic.claude-opus-4-5-20251101-v1:0"
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = settings?.bedrockSonnetModel || "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]"
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = settings?.bedrockHaikuModel || "us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]"
    env.MAX_MCP_OUTPUT_TOKENS = String(settings?.maxMcpOutputTokens ?? 150000) // MCP tool output limit
    env.MAX_THINKING_TOKENS = String(settings?.maxThinkingTokens ?? 60000) // Thinking token limit (64k max for Bedrock)

    // Profile mode - set AWS_PROFILE for Claude SDK
    if (awsCreds.profileName) {
      env.AWS_PROFILE = awsCreds.profileName
      console.log(`[claude-env] Using AWS profile: ${awsCreds.profileName}`)
    }

    // SSO mode - set explicit credentials
    // Profile mode will use AWS SDK's default credential chain
    if (awsCreds.accessKeyId && awsCreds.secretAccessKey) {
      env.AWS_ACCESS_KEY_ID = awsCreds.accessKeyId
      env.AWS_SECRET_ACCESS_KEY = awsCreds.secretAccessKey
      if (awsCreds.sessionToken) {
        env.AWS_SESSION_TOKEN = awsCreds.sessionToken
      }
      console.log(`[claude-env] Using AWS SSO credentials (explicit)`)
    }
  }

  // 8. Handle Custom API / Ollama configuration (from customEnvVars in database)
  if (settings?.authMode === "apiKey" && settings?.customEnvVars) {
    try {
      const customEnv = JSON.parse(settings.customEnvVars)

      // Check for Ollama/Custom API config in customEnvVars
      // These are set by syncCustomConfig tRPC endpoint from frontend
      if (customEnv.ANTHROPIC_AUTH_TOKEN && customEnv.ANTHROPIC_BASE_URL) {
        env.ANTHROPIC_AUTH_TOKEN = customEnv.ANTHROPIC_AUTH_TOKEN
        env.ANTHROPIC_BASE_URL = customEnv.ANTHROPIC_BASE_URL

        // Optional API key for authentication
        if (customEnv.ANTHROPIC_API_KEY) {
          env.ANTHROPIC_API_KEY = customEnv.ANTHROPIC_API_KEY
        }

        // Ollama-specific API key for cloud access (also stored in OLLAMA_API_KEY for reference)
        if (customEnv.OLLAMA_API_KEY) {
          env.OLLAMA_API_KEY = customEnv.OLLAMA_API_KEY
        }

        // Determine if this is Ollama mode (check by baseUrl or the "ollama" marker token)
        const isOllamaMode = customEnv.ANTHROPIC_AUTH_TOKEN === "ollama" ||
                             (customEnv.ANTHROPIC_BASE_URL && customEnv.ANTHROPIC_BASE_URL.includes("ollama.com"))
        if (isOllamaMode) {
          // For Ollama Cloud, the ANTHROPIC_AUTH_TOKEN is the actual API key (not "ollama" marker)
          const isCloudMode = customEnv.ANTHROPIC_BASE_URL && !customEnv.ANTHROPIC_BASE_URL.includes("localhost")
          console.log("[claude-env] Using Ollama configuration:", {
            baseUrl: customEnv.ANTHROPIC_BASE_URL,
            mode: isCloudMode ? "cloud" : "local",
            hasOllamaApiKey: !!customEnv.OLLAMA_API_KEY,
          })
        } else {
          console.log("[claude-env] Using Custom API configuration:", {
            baseUrl: customEnv.ANTHROPIC_BASE_URL,
            hasApiKey: !!customEnv.ANTHROPIC_API_KEY,
          })
        }
      }
    } catch (error) {
      console.error("[claude-env] Failed to parse customEnvVars:", error)
    }
  }

  // 9. Agent teams - always enabled
  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"

  // 10. Mark as SDK entry
  env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts"

  return env
}

/**
 * Clear cached shell environment (useful for testing)
 */
export function clearClaudeEnvCache(): void {
  cachedShellEnv = null
}

/**
 * Debug: Log key environment variables
 */
export function logClaudeEnv(
  env: Record<string, string>,
  prefix: string = "",
): void {
  console.log(`${prefix}[claude-env] HOME: ${env.HOME}`)
  console.log(`${prefix}[claude-env] USER: ${env.USER}`)
  console.log(
    `${prefix}[claude-env] PATH includes homebrew: ${env.PATH?.includes("/opt/homebrew")}`,
  )
  console.log(
    `${prefix}[claude-env] PATH includes /usr/local/bin: ${env.PATH?.includes("/usr/local/bin")}`,
  )
  console.log(
    `${prefix}[claude-env] ANTHROPIC_AUTH_TOKEN: ${env.ANTHROPIC_AUTH_TOKEN ? "set" : "not set"}`,
  )
  console.log(
    `${prefix}[claude-env] ANTHROPIC_API_KEY: ${env.ANTHROPIC_API_KEY ? "set" : "not set"}`,
  )
  console.log(
    `${prefix}[claude-env] OLLAMA_API_KEY: ${env.OLLAMA_API_KEY ? "set" : "not set"}`,
  )
  if (env.ANTHROPIC_AUTH_TOKEN === "ollama") {
    console.log(`${prefix}[claude-env] Ollama mode detected`)
  }
  // Log token limits for Bedrock
  if (env.CLAUDE_CODE_USE_BEDROCK) {
    console.log(`${prefix}[claude-env] MAX_MCP_OUTPUT_TOKENS: ${env.MAX_MCP_OUTPUT_TOKENS || "not set"}`)
    console.log(`${prefix}[claude-env] MAX_THINKING_TOKENS: ${env.MAX_THINKING_TOKENS || "not set"}`)
  }
}
