// Copyright 2026 Claw Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { app, BrowserWindow, safeStorage } from "electron"
import * as fs from "fs/promises"
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, statSync, appendFileSync, readdirSync, rmSync } from "fs"
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
  ensureValidOAuthToken,
  type UIMessageChunk,
} from "../../claude"
import {
  backgroundTasks,
  chats,
  claudeCodeCredentials,
  claudeCodeSettings,
  getDatabase,
  subChats,
  systemPrompts,
} from "../../db"
import { createRollbackStash } from "../../git/stash"
import {
  shouldOffloadOutput,
  storeToolOutput,
  loadToolOutput,
  deleteSubChatOutputs,
  createOffloadedReference,
} from "../../tool-output-storage"
import { publicProcedure, router } from "../index"
import { buildAgentsOption } from "./agent-utils"
import { getMergedMcpConfig } from "../../config/consolidator"
import { taskEvents, taskWatcher } from "../../background-tasks"
import { injectAllStoredCredentials } from "../../mcp/credential-injection"
import { toSdkMcpConfigs, type SdkMcpServerConfig } from "../../config/types"

import { ensureSymlinks } from "../../session/symlink-manager"
import {
  getCachedMcpTools,
  setCachedMcpTools,
  getMcpServerStatusCache,
  setMcpServerStatusCache,
  loadMcpStatusFromDisk,
  saveMcpStatusToDisk,
  clearMcpCaches,
  getAllMcpServerStatusCaches,
  type McpToolsCacheEntry,
  type McpServerWithTools,
} from "../../mcp/cache"
import {
  registerSession,
  getSession,
  removeSession,
  hasActiveSession,
  getSessionQuery,
  abortSession,
  updateSessionQuery,
  updateSessionId,
} from "../../session/session-registry"
import { sendToPlatform, sendTypingToPlatform, reactOnPlatform } from "../../messaging"
import { getWhatsAppQueue } from "../../messaging/whatsapp-queue"

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

// Cache for Ollama model context windows (keyed by baseUrl + modelName)
const ollamaContextWindowCache = new Map<string, { contextWindow: number; timestamp: number }>()
const CONTEXT_WINDOW_CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Cache for Ollama models list (keyed by baseUrl)
let ollamaModelsListCache: {
  baseUrl: string
  filterRemote: boolean
  models: any[]
  expiresAt: number
} | null = null
const OLLAMA_MODELS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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
 * Clear all performance caches (for testing/debugging)
 */
