import { createHash, randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { safeStorage, shell } from "electron"
import { z } from "zod"
import { getExistingClaudeToken } from "../../claude-token"
import { claudeCodeCredentials, claudeCodeSettings, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

// ============ ANTHROPIC OAUTH CONSTANTS ============

const ANTHROPIC_OAUTH_AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
// Token endpoint (platform.claude.com is the registered endpoint for this client)
const ANTHROPIC_OAUTH_TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
const ANTHROPIC_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const ANTHROPIC_OAUTH_SCOPES = "user:inference"
// Registered redirect URI — Anthropic redirects here after auth, showing the user a code to paste
const ANTHROPIC_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback"

// ============ IN-PROCESS SESSION STATE ============
// No local HTTP server needed — sessions are stored in-process and accessed via tRPC directly.

interface OAuthSession {
  oauthUrl: string
  codeVerifier: string
}

const activeSessions = new Map<string, OAuthSession>()

// ============ PKCE HELPERS ============

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url")
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest().toString("base64url")
}

// ============ TOKEN EXCHANGE ============

async function exchangeAnthropicCode(code: string, codeVerifier: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      client_id: ANTHROPIC_OAUTH_CLIENT_ID,
      code_verifier: codeVerifier,
    })

    const response = await fetch(ANTHROPIC_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[ClaudeCode] Token exchange failed:", errorText)
      return null
    }

    const data = await response.json() as { access_token?: string; token?: string }
    return data.access_token || data.token || null
  } catch (err) {
    console.error("[ClaudeCode] Token exchange error:", err)
    return null
  }
}

// ============ TOKEN STORAGE ============

function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[ClaudeCode] Encryption not available, storing as base64")
    return Buffer.from(token).toString("base64")
  }
  return safeStorage.encryptString(token).toString("base64")
}

function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

function storeOAuthToken(oauthToken: string) {
  const encryptedToken = encryptToken(oauthToken)
  const db = getDatabase()

  db.delete(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, "default"))
    .run()

  db.insert(claudeCodeCredentials)
    .values({
      id: "default",
      oauthToken: encryptedToken,
      connectedAt: new Date(),
      userId: null,
    })
    .run()
}

// ============ ROUTER ============

