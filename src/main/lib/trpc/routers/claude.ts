import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { app, BrowserWindow, safeStorage } from "electron"
import * as fs from "fs/promises"
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, statSync, appendFileSync, readdirSync } from "fs"
import * as os from "os"
import path, { dirname, join } from "path"
import { z } from "zod"
import {
  buildClaudeEnv,
  createTransformer,
  getBundledClaudeBinaryPath,
  logClaudeEnv,
  logRawClaudeMessage,
  ensureValidAwsCredentials,
  type UIMessageChunk,
} from "../../claude"
import {
  backgroundTasks,
  chats,
  claudeCodeCredentials,
  claudeCodeSettings,
  getDatabase,
  subChats,
} from "../../db"
import { createRollbackStash } from "../../git/stash"
import { publicProcedure, router } from "../index"
import { buildAgentsOption } from "./agent-utils"
import { getMergedMcpConfig } from "../../config/consolidator"
import { taskEvents, taskWatcher } from "../../background-tasks"
import { injectAllStoredCredentials } from "../../mcp/credential-injection"
import { getBundledGsdPath } from "./gsd"

// Store active Query objects for MCP server runtime control and file checkpointing
// Map: subChatId -> Query object (stream from SDK)
const activeQueries = new Map<string, AsyncIterable<any>>()

// Track session IDs that failed with "No conversation found" errors
// Prevents repeated resume attempts for expired/invalid sessions
const brokenSessionIds = new Set<string>()

/**
 * Parse @[agent:name], @[skill:name], and @[tool:name] mentions from prompt text
 * Returns the cleaned prompt and lists of mentioned agents/skills/tools
 */
function parseMentions(prompt: string): {
  cleanedPrompt: string
  agentMentions: string[]
  skillMentions: string[]
  fileMentions: string[]
  folderMentions: string[]
  toolMentions: string[]
} {
  const agentMentions: string[] = []
  const skillMentions: string[] = []
  const fileMentions: string[] = []
  const folderMentions: string[] = []
  const toolMentions: string[] = []

  // Match @[prefix:name] pattern
  const mentionRegex = /@\[(file|folder|skill|agent|tool):([^\]]+)\]/g
  let match

  while ((match = mentionRegex.exec(prompt)) !== null) {
    const [, type, name] = match
    switch (type) {
      case "agent":
        agentMentions.push(name)
        break
      case "skill":
        skillMentions.push(name)
        break
      case "file":
        fileMentions.push(name)
        break
      case "folder":
        folderMentions.push(name)
        break
      case "tool":
        // Validate tool name format: only alphanumeric, underscore, hyphen allowed
        // This prevents prompt injection via malicious tool names
        if (/^[a-zA-Z0-9_-]+$/.test(name)) {
          toolMentions.push(name)
        }
        break
    }
  }

  // Clean agent/skill/tool mentions from prompt (they will be added as context or hints)
  // Keep file/folder mentions as they are useful context
  let cleanedPrompt = prompt
    .replace(/@\[agent:[^\]]+\]/g, "")
    .replace(/@\[skill:[^\]]+\]/g, "")
    .replace(/@\[tool:[^\]]+\]/g, "")
    .trim()

  // Add tool usage hints if tools were mentioned
  // Tool names are already validated to contain only safe characters
  if (toolMentions.length > 0) {
    const toolHints = toolMentions
      .map((t) => `Use the ${t} tool for this request.`)
      .join(" ")
    cleanedPrompt = `${toolHints}\n\n${cleanedPrompt}`
  }

  return { cleanedPrompt, agentMentions, skillMentions, fileMentions, folderMentions, toolMentions }
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Get Claude Code OAuth token from local SQLite
 * Returns null if not connected
 */
function getClaudeCodeToken(): string | null {
  try {
    const db = getDatabase()
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!cred?.oauthToken) {
      console.log("[claude] No Claude Code credentials found")
      return null
    }

    return decryptToken(cred.oauthToken)
  } catch (error) {
    console.error("[claude] Error getting Claude Code token:", error)
    return null
  }
}

// Dynamic import for ESM module - CACHED to avoid re-importing on every message
let cachedClaudeQuery: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null
const getClaudeQuery = async () => {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery
  }
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeQuery = sdk.query
  return cachedClaudeQuery
}

// Active sessions for cancellation (onAbort handles stash + abort + restore)
// Active sessions for cancellation
const activeSessions = new Map<string, AbortController>()

// Cache for symlinks (track which subChatIds have already set up symlinks)
const symlinksCreated = new Set<string>()

// Cache for MCP server statuses (to filter out failed/needs-auth servers)
// Maps project path -> server name -> status
const mcpServerStatusCache = new Map<string, Map<string, string>>()

// Cache for MCP tools from Claude session init message
// Maps project path -> { servers: [{name, status, tools}], allTools: [...], cachedAt }
interface McpServerWithTools {
  name: string
  status: string
  tools: Array<{
    name: string
    description?: string
    inputSchema?: {
      type: string
      properties?: Record<string, unknown>
      required?: string[]
      [key: string]: unknown
    }
  }>
}

interface McpToolsCacheEntry {
  servers: McpServerWithTools[]
  allTools: string[] // All tool names for quick lookup
  cachedAt: number
}

const mcpToolsCache = new Map<string, McpToolsCacheEntry>()
const MCP_TOOLS_TTL = 10 * 60 * 1000 // 10 minutes (tools change less frequently than status)

/**
 * Get cached MCP tools for a project path
 * Returns null if cache is empty or expired
 */
export function getCachedMcpTools(projectPath: string): McpToolsCacheEntry | null {
  const cached = mcpToolsCache.get(projectPath)
  if (!cached) return null

  // Check if expired
  if (Date.now() - cached.cachedAt > MCP_TOOLS_TTL) {
    mcpToolsCache.delete(projectPath)
    return null
  }

  return cached
}

// Disk cache types and configuration for MCP server statuses
interface CachedMcpStatus {
  status: string
  cachedAt: number
}

interface McpCacheData {
  version: number
  entries: Record<string, {
    servers: Record<string, CachedMcpStatus>
    updatedAt: number
  }>
}

const MCP_STATUS_TTL = 5 * 60 * 1000 // 5 minutes
const MCP_CACHE_PATH = join(app.getPath("userData"), "cache", "mcp-status.json")
let diskCacheLastLoadTime = 0 // Track when disk cache was last loaded

const pendingToolApprovals = new Map<
  string,
  {
    subChatId: string
    resolve: (decision: {
      approved: boolean
      message?: string
      updatedInput?: unknown
    }) => void
  }
>()

const PLAN_MODE_BLOCKED_TOOLS = new Set([
  "Bash",
  "NotebookEdit",
])

const clearPendingApprovals = (message: string, subChatId?: string) => {
  for (const [toolUseId, pending] of pendingToolApprovals) {
    if (subChatId && pending.subChatId !== subChatId) continue
    pending.resolve({ approved: false, message })
    pendingToolApprovals.delete(toolUseId)
  }
}

// Image attachment schema
const imageAttachmentSchema = z.object({
  base64Data: z.string(),
  mediaType: z.string(), // e.g. "image/png", "image/jpeg"
  filename: z.string().optional(),
})

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>

/**
 * Load MCP status cache from disk
 * Reloads if cache was updated on disk since last load (for concurrent requests)
 */
function loadMcpStatusFromDisk(): void {
  try {
    if (!existsSync(MCP_CACHE_PATH)) {
      diskCacheLastLoadTime = Date.now()
      return
    }

    // Check if file was modified since last load (handles concurrent requests)
    const stats = statSync(MCP_CACHE_PATH)
    const fileModTime = stats.mtimeMs

    if (diskCacheLastLoadTime > 0 && fileModTime <= diskCacheLastLoadTime) {
      // File hasn't changed since last load, skip
      return
    }

    const data: McpCacheData = JSON.parse(readFileSync(MCP_CACHE_PATH, "utf-8"))

    if (data.version !== 1) {
      console.warn(`[MCP Cache] Unknown version ${data.version}, ignoring`)
      diskCacheLastLoadTime = Date.now()
      return
    }

    const now = Date.now()
    let loadedCount = 0
    let expiredCount = 0

    for (const [projectPath, entry] of Object.entries(data.entries)) {
      const serverMap = new Map<string, string>()

      for (const [serverName, cached] of Object.entries(entry.servers)) {
        if (now - cached.cachedAt < MCP_STATUS_TTL) {
          serverMap.set(serverName, cached.status)
          loadedCount++
        } else {
          expiredCount++
        }
      }

      if (serverMap.size > 0) {
        mcpServerStatusCache.set(projectPath, serverMap)
      }
    }

    diskCacheLastLoadTime = Date.now()
    if (loadedCount > 0) {
      console.log(`[MCP Cache] Loaded ${loadedCount} cached server statuses`)
    }
  } catch (error) {
    console.warn("[MCP Cache] Failed to load from disk:", error)
    diskCacheLastLoadTime = Date.now()
    try {
      if (existsSync(MCP_CACHE_PATH)) {
        unlinkSync(MCP_CACHE_PATH)
      }
    } catch {}
  }
}

/**
 * Save MCP status cache to disk (write-through)
 */
function saveMcpStatusToDisk(): void {
  try {
    const cacheDir = dirname(MCP_CACHE_PATH)
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }

    const data: McpCacheData = {
      version: 1,
      entries: Object.fromEntries(
        Array.from(mcpServerStatusCache.entries()).map(([projectPath, serverMap]) => [
          projectPath,
          {
            servers: Object.fromEntries(
              Array.from(serverMap.entries()).map(([name, status]) => [
                name,
                { status, cachedAt: Date.now() }
              ])
            ),
            updatedAt: Date.now()
          }
        ])
      )
    }

    const tempPath = MCP_CACHE_PATH + ".tmp"
    writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8")
    renameSync(tempPath, MCP_CACHE_PATH)

    const totalServers = Array.from(mcpServerStatusCache.values())
      .reduce((sum, map) => sum + map.size, 0)
    console.log(`[MCP Cache] Saved ${totalServers} statuses to disk`)
  } catch (error) {
    console.error("[MCP Cache] Failed to save to disk:", error)
  }
}

