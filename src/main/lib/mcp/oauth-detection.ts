import type { McpServerConfig } from "../config/types"

/**
 * OAuth configuration for an MCP server
 */
export interface OAuthConfig {
  type: "oauth" | "api_key"
  /** Known OAuth authorization URL (if available) */
  authUrl?: string
  /** Pattern to match for OAuth callback URL */
  callbackPattern?: string
  /** Provider name for display */
  providerName?: string
  /** Environment variables that need to be configured */
  requiredFields: string[]
}

/**
 * Known OAuth providers and their configurations
 */
const KNOWN_OAUTH_PROVIDERS: Record<
  string,
  Omit<OAuthConfig, "type" | "requiredFields">
> = {
  atlassian: {
    providerName: "Atlassian",
    authUrl: "https://auth.atlassian.com/authorize",
    callbackPattern: "localhost.*callback|atlassian.*callback",
  },
  jira: {
    providerName: "Atlassian (Jira)",
    authUrl: "https://auth.atlassian.com/authorize",
    callbackPattern: "localhost.*callback|atlassian.*callback",
  },
  confluence: {
    providerName: "Atlassian (Confluence)",
    authUrl: "https://auth.atlassian.com/authorize",
    callbackPattern: "localhost.*callback|atlassian.*callback",
  },
  datadog: {
    providerName: "Datadog",
    authUrl: "https://app.datadoghq.com/oauth2/v1/authorize",
    callbackPattern: "localhost.*callback|datadog.*callback",
  },
  github: {
    providerName: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    callbackPattern: "localhost.*callback|github.*callback",
  },
  gitlab: {
    providerName: "GitLab",
    authUrl: "https://gitlab.com/oauth/authorize",
    callbackPattern: "localhost.*callback|gitlab.*callback",
  },
  slack: {
    providerName: "Slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    callbackPattern: "localhost.*callback|slack.*callback",
  },
  google: {
    providerName: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    callbackPattern: "localhost.*callback|google.*callback",
  },
  microsoft: {
    providerName: "Microsoft",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    callbackPattern: "localhost.*callback|microsoft.*callback",
  },
  azure: {
    providerName: "Microsoft Azure",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    callbackPattern: "localhost.*callback|microsoft.*callback",
  },
  linear: {
    providerName: "Linear",
    authUrl: "https://linear.app/oauth/authorize",
    callbackPattern: "localhost.*callback|linear.*callback",
  },
  notion: {
    providerName: "Notion",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    callbackPattern: "localhost.*callback|notion.*callback",
  },
  figma: {
    providerName: "Figma",
    authUrl: "https://www.figma.com/oauth",
    callbackPattern: "localhost.*callback|figma.*callback",
  },
  dropbox: {
    providerName: "Dropbox",
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    callbackPattern: "localhost.*callback|dropbox.*callback",
  },
  spotify: {
    providerName: "Spotify",
    authUrl: "https://accounts.spotify.com/authorize",
    callbackPattern: "localhost.*callback|spotify.*callback",
  },
}

/**
 * Environment variable patterns that indicate OAuth authentication
 */
const OAUTH_ENV_VAR_PATTERNS = [
  /OAUTH/i,
  /CLIENT_ID/i,
  /CLIENT_SECRET/i,
  /REDIRECT_URI/i,
  /AUTH_URL/i,
  /AUTHORIZATION_URL/i,
  /TOKEN_URL/i,
  /REFRESH_TOKEN/i,
  /ACCESS_TOKEN/i,
]

/**
 * Detect authentication type for an MCP server
 * Returns OAuth config if OAuth is detected, otherwise API key config
 */
export function detectAuthType(
  serverId: string,
  config: McpServerConfig
): OAuthConfig {
  const envVars = Object.keys(config.env || {})
  const serverIdLower = serverId.toLowerCase()

  // Check if this matches a known OAuth provider
  for (const [provider, providerConfig] of Object.entries(KNOWN_OAUTH_PROVIDERS)) {
    if (
      serverIdLower.includes(provider) ||
      config.command?.toLowerCase().includes(provider)
    ) {
      return {
        type: "oauth",
        ...providerConfig,
        requiredFields: envVars,
      }
    }
  }

  // Check for OAuth-like environment variables
  const hasOAuthIndicators = envVars.some((varName) =>
    OAUTH_ENV_VAR_PATTERNS.some((pattern) => pattern.test(varName))
  )

  if (hasOAuthIndicators) {
    // Try to detect provider from env var names or values
    let detectedProvider: string | undefined
    const envEntries = Object.entries(config.env || {})

    for (const [key, value] of envEntries) {
      const combined = `${key} ${value || ""}`.toLowerCase()
      for (const provider of Object.keys(KNOWN_OAUTH_PROVIDERS)) {
        if (combined.includes(provider)) {
          detectedProvider = provider
          break
        }
      }
      if (detectedProvider) break
    }

    const providerConfig = detectedProvider
      ? KNOWN_OAUTH_PROVIDERS[detectedProvider]
      : undefined

    return {
      type: "oauth",
      providerName: providerConfig?.providerName || "OAuth Provider",
      authUrl: providerConfig?.authUrl,
      callbackPattern: providerConfig?.callbackPattern || "localhost.*callback",
      requiredFields: envVars,
    }
  }

  // Default to API key authentication
  return {
    type: "api_key",
    requiredFields: envVars,
  }
}

/**
 * Build OAuth authorization URL with required parameters
 */
export function buildOAuthUrl(
  baseUrl: string,
  params: {
    clientId: string
    redirectUri: string
    scope?: string
    state?: string
    responseType?: string
  }
): string {
  const url = new URL(baseUrl)
  url.searchParams.set("client_id", params.clientId)
  url.searchParams.set("redirect_uri", params.redirectUri)
  url.searchParams.set("response_type", params.responseType || "code")

  if (params.scope) {
    url.searchParams.set("scope", params.scope)
  }
  if (params.state) {
    url.searchParams.set("state", params.state)
  }

  return url.toString()
}
