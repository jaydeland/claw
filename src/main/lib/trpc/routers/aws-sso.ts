import { z } from "zod"
import { shell, clipboard } from "electron"
import { eq } from "drizzle-orm"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeSettings } from "../../db"
import { AwsSsoService, decrypt } from "../../aws/sso-service"
import { lookup } from "dns"
import { promisify } from "util"
import * as https from "https"
import * as http from "http"
import { URL } from "url"
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock"

const dnsLookup = promisify(lookup)

// Cache for Bedrock models (5 minutes)
let bedrockModelsCache: { models: Array<{ modelId: string; name: string; supportedStreamingModes: string[] }>; expiresAt: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Bedrock model token limits
// Based on AWS Bedrock testing: "exceeds the model limit of 64000" error
// The SDK appears to validate that budget_tokens + some overhead < 64k hard limit
// Conservative values to ensure: thinking + MCP output + overhead < 64k
const BEDROCK_MODEL_LIMITS: Record<string, { maxThinking: number; maxMcpOutput: number }> = {
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]": { maxThinking: 32000, maxMcpOutput: 30000 },
  "global.anthropic.claude-opus-4-5-20251101-v1:0": { maxThinking: 32000, maxMcpOutput: 150000 },
  "global.anthropic.claude-opus-4-6-20260205-v1:0": { maxThinking: 32000, maxMcpOutput: 150000 },
  "us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]": { maxThinking: 32000, maxMcpOutput: 30000 },
}

// Cached service instance
let ssoService: AwsSsoService | null = null

function getSsoService(region: string): AwsSsoService {
  if (!ssoService || ssoService.getRegion() !== region) {
    ssoService = new AwsSsoService(region)
  }
  return ssoService
}