export const claudeCodeRouter = router({
  /**
   * Check if user has Claude Code connected (local check)
   */
  getIntegration: publicProcedure.query(() => {
    const db = getDatabase()

    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    const hasOAuth = !!cred?.oauthToken
    const hasAWS = settings?.authMode === "aws" &&
                   !!settings?.ssoAccessToken &&
                   !!settings?.awsAccessKeyId

    return {
      isConnected: hasOAuth || hasAWS,
      connectedAt: cred?.connectedAt?.toISOString() ?? null,
      authMode: settings?.authMode || "oauth",
    }
  }),

  /**
   * Start OAuth flow — generates PKCE params and the Anthropic authorization URL.
   *
   * The redirect URI is https://platform.claude.com/oauth/code/callback (the only
   * URI registered for this client ID). After the user approves in their browser,
   * Anthropic shows them a code on that page which they paste back via submitCode.
   *
   * Returns sandbox-compatible { sandboxId, sandboxUrl, sessionId } so the existing
   * UI polling flow works unchanged. sandboxUrl is a sentinel value; pollStatus reads
   * from in-process state instead of making an HTTP request.
   */
  startAuth: publicProcedure.mutation(() => {
    const sessionId = randomBytes(16).toString("hex")
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = randomBytes(16).toString("hex")

    const authUrl = new URL(ANTHROPIC_OAUTH_AUTHORIZE_URL)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("client_id", ANTHROPIC_OAUTH_CLIENT_ID)
    authUrl.searchParams.set("redirect_uri", ANTHROPIC_REDIRECT_URI)
    authUrl.searchParams.set("scope", ANTHROPIC_OAUTH_SCOPES)
    authUrl.searchParams.set("code_challenge", codeChallenge)
    authUrl.searchParams.set("code_challenge_method", "S256")
    authUrl.searchParams.set("state", state)

    activeSessions.set(sessionId, { oauthUrl: authUrl.toString(), codeVerifier })

    // Clean up after 15 minutes
    setTimeout(() => activeSessions.delete(sessionId), 15 * 60 * 1000)

    console.log("[ClaudeCode] OAuth session created:", sessionId)

    return {
      sandboxId: sessionId,
      sandboxUrl: "local", // sentinel — pollStatus reads from activeSessions directly
      sessionId,
    }
  }),

  /**
   * Poll for OAuth status — reads directly from in-process session state.
   * sandboxUrl is ignored; sessionId is the lookup key.
   */
  pollStatus: publicProcedure
    .input(z.object({ sandboxUrl: z.string(), sessionId: z.string() }))
    .query(({ input }) => {
      const session = activeSessions.get(input.sessionId)
      if (!session) {
        return { state: "error" as const, oauthUrl: null, error: "Session not found or expired" }
      }
      return { state: "has_url" as const, oauthUrl: session.oauthUrl, error: null }
    }),

  /**
   * Submit the OAuth code pasted by the user from platform.claude.com/oauth/code/callback.
   * Accepts either the raw code or the full callback URL (both are handled).
   */
  submitCode: publicProcedure
    .input(z.object({
      sandboxUrl: z.string(),
      sessionId: z.string(),
      code: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const session = activeSessions.get(input.sessionId)
      if (!session) {
        throw new Error("Session not found or expired. Please start the authentication process again.")
      }

      // The user may paste the full callback URL or just the code value
      let authCode = input.code.trim()
      if (authCode.startsWith("http")) {
        try {
          authCode = new URL(authCode).searchParams.get("code") || authCode
        } catch { /* use as-is */ }
      }

      const token = await exchangeAnthropicCode(authCode, session.codeVerifier)
      if (!token) {
        throw new Error("Failed to exchange authorization code. Please check the code and try again.")
      }

      storeOAuthToken(token)
      activeSessions.delete(input.sessionId)

      console.log("[ClaudeCode] Token stored locally")
      return { success: true }
    }),

  /**
   * Import an OAuth token directly (e.g. from a token string)
   */
  importToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(({ input }) => {
      storeOAuthToken(input.token.trim())
      console.log("[ClaudeCode] Token imported locally")
      return { success: true }
    }),

  /**
   * Check for an existing Claude token in system credentials (from Claude Code CLI)
   */
  getSystemToken: publicProcedure.query(() => {
    const token = getExistingClaudeToken()?.trim() ?? null
    return { token }
  }),

  /**
   * Import the Claude token from system credentials (Claude Code CLI)
   */
  importSystemToken: publicProcedure.mutation(() => {
    const token = getExistingClaudeToken()?.trim()
    if (!token) {
      throw new Error("No existing Claude token found")
    }
    storeOAuthToken(token)
    console.log("[ClaudeCode] Token imported from system")
    return { success: true }
  }),

  /**
   * Get decrypted OAuth token
   */
  getToken: publicProcedure.query(() => {
    const db = getDatabase()
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!cred?.oauthToken) {
      return { token: null, error: "Not connected" }
    }

    try {
      const token = decryptToken(cred.oauthToken)
      return { token, error: null }
    } catch (error) {
      console.error("[ClaudeCode] Decrypt error:", error)
      return { token: null, error: "Failed to decrypt token" }
    }
  }),

  /**
   * Disconnect — delete local credentials
   */
  disconnect: publicProcedure.mutation(() => {
    const db = getDatabase()
    db.delete(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .run()
    console.log("[ClaudeCode] Disconnected")
    return { success: true }
  }),

  /**
   * Open a URL in the system browser
   */
  openOAuthUrl: publicProcedure
    .input(z.string())
    .mutation(async ({ input: url }) => {
      await shell.openExternal(url)
      return { success: true }
    }),
})