/**
 * Clear all performance caches (for testing/debugging)
 */
export function clearClaudeCaches() {
  cachedClaudeQuery = null
  symlinksCreated.clear()
  mcpServerStatusCache.clear()
  mcpToolsCache.clear()
  diskCacheLastLoadTime = 0

  // Clear disk cache
  try {
    if (existsSync(MCP_CACHE_PATH)) {
      unlinkSync(MCP_CACHE_PATH)
      console.log("[MCP Cache] Cleared disk cache")
    }
  } catch (error) {
    console.error("[MCP Cache] Failed to clear disk cache:", error)
  }

  console.log("[claude] All caches cleared")
}

/**
 * Warm up MCP server cache by initializing servers for all configured projects
 * This runs once at app startup to populate the cache, so all future sessions
 * can use filtered MCP servers without delays
 */
export async function warmupMcpCache(): Promise<void> {
  try {
    const warmupStart = Date.now()

    // Read ~/.claude.json to get all projects with MCP servers
    const claudeJsonPath = join(os.homedir(), ".claude.json")
    let config: any
    try {
      const configContent = readFileSync(claudeJsonPath, "utf-8")
      config = JSON.parse(configContent)
    } catch (err) {
      console.log("[MCP Warmup] No ~/.claude.json found or failed to read - skipping warmup")
      return
    }

    if (!config.projects || Object.keys(config.projects).length === 0) {
      console.log("[MCP Warmup] No projects configured - skipping warmup")
      return
    }

    // Find projects with MCP servers using consolidator (same source as queries)
    // This ensures warmup cache matches what queries will actually use
    const projectsWithMcp: Array<{ path: string; servers: Record<string, any> }> = []
    for (const projectPath of Object.keys(config.projects)) {
      // Skip worktrees - they're temporary git working directories and inherit MCP from parent
      if (projectPath.includes("/.21st/worktrees/") || projectPath.includes("\\.21st\\worktrees\\")) {
        continue
      }

      try {
        // Use getMergedMcpConfig (same as queries) instead of ~/.claude.json's mcpServers
        const mergedConfig = await getMergedMcpConfig(projectPath)
        if (mergedConfig.mcpServers && Object.keys(mergedConfig.mcpServers).length > 0) {
          projectsWithMcp.push({
            path: projectPath,
            servers: mergedConfig.mcpServers
          })
        }
      } catch (err) {
        console.warn(`[MCP Warmup] Failed to get merged config for ${projectPath}:`, err)
      }
    }

    if (projectsWithMcp.length === 0) {
      console.log("[MCP Warmup] No MCP servers configured (excluding worktrees) - skipping warmup")
      return
    }

    // Get SDK
    const sdk = await import("@anthropic-ai/claude-agent-sdk")
    const claudeQuery = sdk.query

    // Ensure AWS credentials are valid before warmup queries
    const credentialResult = await ensureValidAwsCredentials()
    if (!credentialResult.success && credentialResult.connectionMethod === "sso") {
      console.warn("[claude] MCP warmup skipped - SSO credentials invalid:", credentialResult.error)
      return // Skip warmup if SSO credentials are invalid
    }

    // Warm up each project
    for (const project of projectsWithMcp) {

      try {
        // Inject stored OAuth credentials into server configs
        const serversWithCredentials = await injectAllStoredCredentials(project.servers)

        // Create a minimal query to initialize MCP servers
        const warmupQuery = claudeQuery({
          prompt: "ping",
          options: {
            cwd: project.path,
            mcpServers: serversWithCredentials,
            systemPrompt: {
              type: "preset" as const,
              preset: "claude_code" as const,
            },
            env: buildClaudeEnv(),
            permissionMode: "bypassPermissions" as const,
            allowDangerouslySkipPermissions: true,
          }
        })

        // Wait for init message with MCP server statuses and tools
        const configuredServerNames = Object.keys(project.servers)
        console.log(`[MCP Warmup] Configured servers for ${project.path}: ${configuredServerNames.join(", ")}`)

        let gotInit = false
        for await (const msg of warmupQuery) {
          const msgAny = msg as any
          if (msgAny.type === "system" && msgAny.subtype === "init" && msgAny.mcp_servers) {
            // Log all servers returned by SDK
            const returnedServers = msgAny.mcp_servers.map((s: any) => `${s.name}(${s.status}, ${s.tools?.length || 0} tools)`)
            console.log(`[MCP Warmup] SDK returned ${msgAny.mcp_servers.length} servers: ${returnedServers.join(", ")}`)

            // Check for servers that were configured but not returned
            const returnedNames = new Set(msgAny.mcp_servers.map((s: any) => s.name))
            const missingServers = configuredServerNames.filter(name => !returnedNames.has(name))
            if (missingServers.length > 0) {
              console.warn(`[MCP Warmup] Servers configured but NOT returned by SDK: ${missingServers.join(", ")}`)
            }

            // Cache the statuses and tools
            const statusMap = new Map<string, string>()
            const serversWithTools: McpServerWithTools[] = []
            const allToolNames: string[] = []

            for (const server of msgAny.mcp_servers) {
              if (server.name && server.status) {
                statusMap.set(server.name, server.status)

                // Extract tools for this server
                const serverTools = server.tools || []
                serversWithTools.push({
                  name: server.name,
                  status: server.status,
                  tools: serverTools.map((t: any) => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                  })),
                })

                // Collect all tool names
                for (const tool of serverTools) {
                  if (tool.name) {
                    allToolNames.push(`mcp__${server.name}__${tool.name}`)
                  }
                }
              }
            }

            mcpServerStatusCache.set(project.path, statusMap)

            // Cache tools
            if (serversWithTools.length > 0) {
              mcpToolsCache.set(project.path, {
                servers: serversWithTools,
                allTools: allToolNames,
                cachedAt: Date.now(),
              })
            }

            gotInit = true
            break // We only need the init message
          }
        }

        if (!gotInit) {
          console.warn(`[MCP Warmup] Did not receive init message for ${project.path}`)
        }
      } catch (err) {
        console.error(`[MCP Warmup] Failed to warm up MCP for ${project.path}:`, err)
      }
    }

    // Save all cached statuses to disk
    saveMcpStatusToDisk()

    const totalServers = Array.from(mcpServerStatusCache.values())
      .reduce((sum, map) => sum + map.size, 0)
    const warmupDuration = Date.now() - warmupStart
    console.log(`[MCP Warmup] Initialized ${totalServers} servers across ${projectsWithMcp.length} projects in ${warmupDuration}ms`)
  } catch (error) {
    console.error("[MCP Warmup] Warmup failed:", error)
  }
}