export function clearClaudeCaches() {
  cachedClaudeQuery = null
  clearMcpCaches()
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

      // Skip projects that no longer exist on disk
      if (!existsSync(projectPath)) {
        console.log(`[MCP Warmup] Skipping removed project: ${projectPath}`)
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

    // Ensure credentials are valid before warmup queries
    await ensureValidOAuthToken()
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

        // Convert to SDK-compatible format
        const sdkServers = toSdkMcpConfigs(serversWithCredentials)

        // Create a minimal query to initialize MCP servers
        const warmupQuery = claudeQuery({
          prompt: "ping",
          options: {
            cwd: project.path,
            mcpServers: sdkServers,
            systemPrompt: {
              type: "preset" as const,
              preset: "claude_code" as const,
            },
            env: buildClaudeEnv(),
            permissionMode: "bypassPermissions" as const,
            allowDangerouslySkipPermissions: true,
            pathToClaudeCodeExecutable: getBundledClaudeBinaryPath(),
            stderr: (data: string) => {
              console.error(`[MCP Warmup stderr] ${data}`)
            },
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

            setMcpServerStatusCache(project.path, statusMap)

            // Cache tools
            if (serversWithTools.length > 0) {
              setCachedMcpTools(project.path, {
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

    const totalServers = Array.from(getAllMcpServerStatusCaches().values())
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

    // Available models (simplified - SDK resolves actual versions)
    const availableModels = [
      {
        id: 'opus',
        name: 'Claude Opus',
        description: 'Most capable model for complex tasks',
        modelId: 'opus',
      },
      {
        id: 'sonnet',
        name: 'Claude Sonnet',
        description: 'Balanced performance and speed with 1M context',
        modelId: 'sonnet',
        contextWindow: '1M',
      },
      {
        id: 'haiku',
        name: 'Claude Haiku',
        description: 'Fastest model for quick tasks with 1M context',
        modelId: 'haiku',
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
   * Fetch available models from Ollama API
   */
  getOllamaModels: publicProcedure
    .input(
      z.object({
        baseUrl: z.string(),
        apiKey: z.string().optional(),
        filterRemote: z.boolean().optional(), // When true, only return remote/cloud models (for local endpoints)
      })
    )
    .query(async ({ input }) => {
      try {
        // Normalize the base URL
        let url = input.baseUrl.trim()
        if (url.endsWith('/')) {
          url = url.slice(0, -1)
        }

        // Check cache first
        const filterRemote = input.filterRemote ?? false
        const now = Date.now()
        if (
          ollamaModelsListCache &&
          ollamaModelsListCache.baseUrl === url &&
          ollamaModelsListCache.filterRemote === filterRemote &&
          ollamaModelsListCache.expiresAt > now
        ) {
          console.log('[claude] Using cached Ollama models list')
          return {
            success: true,
            models: ollamaModelsListCache.models,
          }
        }

        const apiTagsUrl = `${url}/api/tags`

        const headers: Record<string, string> = {
          'Accept': 'application/json',
        }

        // Add authentication if provided
        if (input.apiKey) {
          headers['Authorization'] = `Bearer ${input.apiKey}`
        }

        const response = await fetch(apiTagsUrl, {
          method: 'GET',
          headers,
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          console.error(`[claude] Ollama API error (${response.status}):`, errorText)
          return {
            success: false,
            error: `Failed to fetch models: ${response.status} ${response.statusText}`,
            models: [],
          }
        }

        const data = await response.json()

        // Detect if this is a cloud endpoint (ollama.com or similar)
        const isCloudEndpoint = url.includes('ollama.com') || !url.includes('localhost') && !url.includes('127.0.0.1')

        // Ollama API returns { models: Array<{ name: string, model?: string, remote_model?: string, ... }> }
        // - Cloud endpoint: All models are cloud models, no remote_model field
        // - Local endpoint: Models pulled from cloud have remote_model/remote_host fields
        let rawModels = data.models || []

        // Filter to only remote models if requested AND this is a local endpoint
        // (Cloud endpoints already return only cloud models)
        if (input.filterRemote && !isCloudEndpoint) {
          rawModels = rawModels.filter((model: any) => model.remote_model || model.remote_host)
        }

        // Fetch context window for each model using /api/show endpoint (with caching)
        const fetchContextWindow = async (modelName: string): Promise<number | undefined> => {
          const cacheKey = `${url}:${modelName}`
          const cached = ollamaContextWindowCache.get(cacheKey)
          if (cached && Date.now() - cached.timestamp < CONTEXT_WINDOW_CACHE_TTL) {
            return cached.contextWindow
          }

          try {
            const showUrl = `${url}/api/show`
            const showResponse = await fetch(showUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: modelName }),
            })
            if (showResponse.ok) {
              const showData = await showResponse.json()
              // context_length is returned in the model_info
              const contextWindow = showData.model_info?.['llama.context_length']?.int ||
                     showData.model_info?.['glm.context_length']?.int ||
                     showData.context_length
              if (contextWindow) {
                ollamaContextWindowCache.set(cacheKey, { contextWindow, timestamp: Date.now() })
              }
              return contextWindow
            }
          } catch (err) {
            console.warn(`[claude] Failed to get context window for ${modelName}:`, err)
          }
          return undefined
        }

        // Fetch all model details in parallel
        const modelDetails = await Promise.all(
          rawModels.map(async (model: any) => {
            const modelId = model.model || model.name
            const contextWindow = await fetchContextWindow(modelId)
            return { modelId, contextWindow }
          })
        )

        const contextWindowMap = new Map(modelDetails.map(m => [m.modelId, m.contextWindow]))

        const models = rawModels.map((model: any) => ({
          id: model.model || model.name,
          name: model.name,
          // For remote models on local endpoint, use the remote_model name if available (cleaner display)
          displayName: model.remote_model || model.name,
          description: model.details?.description || `${model.details?.parameter_size || ''} ${model.details?.family || ''}`.trim() || (model.remote_model ? 'Cloud model' : 'Cloud model'),
          size: model.size,
          isRemote: isCloudEndpoint || !!(model.remote_model || model.remote_host),
          // Include context window if available
          contextWindow: contextWindowMap.get(model.model || model.name),
        }))

        // Update cache
        ollamaModelsListCache = {
          baseUrl: url,
          filterRemote,
          models,
          expiresAt: Date.now() + OLLAMA_MODELS_CACHE_TTL,
        }

        return {
          success: true,
          models,
        }
      } catch (error) {
        console.error('[claude] Failed to fetch Ollama models:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to connect to Ollama',
          models: [],
        }
      }
    }),

  /**
   * Clear Ollama models cache (both list and context window caches)
   */
  clearOllamaModelsCache: publicProcedure.mutation(() => {
    ollamaModelsListCache = null
    ollamaContextWindowCache.clear()
    console.log('[claude] Ollama models cache cleared')
    return { success: true }
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
        maxTokens: z.number().optional(), // Maximum output tokens
        // Thinking configuration
        thinking: z.enum(["adaptive", "enabled", "disabled"]).optional(), // Thinking mode
        budgetTokens: z.number().optional(), // Only used when thinking="enabled" (older models)
        maxThinkingTokens: z.number().optional(), // Legacy: budget for extended thinking (deprecated, use thinking="enabled" instead)
        effort: z.enum(["low", "medium", "high", "max"]).optional(), // Thinking depth (works with adaptive)
        images: z.array(imageAttachmentSchema).optional(), // Image attachments
        historyEnabled: z.boolean().optional(),
        disableMcpAndSkills: z.boolean().optional(), // Skip MCP servers and skill loading (e.g. visualization chat)
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        // Check for existing session and abort it before creating new one
        // This prevents race conditions where the old AbortController affects the new session
        const existingSession = getSession(input.subChatId)
        if (existingSession) {
          console.log(`[SD] Aborting existing session for subChat ${input.subChatId.slice(-8)}`)
          existingSession.abortController.abort()
          removeSession(input.subChatId)
        }

        const abortController = new AbortController()
        const streamId = crypto.randomUUID()

        // Register session in unified registry
        registerSession({
          subChatId: input.subChatId,
          chatId: input.chatId,
          abortController,
          query: null, // Will be set after SDK query is created
          sessionId: null, // Will be updated from DB or SDK
          streamId,
          startedAt: Date.now(),
        })

        // Stream debug logging
        const subId = input.subChatId.slice(-8) // Short ID for logs
        const streamStart = Date.now()
        let chunkCount = 0
        let lastChunkType = ""
        // Shared sessionId for cleanup to save on abort
        let currentSessionId: string | null = null
        // Flag to prevent cleanup from re-writing an invalid session ID back to DB
        let sessionInvalid = false
        // Connection info for typing indicators and reactions (populated after DB lookup)
        let connectionPlatform: string | null = null
        let connectionTarget: string | null = null
        let lastWhatsAppMessageKey: any = null // For emoji reactions
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
            debugInfo: {
              context,
              cwd: input.cwd,
              mode: input.mode,
              PATH: process.env.PATH?.slice(0, 200),
            },
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

            // Look up parent chat's messaging connection for typing indicators
            if (existing?.chatId) {
              const parentChat = db.select().from(chats).where(eq(chats.id, existing.chatId)).get()
              console.log(`[claude] Connection lookup: chatId=${existing.chatId}, type=${parentChat?.connectionType}, target=${parentChat?.connectionTarget?.slice(0, 20)}`)
              if (parentChat?.connectionType && parentChat.connectionType !== "none" && parentChat.connectionTarget) {
                connectionPlatform = parentChat.connectionType
                connectionTarget = parentChat.connectionTarget

                // Find the last WhatsApp message's key for reactions
                const lastWaMsg = [...existingMessages].reverse().find(
                  (m: any) => m.metadata?.source === "whatsapp" && m.metadata?.messageKey
                )
                lastWhatsAppMessageKey = lastWaMsg?.metadata?.messageKey || null

                // React with ⏳ to indicate we're processing
                if (lastWhatsAppMessageKey) {
                  console.log(`[claude] Reacting ⏳ to WhatsApp message`)
                  reactOnPlatform(connectionPlatform as any, connectionTarget, lastWhatsAppMessageKey, "⏳").catch(() => {})
                }

                // Also send typing indicator
                sendTypingToPlatform(connectionPlatform as any, connectionTarget, true).catch(() => {})
              }
            } else {
              console.log(`[claude] No chatId on subChat — skipping typing indicator`)
            }

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

            // Skip agents/MCP/skills when disabled (e.g. visualization chat)
            if (!input.disableMcpAndSkills) {
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

            // Ensure credentials are valid (auto-refresh if needed) before building env
            await ensureValidOAuthToken()
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
            let mcpServersForSdk: Record<string, SdkMcpServerConfig> | undefined

            // Ensure isolated config dir exists and symlink skills/agents from ~/.claude/
            // This is idempotent - recreates symlinks if directory was deleted
            // BUNDLED GSD: Prefer bundled GSD resources over user's ~/.claude/ directory
            try {
              await ensureSymlinks(isolatedConfigDir)

              // Skip MCP loading when disabled (e.g. visualization split chat)
              if (!input.disableMcpAndSkills) {
                // Get merged MCP config from all sources (project, custom, user, custom)
                // This consolidates configs in priority order: project (10) → custom (20) → user (100)
                try {
                  const lookupPath = input.projectPath || input.cwd
                  const mergedConfig = await getMergedMcpConfig(lookupPath)
                  // Inject stored OAuth credentials into server configs
                  const serversWithCredentials = await injectAllStoredCredentials(mergedConfig.mcpServers || {})
                  // Convert to SDK-compatible format
                  mcpServersForSdk = toSdkMcpConfigs(serversWithCredentials)
                } catch (configErr) {
                  console.error(`[claude] Failed to get merged MCP config:`, configErr)
                }
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
              // Pass max_tokens if specified
              ...(input.maxTokens && {
                CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(input.maxTokens),
              }),
            }

            // Get bundled Claude binary path
            const claudeBinaryPath = getBundledClaudeBinaryPath()

            // Backend is sole authority for session IDs - read from database
            let resumeSessionId = existingSessionId || undefined

            console.log(`[claude] Session ID to resume: ${resumeSessionId}`)
            console.log(`[claude] Resume at UUID: ${resumeAtUuid}`)

            // Clean up stale session state when starting fresh (no resumeSessionId)
            // The SDK can discover old sessions from projects/, debug/, todos/, or any subdirectory
            // To prevent "No conversation found" errors, remove the ENTIRE isolated config directory
            if (!resumeSessionId && existsSync(isolatedConfigDir)) {
              try {
                await fs.rm(isolatedConfigDir, { recursive: true, force: true })
                console.log(`[claude] Deleted isolated config directory for fresh start`)
                // Recreate the directory and re-run symlinks (cleanup wiped them)
                mkdirSync(isolatedConfigDir, { recursive: true })
                await ensureSymlinks(isolatedConfigDir)
              } catch (cleanupErr) {
                console.warn(`[claude] Failed to clean up session directory:`, cleanupErr)
              }
            }
            
            // Verify worktree exists before using it as cwd
            let verifiedCwd = input.cwd
            try {
              const cwdStat = await fs.stat(input.cwd)
              if (!cwdStat.isDirectory()) {
                console.warn(`[claude] cwd is not a directory: ${input.cwd}, falling back to projectPath`)
                verifiedCwd = input.projectPath || input.cwd
              }
            } catch (error) {
              console.warn(`[claude] cwd does not exist: ${input.cwd}, falling back to projectPath`)
              verifiedCwd = input.projectPath || input.cwd
            }

            console.log(`[SD] Query options - cwd: ${verifiedCwd}, projectPath: ${input.projectPath || "(not set)"}, mcpServers: ${mcpServersForSdk ? Object.keys(mcpServersForSdk).join(", ") : "(none)"}`)
            if (finalCustomConfig) {
              const redactedConfig = {
                ...finalCustomConfig,
                token: `${finalCustomConfig.token.slice(0, 6)}...`,
                apiKey: finalCustomConfig.apiKey ? `${finalCustomConfig.apiKey.slice(0, 6)}...` : undefined,
                ollamaApiKey: finalCustomConfig.ollamaApiKey ? `${finalCustomConfig.ollamaApiKey.slice(0, 6)}...` : undefined,
              }
              console.log(`[claude] Custom config: ${JSON.stringify(redactedConfig)}`)
            }

            // For Ollama/custom API: prioritize UI-selected model over stored config model
            // This allows users to switch models per-chat from the dropdown
            const resolvedModel = input.model || finalCustomConfig?.model

            // Agent teams is always enabled - set team mode metadata so the UI
            // uses AgentTeamGroup to display parallel Task tool calls
            metadata.isTeamMode = true

            // Filter MCP servers: skip ONLY non-working servers (failed, needs-auth)
            // Pass working/unknown servers in options so Claude can see them
            // OPTIMIZATION: Cache is populated at app startup via warmupMcpCache()
            let mcpServersFiltered: Record<string, SdkMcpServerConfig> | undefined

            if (mcpServersForSdk) {
              const lookupPath = input.projectPath || input.cwd

              // Load cached statuses from disk if needed
              if (!getMcpServerStatusCache(lookupPath)) {
                loadMcpStatusFromDisk()
              }

              // Pass ALL servers to Claude SDK without filtering
              // Let Claude handle auth issues and show proper errors to users
              // The SDK will report accurate statuses in the init message
              console.log(`[MCP] Passing all ${Object.keys(mcpServersForSdk).length} servers to SDK (filtering disabled)`)
              mcpServersFiltered = mcpServersForSdk

              // Load cached statuses from disk if needed (for logging/debugging)
              if (!getMcpServerStatusCache(lookupPath)) {
                loadMcpStatusFromDisk()
              }
            }

            // System prompt config - use preset for normal mode, custom for visualization chat
            let systemPromptConfig = {
              type: "preset" as const,
              preset: "claude_code" as const,
            }

            // Load github_visualization_chat system prompt from DB when MCP/skills disabled
            // This is used for the GitHub visualization split-view chat
            if (input.disableMcpAndSkills) {
              const db = getDatabase()
              const vizPrompt = db.select().from(systemPrompts)
                .where(eq(systemPrompts.key, "github_visualization_chat"))
                .get()

              if (vizPrompt) {
                // For custom system prompts, pass the content directly as a string
                // The SDK will merge it with the preset
                systemPromptConfig = {
                  type: "preset" as const,
                  preset: "claude_code" as const,
                }
              }
            }

            const queryOptions = {
              prompt,
              options: {
                abortController, // Must be inside options!
                cwd: verifiedCwd,
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
                // allowDangerouslySkipPermissions is only required for bypassPermissions mode
                ...(input.mode !== "plan" && {
                  allowDangerouslySkipPermissions: true,
                }),
                includePartialMessages: true,
                // Load skills from project, user, and local plugin directories
                // Skipped when disableMcpAndSkills is set (e.g. visualization split chat)
                ...(!input.disableMcpAndSkills && {
                  settingSources: ["project" as const, "user" as const, "local" as const],
                }),
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
                          behavior: "deny" as const,
                          message:
                            'Only ".md" files can be modified in plan mode.',
                        }
                      }
                    } else if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
                      return {
                        behavior: "deny" as const,
                        message: `Tool "${toolName}" blocked in plan mode.`,
                      }
                    }
                  }
                  if (toolName === "AskUserQuestion") {
                    const { toolUseID } = options

                    // Coerce questions format: model sometimes emits options as strings
                    // instead of { label, description } objects, failing SDK validation.
                    const rawQuestions = (toolInput as any).questions
                    const coercedQuestions = Array.isArray(rawQuestions)
                      ? rawQuestions.map((q: any) => {
                          if (typeof q === "string") {
                            return { question: q, header: q.slice(0, 12), options: [], multiSelect: false }
                          }
                          const opts = Array.isArray(q.options)
                            ? q.options.map((o: any) =>
                                typeof o === "string" ? { label: o, description: o } : o
                              )
                            : []
                          return { ...q, options: opts }
                        })
                      : rawQuestions

                    // Update toolInput with coerced questions for SDK validation
                    ;(toolInput as any).questions = coercedQuestions

                    // Emit to UI (safely in case observer is closed)
                    safeEmit({
                      type: "ask-user-question",
                      toolUseId: toolUseID,
                      questions: coercedQuestions,
                    } as UIMessageChunk)

                    // Forward question to connected channel/group (fire-and-forget)
                    try {
                      // Get parent chatId from subChat first
                      const subChat = getDatabase().select().from(subChats).where(eq(subChats.id, input.subChatId)).get()
                      if (!subChat?.chatId) return

                      const parentChat = getDatabase().select().from(chats).where(eq(chats.id, subChat.chatId)).get()
                      if (parentChat?.connectionType && parentChat.connectionType !== "none" && parentChat.connectionTarget) {
                        const questionText = (coercedQuestions as any[]).map((q: any) => {
                          const opts = q.options?.map((o: any) => o.label || String(o)).join(", ")
                          return `❓ ${q.question}${opts ? `\nOptions: ${opts}` : ""}`
                        }).join("\n")
                        sendToPlatform(parentChat.connectionType, parentChat.connectionTarget, questionText).catch(console.error)
                      }
                    } catch (e) {
                      console.error("[claude] Failed to forward question to channel:", e)
                    }

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
                        behavior: "deny" as const,
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
                      behavior: "allow" as const,
                      updatedInput: response.updatedInput as Record<string, unknown>,
                    }
                  }
                  // Coerce ExitPlanMode's allowedPrompts: model sometimes emits
                  // strings instead of { tool, prompt } objects, failing SDK validation.
                  if (toolName === "ExitPlanMode") {
                    const raw = toolInput.allowedPrompts
                    if (Array.isArray(raw)) {
                      const coerced = raw.map((item) =>
                        typeof item === "string"
                          ? { tool: "Bash", prompt: item }
                          : item
                      )
                      return {
                        behavior: "allow" as const,
                        updatedInput: { ...toolInput, allowedPrompts: coerced },
                      }
                    }
                  }
                  return {
                    behavior: "allow" as const,
                    updatedInput: toolInput,
                  }
                },
                stderr: (data: string) => {
                  if (stderrLines.length < 200) {
                    stderrLines.push(data)
                  }
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
                // Thinking configuration - replaces deprecated maxThinkingTokens
                // For Opus 4.6 and Sonnet 4.6, use adaptive thinking (model decides when/how much to think)
                // For older models, use enabled with budgetTokens
                // Reference: https://docs.anthropic.com/en/docs/build-with-claude/adaptive-thinking
                ...(() => {
                  // If thinking mode is explicitly specified, use it
                  if (input.thinking) {
                    if (input.thinking === "adaptive") {
                      return { thinking: { type: "adaptive" as const } }
                    } else if (input.thinking === "enabled") {
                      return { thinking: { type: "enabled" as const, budgetTokens: input.budgetTokens ?? 16000 } }
                    } else if (input.thinking === "disabled") {
                      return { thinking: { type: "disabled" as const } }
                    }
                  }
                  // Legacy support: maxThinkingTokens from frontend (deprecated)
                  if (input.maxThinkingTokens) {
                    // Treat as "enabled" mode with budget
                    return { thinking: { type: "enabled" as const, budgetTokens: input.maxThinkingTokens } }
                  }
                  // Default: check database for thinking settings
                  const db = getDatabase()
                  const settings = db
                    .select()
                    .from(claudeCodeSettings)
                    .where(eq(claudeCodeSettings.id, "default"))
                    .get()

                  // If extended thinking is enabled in settings, use adaptive for modern models
                  if (settings?.extendedThinkingEnabled) {
                    return { thinking: { type: "adaptive" as const } }
                  }

                  // No thinking configuration
                  return {}
                })(),
                // Effort parameter - controls thinking depth (low/medium/high/max)
                // Works with adaptive thinking for cost-quality tradeoffs
                // max is Opus 4.6 only, default is high
                ...(input.effort && { output_config: { effort: input.effort } }),
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
                // SDK expects Record<HookEvent, HookCallbackMatcher[]> where each matcher has { hooks: HookCallback[] }
                hooks: {
                  // Desktop notifications for important events
                  Notification: [{
                    hooks: [async (input: any) => {
                      const { message } = input
                      console.log(`[CLAUDE] Notification: ${message}`)
                      const mainWindow = BrowserWindow.getAllWindows()[0]
                      if (mainWindow) {
                        mainWindow.webContents.send('claude-notification', { type: 'info', message })
                      }
                      return {}
                    }],
                  }],
                  // Pre-tool use guardrails
                  PreToolUse: [{
                    hooks: [async (input: any) => {
                      const { tool_name, tool_input } = input
                      console.log(`[CLAUDE] PreToolUse: ${tool_name}`)
                      if (tool_name === "Bash" && typeof tool_input?.command === "string") {
                        const dangerousPatterns = ["rm -rf", "sudo rm", "format", "mkfs"]
                        if (dangerousPatterns.some(p => tool_input.command.includes(p))) {
                          console.warn(`[CLAUDE] ⚠️ Potentially destructive Bash command: ${tool_input.command}`)
                        }
                      }
                      return {}
                    }],
                  }],
                  // Post-tool use audit logging
                  PostToolUse: [{
                    hooks: [async (input: any) => {
                      const { tool_name, tool_response } = input
                      console.log(`[CLAUDE] PostToolUse: ${tool_name} - status: ${tool_response?.status || 'unknown'}`)
                      return {}
                    }],
                  }],
                  // Agent team events (when experimental flag enabled)
                  TeammateIdle: [{
                    hooks: [async (input: any) => {
                      const { teammate_name } = input
                      console.log(`[CLAUDE] TeammateIdle: ${teammate_name}`)
                      safeEmit({ type: "teammate-idle", teammateName: teammate_name } as UIMessageChunk)
                      return {}
                    }],
                  }],
                  TaskCompleted: [{
                    hooks: [async (input: any) => {
                      const { task_id, task_subject } = input
                      console.log(`[CLAUDE] TaskCompleted: ${task_id} - ${task_subject}`)
                      safeEmit({ type: "task-completed", taskId: task_id, taskSubject: task_subject } as UIMessageChunk)
                      const mainWindow = BrowserWindow.getAllWindows()[0]
                      if (mainWindow) {
                        mainWindow.webContents.send('claude-notification', {
                          type: 'success',
                          message: `Task completed: ${task_subject}`,
                        })
                      }
                      return {}
                    }],
                  }],
                  // Worktree lifecycle hooks - SDK notifies us when it creates/removes worktrees
                  WorktreeCreate: [{
                    hooks: [async (input: any) => {
                      const { name, cwd, session_id } = input
                      console.log(`[CLAUDE] WorktreeCreate: ${name} in session ${session_id}`)
                      // The SDK is creating a worktree - we should verify it exists or create it
                      // Return {} to allow the SDK to proceed with its own worktree creation
                      return {}
                    }],
                  }],
                  WorktreeRemove: [{
                    hooks: [async (input: any) => {
                      const { worktree_path, session_id } = input
                      console.log(`[CLAUDE] WorktreeRemove: ${worktree_path} in session ${session_id}`)
                      // The SDK is removing a worktree - we can clean up any associated resources
                      // Return {} to allow the SDK to proceed with its own worktree removal
                      return {}
                    }],
                  }],
                },
              },
            }

            // 5. Run Claude SDK
            // Check if session was aborted during setup (race condition)
            if (abortController.signal.aborted) {
              console.log(`[SD] M:END sub=${subId} reason=aborted_before_query n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            let stream
            try {
              stream = claudeQuery(queryOptions)
              // Store query object in session registry for MCP server runtime control and file checkpointing
              updateSessionQuery(input.subChatId, stream)
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

            // Reset per-attempt state
            let messageCount = 0
            let lastError: Error | null = null
            let planCompleted = false // Reset for each attempt
            let exitPlanModeToolCallId: string | null = null // Track ExitPlanMode's toolCallId
            let firstMessageReceived = false
            let resultReceived = false // Flag to stop after result message
            const streamIterationStart = Date.now()

            // Streaming inactivity timeout — if binary hangs (e.g., stuck session resume),
            // abort after 90s of no messages and surface an error to the UI
            const STREAM_TIMEOUT_MS = 90_000
            let streamTimeoutHandle: ReturnType<typeof setTimeout> | null = null
            const resetStreamTimeout = () => {
              if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle)
              streamTimeoutHandle = setTimeout(() => {
                console.error(`[claude] Stream timeout: no messages received for ${STREAM_TIMEOUT_MS / 1000}s — aborting`)
                // Clear the session to prevent the same hang on retry
                try {
                  if (existsSync(isolatedConfigDir)) {
                    rmSync(isolatedConfigDir, { recursive: true, force: true })
                    console.log(`[claude] Removed timed-out session dir: ${isolatedConfigDir}`)
                  }
                } catch (rmErr) {
                  console.error(`[claude] Failed to remove session dir:`, rmErr)
                }
                db.update(subChats)
                  .set({ sessionId: null })
                  .where(eq(subChats.id, input.subChatId))
                  .run()
                console.log(`[claude] Cleared session ID for subChat ${input.subChatId} after timeout`)

                safeEmit({
                  type: "error",
                  errorText: "Claude stopped responding. The session has been reset — please resend your message.",
                  debugInfo: { category: "STREAM_TIMEOUT", timeoutMs: STREAM_TIMEOUT_MS },
                } as UIMessageChunk)
                safeEmit({ type: "finish" } as UIMessageChunk)
                safeComplete()
                abortController.abort()
              }, STREAM_TIMEOUT_MS)
            }
            resetStreamTimeout() // Start the initial timeout

            // Refresh typing indicator every 20s (WhatsApp auto-expires after ~25s)
            let typingIntervalHandle: ReturnType<typeof setInterval> | null = null
            if (connectionPlatform && connectionTarget) {
              typingIntervalHandle = setInterval(() => {
                sendTypingToPlatform(connectionPlatform as any, connectionTarget!, true).catch(() => {})
              }, 20_000)
            }

            try {
              for await (const msg of stream) {
                resetStreamTimeout() // Reset timeout on every message

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

                  // Log message content for context length errors
                  const errorText = msgAny.message?.content?.[0]?.text || sdkError
                  console.log(`[claude] Error text for detection: "${errorText.slice(0, 200)}"`)
                  console.log(`[claude] SDK error type: "${sdkError}"`)
                  console.log(`[claude] Checking context error: prompt too long = ${errorText.toLowerCase().includes("prompt too long")}`)

                  // Check for 500 API errors (Internal Server Error from Anthropic)
                  // These are transient server-side errors that should be retryable
                  const isApi500Error =
                    errorText.includes("API Error: 500") ||
                    errorText.includes("Internal Server Error") ||
                    (errorText.includes("500") && errorText.includes("api_error"))

                  if (isApi500Error) {
                    console.log(`[claude] 500 API error detected - emitting retryable error event`)
                    // Emit a special retryable error event for the frontend to handle
                    safeEmit({
                      type: "api-error",
                      errorText: "Claude API returned a 500 Internal Server Error. This is a temporary issue on the provider's end.",
                      isRetryable: true,
                      errorCode: "API_500_ERROR",
                    } as UIMessageChunk)
                  }

                  // Check for corrupted session errors (malformed tool_use, missing fields, etc.)
                  // These require wiping the session and starting fresh
                  const isCorruptedSessionError =
                    errorText.includes("tool_use block missing required") ||
                    errorText.includes("missing required 'name' field") ||
                    errorText.includes("invalid_request_error") && errorText.includes("tool_use")

                  if (isCorruptedSessionError) {
                    console.log(`[claude] Corrupted session error detected - clearing session files and DB session ID`)
                    try {
                      if (existsSync(isolatedConfigDir)) {
                        rmSync(isolatedConfigDir, { recursive: true, force: true })
                        console.log(`[claude] Removed corrupted session dir: ${isolatedConfigDir}`)
                      }
                    } catch (rmErr) {
                      console.error(`[claude] Failed to remove session dir:`, rmErr)
                    }
                    db.update(subChats)
                      .set({ sessionId: null })
                      .where(eq(subChats.id, input.subChatId))
                      .run()
                    console.log(`[claude] Cleared session ID for subChat ${input.subChatId}`)

                    safeEmit({
                      type: "message",
                      message: {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        parts: [{ type: "text", text: "Session format error detected. The session has been reset — please resend your message to continue with a fresh session." }],
                      },
                    } as unknown as UIMessageChunk)
                    safeEmit({ type: "finish" } as UIMessageChunk)
                    safeComplete()
                    return
                  }

                  // Check for token limit errors - clear session ID from DB
                  if (errorText.includes("maximum tokens") && errorText.includes("exceeds the model limit")) {
                    console.log(`[claude] Token limit error - clearing session ID from database`)
                    // Clear from database to start fresh on next message
                    db.update(subChats)
                      .set({ sessionId: null })
                      .where(eq(subChats.id, input.subChatId))
                      .run()
                    console.log(`[claude] Cleared session ID from subChat ${input.subChatId}`)
                  }

                  // Check for thinking signature error - happens when session files predate the
                  // thinking.signature API requirement. Fix: wipe stale session files + clear DB session ID.
                  if (errorText.includes("thinking.signature")) {
                    console.log(`[claude] Thinking signature error - clearing stale session files and DB session ID`)
                    try {
                      if (existsSync(isolatedConfigDir)) {
                        rmSync(isolatedConfigDir, { recursive: true, force: true })
                        console.log(`[claude] Removed stale session dir: ${isolatedConfigDir}`)
                      }
                    } catch (rmErr) {
                      console.error(`[claude] Failed to remove session dir:`, rmErr)
                    }
                    db.update(subChats)
                      .set({ sessionId: null })
                      .where(eq(subChats.id, input.subChatId))
                      .run()
                    console.log(`[claude] Cleared session ID for subChat ${input.subChatId}`)

                    safeEmit({
                      type: "message",
                      message: {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        parts: [{ type: "text", text: "Your session contained extended thinking blocks from an older format that is no longer compatible. The session has been reset — please resend your message to continue." }],
                      },
                    } as unknown as UIMessageChunk)
                    safeEmit({ type: "finish" } as UIMessageChunk)
                    safeComplete()
                    return
                  }

                  // Check for context length errors ("prompt too long", "context", etc.)
                  let compacted = false
                  const isContextError =
                    errorText.toLowerCase().includes("prompt too long") ||
                    errorText.toLowerCase().includes("exceeded max context") ||
                    errorText.toLowerCase().includes("context length") ||
                    errorText.toLowerCase().includes("context_limit") ||
                    errorText.toLowerCase().includes("maximum context")
                  console.log(`[claude] isContextError = ${isContextError}`)
                  if (isContextError) {
                    console.log(`[claude] Context length error detected - attempting automatic compaction`)

                    try {
                      // 1. Get existing messages from DB
                      const existing = db
                        .select()
                        .from(subChats)
                        .where(eq(subChats.id, input.subChatId))
                        .get()
                      const existingMessages: any[] = JSON.parse(existing?.messages || "[]")

                      if (existingMessages.length > 10) {
                        // 2. Split into recent (keep) and older (summarize)
                        const recentMessages = existingMessages.slice(-20) // keep last 20 messages
                        const olderMessages = existingMessages.slice(0, -20)

                        // Only compact if there are actually older messages to summarize
                        if (olderMessages.length > 0) {
                          // 3. Create a summary of older messages (simple concatenation for now)
                          const olderSummary = olderMessages
                            .map((m: any) => `${m.role}: ${m.parts?.[0]?.text || m.content || "[content]"}`)
                            .join("\n\n")

                          // 4. Create summary message
                          const summaryMessage = {
                            id: crypto.randomUUID(),
                            role: "system",
                            parts: [{ type: "text", text: `[Previous conversation summarized: ${olderSummary.slice(0, 3000)}]` }],
                          }

                          // 5. Create new message list with summary replacing older messages
                          const truncatedMessages = [summaryMessage, ...recentMessages]

                          // 6. Clear session ID and update DB with truncated messages
                          db.update(subChats)
                            .set({
                              messages: JSON.stringify(truncatedMessages),
                              sessionId: null, // Clear session since context changed
                            })
                            .where(eq(subChats.id, input.subChatId))
                            .run()

                          console.log(`[claude] Compacted ${olderMessages.length} messages into summary`)

                          // Emit compaction event to UI
                          safeEmit({
                            type: "system-Compact",
                            toolCallId: `compact-${Date.now()}`,
                            state: "input-streaming",
                          } as UIMessageChunk)
                          safeEmit({
                            type: "system-Compact",
                            toolCallId: `compact-${Date.now()}`,
                            state: "output-available",
                          } as UIMessageChunk)

                          // Emit info message about compaction
                          safeEmit({
                            type: "message",
                            message: {
                              id: crypto.randomUUID(),
                              role: "assistant",
                              parts: [{ type: "text", text: "I automatically summarized earlier parts of our conversation to fit within the context limit. You can continue asking me questions!" }],
                            },
                          } as unknown as UIMessageChunk)

                          // Mark as compacted and clear the error to allow retry
                          compacted = true
                          lastError = null
                          console.log(`[claude] Compaction complete - caller should retry the request`)
                        } else {
                          console.log(`[claude] Not enough older messages to compact (only ${existingMessages.length} total)`)
                        }
                      } else {
                        console.log(`[claude] Not enough messages to compact (${existingMessages.length})`)
                      }
                    } catch (compactionError) {
                      console.error(`[claude] Error during compaction:`, compactionError)
                    }
                  }

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
                  } else if (isContextError) {
                    // Fallback category if compaction wasn't triggered or failed
                    errorCategory = "CONTEXT_LENGTH"
                    errorContext = "Conversation exceeds context limit"
                  }

                  // Clear session on auth errors to prevent resume hang on next attempt
                  // When a session ends with an auth error, the binary hangs on resume
                  if (errorCategory === "AUTH_FAILED_SDK" || errorCategory === "INVALID_API_KEY_SDK") {
                    console.log(`[claude] Auth error detected (${errorCategory}) - clearing session to prevent resume hang`)
                    try {
                      if (existsSync(isolatedConfigDir)) {
                        rmSync(isolatedConfigDir, { recursive: true, force: true })
                        console.log(`[claude] Removed auth-failed session dir: ${isolatedConfigDir}`)
                      }
                    } catch (rmErr) {
                      console.error(`[claude] Failed to remove session dir:`, rmErr)
                    }
                    db.update(subChats)
                      .set({ sessionId: null })
                      .where(eq(subChats.id, input.subChatId))
                      .run()
                    console.log(`[claude] Cleared session ID for subChat ${input.subChatId}`)
                  }

                  // Emit auth-error for authentication failures, regular error otherwise
                  // Skip if compaction was successful (we emitted a message instead)
                  if (!compacted) {
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
                  } else {
                    // Compaction was successful - don't emit error, just finish this turn
                    // The caller should retry with the compacted context
                    console.log(`[SD] M:END sub=${subId} reason=compacted n=${chunkCount}`)
                    safeEmit({ type: "finish" } as UIMessageChunk)
                    safeComplete()
                    return
                  }
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

                    setMcpServerStatusCache(lookupPath, statusMap)
                    // Persist status to disk immediately (write-through)
                    saveMcpStatusToDisk()

                    // Cache tools (in-memory only, not persisted to disk)
                    if (serversWithTools.length > 0) {
                      setCachedMcpTools(lookupPath, {
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

                      // DEBUG: Log LS (List) tool input to diagnose cwd issues
                      if (chunk.toolName === "LS" && chunk.input) {
                        console.log(`[SD] M:LS_TOOL sub=${subId} input=`, chunk.input, `cwd=${input.cwd}`)
                      }

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
                      const toolPart = parts.find(
                        (p) =>
                          p.type?.startsWith("tool-") &&
                          p.toolCallId === chunk.toolCallId,
                      )

                      if (toolPart) {
                        // Check if output is large and needs offloading to file
                        let outputToStore = chunk.output
                        if (shouldOffloadOutput(chunk.output)) {
                          try {
                            const storedInfo = await storeToolOutput(
                              input.subChatId,
                              chunk.toolCallId,
                              chunk.output,
                            )
                            // Create smart reference preserving structure (exitCode, etc.)
                            outputToStore = createOffloadedReference(
                              chunk.output,
                              chunk.toolCallId,
                              storedInfo,
                            )
                            console.log(
                              `[claude] Tool output offloaded to file for ${chunk.toolCallId} (${storedInfo.fullLength} chars)`,
                            )
                          } catch (offloadError) {
                            console.error(
                              `[claude] Failed to offload tool output for ${chunk.toolCallId}:`,
                              offloadError,
                            )
                            // Fall back to storing in message (might still crash, but we tried)
                          }
                        }
                        toolPart.result = outputToStore
                        toolPart.output = outputToStore // Backwards compatibility for the UI that relies on output field
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
                        console.log(`[claude] Detected invalid session error, clearing from database`)
                        sessionInvalid = true // Prevent cleanup from re-writing stale session ID

                        // Clear from database to start fresh on next message
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

              // Clear the inactivity timeout and typing indicator refresh
              if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle)
              if (typingIntervalHandle) clearInterval(typingIntervalHandle)

              // Clear typing indicator and react ✅ on completion
              if (connectionPlatform && connectionTarget) {
                sendTypingToPlatform(connectionPlatform as any, connectionTarget, false).catch(() => {})
                if (lastWhatsAppMessageKey && resultReceived) {
                  reactOnPlatform(connectionPlatform as any, connectionTarget, lastWhatsAppMessageKey, "✅").catch(() => {})
                }
                // Notify queue that streaming finished — triggers next batch if queued
                try {
                  const parentChatId = db.select().from(subChats).where(eq(subChats.id, input.subChatId)).get()?.chatId
                  if (parentChatId) getWhatsAppQueue().streamComplete(parentChatId)
                } catch {}
              }

              // Warn if stream yielded no messages
              if (messageCount === 0) {
                console.error(`[claude] Stream yielded no messages - model not responding`)
              }

              // Forward final assistant response to connected channel/group (fire-and-forget)
              if (resultReceived) {
                try {
                  // Get parent chatId from subChat first
                  const subChat = getDatabase().select().from(subChats).where(eq(subChats.id, input.subChatId)).get()
                  if (!subChat?.chatId) return

                  const parentChat = getDatabase().select().from(chats).where(eq(chats.id, subChat.chatId)).get()
                  if (parentChat?.connectionType && parentChat.connectionType !== "none" && parentChat.connectionTarget) {
                    const finalText = parts
                      .filter((p: any) => p.type === "text" && p.text)
                      .map((p: any) => String(p.text))
                      .join("")
                    if (finalText.trim()) {
                      sendToPlatform(parentChat.connectionType, parentChat.connectionTarget, finalText).catch(console.error)
                    }
                  }
                } catch (e) {
                  console.error("[claude] Failed to forward final response to channel:", e)
                }
              }
            } catch (streamError) {
              // Clear the inactivity timeout and typing indicator on stream error
              if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle)
              if (typingIntervalHandle) clearInterval(typingIntervalHandle)

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

                console.log(`[claude] Detected invalid session error, clearing from database`)
                sessionInvalid = true // Prevent cleanup from re-writing stale session ID

                // Clear invalid sessionId from database to start fresh on next message
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

            // Release accumulated streaming data from memory
            parts.length = 0
            messagesToSave.length = 0
            stderrLines.length = 0

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
            // Session cleanup happens in unsubscribe handler below
            // This ensures messages are saved before cleanup to avoid race conditions
          }
        })()

        // Cleanup on unsubscribe
        return () => {
          console.log(`[SD] M:CLEANUP sub=${subId} sessionId=${currentSessionId || 'none'}`)
          isObservableActive = false // Prevent emit after unsubscribe
          abortController.abort()
          removeSession(input.subChatId)
          clearPendingApprovals("Session ended.", input.subChatId)

          // Clear typing indicator on connected platform
          if (connectionPlatform && connectionTarget) {
            sendTypingToPlatform(connectionPlatform as any, connectionTarget, false).catch(() => {})
          }

          // Save sessionId on abort so conversation can be resumed
          // Clear streamId since we're no longer streaming
          // Skip saving sessionId if session was invalid (already cleared from DB above)
          const db = getDatabase()
          db.update(subChats)
            .set({
              streamId: null,
              ...(currentSessionId && !sessionInvalid && { sessionId: currentSessionId })
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
      const session = getSession(input.subChatId)
      if (session) {
        session.abortController.abort()
        removeSession(input.subChatId)
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
    .query(({ input }) => hasActiveSession(input.subChatId)),
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
      const query = getSessionQuery(input.subChatId) as any
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
      const query = getSessionQuery(input.subChatId) as any
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
      const query = getSessionQuery(input.subChatId) as any
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

  /**
   * Load full tool output from file storage
   * For outputs that were offloaded to prevent IPC crashes
   */
  loadToolOutput: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        toolCallId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const content = await loadToolOutput(input.subChatId, input.toolCallId)
      if (content === null) {
        throw new Error(`Tool output not found for ${input.toolCallId}`)
      }
      return { content, length: content.length }
    }),

})
