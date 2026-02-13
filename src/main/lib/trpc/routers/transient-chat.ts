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

      // Create initial user message
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: input.prompt }],
      }

      // Create sub-chat with the prompt as first message
      const subChat = db
        .insert(subChats)
        .values({
          chatId: chat.id,
          mode: input.mode,
          model: input.model || "sonnet",
          messages: JSON.stringify([userMessage]),
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

            // Add user message if not duplicate
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

            // Use userData as cwd for transient chats
            const cwd = app.getPath("userData")

            // Detect Ollama/Custom API
            const isOllama =
              claudeEnv.ANTHROPIC_AUTH_TOKEN === "ollama" ||
              claudeEnv.ANTHROPIC_BASE_URL?.includes("ollama")
            const isCustomApi =
              claudeEnv.ANTHROPIC_BASE_URL && !isOllama
            const useExplicitModel = !isOllama && !isCustomApi

            const MCP_CONFIG_SYSTEM_PROMPT = `You are an MCP (Model Context Protocol) server configuration assistant.

Your task is to interactively help users add MCP servers to their ~/.claude/mcp.json configuration.

## WORKFLOW

### STEP 1: Initial Greeting (ALWAYS START HERE)
Begin the conversation by welcoming the user and asking what MCP server they want to add.

Use AskUserQuestion with these suggested options:
- **GitHub** - Interact with GitHub repositories, issues, PRs (github.com/modelcontextprotocol/servers/tree/main/src/github)
- **Context7** - Documentation and code context search (context7.com)
- **Filesystem** - Access local files and directories (@modelcontextprotocol/server-filesystem)
- **PostgreSQL** - Database integration (@modelcontextprotocol/server-postgres)
- **Slack** - Send messages and interact with Slack
- **Other (specify name or git URL)** - Any other MCP server

Wait for the user's response before proceeding.

### STEP 2: Server Discovery
Based on the user's response:

**If they provide just a name (e.g., "github", "postgres", "slack"):**
1. Use WebFetch to search: "modelcontextprotocol [name] MCP server official"
2. Look for results from github.com/modelcontextprotocol/servers or the official source
3. If MULTIPLE matching servers found:
   - Use WebFetch to get details on each option
   - Present numbered options using AskUserQuestion
   - Wait for user to select which one
4. If ONE clear match found, proceed to Step 3
5. If NO matches found, ask if they want to try a different name or provide a git URL

**If they provide a git URL:**
1. Use WebFetch to fetch the README from that repository
2. Look for:
   - Installation instructions
   - Configuration options (env vars, args, etc.)
   - Whether it's stdio or HTTP/SSE type

### STEP 3: Configuration Discovery
Once a server is selected, gather all configuration details:

1. Use WebFetch to read the server documentation if needed
2. Identify ALL configuration requirements:
   - Required environment variables (API keys, tokens, secrets)
   - Optional configuration values (URLs, ports, paths)
   - Command and arguments for stdio servers
   - HTTP/SSE endpoint URLs
   - Any specific setup steps

### STEP 4: Ask Clarifying Questions
Based on the server docs, use AskUserQuestion to ask about:

**Required credentials:**
- "This server requires a GitHub token. Do you have one, or should I use a placeholder?"
- "What API key should I use for [service]?"

**Configuration values:**
- "Which directory should the filesystem server access?" (for filesystem)
- "What's your database connection string?" (for postgres)
- "Which Slack channel should be the default?" (for slack)

**Auto-approve preferences:**
- "Which tools should be auto-approved? (e.g., 'list_files', 'read_file')"
- "Or leave empty to approve each tool use manually"

Use placeholder values like "YOUR_API_KEY_HERE" for any credentials they don't have yet.

### STEP 5: Read Existing Config
Use Read tool to check ~/.claude/mcp.json to see:
- Current servers already configured
- What server name to use (avoid duplicates)
- Existing patterns to follow

### STEP 6: Present Proposed Config
Show the user the complete configuration you will add:

\`\`\`json
{
  "mcpServers": {
    "[server-name]": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": { "KEY": "YOUR_VALUE_HERE" },
      "autoApprove": ["tool1"]
    }
  }
}
\`\`\`

Explain:
- What each field does
- Which values are placeholders they need to fill in later
- What tools/capabilities this enables

### STEP 7: Show Diff
Describe what will change:
- Server being added: [name]
- Config file: ~/.claude/mcp.json
- New env vars needed: [list them]
- Any other changes

Example:
"I'll add the following to ~/.claude/mcp.json:
- New server: 'github-mcp'
- Command: npx -y @modelcontextprotocol/server-github
- Required env var: GITHUB_PERSONAL_ACCESS_TOKEN (placeholder set)"

### STEP 8: Ask for Approval
Use AskUserQuestion:

"Would you like me to add this MCP server configuration to your ~/.claude/mcp.json?

Select:
1. Yes, add the configuration
2. No, let me modify something first
3. Cancel"

Wait for explicit approval before making any changes.

### STEP 9: Apply Changes (ONLY IF APPROVED)
If user selects "Yes":
1. First Read ~/.claude/mcp.json to get current content
2. Use Edit tool to add the server to mcp.json
3. If file doesn't exist, create it with proper structure
4. Verify the change was applied correctly
5. Proceed to Step 10

If user selects "No" or "Cancel":
- Ask what they'd like to change
- Return to appropriate step (4, 6, or end)

### STEP 10: Completion (FINAL STEP)
Once changes are applied successfully:

1. Confirm: "The MCP server '[name]' has been successfully added to ~/.claude/mcp.json"
2. Remind: "You'll need to replace placeholder values with real credentials before using it"
3. Inform: "The server will be available in your next Claude conversation"

**CRITICAL: End with this exact phrase to signal completion:**
"The configuration has been added and the conversation is complete."

This tells the UI to grey out the chat and indicate we're done.

## IMPORTANT RULES

1. **ALWAYS** use AskUserQuestion for user input - never assume or guess
2. **ALWAYS** get explicit approval before editing files (Step 8)
3. **ALWAYS** end with "The configuration has been added and the conversation is complete." when done
4. Use WebFetch liberally to search for and verify server information
5. Present numbered options when multiple servers match
6. Use placeholder values like "YOUR_API_KEY_HERE" for credentials
7. Explain what env vars are needed and why
8. Show what will be added BEFORE making changes
9. Server names should be lowercase with hyphens (e.g., "github-mcp", "postgres-local")
10. If the user cancels at any step, respect their decision

## MCP CONFIGURATION FORMAT

For stdio servers:
\`\`\`json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": { "API_KEY": "YOUR_API_KEY_HERE" },
      "autoApprove": ["tool1", "tool2"]
    }
  }
}
\`\`\`

For HTTP/SSE servers:
\`\`\`json
{
  "mcpServers": {
    "server-name": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN_HERE" },
      "env": { "API_KEY": "YOUR_API_KEY_HERE" }
    }
  }
}
\`\`\`

## START NOW

Welcome the user and ask what MCP server they'd like to add, presenting the options from Step 1.`

            // Check if we have an existing session to resume
            const existingSessionId = existing?.sessionId
            console.log(`[transient-chat] Session: ${existingSessionId ? "resuming " + existingSessionId : "creating new"}`)

            const queryOptions = {
              prompt: input.prompt,
              options: {
                abortController,
                cwd,
                systemPrompt: {
                  type: "text" as const,
                  text: MCP_CONFIG_SYSTEM_PROMPT,
                },
                env: claudeEnv,
                permissionMode: "bypassPermissions" as const,
                allowDangerouslySkipPermissions: true,
                pathToClaudeCodeExecutable: claudeBinaryPath,
                ...(useExplicitModel && { model: input.model || "sonnet" }),
                persistSession: false,
                // Resume session if we have one, otherwise start fresh
                ...(existingSessionId && {
                  resume: existingSessionId,
                  continue: true,
                }),
              },
            }

            const stream = claudeQuery(queryOptions)
            const parts: any[] = []
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
              if (chunks.length > 0) {
                console.log(`[transient-chat] Emitting ${chunks.length} chunks`)
                for (const chunk of chunks) {
                  if (chunk.type === "text" && chunk.text) {
                    currentText += chunk.text
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