export const claudeRouter = router({
  /**
   * Get Claude SDK version and available models
   */
  getVersionInfo: publicProcedure.query(async () => {
    // Get SDK version from package.json
    const packageJsonPath = path.join(app.getAppPath(), 'package.json')
    let sdkVersion = 'unknown'

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      sdkVersion = packageJson.dependencies?.['@anthropic-ai/claude-agent-sdk']?.replace(/^\^/, '') || 'unknown'
    } catch (error) {
      console.error('[claude] Failed to read SDK version:', error)
    }

    // Get Claude binary version from bundled binary (not PATH)
    let binaryVersion = 'unknown'
    try {
      const { execSync } = await import('child_process')
      const bundledBinaryPath = getBundledClaudeBinaryPath()
      const output = execSync(`"${bundledBinaryPath}" --version`, { encoding: 'utf-8', timeout: 5000 })
      // Parse output like "claude 2.1.34 (Claude Code)" or "2.1.34 (Claude Code)"
      const match = output.trim().match(/(?:claude\s+)?(\d+\.\d+\.\d+)/)
      binaryVersion = match ? match[1] : output.trim()
      console.log('[claude] Bundled binary version:', binaryVersion)
    } catch (error: any) {
      console.error('[claude] Failed to get bundled binary version:', error.message)
      // Fallback: read from VERSION file
      try {
        const versionFile = path.join(app.getAppPath(), 'resources/bin/VERSION')
        const versionContent = readFileSync(versionFile, 'utf-8')
        binaryVersion = versionContent.split('\n')[0].trim()
        console.log('[claude] Read version from VERSION file:', binaryVersion)
      } catch {
        binaryVersion = 'Not found'
      }
    }

    // Available models (from env.ts defaults)
    const availableModels = [
      {
        id: 'opus-4-6',
        name: 'Claude Opus 4.6',
        description: 'Latest and most capable model (Binary 2.1.32+)',
        modelId: 'claude-opus-4-6-20260205',
        badge: 'NEW',
      },
      {
        id: 'opus-4-5',
        name: 'Claude Opus 4.5',
        description: 'Most capable model for complex tasks',
        modelId: 'claude-opus-4-5-20251101',
      },
      {
        id: 'sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        description: 'Balanced performance and speed with 1M context',
        modelId: 'claude-sonnet-4-5-20250929',
        contextWindow: '1M',
      },
      {
        id: 'haiku-4-5',
        name: 'Claude Haiku 4.5',
        description: 'Fastest model for quick tasks with 1M context',
        modelId: 'claude-haiku-4-5-20251001',
        contextWindow: '1M',
      },
    ]

    return {
      sdkVersion,
      binaryVersion,
      availableModels,
    }
  }),

  /**
   * Stream chat with Claude - single subscription handles everything
   */
  chat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        prompt: z.string(),
        cwd: z.string(),
        projectPath: z.string().optional(), // Original project path for MCP config lookup
        mode: z.enum(["plan", "agent"]).default("agent"),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        customConfig: z
          .object({
            model: z.string().min(1),
            token: z.string().min(1),
            baseUrl: z.string().min(1),
            apiKey: z.string().optional(),
            ollamaApiKey: z.string().optional(),
          })
          .optional(),
        maxThinkingTokens: z.number().optional(), // Enable extended thinking
        images: z.array(imageAttachmentSchema).optional(), // Image attachments
        historyEnabled: z.boolean().optional(),
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        const abortController = new AbortController()
        const streamId = crypto.randomUUID()
        activeSessions.set(input.subChatId, abortController)

        // Stream debug logging
        const subId = input.subChatId.slice(-8) // Short ID for logs
        const streamStart = Date.now()
        let chunkCount = 0
        let lastChunkType = ""
        // Shared sessionId for cleanup to save on abort
        let currentSessionId: string | null = null
        console.log(`[SD] M:START sub=${subId} stream=${streamId.slice(-8)} mode=${input.mode}`)

        // Track if observable is still active (not unsubscribed)
        let isObservableActive = true

        // Helper to safely emit (no-op if already unsubscribed)
        const safeEmit = (chunk: UIMessageChunk) => {
          if (!isObservableActive) return false
          try {
            emit.next(chunk)
            return true
          } catch {
            isObservableActive = false
            return false
          }
        }

        // Helper to safely complete (no-op if already closed)
        const safeComplete = () => {
          try {
            emit.complete()
          } catch {
            // Already completed or closed
          }
        }

        // Helper to emit error to frontend
        const emitError = (error: unknown, context: string) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          const errorStack = error instanceof Error ? error.stack : undefined

          console.error(`[claude] ${context}:`, errorMessage)
          if (errorStack) console.error("[claude] Stack:", errorStack)

          // Send detailed error to frontend (safely)
          safeEmit({
            type: "error",
            errorText: `${context}: ${errorMessage}`,
            // Include extra debug info
            ...(process.env.NODE_ENV !== "production" && {
              debugInfo: {
                context,
                cwd: input.cwd,
                mode: input.mode,
                PATH: process.env.PATH?.slice(0, 200),
              },
            }),
          } as UIMessageChunk)
        }

        ;(async () => {
          try {
            const db = getDatabase()

            // 1. Get existing messages from DB
            const existing = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()
            const existingMessages = JSON.parse(existing?.messages || "[]")
            const existingSessionId = existing?.sessionId || null

            // Get resumeSessionAt UUID from the last assistant message (for rollback)
            const lastAssistantMsg = [...existingMessages].reverse().find(
              (m: any) => m.role === "assistant"
            )
            const resumeAtUuid = lastAssistantMsg?.metadata?.sdkMessageUuid || null
            const historyEnabled = input.historyEnabled === true

            // Check if last message is already this user message (avoid duplicate)
            const lastMsg = existingMessages[existingMessages.length - 1]
            const isDuplicate =
              lastMsg?.role === "user" &&
              lastMsg?.parts?.[0]?.text === input.prompt

            // 2. Create user message and save BEFORE streaming (skip if duplicate)
            let userMessage: any
            let messagesToSave: any[]

            if (isDuplicate) {
              userMessage = lastMsg
              messagesToSave = existingMessages
            } else {
              userMessage = {
                id: crypto.randomUUID(),
                role: "user",
                parts: [{ type: "text", text: input.prompt }],
              }
              messagesToSave = [...existingMessages, userMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(messagesToSave),
                  streamId,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            // Use custom config if provided (for API key users)
            const finalCustomConfig = input.customConfig

            // 3. Get Claude SDK
            let claudeQuery
            try {
              claudeQuery = await getClaudeQuery()
            } catch (sdkError) {
              emitError(sdkError, "Failed to load Claude SDK")
              console.log(`[SD] M:END sub=${subId} reason=sdk_load_error n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            const transform = createTransformer({
              emitSdkMessageUuid: historyEnabled,
            })

            // 4. Setup accumulation state
            const parts: any[] = []
            let currentText = ""
            let metadata: any = {}

            // Capture stderr from Claude process for debugging
            const stderrLines: string[] = []

            // Parse mentions from prompt (agents, skills, files, folders)
            const { cleanedPrompt, agentMentions, skillMentions } = parseMentions(input.prompt)

            // Build agents option for SDK (proper registration via options.agents)
            // Load @mentioned agents
            let agentsOption: Record<string, any> = {}
            let finalPrompt = cleanedPrompt

            // Load @mentioned agents
            agentsOption = await buildAgentsOption(agentMentions, input.cwd)

            // Log if agents were mentioned
            if (agentMentions.length > 0) {
              console.log(`[claude] Registering agents via SDK:`, Object.keys(agentsOption))
            }

            // Log if skills were mentioned
            if (skillMentions.length > 0) {
              console.log(`[claude] Skills mentioned:`, skillMentions)
            }

            // Build final prompt with skill instructions if needed
            // Handle empty prompt when only mentions are present
            if (!finalPrompt.trim()) {
              if (agentMentions.length > 0 && skillMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) and invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
              } else if (agentMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) for this task.`
              } else if (skillMentions.length > 0) {
                finalPrompt = `Invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
              }
            } else if (skillMentions.length > 0) {
              // Append skill instruction to existing prompt
              finalPrompt = `${finalPrompt}\n\nUse the "${skillMentions.join('", "')}" skill(s) for this task.`
            }

            // Build prompt: if there are images, create an AsyncIterable<SDKUserMessage>
            // Otherwise use simple string prompt
            let prompt: string | AsyncIterable<any> = finalPrompt

            if (input.images && input.images.length > 0) {
              // Create message content array with images first, then text
              const messageContent: any[] = [
                ...input.images.map((img) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: img.mediaType,
                    data: img.base64Data,
                  },
                })),
              ]

              // Add text if present
              if (finalPrompt.trim()) {
                messageContent.push({
                  type: "text" as const,
                  text: finalPrompt,
                })
              }

              // Create an async generator that yields a single SDKUserMessage
              async function* createPromptWithImages() {
                yield {
                  type: "user" as const,
                  message: {
                    role: "user" as const,
                    content: messageContent,
                  },
                  parent_tool_use_id: null,
                }
              }

              prompt = createPromptWithImages()
            }

            // Ensure AWS credentials are valid (auto-refresh if needed) before building env
            const credentialRefreshResult = await ensureValidAwsCredentials()
            if (!credentialRefreshResult.success && credentialRefreshResult.error) {
              console.warn("[claude] AWS credential refresh failed:", credentialRefreshResult.error)
              // CRITICAL: In SSO mode, we must NOT fall back to system credentials
              // This would cause the app to use the user's system AWS SSO instead of the app's SSO
              if (credentialRefreshResult.connectionMethod === "sso") {
                throw new Error(`AWS authentication failed: ${credentialRefreshResult.error}`)
              }
              // Profile mode can fall back to system credentials
            }

            // Build full environment for Claude SDK (includes HOME, PATH, etc.)
            const claudeEnv = buildClaudeEnv(
              finalCustomConfig
                ? {
                    customEnv: {
                      ANTHROPIC_AUTH_TOKEN: finalCustomConfig.token,
                      ANTHROPIC_BASE_URL: finalCustomConfig.baseUrl,
                      ...(finalCustomConfig.apiKey && {
                        ANTHROPIC_API_KEY: finalCustomConfig.apiKey,
                      }),
                      ...(finalCustomConfig.ollamaApiKey && {
                        OLLAMA_API_KEY: finalCustomConfig.ollamaApiKey,
                      }),
                    },
                  }
                : undefined,
            )

            // Debug logging in dev
            if (process.env.NODE_ENV !== "production") {
              logClaudeEnv(claudeEnv, `[${input.subChatId}] `)
            }

            // Create isolated config directory per subChat to prevent session contamination
            // The Claude binary stores sessions in ~/.claude/ based on cwd, which causes
            // cross-chat contamination when multiple chats use the same project folder
            const isolatedConfigDir = path.join(
              app.getPath("userData"),
              "claude-sessions",
              input.subChatId
            )

            // MCP servers to pass to SDK (merged from all config sources)
            let mcpServersForSdk: Record<string, any> | undefined

            // Ensure isolated config dir exists and symlink skills/agents from ~/.claude/
            // This is needed because SDK looks for skills at $CLAUDE_CONFIG_DIR/skills/
            // OPTIMIZATION: Only create symlinks once per subChatId (cached)
            // BUNDLED GSD: Prefer bundled GSD resources over user's ~/.claude/ directory
            try {
              await fs.mkdir(isolatedConfigDir, { recursive: true })

              // Only create symlinks if not already created for this config dir
              if (!symlinksCreated.has(input.subChatId)) {
                const homeClaudeDir = path.join(os.homedir(), ".claude")
                const bundledGsdPath = getBundledGsdPath()

                // Helper to check if path exists
                const pathExists = async (p: string) => fs.stat(p).then(() => true).catch(() => false)

                // Symlink skills directory - prefer bundled GSD, fallback to ~/.claude/
                try {
                  const skillsTarget = path.join(isolatedConfigDir, "skills")
                  const skillsTargetExists = await fs.lstat(skillsTarget).then(() => true).catch(() => false)
                  if (!skillsTargetExists) {
                    // Check bundled GSD first (GSD doesn't have skills, but keep pattern consistent)
                    const bundledSkillsSource = path.join(bundledGsdPath, "skills")
                    const userSkillsSource = path.join(homeClaudeDir, "skills")
                    const bundledExists = await pathExists(bundledSkillsSource)
                    const userExists = await pathExists(userSkillsSource)
                    const skillsSource = bundledExists ? bundledSkillsSource : (userExists ? userSkillsSource : null)
                    if (skillsSource) {
                      await fs.symlink(skillsSource, skillsTarget, "dir")
                      console.log(`[claude] Symlinked skills: ${skillsSource} → ${skillsTarget}`)
                    }
                  }
                } catch (symlinkErr) {
                  console.error(`[claude] Failed to symlink skills directory:`, symlinkErr)
                }

                // Symlink agents directory - prefer bundled GSD, fallback to ~/.claude/
                try {
                  const agentsTarget = path.join(isolatedConfigDir, "agents")
                  const agentsTargetExists = await fs.lstat(agentsTarget).then(() => true).catch(() => false)
                  if (!agentsTargetExists) {
                    const bundledAgentsSource = path.join(bundledGsdPath, "agents")
                    const userAgentsSource = path.join(homeClaudeDir, "agents")
                    const bundledExists = await pathExists(bundledAgentsSource)
                    const userExists = await pathExists(userAgentsSource)
                    const agentsSource = bundledExists ? bundledAgentsSource : (userExists ? userAgentsSource : null)
                    if (agentsSource) {
                      await fs.symlink(agentsSource, agentsTarget, "dir")
                      console.log(`[claude] Symlinked agents: ${agentsSource} → ${agentsTarget}${bundledExists ? " (bundled GSD)" : ""}`)
                    }
                  }
                } catch (symlinkErr) {
                  console.error(`[claude] Failed to symlink agents directory:`, symlinkErr)
                }

                // Symlink commands directory - prefer bundled GSD, fallback to ~/.claude/
                try {
                  const commandsTarget = path.join(isolatedConfigDir, "commands")
                  const commandsTargetExists = await fs.lstat(commandsTarget).then(() => true).catch(() => false)
                  if (!commandsTargetExists) {
                    const bundledCommandsSource = path.join(bundledGsdPath, "commands")
                    const userCommandsSource = path.join(homeClaudeDir, "commands")
                    const bundledExists = await pathExists(bundledCommandsSource)
                    const userExists = await pathExists(userCommandsSource)
                    const commandsSource = bundledExists ? bundledCommandsSource : (userExists ? userCommandsSource : null)
                    if (commandsSource) {
                      await fs.symlink(commandsSource, commandsTarget, "dir")
                      console.log(`[claude] Symlinked commands: ${commandsSource} → ${commandsTarget}${bundledExists ? " (bundled GSD)" : ""}`)
                    }
                  }
                } catch (symlinkErr) {
                  console.error(`[claude] Failed to symlink commands directory:`, symlinkErr)
                }

                // Symlink rules directory - only from ~/.claude/ (GSD doesn't have rules)
                try {
                  const rulesSource = path.join(homeClaudeDir, "rules")
                  const rulesTarget = path.join(isolatedConfigDir, "rules")
                  const rulesSourceExists = await pathExists(rulesSource)
                  const rulesTargetExists = await fs.lstat(rulesTarget).then(() => true).catch(() => false)
                  if (rulesSourceExists && !rulesTargetExists) {
                    await fs.symlink(rulesSource, rulesTarget, "dir")
                    console.log(`[claude] Symlinked rules: ${rulesSource} → ${rulesTarget}`)
                  }
                } catch (symlinkErr) {
                  console.error(`[claude] Failed to symlink rules directory:`, symlinkErr)
                }

                symlinksCreated.add(input.subChatId)
              }

              // Get merged MCP config from all sources (project, custom, user, custom)
              // This consolidates configs in priority order: project (10) → custom (20) → user (100)
              try {
                const lookupPath = input.projectPath || input.cwd
                const mergedConfig = await getMergedMcpConfig(lookupPath)
                // Inject stored OAuth credentials into server configs
                mcpServersForSdk = await injectAllStoredCredentials(mergedConfig.mcpServers)
              } catch (configErr) {
                console.error(`[claude] Failed to get merged MCP config:`, configErr)
              }
            } catch (mkdirErr) {
              console.error(`[claude] Failed to setup isolated config dir:`, mkdirErr)
            }

            // Build final env - only add OAuth token if we have one
            const claudeCodeToken = getClaudeCodeToken()
            const finalEnv = {
              ...claudeEnv,
              ...(claudeCodeToken && {
                CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
              }),
              // Re-enable CLAUDE_CONFIG_DIR now that we properly map MCP configs
              CLAUDE_CONFIG_DIR: isolatedConfigDir,
            }

            // Get bundled Claude binary path
            const claudeBinaryPath = getBundledClaudeBinaryPath()

            let resumeSessionId = input.sessionId || existingSessionId || undefined

            // CRITICAL: Skip resume if this session ID previously failed
            // Prevents repeated "No conversation found" errors for expired sessions
            if (resumeSessionId && brokenSessionIds.has(resumeSessionId)) {
              console.log(`[claude] Skipping resume for broken session: ${resumeSessionId}`)
              resumeSessionId = undefined
              // Also clear from DB to prevent future attempts
              db.update(subChats)
                .set({ sessionId: null })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            console.log(`[claude] Session ID to resume: ${resumeSessionId} (Existing: ${existingSessionId})`)
            console.log(`[claude] Resume at UUID: ${resumeAtUuid}`)

            // Clean up stale session state when starting fresh (no resumeSessionId)
            // The SDK can discover old sessions from projects/, debug/, todos/, or any subdirectory
            // To prevent "No conversation found" errors, remove the ENTIRE isolated config directory
            if (!resumeSessionId && existsSync(isolatedConfigDir)) {
              try {
                await fs.rm(isolatedConfigDir, { recursive: true, force: true })
                console.log(`[claude] Deleted isolated config directory for fresh start`)
                // Recreate the directory
                mkdirSync(isolatedConfigDir, { recursive: true })
              } catch (cleanupErr) {
                console.warn(`[claude] Failed to clean up session directory:`, cleanupErr)
              }
            }
            
            console.log(`[SD] Query options - cwd: ${input.cwd}, projectPath: ${input.projectPath || "(not set)"}, mcpServers: ${mcpServersForSdk ? Object.keys(mcpServersForSdk).join(", ") : "(none)"}`)
            if (finalCustomConfig) {
              const redactedConfig = {
                ...finalCustomConfig,
                token: `${finalCustomConfig.token.slice(0, 6)}...`,
                apiKey: finalCustomConfig.apiKey ? `${finalCustomConfig.apiKey.slice(0, 6)}...` : undefined,
                ollamaApiKey: finalCustomConfig.ollamaApiKey ? `${finalCustomConfig.ollamaApiKey.slice(0, 6)}...` : undefined,
              }
              console.log(`[claude] Custom config: ${JSON.stringify(redactedConfig)}`)
            }

            const resolvedModel = finalCustomConfig?.model || input.model

            // Filter MCP servers: skip ONLY non-working servers (failed, needs-auth)
            // Pass working/unknown servers in options so Claude can see them
            // OPTIMIZATION: Cache is populated at app startup via warmupMcpCache()
            let mcpServersFiltered: Record<string, any> | undefined

            if (mcpServersForSdk) {
              const lookupPath = input.projectPath || input.cwd

              // Load cached statuses from disk if needed
              if (!mcpServerStatusCache.has(lookupPath)) {
                loadMcpStatusFromDisk()
              }

              // Pass ALL servers to Claude SDK without filtering
              // Let Claude handle auth issues and show proper errors to users
              // The SDK will report accurate statuses in the init message
              console.log(`[MCP] Passing all ${Object.keys(mcpServersForSdk).length} servers to SDK (filtering disabled)`)
              mcpServersFiltered = mcpServersForSdk

              // Load cached statuses from disk if needed (for logging/debugging)
              if (!mcpServerStatusCache.has(lookupPath)) {
                loadMcpStatusFromDisk()
              }
            }

            // System prompt config
            const systemPromptConfig = {
              type: "preset" as const,
              preset: "claude_code" as const,
            }

            const queryOptions = {
              prompt,
              options: {
                abortController, // Must be inside options!
                cwd: input.cwd,
                systemPrompt: systemPromptConfig,
                // Register mentioned agents with SDK via options.agents
                ...(Object.keys(agentsOption).length > 0 && { agents: agentsOption }),
                // Pass filtered MCP servers (only working/unknown ones, skip failed/needs-auth)
                ...(mcpServersFiltered && Object.keys(mcpServersFiltered).length > 0 && { mcpServers: mcpServersFiltered }),
                env: finalEnv,
                permissionMode:
                  input.mode === "plan"
                    ? ("plan" as const)
                    : ("bypassPermissions" as const),
                ...(input.mode !== "plan" && {
                  allowDangerouslySkipPermissions: true,
                }),
                includePartialMessages: true,
                // Load skills from project, user, and local plugin directories
                settingSources: ["project" as const, "user" as const, "local" as const],
                canUseTool: async (
                  toolName: string,
                  toolInput: Record<string, unknown>,
                  options: { toolUseID: string },
                ) => {
                  if (input.mode === "plan") {
                    if (toolName === "Edit" || toolName === "Write") {
                      const filePath =
                        typeof toolInput.file_path === "string"
                          ? toolInput.file_path
                          : ""
                      if (!/\.md$/i.test(filePath)) {
                        return {
                          behavior: "deny",
                          message:
                            'Only ".md" files can be modified in plan mode.',
                        }
                      }
                    } else if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
                      return {
                        behavior: "deny",
                        message: `Tool "${toolName}" blocked in plan mode.`,
                      }
                    }
                  }
                  if (toolName === "AskUserQuestion") {
                    const { toolUseID } = options
                    // Emit to UI (safely in case observer is closed)
                    safeEmit({
                      type: "ask-user-question",
                      toolUseId: toolUseID,
                      questions: (toolInput as any).questions,
                    } as UIMessageChunk)

                    // Wait for response (no timeout - question remains open until user responds)
                    const response = await new Promise<{
                      approved: boolean
                      message?: string
                      updatedInput?: unknown
                    }>((resolve) => {
                      pendingToolApprovals.set(toolUseID, {
                        subChatId: input.subChatId,
                        resolve: (d) => {
                          resolve(d)
                        },
                      })
                    })

                    // Find the tool part in accumulated parts
                    const askToolPart = parts.find(
                      (p) => p.toolCallId === toolUseID && p.type === "tool-AskUserQuestion"
                    )

                    if (!response.approved) {
                      // Update the tool part with error result for skipped/denied
                      const errorMessage = response.message || "Skipped"
                      if (askToolPart) {
                        askToolPart.result = errorMessage
                        askToolPart.state = "result"
                      }
                      // Emit result to frontend so it updates in real-time
                      safeEmit({
                        type: "ask-user-question-result",
                        toolUseId: toolUseID,
                        result: errorMessage,
                      } as unknown as UIMessageChunk)
                      return {
                        behavior: "deny",
                        message: errorMessage,
                      }
                    }

                    // Update the tool part with answers result for approved
                    const answers = (response.updatedInput as any)?.answers
                    const answerResult = { answers }
                    if (askToolPart) {
                      askToolPart.result = answerResult
                      askToolPart.state = "result"
                    }
                    // Emit result to frontend so it updates in real-time
                    safeEmit({
                      type: "ask-user-question-result",
                      toolUseId: toolUseID,
                      result: answerResult,
                    } as unknown as UIMessageChunk)
                    return {
                      behavior: "allow",
                      updatedInput: response.updatedInput,
                    }
                  }
                  return {
                    behavior: "allow",
                    updatedInput: toolInput,
                  }
                },
                stderr: (data: string) => {
                  stderrLines.push(data)
                  console.error("[claude stderr]", data)
                },
                // Use bundled binary
                pathToClaudeCodeExecutable: claudeBinaryPath,
                // Session handling with rollback support
                enableFileCheckpointing: true, // Enable SDK-native file rollback
                ...(resumeSessionId && {
                  resume: resumeSessionId,
                  // Rollback support - resume at specific message UUID (from DB)
                  ...(resumeAtUuid
                    ? { resumeSessionAt: resumeAtUuid }
                    : { continue: true }),
                }),
                // NOTE: Do NOT set `continue: true` when there is no resumeSessionId.
                // `continue: true` without an explicit session ID causes the SDK to scan
                // CLAUDE_CONFIG_DIR/projects/ for the most recent session file on disk
                // and attempt to resume it. If that server-side session has expired or
                // been deleted, we get "No conversation found with session ID: ..."
                // For truly new sessions, omit `continue` so the SDK starts fresh.
                ...(resolvedModel && { model: resolvedModel }),
                // Fallback to Sonnet if primary model unavailable
                fallbackModel: resolvedModel === "opus" ? "claude-sonnet-4-5-20241022" : undefined,
                // Debug logging (when environment variable is set)
                ...(process.env.CLAW_DEBUG_CLAUDE && {
                  debug: true,
                  debugFile: path.join(app.getPath('userData'), 'logs', `claude-debug-${Date.now()}.log`),
                }),
                ...(input.maxThinkingTokens && {
                  maxThinkingTokens: input.maxThinkingTokens,
                }),
                // Budget limit for cost control (from settings)
                ...((() => {
                  const db = getDatabase()
                  const settings = db
                    .select()
                    .from(claudeCodeSettings)
                    .where(eq(claudeCodeSettings.id, "default"))
                    .get()
                  return settings?.maxBudgetUsd ? { maxBudgetUsd: settings.maxBudgetUsd } : {}
                })()),
                // Hooks system for lifecycle events
                hooks: {
                  // Desktop notifications for important events
                  async Notification({ message }: { message: string }) {
                    console.log(`[CLAUDE] Notification: ${message}`)
                    const mainWindow = BrowserWindow.getAllWindows()[0]
                    if (mainWindow) {
                      mainWindow.webContents.send('claude-notification', {
                        type: 'info',
                        message,
                      })
                    }
                  },
                  // Pre-tool use guardrails
                  async PreToolUse({ toolName, args }: { toolName: string; args: any }) {
                    console.log(`[CLAUDE] PreToolUse: ${toolName}`)
                    // Example: Log destructive Bash commands
                    if (toolName === "Bash" && typeof args.command === "string") {
                      const dangerousPatterns = ["rm -rf", "sudo rm", "format", "mkfs"]
                      if (dangerousPatterns.some(p => args.command.includes(p))) {
                        console.warn(`[CLAUDE] ⚠️ Potentially destructive Bash command: ${args.command}`)
                      }
                    }
                  },
                  // Post-tool use audit logging
                  async PostToolUse({ toolName, result }: { toolName: string; result: any }) {
                    console.log(`[CLAUDE] PostToolUse: ${toolName} - status: ${result?.status || 'unknown'}`)
                  },
                  // Agent team events (when experimental flag enabled)
                  async TeammateIdle({ teammate_name }: { teammate_name: string }) {
                    console.log(`[CLAUDE] TeammateIdle: ${teammate_name}`)
                  },
                  async TaskCompleted({ task_id, task_subject }: { task_id: string; task_subject: string }) {
                    console.log(`[CLAUDE] TaskCompleted: ${task_id} - ${task_subject}`)
                    const mainWindow = BrowserWindow.getAllWindows()[0]
                    if (mainWindow) {
                      mainWindow.webContents.send('claude-notification', {
                        type: 'success',
                        message: `Task completed: ${task_subject}`,
                      })
                    }
                  },
                },
              },
            }

            // 5. Run Claude SDK
            let stream
            try {
              stream = claudeQuery(queryOptions as any)
              // Store query object for MCP server runtime control and file checkpointing
              activeQueries.set(input.subChatId, stream)
              console.log(`[CLAUDE] Stored active query for subChat ${input.subChatId}`)
            } catch (queryError) {
              console.error(
                "[CLAUDE] ✗ Failed to create SDK query:",
                queryError,
              )
              emitError(queryError, "Failed to start Claude query")
              console.log(`[SD] M:END sub=${subId} reason=query_error n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            let messageCount = 0
            let lastError: Error | null = null
            let planCompleted = false // Flag to stop after ExitPlanMode in plan mode
            let exitPlanModeToolCallId: string | null = null // Track ExitPlanMode's toolCallId
            let firstMessageReceived = false
            let resultReceived = false // Flag to stop after result message
            const streamIterationStart = Date.now()

            try {
              for await (const msg of stream) {
                if (abortController.signal.aborted || resultReceived) {
                  if (resultReceived) {
                    console.log(`[SD] M:RESULT_EXIT sub=${subId} messageCount=${messageCount}`)
                  }
                  break
                }

                messageCount++

                // Warn if SDK initialization is slow (MCP delay)
                if (!firstMessageReceived) {
                  firstMessageReceived = true
                  const timeToFirstMessage = Date.now() - streamIterationStart
                  if (timeToFirstMessage > 5000) {
                    console.warn(`[claude] SDK initialization took ${(timeToFirstMessage / 1000).toFixed(1)}s (MCP servers loading?)`)
                  }
                }

                // Log raw message for debugging
                logRawClaudeMessage(input.chatId, msg)

                // Check for error messages from SDK (error can be embedded in message payload!)
                const msgAny = msg as any
                if (msgAny.type === "error" || msgAny.error) {
                  const sdkError =
                    msgAny.error || msgAny.message || "Unknown SDK error"
                  lastError = new Error(sdkError)

                  // Log the actual SDK error message for debugging
                  console.error(`[claude] SDK ERROR: ${sdkError}`)
                  console.error(`[claude] Full error object:`, JSON.stringify(msgAny, null, 2))

                  // Categorize SDK-level errors
                  let errorCategory = "SDK_ERROR"
                  let errorContext = "Claude SDK error"

                  if (
                    sdkError === "authentication_failed" ||
                    sdkError.includes("authentication")
                  ) {
                    errorCategory = "AUTH_FAILED_SDK"
                    errorContext =
                      "Authentication failed - not logged into Claude Code CLI"
                  } else if (
                    sdkError === "invalid_api_key" ||
                    sdkError.includes("api_key")
                  ) {
                    errorCategory = "INVALID_API_KEY_SDK"
                    errorContext = "Invalid API key in Claude Code CLI"
                  } else if (
                    sdkError === "rate_limit_exceeded" ||
                    sdkError.includes("rate")
                  ) {
                    errorCategory = "RATE_LIMIT_SDK"
                    errorContext = "Session limit reached"
                  } else if (
                    sdkError === "overloaded" ||
                    sdkError.includes("overload")
                  ) {
                    errorCategory = "OVERLOADED_SDK"
                    errorContext = "Claude is overloaded, try again later"
                  }

                  // Emit auth-error for authentication failures, regular error otherwise
                  if (errorCategory === "AUTH_FAILED_SDK") {
                    safeEmit({
                      type: "auth-error",
                      errorText: errorContext,
                    } as UIMessageChunk)
                  } else {
                    safeEmit({
                      type: "error",
                      errorText: errorContext,
                      debugInfo: {
                        category: errorCategory,
                        sdkError: sdkError,
                        sessionId: msgAny.session_id,
                        messageId: msgAny.message?.id,
                      },
                    } as UIMessageChunk)
                  }

                  console.log(`[SD] M:END sub=${subId} reason=sdk_error cat=${errorCategory} n=${chunkCount}`)
                  safeEmit({ type: "finish" } as UIMessageChunk)
                  safeComplete()
                  return
                }

                // Track sessionId and uuid for rollback support (available on all messages)
                if (msgAny.session_id) {
                  metadata.sessionId = msgAny.session_id
                  currentSessionId = msgAny.session_id // Share with cleanup
                }

                // Debug: Log system messages from SDK
                if (msgAny.type === "system") {
                  // Full log to see all fields including MCP errors
                  console.log(`[SD] SYSTEM message: subtype=${msgAny.subtype}`, JSON.stringify({
                    cwd: msgAny.cwd,
                    mcp_servers: msgAny.mcp_servers,
                    tools: msgAny.tools,
                    plugins: msgAny.plugins,
                    permissionMode: msgAny.permissionMode,
                  }, null, 2))

                  // Cache MCP server statuses and tools for next request
                  if (msgAny.subtype === "init" && msgAny.mcp_servers) {
                    const lookupPath = input.projectPath || input.cwd
                    const statusMap = new Map<string, string>()

                    // Build tools cache from mcp_servers data
                    const serversWithTools: McpServerWithTools[] = []
                    const allToolNames: string[] = []

                    for (const server of msgAny.mcp_servers) {
                      if (server.name && server.status) {
                        statusMap.set(server.name, server.status)

                        // Extract tools for this server (SDK includes tools per server)
                        const serverTools = server.tools || []
                        serversWithTools.push({
                          name: server.name,
                          status: server.status,
                          tools: serverTools.map((t: any) => ({
                            name: t.name,
                            description: t.description,
                            inputSchema: t.inputSchema,
                          })),
                        })

                        // Collect all tool names for quick lookup
                        for (const tool of serverTools) {
                          if (tool.name) {
                            allToolNames.push(`mcp__${server.name}__${tool.name}`)
                          }
                        }
                      }
                    }

                    mcpServerStatusCache.set(lookupPath, statusMap)
                    // Persist status to disk immediately (write-through)
                    saveMcpStatusToDisk()

                    // Cache tools (in-memory only, not persisted to disk)
                    if (serversWithTools.length > 0) {
                      mcpToolsCache.set(lookupPath, {
                        servers: serversWithTools,
                        allTools: allToolNames,
                        cachedAt: Date.now(),
                      })
                      console.log(`[MCP Tools Cache] Cached ${allToolNames.length} tools from ${serversWithTools.length} servers for ${lookupPath}`)
                    }
                  }
                }

                // Transform and emit + accumulate
                for (const chunk of transform(msg)) {
                  chunkCount++
                  lastChunkType = chunk.type

                  // Use safeEmit to prevent throws when observer is closed
                  if (!safeEmit(chunk)) {
                    // Observer closed (user clicked Stop), break out of loop
                    console.log(`[SD] M:EMIT_CLOSED sub=${subId} type=${chunk.type} n=${chunkCount}`)
                    break
                  }

                  // Accumulate based on chunk type
                  // Log ALL chunk types for debugging
                  const chunkAny = chunk as any
                  if (chunkAny.toolName === "Bash" || chunk.type.includes("background")) {
                    const path = require('path')
                    const { app } = require('electron')
                    const logPath = path.join(app.getPath('userData'), 'claw-debug.log')
                    require('fs').appendFileSync(logPath, `\n[${new Date().toISOString()}] Chunk type: ${chunk.type}, toolName: ${chunkAny.toolName || 'none'}, toolCallId: ${chunkAny.toolCallId || 'none'}`)
                  }

                  switch (chunk.type) {
                    case "text-delta":
                      currentText += chunk.delta
                      break
                    case "text-end":
                      if (currentText.trim()) {
                        parts.push({ type: "text", text: currentText })
                        currentText = ""
                      }
                      break
                    case "tool-input-available":
                      // DEBUG: Log tool calls
                      console.log(`[SD] M:TOOL_CALL sub=${subId} toolName="${chunk.toolName}" mode=${input.mode} callId=${chunk.toolCallId}`)

                      // Track ExitPlanMode toolCallId so we can stop when it completes
                      if (input.mode === "plan" && chunk.toolName === "ExitPlanMode") {
                        console.log(`[SD] M:PLAN_TOOL_DETECTED sub=${subId} callId=${chunk.toolCallId}`)
                        exitPlanModeToolCallId = chunk.toolCallId
                      }

                      parts.push({
                        type: `tool-${chunk.toolName}`,
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input,
                        state: "call",
                      })
                      break
                    case "tool-output-available":
                      // Debug logging to file for visibility
                      const path = require('path')
                      const { app } = require('electron')
                      const logPath = path.join(app.getPath('userData'), 'claw-debug.log')
                      require('fs').appendFileSync(logPath, `\n[${new Date().toISOString()}] Tool output available - toolCallId: ${chunk.toolCallId}, toolName: ${(chunk as any).toolName}`)

                      const toolPart = parts.find(
                        (p) =>
                          p.type?.startsWith("tool-") &&
                          p.toolCallId === chunk.toolCallId,
                      )

                      require('fs').appendFileSync(logPath, `\n[${new Date().toISOString()}] Found toolPart: ${!!toolPart}, type: ${toolPart?.type}, hasOutput: ${!!chunk.output}`)

                      if (toolPart) {
                        toolPart.result = chunk.output
                        toolPart.output = chunk.output // Backwards compatibility for the UI that relies on output field
                        toolPart.state = "result"

                        // Update background task with output info from Bash tool output
                        if (toolPart.type === "tool-Bash" && chunk.output) {
                          console.log("[Tasks] Bash tool output detected")
                          try {
                            const output = chunk.output as any

                            // Debug: Log the actual structure of the output
                            const debugInfo = {
                              keys: Object.keys(output || {}),
                              task_id: output?.task_id,
                              taskId: output?.taskId,
                              backgroundTaskId: output?.backgroundTaskId,
                              output_file: output?.output_file,
                              outputFile: output?.outputFile,
                            }
                            console.log("[Tasks] Bash output structure:", debugInfo)

                            // Extract fields - check multiple possible field names
                            const outputFileFromSdk =
                              output.output_file ||
                              output.outputFile ||
                              output.file ||
                              output.logFile

                            // task_id is a string identifier from the SDK, NOT a PID!
                            const sdkTaskId =
                              output.backgroundTaskId ||
                              output.background_task_id ||
                              output.task_id ||
                              output.taskId ||
                              output.id

                            console.log(`[Tasks] Extracted - sdkTaskId: ${sdkTaskId}, outputFileFromSdk: ${outputFileFromSdk}`)

                            if (outputFileFromSdk || sdkTaskId) {
                              console.log(`[Tasks] Entering update block - sdkTaskId: ${sdkTaskId}`)
                              const taskDb = getDatabase()
                              const updateData: any = {}

                              // If SDK provides output file, use it. Otherwise construct from task ID
                              if (outputFileFromSdk) {
                                console.log(`[Tasks] Using SDK-provided output file: ${outputFileFromSdk}`)
                                updateData.outputFile = outputFileFromSdk
                              } else if (sdkTaskId) {
                                // SDK doesn't provide output_file in tool output, but we can construct it
                                // Use the input.cwd which is the working directory for this session
                                const workingDir = input.cwd

                                console.log(`[Tasks] Constructing path - workingDir: ${workingDir}, sdkTaskId: ${sdkTaskId}`)

                                // Pattern: $CLAUDE_CODE_TMPDIR/claude/-{encoded-cwd}/tasks/{taskId}.output
                                // The SDK uses CLAUDE_CODE_TMPDIR env var, fallback to TMPDIR or os.tmpdir()
                                // The encoded cwd has / replaced by - with leading dash
                                const tmpBase = process.env.CLAUDE_CODE_TMPDIR || process.env.TMPDIR || os.tmpdir()
                                const encodedCwd = workingDir.replace(/\//g, '-').replace(/^-/, '')
                                const tasksDir = path.join(tmpBase, 'claude', `-${encodedCwd}`, 'tasks')
                                updateData.outputFile = path.join(tasksDir, `${sdkTaskId}.output`)

                                console.log(`[Tasks] Constructed output file: ${updateData.outputFile}`)
                              }

                              // Store as sdkTaskId (string), not pid (was incorrectly parsed as integer before)
                              if (sdkTaskId) updateData.sdkTaskId = String(sdkTaskId)

                              console.log(`[Tasks] About to update database - toolCallId: ${chunk.toolCallId}`)

                              const updateResult = taskDb
                                .update(backgroundTasks)
                                .set(updateData)
                                .where(eq(backgroundTasks.toolCallId, chunk.toolCallId))
                                .run()

                              console.log(`[Tasks] Primary update matched ${updateResult.changes} row(s)`)

                              // Fallback: If no rows updated, try to match by recent pending task
                              if (updateResult.changes === 0 && (sdkTaskId || outputFileFromSdk)) {
                                console.log(`[Tasks] Primary update matched 0 rows, trying fallback for toolCallId: ${chunk.toolCallId}`)

                                // Find most recent pending task in this subchat without sdkTaskId
                                const pendingTasks = taskDb.select()
                                  .from(backgroundTasks)
                                  .where(eq(backgroundTasks.subChatId, input.subChatId))
                                  .all()
                                  .filter((t: any) => !t.sdkTaskId)
                                  .sort((a, b) => a.id.localeCompare(b.id)) // Sort by ID (chronological)

                                console.log(`[Tasks] Found ${pendingTasks.length} pending task(s) without sdkTaskId`)

                                if (pendingTasks.length > 0) {
                                  const taskToUpdate = pendingTasks[pendingTasks.length - 1]
                                  console.log(`[Tasks] Fallback updating task ${taskToUpdate.id} (toolCallId: ${taskToUpdate.toolCallId})`)

                                  const fallbackResult = taskDb
                                    .update(backgroundTasks)
                                    .set(updateData)
                                    .where(eq(backgroundTasks.id, taskToUpdate.id))
                                    .run()

                                  console.log(`[Tasks] Fallback update matched ${fallbackResult.changes} row(s)`)
                                } else {
                                  console.log("[Tasks] No pending tasks found for fallback")
                                }
                              }

                              console.log(`[Tasks] Database update complete - outputFile: ${updateData.outputFile}, sdkTaskId: ${sdkTaskId}`)
                            }
                          } catch (err) {
                            console.error("[Tasks] Failed to update task with output info:", err)
                          }
                        }

                        // Notify renderer about file changes for Write/Edit tools
                        if (toolPart.type === "tool-Write" || toolPart.type === "tool-Edit") {
                          const filePath = toolPart.input?.file_path
                          if (filePath) {
                            const windows = BrowserWindow.getAllWindows()
                            for (const win of windows) {
                              win.webContents.send("file-changed", {
                                filePath,
                                type: toolPart.type,
                                subChatId: input.subChatId
                              })
                            }
                          }
                        }
                      }
                      // Stop streaming after ExitPlanMode completes in plan mode
                      // Match by toolCallId since toolName is undefined in output chunks
                      if (input.mode === "plan" && exitPlanModeToolCallId && chunk.toolCallId === exitPlanModeToolCallId) {
                        console.log(`[SD] M:PLAN_STOP sub=${subId} callId=${chunk.toolCallId} n=${chunkCount} parts=${parts.length}`)
                        planCompleted = true
                        // Emit finish chunk so Chat hook properly resets its state
                        console.log(`[SD] M:PLAN_FINISH sub=${subId} - emitting finish chunk`)
                        safeEmit({ type: "finish" } as UIMessageChunk)
                        // Abort the Claude process so it doesn't keep running
                        console.log(`[SD] M:PLAN_ABORT sub=${subId} - aborting claude process`)
                        abortController.abort()
                      }
                      break
                    case "background-task-started":
                      // Insert background task record into database
                      // Store static metadata (command, description) immediately for UI display
                      // Dynamic data (output, exitCode) will be derived from messages later
                      try {
                        const taskDb = getDatabase()
                        taskDb
                          .insert(backgroundTasks)
                          .values({
                            subChatId: input.subChatId,
                            chatId: input.chatId,
                            toolCallId: chunk.toolCallId,
                            outputFile: chunk.outputFile,
                            command: chunk.command,
                            description: chunk.description,
                            // sdkTaskId and sdkStatus will be filled later from tool-output and task-notification
                          })
                          .run()
                        console.log(
                          `[Tasks] Created background task: ${chunk.toolCallId} - ${chunk.command?.slice(0, 50) || ''}...`,
                        )
                        // Notify watcher to start/wake up for the new task
                        taskWatcher.notifyNewTask()
                      } catch (err) {
                        console.error("[Tasks] Failed to create background task:", err)
                      }
                      break
                    case "background-task-notification":
                      // SDK notifies us when a background task completes/fails/stops
                      // Update the task record with the status and output file path
                      try {
                        const taskDb = getDatabase()
                        console.log(
                          `[Tasks] Received task notification: taskId=${chunk.taskId}, status=${chunk.status}, outputFile=${chunk.outputFile}`
                        )

                        // First, try to find the task by sdkTaskId
                        let updateResult = taskDb
                          .update(backgroundTasks)
                          .set({
                            sdkStatus: chunk.status,
                            outputFile: chunk.outputFile || undefined,
                          })
                          .where(eq(backgroundTasks.sdkTaskId, chunk.taskId))
                          .run()

                        // If no match by sdkTaskId, try to find and update the most recent
                        // pending task for this subChat (fallback for when initial tool output
                        // didn't include task_id)
                        if (updateResult.changes === 0) {
                          console.log(`[Tasks] No task found by sdkTaskId, trying fallback lookup for subChat=${input.subChatId}`)

                          // Find tasks without sdkTaskId in this subChat
                          const pendingTasks = taskDb
                            .select()
                            .from(backgroundTasks)
                            .where(eq(backgroundTasks.subChatId, input.subChatId))
                            .all()
                            .filter((t: any) => !t.sdkTaskId && !t.sdkStatus)

                          if (pendingTasks.length > 0) {
                            // Update the most recent pending task (last one)
                            const taskToUpdate = pendingTasks[pendingTasks.length - 1]
                            console.log(`[Tasks] Found pending task ${taskToUpdate.id} to link with sdkTaskId=${chunk.taskId}`)

                            updateResult = taskDb
                              .update(backgroundTasks)
                              .set({
                                sdkTaskId: chunk.taskId,
                                sdkStatus: chunk.status,
                                outputFile: chunk.outputFile || undefined,
                              })
                              .where(eq(backgroundTasks.id, taskToUpdate.id))
                              .run()
                          }
                        }

                        if (updateResult.changes > 0) {
                          console.log(`[Tasks] Updated task status to ${chunk.status} for sdkTaskId=${chunk.taskId}`)

                          // Find the task to emit status change event
                          const updatedTask = taskDb
                            .select()
                            .from(backgroundTasks)
                            .where(eq(backgroundTasks.sdkTaskId, chunk.taskId))
                            .get()

                          if (updatedTask) {
                            // Emit status change event for UI updates
                            taskEvents.emit("status-change", {
                              id: updatedTask.id,
                              chatId: updatedTask.chatId,
                              subChatId: updatedTask.subChatId,
                              status: chunk.status === "completed" ? "completed" : chunk.status === "failed" ? "failed" : "stopped",
                              completedAt: new Date(),
                            })
                          }
                        } else {
                          console.warn(`[Tasks] No task found with sdkTaskId=${chunk.taskId} to update (subChat=${input.subChatId})`)
                        }
                      } catch (err) {
                        console.error("[Tasks] Failed to update task from notification:", err)
                      }
                      break
                    case "message-metadata":
                      metadata = { ...metadata, ...chunk.messageMetadata }
                      break
                    case "error":
                      // Check for invalid session error and clear sessionId from DB
                      if (
                        chunk.errorText.includes("No conversation found") ||
                        chunk.errorText.includes("Invalid session ID")
                      ) {
                        // Extract session ID from error message if possible
                        const sessionMatch = chunk.errorText.match(/session ID: ([a-f0-9-]+)/)
                        const brokenSessionId = sessionMatch ? sessionMatch[1] : null

                        console.log(`[claude] Detected broken session ID: ${brokenSessionId || 'unknown'}`)

                        if (brokenSessionId) {
                          // Add to broken sessions set to prevent future resume attempts
                          brokenSessionIds.add(brokenSessionId)
                          console.log(`[claude] Added ${brokenSessionId} to broken sessions list (${brokenSessionIds.size} total)`)
                        }

                        // Clear from database
                        db.update(subChats)
                          .set({ sessionId: null })
                          .where(eq(subChats.id, input.subChatId))
                          .run()
                        console.log(`[claude] Cleared session ID from subChat ${input.subChatId} in database`)
                      }
                      break
                    case "system-Compact":
                      // Add system-Compact to parts so it renders in the chat
                      // Find existing part by toolCallId or add new one
                      const existingCompact = parts.find(
                        (p) => p.type === "system-Compact" && p.toolCallId === chunk.toolCallId
                      )
                      if (existingCompact) {
                        existingCompact.state = chunk.state
                      } else {
                        parts.push({
                          type: "system-Compact",
                          toolCallId: chunk.toolCallId,
                          state: chunk.state,
                        })
                      }
                      break
                  }
                  // Detect result finish chunk
                  if (chunk.type === "finish") {
                    resultReceived = true

                    // Handle SDK errors from result message
                    if (chunk.messageMetadata?.resultSubtype === "error_during_execution") {
                      // Check for session-not-found error specifically
                      // The error is in the result.errors array, which gets passed through metadata
                      // We need to emit this as an error chunk if not already done by transform
                      console.log("[claude] SDK error detected in result, checking if session should be cleared")
                    }
                  }
                  // Break from chunk loop if plan is done
                  if (planCompleted) {
                    console.log(`[SD] M:PLAN_BREAK_CHUNK sub=${subId}`)
                    break
                  }
                }
                // Break from stream loop if result received
                if (resultReceived) {
                  console.log(`[SD] M:RESULT_BREAK sub=${subId} messageCount=${messageCount} chunkCount=${chunkCount}`)
                  break
                }
                // Break from stream loop if plan is done
                if (planCompleted) {
                  console.log(`[SD] M:PLAN_BREAK_STREAM sub=${subId}`)
                  break
                }
                // Break from stream loop if observer closed (user clicked Stop)
                if (!isObservableActive) {
                  console.log(`[SD] M:OBSERVER_CLOSED_STREAM sub=${subId}`)
                  break
                }
              }

              // Warn if stream yielded no messages
              if (messageCount === 0) {
                console.error(`[claude] Stream yielded no messages - model not responding`)
              }
            } catch (streamError) {
              // This catches errors during streaming (like process exit)
              const err = streamError as Error
              const stderrOutput = stderrLines.join("\n")

              // Build detailed error message with category
              let errorContext = "Claude streaming error"
              let errorCategory = "UNKNOWN"

              if (err.message?.includes("exited with code")) {
                errorContext = "Claude Code process crashed"
                errorCategory = "PROCESS_CRASH"
              } else if (err.message?.includes("ENOENT")) {
                errorContext = "Required executable not found in PATH"
                errorCategory = "EXECUTABLE_NOT_FOUND"
              } else if (
                err.message?.includes("authentication") ||
                err.message?.includes("401")
              ) {
                errorContext = "Authentication failed - check your API key"
                errorCategory = "AUTH_FAILURE"
              } else if (
                err.message?.includes("invalid_api_key") ||
                err.message?.includes("Invalid API Key") ||
                stderrOutput?.includes("invalid_api_key")
              ) {
                errorContext = "Invalid API key"
                errorCategory = "INVALID_API_KEY"
              } else if (
                err.message?.includes("rate_limit") ||
                err.message?.includes("429")
              ) {
                errorContext = "Session limit reached"
                errorCategory = "RATE_LIMIT"
              } else if (
                err.message?.includes("network") ||
                err.message?.includes("ECONNREFUSED") ||
                err.message?.includes("fetch failed")
              ) {
                errorContext = "Network error - check your connection"
                errorCategory = "NETWORK_ERROR"
              } else if (
                err.message?.includes("No conversation found") ||
                err.message?.includes("Invalid session ID")
              ) {
                errorContext = "Session no longer exists - please retry"
                errorCategory = "INVALID_SESSION"

                // Extract and track broken session ID
                const sessionMatch = err.message?.match(/session ID: ([a-f0-9-]+)/)
                const brokenSessionId = sessionMatch ? sessionMatch[1] : resumeSessionId

                if (brokenSessionId) {
                  brokenSessionIds.add(brokenSessionId)
                  console.log(`[claude] Added ${brokenSessionId} to broken sessions list (${brokenSessionIds.size} total)`)
                }

                // Clear invalid sessionId from database
                db.update(subChats)
                  .set({ sessionId: null })
                  .where(eq(subChats.id, input.subChatId))
                  .run()
                console.log(`[claude] Cleared invalid session ID from subChat ${input.subChatId}`)
              }

              // Send error with stderr output to frontend (only if not aborted by user)
              if (!abortController.signal.aborted) {
                safeEmit({
                  type: "error",
                  errorText: stderrOutput
                    ? `${errorContext}: ${err.message}\n\nProcess output:\n${stderrOutput}`
                    : `${errorContext}: ${err.message}`,
                  debugInfo: {
                    context: errorContext,
                    category: errorCategory,
                    cwd: input.cwd,
                    mode: input.mode,
                    stderr: stderrOutput || "(no stderr captured)",
                  },
                } as UIMessageChunk)
              }

              // ALWAYS save accumulated parts before returning (even on abort/error)
              console.log(`[SD] M:CATCH_SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`)
              if (currentText.trim()) {
                parts.push({ type: "text", text: currentText })
              }
              if (parts.length > 0) {
                const assistantMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  parts,
                  metadata,
                }
                const finalMessages = [...messagesToSave, assistantMessage]
                db.update(subChats)
                  .set({
                    messages: JSON.stringify(finalMessages),
                    sessionId: metadata.sessionId,
                    streamId: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(subChats.id, input.subChatId))
                  .run()
                db.update(chats)
                  .set({ updatedAt: new Date() })
                  .where(eq(chats.id, input.chatId))
                  .run()

                // Create snapshot stash for rollback support (on error)
                if (historyEnabled && metadata.sdkMessageUuid && input.cwd) {
                  await createRollbackStash(input.cwd, metadata.sdkMessageUuid)
                }
              }

              console.log(`[SD] M:END sub=${subId} reason=stream_error cat=${errorCategory} n=${chunkCount} last=${lastChunkType}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // 6. Check if we got any response
            if (messageCount === 0 && !abortController.signal.aborted) {
              emitError(
                new Error("No response received from Claude"),
                "Empty response",
              )
              console.log(`[SD] M:END sub=${subId} reason=no_response n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // 7. Save final messages to DB
            // ALWAYS save accumulated parts, even on abort (so user sees partial responses after reload)
            console.log(`[SD] M:SAVE sub=${subId} planCompleted=${planCompleted} aborted=${abortController.signal.aborted} parts=${parts.length}`)

            // Flush any remaining text
            if (currentText.trim()) {
              parts.push({ type: "text", text: currentText })
            }

            if (parts.length > 0) {
              const assistantMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                parts,
                metadata,
              }

              const finalMessages = [...messagesToSave, assistantMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(finalMessages),
                  sessionId: metadata.sessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            } else {
              // No assistant response - just clear streamId
              db.update(subChats)
                .set({
                  sessionId: metadata.sessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            // Update parent chat timestamp
            db.update(chats)
              .set({ updatedAt: new Date() })
              .where(eq(chats.id, input.chatId))
              .run()

            // Create snapshot stash for rollback support
            if (historyEnabled && metadata.sdkMessageUuid && input.cwd) {
              await createRollbackStash(input.cwd, metadata.sdkMessageUuid)
            }

            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            const reason = planCompleted ? "plan_complete" : "ok"
            console.log(`[SD] M:END sub=${subId} reason=${reason} n=${chunkCount} last=${lastChunkType} t=${duration}s`)
            safeComplete()
          } catch (error) {
            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            console.log(`[SD] M:END sub=${subId} reason=unexpected_error n=${chunkCount} t=${duration}s`)
            emitError(error, "Unexpected error")
            safeEmit({ type: "finish" } as UIMessageChunk)
            safeComplete()
          } finally {
            activeSessions.delete(input.subChatId)
            // Clean up active query object
            if (activeQueries.has(input.subChatId)) {
              activeQueries.delete(input.subChatId)
              console.log(`[CLAUDE] Cleaned up active query for subChat ${input.subChatId}`)
            }
          }
        })()

        // Cleanup on unsubscribe
        return () => {
          console.log(`[SD] M:CLEANUP sub=${subId} sessionId=${currentSessionId || 'none'}`)
          isObservableActive = false // Prevent emit after unsubscribe
          abortController.abort()
          activeSessions.delete(input.subChatId)
          clearPendingApprovals("Session ended.", input.subChatId)

          // Save sessionId on abort so conversation can be resumed
          // Clear streamId since we're no longer streaming
          // IMPORTANT: Don't save broken session IDs - they'll fail on resume
          const db = getDatabase()
          const shouldSaveSession = currentSessionId && !brokenSessionIds.has(currentSessionId)
          db.update(subChats)
            .set({
              streamId: null,
              ...(shouldSaveSession && { sessionId: currentSessionId })
            })
            .where(eq(subChats.id, input.subChatId))
            .run()
        }
      })
    }),

  /**
   * Get MCP servers configuration for a project
   * This allows showing MCP servers in UI before starting a chat session
   * Uses consolidated config from all sources (project, custom, user, custom)
   */
  getMcpConfig: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      try {
        // Get merged config from all sources
        const mergedConfig = await getMergedMcpConfig(input.projectPath)

        if (!mergedConfig.mcpServers || Object.keys(mergedConfig.mcpServers).length === 0) {
          return { mcpServers: [], projectPath: input.projectPath }
        }

        // Convert to array format with names
        const mcpServers = Object.entries(mergedConfig.mcpServers).map(([name, serverConfig]) => ({
          name,
          // Status will be "pending" until SDK actually connects
          status: "pending" as const,
          // Include config details for display (command, args, etc)
          config: serverConfig as Record<string, unknown>,
        }))

        return { mcpServers, projectPath: input.projectPath }
      } catch (error) {
        console.error("[getMcpConfig] Error reading consolidated config:", error)
        return { mcpServers: [], projectPath: input.projectPath, error: String(error) }
      }
    }),

  /**
   * Cancel active session
   */
  cancel: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      const controller = activeSessions.get(input.subChatId)
      if (controller) {
        controller.abort()
        activeSessions.delete(input.subChatId)
        clearPendingApprovals("Session cancelled.", input.subChatId)
        return { cancelled: true }
      }
      return { cancelled: false }
    }),

  /**
   * Check if session is active
   */
  isActive: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => activeSessions.has(input.subChatId)),
  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
      }),
    )
    .mutation(({ input }) => {
      const pending = pendingToolApprovals.get(input.toolUseId)
      if (!pending) {
        return { ok: false }
      }
      pending.resolve({
        approved: input.approved,
        message: input.message,
        updatedInput: input.updatedInput,
      })
      pendingToolApprovals.delete(input.toolUseId)
      return { ok: true }
    }),

  /**
   * Query the background Claude session with a custom prompt
   * Returns AI response without creating a chat session
   */
  queryPrompt: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        model: z.enum(["haiku", "sonnet", "opus"]).optional(),
        maxTokens: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { queryBackgroundSession } = await import("../../claude/background-session")
      return queryBackgroundSession(input.prompt, {
        model: input.model,
        maxTokens: input.maxTokens,
      })
    }),

  /**
   * Fix TypeScript/ESLint errors in a file using Claude
   */
  fixLintErrors: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
        diagnostics: z.array(
          z.object({
            message: z.string(),
            line: z.number().optional(),
            column: z.number().optional(),
            severity: z.string().optional(),
          })
        ),
        cwd: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { fixLintErrors } = await import("../../claude/background-session")
      return fixLintErrors(input.filePath, input.diagnostics, input.cwd)
    }),

  /**
   * Reconnect a failed MCP server without restarting the chat session
   * Requires SDK 0.2.21+ with runtime MCP server management
   */
  reconnectMcpServer: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        serverName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const query = activeQueries.get(input.subChatId) as any
      if (!query) {
        throw new Error(`No active session for subChat ${input.subChatId}`)
      }
      if (!query.reconnectMcpServer) {
        throw new Error("SDK version does not support reconnectMcpServer. Requires SDK 0.2.21+")
      }
      console.log(`[CLAUDE] Reconnecting MCP server: ${input.serverName}`)
      await query.reconnectMcpServer(input.serverName)
      return { success: true, serverName: input.serverName }
    }),

  /**
   * Toggle MCP server on/off without restarting the chat session
   * Requires SDK 0.2.21+ with runtime MCP server management
   */
  toggleMcpServer: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        serverName: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const query = activeQueries.get(input.subChatId) as any
      if (!query) {
        throw new Error(`No active session for subChat ${input.subChatId}`)
      }
      if (!query.toggleMcpServer) {
        throw new Error("SDK version does not support toggleMcpServer. Requires SDK 0.2.21+")
      }
      console.log(`[CLAUDE] Toggling MCP server ${input.serverName}: ${input.enabled ? 'enabled' : 'disabled'}`)
      await query.toggleMcpServer(input.serverName, input.enabled)
      return { success: true, serverName: input.serverName, enabled: input.enabled }
    }),

  /**
   * Rewind files to a previous message state using SDK-native checkpointing
   * Replaces git stash-based rollback with more precise file-level tracking
   * Requires SDK 0.2.21+ with enableFileCheckpointing: true
   */
  rewindFiles: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        userMessageId: z.string(), // SDK message UUID to rewind to
        dryRun: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const query = activeQueries.get(input.subChatId) as any
      if (!query) {
        throw new Error(`No active session for subChat ${input.subChatId}`)
      }
      if (!query.rewindFiles) {
        throw new Error("SDK version does not support rewindFiles. Requires SDK 0.2.21+ with enableFileCheckpointing")
      }
      console.log(`[CLAUDE] Rewinding files to message ${input.userMessageId} (dryRun: ${input.dryRun})`)
      const result = await query.rewindFiles(input.userMessageId, { dryRun: input.dryRun })
      return {
        success: true,
        dryRun: input.dryRun,
        filesChanged: result.filesChanged || 0,
        insertions: result.insertions || 0,
        deletions: result.deletions || 0,
        changes: result.changes || [],
      }
    }),
})