export const awsSsoRouter = router({
  /**
   * Start SSO device authorization flow
   * This is the correct flow for AWS SSO - user gets a code to enter in browser
   */
  startDeviceAuth: publicProcedure
    .input(
      z.object({
        ssoStartUrl: z.string().url(),
        ssoRegion: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const service = getSsoService(input.ssoRegion)
      const db = getDatabase()

      // Get or register OIDC client
      let settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      let clientId = settings?.ssoClientId
      let clientSecret = settings?.ssoClientSecret
      let clientExpiresAt = settings?.ssoClientExpiresAt

      // Register new client if needed
      const now = new Date()
      if (!clientId || !clientSecret || !clientExpiresAt || clientExpiresAt < now) {
        console.log("[aws-sso] Registering new OIDC client")
        const registration = await service.registerClient()
        clientId = registration.clientId
        clientSecret = registration.clientSecret
        clientExpiresAt = registration.expiresAt

        // Save client registration
        if (settings) {
          db.update(claudeCodeSettings)
            .set({
              ssoClientId: clientId,
              ssoClientSecret: clientSecret,
              ssoClientExpiresAt: clientExpiresAt,
              ssoStartUrl: input.ssoStartUrl,
              ssoRegion: input.ssoRegion,
              updatedAt: new Date(),
            })
            .where(eq(claudeCodeSettings.id, "default"))
            .run()
        } else {
          db.insert(claudeCodeSettings)
            .values({
              id: "default",
              customEnvVars: "{}",
              mcpServerSettings: "{}",
              authMode: "aws",
              bedrockRegion: "us-east-1",
              ssoClientId: clientId,
              ssoClientSecret: clientSecret,
              ssoClientExpiresAt: clientExpiresAt,
              ssoStartUrl: input.ssoStartUrl,
              ssoRegion: input.ssoRegion,
            })
            .run()
        }
      }

      // Start device authorization
      const deviceAuth = await service.startDeviceAuthorization(
        clientId,
        clientSecret,
        input.ssoStartUrl
      )

      // Auto-copy code to clipboard for better UX
      try {
        clipboard.writeText(deviceAuth.userCode)
        console.log("[aws-sso] User code copied to clipboard:", deviceAuth.userCode)
      } catch (err) {
        console.warn("[aws-sso] Failed to copy to clipboard:", err)
      }

      // Auto-open browser with verification URL
      const urlToOpen = deviceAuth.verificationUriComplete || deviceAuth.verificationUri
      try {
        shell.openExternal(urlToOpen)
        console.log("[aws-sso] Opened verification URL:", urlToOpen)
      } catch (err) {
        console.warn("[aws-sso] Failed to open browser:", err)
      }

      return {
        deviceCode: deviceAuth.deviceCode,
        userCode: deviceAuth.userCode,
        verificationUri: deviceAuth.verificationUri,
        verificationUriComplete: deviceAuth.verificationUriComplete,
        expiresIn: deviceAuth.expiresIn,
        interval: deviceAuth.interval,
        codeCopied: true,
        browserOpened: true,
      }
    }),

  /**
   * Open SSO verification URL in browser
   */
  openVerificationUrl: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(({ input }) => {
      shell.openExternal(input.url)
      return { opened: true }
    }),

  /**
   * Poll for device auth completion
   */
  pollDeviceAuth: publicProcedure
    .input(z.object({ deviceCode: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (!settings?.ssoClientId || !settings?.ssoClientSecret || !settings?.ssoRegion) {
        throw new Error("SSO client not registered")
      }

      const service = getSsoService(settings.ssoRegion)

      try {
        const token = await service.createToken(
          settings.ssoClientId,
          settings.ssoClientSecret,
          input.deviceCode
        )

        if (!token) {
          return { status: "pending" as const }
        }

        // Save tokens
        db.update(claudeCodeSettings)
          .set({
            ssoAccessToken: token.accessToken,
            ssoRefreshToken: token.refreshToken || null,
            ssoTokenExpiresAt: token.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()

        return { status: "success" as const, expiresAt: token.expiresAt.toISOString() }
      } catch (error: any) {
        if (error.name === "ExpiredTokenException") {
          return { status: "expired" as const }
        }
        if (error.name === "AccessDeniedException") {
          return { status: "denied" as const }
        }
        throw error
      }
    }),

  /**
   * List AWS accounts available to authenticated user
   */
  listAccounts: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
      return { accounts: [], error: "Not authenticated" }
    }

    // Check if token is expired
    if (settings.ssoTokenExpiresAt && settings.ssoTokenExpiresAt < new Date()) {
      return { accounts: [], error: "Token expired" }
    }

    try {
      const service = getSsoService(settings.ssoRegion)
      const accounts = await service.listAccounts(settings.ssoAccessToken)
      return { accounts }
    } catch (error: any) {
      console.error("[aws-sso] Failed to list accounts:", error)
      return { accounts: [], error: error.message }
    }
  }),

  /**
   * List roles for a specific account
   */
  listRoles: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
        return { roles: [], error: "Not authenticated" }
      }

      try {
        const service = getSsoService(settings.ssoRegion)
        const roles = await service.listAccountRoles(settings.ssoAccessToken, input.accountId)
        return { roles }
      } catch (error: any) {
        console.error("[aws-sso] Failed to list roles:", error)
        return { roles: [], error: error.message }
      }
    }),

  /**
   * Select account and role, then fetch credentials
   */
  selectProfile: publicProcedure
    .input(
      z.object({
        accountId: z.string(),
        accountName: z.string(),
        roleName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
        throw new Error("Not authenticated")
      }

      const service = getSsoService(settings.ssoRegion)

      // Get role credentials
      const credentials = await service.getRoleCredentials(
        settings.ssoAccessToken,
        input.accountId,
        input.roleName
      )

      // Save selection and credentials
      db.update(claudeCodeSettings)
        .set({
          ssoAccountId: input.accountId,
          ssoAccountName: input.accountName,
          ssoRoleName: input.roleName,
          awsAccessKeyId: credentials.accessKeyId,
          awsSecretAccessKey: credentials.secretAccessKey,
          awsSessionToken: credentials.sessionToken,
          awsCredentialsExpiresAt: credentials.expiration,
          bedrockConnectionMethod: "sso", // Ensure SSO mode is active
          updatedAt: new Date(),
        })
        .where(eq(claudeCodeSettings.id, "default"))
        .run()

      // Validate credentials immediately (decrypt first since getRoleCredentials returns encrypted values)
      try {
        const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts")
        const stsClient = new STSClient({
          region: settings.ssoRegion || "us-east-1",
          credentials: {
            accessKeyId: decrypt(credentials.accessKeyId),
            secretAccessKey: decrypt(credentials.secretAccessKey),
            sessionToken: decrypt(credentials.sessionToken),
          },
        })
        await stsClient.send(new GetCallerIdentityCommand({}))
        console.log("[aws-sso] Credentials validated successfully")
      } catch (validationError: any) {
        console.error("[aws-sso] Credential validation failed:", validationError)
        throw new Error(`Credentials saved but validation failed: ${validationError.message}`)
      }

      // Auto-configure token limits for the selected Bedrock model
      const sonnetModel = settings.bedrockSonnetModel || "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]"
      const limits = BEDROCK_MODEL_LIMITS[sonnetModel]

      let tokenLimitsConfigured = false
      if (limits) {
        console.log(`[aws-sso] Auto-configuring token limits for ${sonnetModel}: thinking=${limits.maxThinking} mcp=${limits.maxMcpOutput}`)

        db.update(claudeCodeSettings)
          .set({
            maxThinkingTokens: limits.maxThinking,
            maxMcpOutputTokens: limits.maxMcpOutput,
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()

        tokenLimitsConfigured = true
      } else {
        console.warn(`[aws-sso] No token limits found for model ${sonnetModel}, using existing settings`)
      }

      return {
        success: true,
        expiresAt: credentials.expiration.toISOString(),
        tokenLimitsConfigured,
        limits: limits ? {
          maxThinking: limits.maxThinking,
          maxMcpOutput: limits.maxMcpOutput,
        } : undefined,
      }
    }),

  /**
   * Validate SSO credentials using STS GetCallerIdentity
   */
  validateSsoCredentials: publicProcedure.mutation(async () => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings?.awsAccessKeyId || !settings?.awsSecretAccessKey) {
      throw new Error("No AWS credentials configured")
    }

    // Check expiration
    if (settings.awsCredentialsExpiresAt && settings.awsCredentialsExpiresAt < new Date()) {
      throw new Error("AWS credentials expired")
    }

    try {
      // Decrypt credentials
      const credentials = {
        accessKeyId: decrypt(settings.awsAccessKeyId),
        secretAccessKey: decrypt(settings.awsSecretAccessKey),
        sessionToken: settings.awsSessionToken ? decrypt(settings.awsSessionToken) : undefined,
      }

      // Test with STS GetCallerIdentity
      const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts")
      const stsClient = new STSClient({
        region: settings.ssoRegion || "us-east-1",
        credentials,
      })

      const result = await stsClient.send(new GetCallerIdentityCommand({}))

      return {
        valid: true,
        accountId: result.Account,
        userId: result.UserId,
        arn: result.Arn,
      }
    } catch (error: any) {
      console.error("[aws-sso] Credential validation failed:", error)
      return {
        valid: false,
        error: error.message || "Failed to validate credentials",
      }
    }
  }),

  /**
   * Get current SSO status
   */
  getStatus: publicProcedure.query(() => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings) {
      return {
        configured: false,
        authenticated: false,
        hasCredentials: false,
        authMode: "oauth" as const,
      }
    }

    const now = new Date()
    const tokenValid = settings.ssoTokenExpiresAt && settings.ssoTokenExpiresAt > now
    const credsValid = settings.awsCredentialsExpiresAt && settings.awsCredentialsExpiresAt > now

    return {
      configured: !!settings.ssoStartUrl && !!settings.ssoRegion,
      authenticated: !!settings.ssoAccessToken && tokenValid,
      hasCredentials: !!settings.awsAccessKeyId && credsValid,
      authMode: settings.authMode as "oauth" | "aws" | "apiKey",
      ssoStartUrl: settings.ssoStartUrl,
      ssoRegion: settings.ssoRegion,
      accountId: settings.ssoAccountId,
      accountName: settings.ssoAccountName,
      roleName: settings.ssoRoleName,
      tokenExpiresAt: settings.ssoTokenExpiresAt?.toISOString(),
      credentialsExpiresAt: settings.awsCredentialsExpiresAt?.toISOString(),
    }
  }),

  /**
   * Refresh AWS credentials using stored SSO token
   */
  refreshCredentials: publicProcedure.mutation(async () => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings?.ssoAccessToken || !settings?.ssoRegion) {
      throw new Error("Not authenticated")
    }

    if (!settings.ssoAccountId || !settings.ssoRoleName) {
      throw new Error("No account/role selected")
    }

    const service = getSsoService(settings.ssoRegion)

    // Check if SSO token needs refresh
    const now = new Date()
    let accessToken = settings.ssoAccessToken

    if (settings.ssoTokenExpiresAt && settings.ssoTokenExpiresAt < now) {
      if (!settings.ssoRefreshToken || !settings.ssoClientId || !settings.ssoClientSecret) {
        throw new Error("SSO session expired, please re-authenticate")
      }

      // Refresh SSO token
      const newToken = await service.refreshToken(
        settings.ssoClientId,
        settings.ssoClientSecret,
        settings.ssoRefreshToken
      )

      accessToken = newToken.accessToken

      db.update(claudeCodeSettings)
        .set({
          ssoAccessToken: newToken.accessToken,
          ssoRefreshToken: newToken.refreshToken || settings.ssoRefreshToken,
          ssoTokenExpiresAt: newToken.expiresAt,
        })
        .where(eq(claudeCodeSettings.id, "default"))
        .run()
    }

    // Get new role credentials
    const credentials = await service.getRoleCredentials(
      accessToken,
      settings.ssoAccountId,
      settings.ssoRoleName
    )

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

    return {
      success: true,
      expiresAt: credentials.expiration.toISOString(),
    }
  }),

  /**
   * Logout from SSO
   */
  logout: publicProcedure.mutation(() => {
    const db = getDatabase()

    db.update(claudeCodeSettings)
      .set({
        ssoAccessToken: null,
        ssoRefreshToken: null,
        ssoTokenExpiresAt: null,
        ssoAccountId: null,
        ssoAccountName: null,
        ssoRoleName: null,
        awsAccessKeyId: null,
        awsSecretAccessKey: null,
        awsSessionToken: null,
        awsCredentialsExpiresAt: null,
        bedrockConnectionMethod: "profile", // Reset to profile mode
        updatedAt: new Date(),
      })
      .where(eq(claudeCodeSettings.id, "default"))
      .run()

    return { success: true }
  }),

  /**
   * Check VPN connectivity status
   * Checks connectivity to AWS internal resources (SSO endpoint)
   */
  checkVpnStatus: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    // If VPN check is disabled, skip check
    if (!settings?.vpnCheckEnabled) {
      return {
        enabled: false,
        connected: false,
        lastChecked: new Date().toISOString(),
      }
    }

    // Determine what to check
    const checkUrl = settings.vpnCheckUrl?.trim()

    // If user provided a custom URL, check that
    if (checkUrl) {
      try {
        // Parse URL
        const parsedUrl = new URL(checkUrl)
        const isHttps = parsedUrl.protocol === "https:"
        const requestModule = isHttps ? https : http

        // Try HTTP HEAD request with timeout and accept self-signed certs
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Request timeout"))
          }, 3000)

          const options = {
            method: "HEAD",
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            // Accept self-signed certificates for internal URLs
            rejectUnauthorized: false,
          }

          const req = requestModule.request(options, (res) => {
            clearTimeout(timeoutId)
            // Any response means we reached the server
            console.log("[vpn-check] Custom URL check succeeded:", checkUrl, res.statusCode)
            resolve()
          })

          req.on("error", (error) => {
            clearTimeout(timeoutId)
            reject(error)
          })

          req.end()
        })

        return {
          enabled: true,
          connected: true,
          lastChecked: new Date().toISOString(),
        }
      } catch (error: any) {
        // Connection failed - VPN likely disconnected
        console.log("[vpn-check] Custom URL check failed:", checkUrl, error.message)
        return {
          enabled: true,
          connected: false,
          lastChecked: new Date().toISOString(),
        }
      }
    }

    // Fallback: Use AWS SSO endpoint for VPN check (if no custom URL)
    const ssoRegion = settings.ssoRegion || "us-east-1"
    const hostname = `oidc.${ssoRegion}.amazonaws.com`

    // Try DNS lookup with short timeout
    try {
      const lookupPromise = dnsLookup(hostname)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DNS lookup timeout")), 3000)
      )

      await Promise.race([lookupPromise, timeoutPromise])

      // DNS resolved successfully
      return {
        enabled: true,
        connected: true,
        lastChecked: new Date().toISOString(),
      }
    } catch (error: any) {
      // DNS lookup failed or timeout
      console.log("[vpn-check] DNS lookup failed:", error.message)
      return {
        enabled: true,
        connected: false,
        lastChecked: new Date().toISOString(),
      }
    }
  }),

  /**
   * Update VPN check enabled setting
   */
  updateVpnCheckEnabled: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      const db = getDatabase()

      // Get or create settings
      let settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (settings) {
        db.update(claudeCodeSettings)
          .set({
            vpnCheckEnabled: input.enabled,
            updatedAt: new Date(),
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()
      } else {
        db.insert(claudeCodeSettings)
          .values({
            id: "default",
            customEnvVars: "{}",
            mcpServerSettings: "{}",
            authMode: "oauth",
            bedrockRegion: "us-east-1",
            vpnCheckEnabled: input.enabled,
          })
          .run()
      }

      return { success: true }
    }),

  /**
   * List available Anthropic models from AWS Bedrock
   * Uses ListFoundationModels API to get models available in the user's region
   */
  listAvailableModels: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings?.bedrockRegion) {
      return { models: [], error: "Bedrock region not configured" }
    }

    // Check cache first
    if (bedrockModelsCache && Date.now() < bedrockModelsCache.expiresAt) {
      console.log("[bedrock] Returning cached models:", bedrockModelsCache.models.length)
      return { models: bedrockModelsCache.models }
    }

    // Get credentials - either from SSO or from profile
    let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

    if (settings.bedrockConnectionMethod === "sso") {
      // Decrypt SSO credentials
      if (!settings.awsAccessKeyId || !settings.awsSecretAccessKey) {
        return { models: [], error: "AWS credentials not configured" }
      }
      credentials = {
        accessKeyId: decrypt(settings.awsAccessKeyId),
        secretAccessKey: decrypt(settings.awsSecretAccessKey),
        sessionToken: settings.awsSessionToken ? decrypt(settings.awsSessionToken) : undefined,
      }
    } else {
      // Load from AWS profile
      try {
        const { fromIni } = await import("@aws-sdk/credential-provider-ini")
        const credentialProvider = fromIni({ profile: settings.awsProfileName || "default" })
        const creds = await credentialProvider()
        credentials = {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        }
      } catch (error: any) {
        console.error("[bedrock] Failed to load AWS profile credentials:", error)
        return { models: [], error: `Failed to load AWS profile: ${error.message}` }
      }
    }

    try {
      const client = new BedrockClient({
        region: settings.bedrockRegion,
        credentials,
      })

      const command = new ListFoundationModelsCommand({
        provider: "anthropic",
      })

      const response = await client.send(command)

      const models = (response.modelSummaries || [])
        .filter((m) => m.modelId?.includes("claude"))
        .map((m) => ({
          modelId: m.modelId || "",
          name: m.modelName || m.modelId?.split(".").pop() || "Unknown",
          supportedStreamingModes: m.supportedStreamingModes || [],
        }))
        .sort((a, b) => {
          // Sort by model tier: Opus > Sonnet > Haiku
          const tierOrder = (id: string) => {
            if (id.includes("opus")) return 0
            if (id.includes("sonnet")) return 1
            if (id.includes("haiku")) return 2
            return 3
          }
          return tierOrder(a.modelId) - tierOrder(b.modelId)
        })

      // Update cache
      bedrockModelsCache = {
        models,
        expiresAt: Date.now() + CACHE_TTL_MS,
      }

      console.log("[bedrock] Found available models:", models.length)
      return { models }
    } catch (error: any) {
      console.error("[bedrock] Failed to list models:", error)
      return { models: [], error: error.message || "Failed to fetch available models" }
    }
  }),

  /**
   * Clear the cached Bedrock models (force refresh)
   */
  clearModelsCache: publicProcedure.mutation(() => {
    bedrockModelsCache = null
    return { success: true }
  }),
})
