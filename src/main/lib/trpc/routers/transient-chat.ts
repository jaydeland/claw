import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { getDatabase, chats, subChats, projects } from "../../db"
import { publicProcedure, router } from "../index"
import {
  buildClaudeEnv,
  getBundledClaudeBinaryPath,
  createTransformer,
  type UIMessageChunk,
} from "../../claude"
import { registerSession, removeSession } from "../../session/session-registry"
import { app } from "electron"
import * as path from "path"
import * as crypto from "crypto"

// Cached SDK query function
let cachedClaudeQuery: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null

async function getClaudeQuery() {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery
  }
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeQuery = sdk.query
  return cachedClaudeQuery
}

// System prompts for different use cases
const SYSTEM_PROMPTS = {
  mcp: `You are an MCP server configuration assistant. Help users add MCP servers to their ~/.claude/mcp.json.

## WORKFLOW

1. **Understand the request** - User will describe what MCP server they want (e.g., "github", "filesystem", "postgres", or a git URL)

2. **Research if needed** - Use WebFetch to find installation/config details for unfamiliar servers

3. **Gather requirements** - Ask about required credentials (API keys, tokens) using AskUserQuestion. Use "YOUR_KEY_HERE" placeholders if they don't have them yet.

4. **Read existing config** - Use Read tool on ~/.claude/mcp.json to avoid duplicates and follow existing patterns

5. **Present config** - Show the proposed JSON config and explain what it does

6. **Get approval** - Use AskUserQuestion to confirm before making changes:
   - "Yes, add it"
   - "Let me modify something"
   - "Cancel"

7. **Apply changes** - If approved, use Edit tool to add the server to mcp.json

8. **Complete** - End with: "The configuration has been added and the conversation is complete."

## CONFIG FORMATS

**stdio:**
\`\`\`json
{"mcpServers": {"name": {"command": "npx", "args": ["-y", "pkg"], "env": {"KEY": "VAL"}}}}
\`\`\`

**HTTP/SSE:**
\`\`\`json
{"mcpServers": {"name": {"type": "http", "url": "https://...", "headers": {}}}}
\`\`\`

## RULES
- Always use AskUserQuestion for user input
- Get explicit approval before editing files
- Use lowercase-hyphen server names (e.g., "github-mcp")
- Use placeholder values for credentials`,

  review: `You are a markdown file review assistant. Help users review and improve their markdown files for correctness, quality, and best practices.

## WORKFLOW

1. **Analyze the file** - Review the markdown structure, formatting, and content
2. **Check frontmatter** - Verify all required fields are present and correctly formatted
3. **Identify issues** - Look for linting errors, formatting problems, and content issues
4. **Provide suggestions** - Offer specific, actionable recommendations for improvement
5. **Answer questions** - Respond to follow-up questions about the file

## REVIEW FOCUS AREAS

- **Formatting**: Proper markdown syntax, heading hierarchy, list formatting
- **Frontmatter**: YAML syntax, required fields, field types
- **Content**: Clarity, completeness, organization
- **Best practices**: Common patterns, recommended structure

## RULES
- Be specific about line numbers when pointing out issues
- Provide code examples for suggested fixes
- Explain why something is an issue, not just that it is one
- Acknowledge when the file looks good`,
}

type SystemPromptType = keyof typeof SYSTEM_PROMPTS

/**
 * Transient Chat Router
 *
 * Provides temporary chat sessions for mini-conversations like MCP config generation.
 * These chats are not associated with projects/worktrees and are cleaned up after use.
 */
export const transientChatRouter = router({
  /**
   * Create a new transient chat session
   * Creates a temporary chat and sub-chat in the database
   */
  create: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        model: z.string().optional(),
        systemPromptType: z.enum(["mcp", "review"]).optional().default("mcp"),
        projectPath: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Create a placeholder project for transient chats (if not exists)
      // We use a special system project to avoid orphan records
      let systemProject = db
        .select()
        .from(projects)
        .where(eq(projects.path, "__transient__"))
        .get()

      if (!systemProject) {
        systemProject = db
          .insert(projects)
          .values({
            name: "Transient Chats",
            path: "__transient__",
          })
          .returning()
          .get()
      }

      // Create transient chat
      const chat = db
        .insert(chats)
        .values({
          name: "MCP Config Chat",
          projectId: systemProject.id,
          isTransient: true,
        })
        .returning()
        .get()

      // Create sub-chat with empty messages (SDK will populate on first request)
      const subChat = db
        .insert(subChats)
        .values({
          chatId: chat.id,
          mode: input.mode,
          model: input.model || "sonnet",
          messages: JSON.stringify([]),
        })
        .returning()
        .get()

      return {
        chatId: chat.id,
        subChatId: subChat.id,
        projectId: systemProject.id,
      }
    }),

  /**
   * Stream chat for transient session
   * Simplified version of the main chat subscription
   */
  chat: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        subChatId: z.string(),
        prompt: z.string(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        model: z.string().optional(),
        systemPromptType: z.enum(["mcp", "review"]).optional().default("mcp"),
        projectPath: z.string().optional(),
      })
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        const abortController = new AbortController()
        const streamId = crypto.randomUUID()

        // Register session
        registerSession({
          subChatId: input.subChatId,
          chatId: input.chatId,
          abortController,
          query: null,
          sessionId: null,
          streamId,
          startedAt: Date.now(),
        })

        const subId = input.subChatId.slice(-8)
        const streamStart = Date.now()
        let chunkCount = 0
        let isObservableActive = true

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

        const safeComplete = () => {
          try {
            emit.complete()
          } catch {
            // Already completed
          }
        }

        ;(async () => {
          try {
            const db = getDatabase()

            // Get existing messages
            const existing = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()

            if (!existing) {
              safeEmit({
                type: "error",
                errorText: "Sub-chat not found",
              } as UIMessageChunk)
              safeComplete()
              return
            }

            const existingMessages = JSON.parse(existing.messages || "[]")

            // Add user message if not duplicate and not an internal auto-start signal
            const lastMsg = existingMessages[existingMessages.length - 1]
            const isDuplicate =
              lastMsg?.role === "user" &&
              lastMsg?.parts?.[0]?.text === input.prompt

            let messagesToSave = existingMessages
            if (!isDuplicate) {
              const userMessage = {
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

            // Get Claude SDK
            let claudeQuery
            try {
              claudeQuery = await getClaudeQuery()
            } catch (sdkError) {
              safeEmit({
                type: "error",
                errorText: "Failed to load Claude SDK",
              } as UIMessageChunk)
              safeComplete()
              return
            }

            const transform = createTransformer({})

            // Build environment
            const claudeEnv = buildClaudeEnv()
            const claudeBinaryPath = getBundledClaudeBinaryPath()

            // Use project path as cwd if provided (allows AI to read project files)
            // Fall back to userData for MCP config chats that don't have a project
            const cwd = input.projectPath || app.getPath("userData")

            // Detect Ollama/Custom API
            const isOllama =
              claudeEnv.ANTHROPIC_AUTH_TOKEN === "ollama" ||
              claudeEnv.ANTHROPIC_BASE_URL?.includes("ollama")
            const isCustomApi =
              claudeEnv.ANTHROPIC_BASE_URL && !isOllama
            const useExplicitModel = !isOllama && !isCustomApi

            // Check if we have an existing session to resume
            let existingSessionId = existing?.sessionId
            console.log(`[transient-chat] Session: ${existingSessionId ? "resuming " + existingSessionId : "creating new"}`)

            const buildQueryOptions = (sessionId?: string | null) => ({
              prompt: input.prompt,
              options: {
                abortController,
                cwd,
                systemPrompt: {
                  type: "text" as const,
                  text: SYSTEM_PROMPTS[input.systemPromptType || "mcp"],
                },
                env: claudeEnv,
                permissionMode: "bypassPermissions" as const,
                allowDangerouslySkipPermissions: true,
                pathToClaudeCodeExecutable: claudeBinaryPath,
                ...(useExplicitModel && { model: input.model || "sonnet" }),
                // Resume session if we have one, otherwise start fresh
                ...(sessionId && {
                  resume: sessionId,
                  continue: true,
                }),
              },
            })

            let stream = claudeQuery(buildQueryOptions(existingSessionId))
            let isRetry = false
            const parts: any[] = []
            let streamError: Error | null = null
            let currentText = ""
            let currentSessionId: string | null = null

            for await (const msg of stream) {
              const msgAny = msg as any
              chunkCount++

              // Debug logging for first few messages
              if (chunkCount <= 5) {
                console.log(`[transient-chat] Message ${chunkCount}:`, {
                  type: msgAny.type,
                  subtype: msgAny.subtype,
                  hasMessage: !!msgAny.message,
                  hasContent: !!msgAny.message?.content,
                })
              }

              // Track session ID
              if (msgAny.session_id) {
                currentSessionId = msgAny.session_id
              }

              // Transform and emit chunks
              const chunks = transform(msg)
              const chunkList = [...chunks] // Convert generator to array
              console.log(`[transient-chat] Raw chunks:`, chunkList.map(c => c.type))

              // Check for session-not-found error in transformed chunks
              // This must happen BEFORE emitting to prevent showing the error to the user
              for (const chunk of chunkList) {
                if (chunk.type === "error" && chunk.errorText) {
                  const errorText = chunk.errorText.toLowerCase()
                  if (errorText.includes("no conversation found with session id") && existingSessionId && !isRetry) {
                    console.log(`[transient-chat] Session ${existingSessionId} not found in transformed chunk, will retry without resume`)
                    streamError = new Error(chunk.errorText)
                    break
                  }
                }
              }
              if (streamError) {
                break
              }

              if (chunkList.length > 0) {
                console.log(`[transient-chat] Emitting ${chunkList.length} chunks`)
                for (const chunk of chunkList) {
                  console.log(`[transient-chat] Chunk type: ${chunk.type}`, chunk)
                  if (chunk.type === "text" && chunk.text) {
                    currentText += chunk.text
                  }
                  if (chunk.type === "text-delta" && chunk.delta) {
                    currentText += chunk.delta
                  }
                  safeEmit(chunk)
                }
              }

              // Check for result to end stream
              if (msgAny.type === "result") {
                console.log(`[transient-chat] Got result message, ending stream`)
                break
              }
            }

            // Handle stale session - retry without resume if we got a session not found error
            if (streamError && streamError.message.toLowerCase().includes("no conversation found with session id") && existingSessionId && !isRetry) {
              console.log(`[transient-chat] Retrying without stale session ID ${existingSessionId}`)

              // Clear the stale session ID from database
              db.update(subChats)
                .set({
                  sessionId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()

              // Create new abort controller for retry
              const retryAbortController = new AbortController()
              registerSession({
                subChatId: input.subChatId,
                chatId: input.chatId,
                abortController: retryAbortController,
                query: null,
                sessionId: null,
                streamId,
                startedAt: Date.now(),
              })

              // Restart stream without session resume
              stream = claudeQuery(buildQueryOptions(null))
              isRetry = true
              streamError = null
              chunkCount = 0
              currentText = ""

              // Process retry stream
              for await (const msg of stream) {
                const msgAny = msg as any
                chunkCount++

                // Debug logging for first few messages
                if (chunkCount <= 5) {
                  console.log(`[transient-chat] Retry message ${chunkCount}:`, {
                    type: msgAny.type,
                    subtype: msgAny.subtype,
                    hasMessage: !!msgAny.message,
                    hasContent: !!msgAny.message?.content,
                  })
                }

                // Track session ID
                if (msgAny.session_id) {
                  currentSessionId = msgAny.session_id
                }

                // Transform and emit chunks
                const chunks = transform(msg)
                const chunkList = [...chunks]
                console.log(`[transient-chat] Retry raw chunks:`, chunkList.map(c => c.type))
                if (chunkList.length > 0) {
                  console.log(`[transient-chat] Retry emitting ${chunkList.length} chunks`)
                  for (const chunk of chunkList) {
                    console.log(`[transient-chat] Retry chunk type: ${chunk.type}`, chunk)
                    if (chunk.type === "text" && chunk.text) {
                      currentText += chunk.text
                    }
                    if (chunk.type === "text-delta" && chunk.delta) {
                      currentText += chunk.delta
                    }
                    safeEmit(chunk)
                  }
                }

                // Check for result to end stream
                if (msgAny.type === "result") {
                  console.log(`[transient-chat] Retry got result message, ending stream`)
                  break
                }
              }
            }

            // Save assistant message to database
            if (currentText) {
              const assistantMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                parts: [{ type: "text", text: currentText }],
                metadata: {
                  sessionId: currentSessionId,
                },
              }

              const finalMessages = [...messagesToSave, assistantMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(finalMessages),
                  sessionId: currentSessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            console.log(
              `[transient-chat] Completed: ${chunkCount} chunks, ${currentText.length} chars`
            )
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error)
            console.error("[transient-chat] Error:", errorMessage)
            safeEmit({
              type: "error",
              errorText: errorMessage,
            } as UIMessageChunk)
          } finally {
            removeSession(input.subChatId)
            safeEmit({ type: "finish" } as UIMessageChunk)
            safeComplete()
          }
        })()

        // Cleanup on unsubscribe
        return () => {
          isObservableActive = false
          abortController.abort()
          removeSession(input.subChatId)
        }
      })
    }),

  /**
   * Get messages for a transient sub-chat
   */
  getMessages: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get()

      if (!subChat) return null

      return {
        messages: JSON.parse(subChat.messages || "[]"),
        subChat,
      }
    }),

  /**
   * Cleanup transient chat and its sub-chats
   */
  cleanup: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()

      // Delete sub-chats first (cascade should handle this, but being explicit)
      db.delete(subChats)
        .where(eq(subChats.chatId, input.chatId))
        .run()

      // Delete the chat
      db.delete(chats)
        .where(eq(chats.id, input.chatId))
        .run()

      return { success: true }
    }),

  /**
   * Cleanup all transient chats (call on app startup)
   */
  cleanupAll: publicProcedure.mutation(() => {
    const db = getDatabase()

    // Get all transient chat IDs
    const transientChats = db
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.isTransient, true))
      .all()

    const chatIds = transientChats.map((c) => c.id)

    if (chatIds.length === 0) {
      return { deletedCount: 0 }
    }

    // Delete sub-chats for all transient chats
    for (const chatId of chatIds) {
      db.delete(subChats)
        .where(eq(subChats.chatId, chatId))
        .run()
    }

    // Delete transient chats
    db.delete(chats)
      .where(eq(chats.isTransient, true))
      .run()

    console.log(`[transient-chat] Cleaned up ${chatIds.length} transient chats`)

    return { deletedCount: chatIds.length }
  }),
})
